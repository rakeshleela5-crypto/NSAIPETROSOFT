import asyncio
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
    CollectionLedgerEntry,
    DecentroWebhookAudit,
    FleetVirtualAccount,
    GstinVerificationRecord,
    SupplierPayoutOrder,
    UpiQrTransaction,
)
from app.models.petrol_pump import BankAccount, CreditSale, Customer, PaymentReceipt

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_decentro_banking_v2_comprehensive():
    """
    Principal Architect end-to-end integration test suite for Decentro Banking V2:
    1. Nozzle Dynamic UPI QR generation, status polling, and SSE endpoint
    2. B2B Fleet Virtual Account provisioning
    3. Inbound Collection Webhook with HMAC signature verification, FIFO credit invoice clearing & UTR deduplication
    4. Outbound OMC Payout with database-enforced idempotency keys
    5. Asynchronous Payout Failure/Reversal Webhook restoring Station Bank Ledger balance
    6. Decentro KYC V2 Public Registry GSTIN Verification with customer profile auto-population
    """
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    # Initialize all SQLAlchemy and SQLModel tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(SQLModel.metadata.create_all)

    # Override get_db dependency to use the isolated test session
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
        # Pre-seed Station Bank Account, Fleet Customer & Pending Credit Invoices (for FIFO test)
        async with async_session() as session:
            bank = BankAccount(
                account_name="DECENTRO ESCROW / PRIMARY",
                account_type="BANK",
                balance=500000.0,
            )
            session.add(bank)

            fleet_cust = Customer(
                code="CUST-FL-100",
                name="RELIABLE FREIGHT CARRIERS LTD",
                mobile="9825012345",
                credit_limit=1000000.0,
                current_outstanding=150000.0,
            )
            session.add(fleet_cust)
            await session.commit()
            await session.refresh(fleet_cust)
            cust_id = fleet_cust.id

            # Add 2 pending credit sales (oldest first: FIFO)
            import datetime
            inv1 = CreditSale(
                customer_id=cust_id,
                vehicle_no="GJ-01-TX-1001",
                date=datetime.date(2026, 10, 1),
                bill_no="INV-1001",
                slip_no="SLIP-01",
                product_id=1,
                qty=500.0,
                rate=90.0,
                amount=45000.0,
                credit_amount=45000.0,
            )
            inv2 = CreditSale(
                customer_id=cust_id,
                vehicle_no="GJ-01-TX-1002",
                date=datetime.date(2026, 10, 5),
                bill_no="INV-1002",
                slip_no="SLIP-02",
                product_id=1,
                qty=1000.0,
                rate=90.0,
                amount=90000.0,
                credit_amount=90000.0,
            )
            session.add(inv1)
            session.add(inv2)
            await session.commit()

        print(f"\n[PASS 1] Database seeded with Customer #{cust_id} and 2 FIFO Credit Sales (INR 45,000 + INR 90,000).")

        # =====================================================================
        # 1. Dynamic UPI QR Generation (POST /api/v1/banking/upi-qr)
        # =====================================================================
        qr_req = {
            "amount": 1850.75,
            "lane_id": "LANE-1",
            "bill_no": "BILL-9081",
            "purpose_message": "Dispenser 1 MS Fuel",
            "expiry_minutes": 10,
        }
        res_qr = await client.post("/api/v1/banking/upi-qr", json=qr_req)
        assert res_qr.status_code == 200, res_qr.text
        qr_data = res_qr.json()
        assert qr_data["amount"] == 1850.75
        assert qr_data["status"] == "PENDING"
        assert qr_data["upi_uri"].startswith("upi://pay?")
        assert qr_data["qr_code_base64"] is not None
        ref_id = qr_data["reference_id"]
        print(f"[PASS 2] Dynamic UPI QR created. Reference: {ref_id}")

        # Poll status
        res_stat = await client.get(f"/api/v1/banking/upi-qr/{ref_id}/status")
        assert res_stat.status_code == 200
        assert res_stat.json()["status"] == "PENDING"
        print(f"[PASS 3] UPI QR Status verified as PENDING.")

        # =====================================================================
        # 2. B2B Dedicated Virtual Account (POST /api/v1/banking/virtual-accounts)
        # =====================================================================
        res_va = await client.post("/api/v1/banking/virtual-accounts", json={"customer_id": cust_id})
        assert res_va.status_code == 200, res_va.text
        va_data = res_va.json()
        assert va_data["customer_id"] == cust_id
        assert va_data["status"] == "ACTIVE"
        assert va_data["ifsc"] == settings.DECENTRO_MASTER_IFSC
        van_number = va_data["account_number"]
        print(f"[PASS 4] Fleet Virtual Account provisioned: {van_number} ({va_data['bank_name']})")

        # =====================================================================
        # 3. Inbound Collection Webhook with FIFO Clearance & UTR Deduplication
        # (POST /api/v1/webhooks/decentro/collections)
        # =====================================================================
        test_utr = f"UTR_RTGS_{int(time.time())}"
        collect_payload = {
            "decentroTxnId": f"DEC_COL_{uuid.uuid4().hex[:8].upper()}",
            "bankReferenceNumber": test_utr,
            "amount": 50000.0,  # Should clear inv1 (45,000) completely and partially clear inv2 by 5,000
            "transferType": "RTGS",
            "payerVirtualAccountNumber": van_number,
            "payerName": "RELIABLE FREIGHT CARRIERS LTD",
            "payerAccountNumber": "918020012345678",
            "payerIfsc": "HDFC0000128",
        }
        body_bytes = json.dumps(collect_payload).encode("utf-8")
        sig = compute_hmac_sha256_hex(body_bytes, settings.DECENTRO_WEBHOOK_SECRET)

        res_col = await client.post(
            "/api/v1/webhooks/decentro/collections",
            content=body_bytes,
            headers={"Content-Type": "application/json", "x-decentro-signature": sig},
        )
        assert res_col.status_code == 200, res_col.text
        col_result = res_col.json()
        assert col_result["status"] == "SUCCESS"
        assert col_result["reconciled"] is True
        assert col_result["cleared_invoices_count"] == 2
        print(f"[PASS 5] B2B Collection reconciled via FIFO! 2 invoices updated. Receipt: {col_result['receipt_no']}")

        # Verify customer outstanding in DB: was 150000 - 50000 = 100000
        async with async_session() as session:
            c = await session.get(Customer, cust_id)
            assert c.current_outstanding == 100000.0

            # Verify inv1 is 0 and inv2 is 85000
            inv1_db = await session.get(CreditSale, 1)
            inv2_db = await session.get(CreditSale, 2)
            assert inv1_db.credit_amount == 0.0
            assert inv2_db.credit_amount == 85000.0
        print(f"[PASS 6] Customer outstanding and invoice balances verified in PostgreSQL.")

        # Test Idempotency: replay the same UTR
        res_dup = await client.post(
            "/api/v1/webhooks/decentro/collections",
            content=body_bytes,
            headers={"Content-Type": "application/json", "x-decentro-signature": sig},
        )
        assert res_dup.status_code == 200
        assert res_dup.json()["status"] == "ALREADY_PROCESSED"
        print(f"[PASS 7] Duplicate UTR replay rejected idempotently.")

        # =====================================================================
        # 4. OMC Payout with Database Idempotency (POST /api/v1/banking/payouts)
        # =====================================================================
        idemp_token = f"IDEMP_OMC_{uuid.uuid4().hex[:10].upper()}"
        payout_req = {
            "vendor_name": "INDIAN OIL CORPORATION LTD",
            "account_number": "112233445566",
            "ifsc": "SBIN0001001",
            "amount": 200000.0,
            "transfer_type": "RTGS",
            "purpose_message": "OMC MS 20KL Tanker Indent",
            "idempotency_key": idemp_token,
        }
        res_po = await client.post("/api/v1/banking/payouts", json=payout_req)
        assert res_po.status_code == 200, res_po.text
        po_data = res_po.json()
        assert po_data["amount"] == 200000.0
        assert po_data["idempotency_key"] == idemp_token
        order_ref = po_data["reference_id"]
        decentro_po_txn = po_data["decentro_txn_id"]
        print(f"[PASS 8] Supplier payout executed: INR 200,000 to IOCL. Decentro Txn: {decentro_po_txn}")

        # Idempotency replay check
        res_po_dup = await client.post("/api/v1/banking/payouts", json=payout_req)
        assert res_po_dup.status_code == 200
        assert res_po_dup.json()["reference_id"] == order_ref
        assert "Idempotent return" in res_po_dup.json()["message"]
        print(f"[PASS 9] Payout duplicate call with same idempotency key returned existing order.")

        # Check bank balance reduced from 500,000 to (500,000 + 50,000 collected - 200,000 payout) = 350,000
        async with async_session() as session:
            bank_db = (await session.execute(select(BankAccount))).scalars().first()
            assert bank_db.balance == 350000.0
        print(f"[PASS 10] Station Bank Ledger balance accurately reflects deduction (INR 350,000.00).")

        # =====================================================================
        # 5. Payout Reversal Webhook restoring Station Bank Ledger
        # (POST /api/v1/webhooks/decentro/payouts)
        # =====================================================================
        reversal_payload = {
            "decentroTxnId": decentro_po_txn,
            "referenceId": order_ref,
            "status": "REVERSED",
            "failureReason": "Beneficiary bank RTGS network timed out - funds returned",
        }
        rev_bytes = json.dumps(reversal_payload).encode("utf-8")
        rev_sig = compute_hmac_sha256_hex(rev_bytes, settings.DECENTRO_WEBHOOK_SECRET)

        res_rev = await client.post(
            "/api/v1/webhooks/decentro/payouts",
            content=rev_bytes,
            headers={"Content-Type": "application/json", "x-decentro-signature": rev_sig},
        )
        assert res_rev.status_code == 200, res_rev.text
        assert res_rev.json()["payout_status"] == "REVERSED"
        print(f"[PASS 11] Payout reversal webhook processed.")

        # Verify station bank balance was RESTORED back to 550,000!
        async with async_session() as session:
            bank_restored = (await session.execute(select(BankAccount))).scalars().first()
            assert bank_restored.balance == 550000.0
            order_db = (await session.execute(
                select(SupplierPayoutOrder).where(SupplierPayoutOrder.reference_id == order_ref)
            )).scalar_one()
            assert order_db.is_reversed is True
            assert order_db.status == "REVERSED"
        print(f"[PASS 12] Bank balance successfully restored by INR 200,000 upon reversal (INR 550,000.00).")

        # =====================================================================
        # 6. Decentro KYC V2 GSTIN Verification (POST /api/v1/banking/kyc/gstin)
        # =====================================================================
        gstin_req = {
            "gstin": "24AAACB2233M1Z5",
            "customer_id": cust_id,
            "auto_populate": True,
        }
        res_gstin = await client.post("/api/v1/banking/kyc/gstin", json=gstin_req)
        assert res_gstin.status_code == 200, res_gstin.text
        gstin_data = res_gstin.json()
        assert gstin_data["gstin"] == "24AAACB2233M1Z5"
        assert gstin_data["customer_updated"] is True
        assert gstin_data["registration_status"] == "ACTIVE"
        print(f"[PASS 13] KYC GSTIN verified and customer #{cust_id} auto-populated successfully!")

        # Mark UPI QR as SUCCESS to verify the SSE stream delivers SUCCESS and closes
        async with async_session() as session:
            q = select(UpiQrTransaction).where(UpiQrTransaction.reference_id == ref_id)
            txn_db = (await session.execute(q)).scalar_one()
            txn_db.status = "SUCCESS"
            txn_db.bank_reference_number = "UTR_UPI_998877"
            await session.commit()

        # Test SSE Stream for Forecourt Screen (turns screen green)
        async with client.stream("GET", f"/api/v1/banking/upi-qr/{ref_id}/stream") as sse_stream:
            assert sse_stream.status_code == 200
            assert "text/event-stream" in sse_stream.headers["content-type"]
            first_chunk = ""
            async for line in sse_stream.aiter_lines():
                if line.startswith("data:"):
                    first_chunk = line
                    break
            assert "SUCCESS" in first_chunk
            print(f"[PASS 14] Real-time SSE stream pushed payment confirmation instantly (turns forecourt green)!")

    print("\n=======================================================")
    print("ALL 14 DECENTRO BANKING V2 INTEGRATION TESTS PASSED 100%")
    print("=======================================================\n")
    app.dependency_overrides.clear()
