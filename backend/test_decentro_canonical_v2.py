import json
import time
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import SQLModel, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security_decentro import compute_hmac_sha256_hex
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.banking import (
    FleetCustomer,
    NozzleUPITransaction,
    SupplierPayout,
    TxnStatus,
    VirtualAccountWebhookLog,
)

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_canonical_decentro_v2_workflows():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(SQLModel.metadata.create_all)

    async def override_get_db():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    from app.core.security import get_current_user
    from app.models.petrol_pump import User
    import app.core.idempotency as idempotency_mod

    mock_user = User(id=1, username="test_owner", full_name="Test Owner", role="OWNER", is_active=True)
    async def override_current_user():
        return mock_user

    app.dependency_overrides[get_current_user] = override_current_user
    idempotency_mod.AsyncSessionLocal = async_session
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Test POST /api/v1/banking/upi-qr
        qr_req = {
            "shift_id": "SHIFT-20261020-A",
            "nozzle_id": "NOZZLE-MPD1-HSD2",
            "attendant_id": "EMP-104",
            "fuel_type": "HSD",
            "liters_dispensed": 45.5,
            "amount": 4250.00,
            "expiry_seconds": 300,
        }
        res_qr = await client.post("/api/v1/banking/upi-qr", json=qr_req)
        assert res_qr.status_code == 200, res_qr.text
        data_qr = res_qr.json()
        assert data_qr["amount"] == 4250.00
        assert data_qr["status"] == "PENDING"
        assert "qr_base64" in data_qr
        assert "upi_uri" in data_qr
        ref_id = data_qr["reference_id"]

        # Verify record in nozzle_upi_transactions table
        async with async_session() as session:
            db_noz = (
                await session.execute(
                    select(NozzleUPITransaction).where(NozzleUPITransaction.reference_id == ref_id)
                )
            ).scalar_one()
            assert db_noz.fuel_type == "HSD"
            assert db_noz.amount == 4250.00
            assert db_noz.status == TxnStatus.PENDING

        # 2. Test GET /api/v1/banking/upi-qr/{reference_id}/status
        res_status = await client.get(f"/api/v1/banking/upi-qr/{ref_id}/status")
        assert res_status.status_code == 200
        status_data = res_status.json()
        assert status_data["reference_id"] == ref_id
        assert status_data["status"] == "PENDING"
        assert status_data["amount"] == 4250.00

        # 3. Test POST /api/v1/banking/virtual-accounts
        va_req = {
            "business_name": "Kalinga Heavy Logistics Pvt Ltd",
            "gstin": "21AABCK1234F1Z5",
            "contact_phone": "9876543210",
            "contact_email": "accounts@kalingalogistics.in",
            "credit_limit": 500000.0,
        }
        res_va = await client.post("/api/v1/banking/virtual-accounts", json=va_req)
        assert res_va.status_code == 200, res_va.text
        data_va = res_va.json()
        va_number = data_va["account_number"]
        assert va_number is not None

        # Verify record in fleet_customers table
        async with async_session() as session:
            db_fleet = (
                await session.execute(
                    select(FleetCustomer).where(FleetCustomer.business_name == "Kalinga Heavy Logistics Pvt Ltd")
                )
            ).scalar_one()
            assert db_fleet.gstin == "21AABCK1234F1Z5"
            assert db_fleet.virtual_account_number == va_number
            assert db_fleet.credit_limit == 500000.0
            # Set outstanding for webhook test
            db_fleet.current_outstanding = 85000.0
            await session.commit()

        # 4. Test Collections Webhook for both Nozzle QR and Fleet Virtual Account
        utr_qr = f"UTR_QR_{int(time.time())}"
        wh_qr_payload = {
            "decentro_txn_id": f"DEC_WH_{uuid.uuid4().hex[:8]}",
            "bank_reference_number": utr_qr,
            "reference_id": ref_id,
            "transaction_status": "SUCCESS",
            "amount": 4250.00,
            "payer_upi": "customer@oksbi",
            "transfer_type": "UPI",
        }
        raw_qr = json.dumps(wh_qr_payload).encode("utf-8")
        sig_qr = compute_hmac_sha256_hex(raw_qr, settings.DECENTRO_WEBHOOK_SECRET)
        res_wh_qr = await client.post(
            "/api/v1/webhooks/decentro/collections",
            content=raw_qr,
            headers={"Content-Type": "application/json", "x-decentro-signature": sig_qr},
        )
        assert res_wh_qr.status_code == 200, res_wh_qr.text
        assert res_wh_qr.json()["response_code"] == "CB_S00000"

        # Verify NozzleUPITransaction updated to SUCCESS
        async with async_session() as session:
            db_noz = (
                await session.execute(
                    select(NozzleUPITransaction).where(NozzleUPITransaction.reference_id == ref_id)
                )
            ).scalar_one()
            assert db_noz.status == TxnStatus.SUCCESS
            assert db_noz.bank_utr == utr_qr
            assert db_noz.payer_vpa == "customer@oksbi"

        # Test Inbound RTGS to Fleet Virtual Account
        utr_rtgs = f"UTR_RTGS_{int(time.time())}"
        wh_fleet_payload = {
            "decentro_txn_id": f"DEC_WH_{uuid.uuid4().hex[:8]}",
            "bank_reference_number": utr_rtgs,
            "payee_account_number": va_number,
            "transaction_status": "SUCCESS",
            "amount": 25000.00,
            "transfer_type": "RTGS",
            "payer_name": "Kalinga Logistics Bank",
        }
        raw_fleet = json.dumps(wh_fleet_payload).encode("utf-8")
        sig_fleet = compute_hmac_sha256_hex(raw_fleet, settings.DECENTRO_WEBHOOK_SECRET)
        res_wh_flt = await client.post(
            "/api/v1/webhooks/decentro/collections",
            content=raw_fleet,
            headers={"Content-Type": "application/json", "x-decentro-signature": sig_fleet},
        )
        assert res_wh_flt.status_code == 200, res_wh_flt.text
        assert res_wh_flt.json()["response_code"] == "CB_S00000"

        # Verify FleetCustomer outstanding reduced: was 85000 - 25000 = 60000
        async with async_session() as session:
            db_fleet = (
                await session.execute(
                    select(FleetCustomer).where(FleetCustomer.virtual_account_number == va_number)
                )
            ).scalar_one()
            assert db_fleet.current_outstanding == 60000.00

            # Verify VirtualAccountWebhookLog was logged
            db_log = (
                await session.execute(
                    select(VirtualAccountWebhookLog).where(VirtualAccountWebhookLog.bank_utr == utr_rtgs)
                )
            ).scalar_one()
            assert db_log.amount == 25000.00
            assert db_log.transfer_type == "RTGS"

        # 5. Test Supplier Payout (POST /api/v1/banking/payouts)
        payout_req = {
            "supplier_name": "Indian Oil Corporation Ltd - Paradeep Terminal",
            "supplier_gstin": "21AAACI1681G1Z0",
            "invoice_number": "IOCL-INV-2026-88412",
            "beneficiary_account": "309812345678",
            "beneficiary_ifsc": "SBIN0004321",
            "transfer_type": "RTGS",
            "amount": 845000.00,
        }
        res_po = await client.post("/api/v1/banking/payouts", json=payout_req)
        assert res_po.status_code == 200, res_po.text
        data_po = res_po.json()
        assert data_po["amount"] == 845000.00
        assert data_po["supplier_name"] == "Indian Oil Corporation Ltd - Paradeep Terminal"
        po_ref = data_po["reference_id"]
        po_decentro_id = data_po["decentro_txn_id"]

        # Verify record in supplier_payouts table
        async with async_session() as session:
            db_po = (
                await session.execute(
                    select(SupplierPayout).where(SupplierPayout.reference_id == po_ref)
                )
            ).scalar_one()
            assert db_po.amount == 845000.00
            assert db_po.beneficiary_ifsc == "SBIN0004321"

        # 6. Test Supplier Payout Webhook (POST /api/v1/webhooks/decentro/payouts)
        po_wh_payload = {
            "reference_id": po_ref,
            "decentro_txn_id": po_decentro_id,
            "transaction_status": "SUCCESS",
            "bank_reference_number": "UTR_PO_990011",
        }
        raw_po = json.dumps(po_wh_payload).encode("utf-8")
        sig_po = compute_hmac_sha256_hex(raw_po, settings.DECENTRO_WEBHOOK_SECRET)
        res_po_wh = await client.post(
            "/api/v1/webhooks/decentro/payouts",
            content=raw_po,
            headers={"Content-Type": "application/json", "x-decentro-signature": sig_po},
        )
        assert res_po_wh.status_code == 200, res_po_wh.text
        assert res_po_wh.json()["response_code"] == "CB_S00000"

        # 7. Test GSTIN Verification (POST /api/v1/banking/kyc/gstin)
        gst_req = {
            "gstin": "21AABCK1234F1Z5",
            "consent": True,
        }
        res_gst = await client.post("/api/v1/banking/kyc/gstin", json=gst_req)
        assert res_gst.status_code == 200, res_gst.text
        data_gst = res_gst.json()
        assert data_gst["gstin"] == "21AABCK1234F1Z5"
        assert data_gst["legal_name"] is not None
        assert data_gst["registration_status"] == "ACTIVE"

    app.dependency_overrides.clear()
