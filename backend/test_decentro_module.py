import asyncio
import hashlib
import hmac
import json
import time
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security_decentro import compute_hmac_sha256_hex
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.decentro import (
    CustomerVirtualAccount,
    DecentroTransaction,
    DecentroWebhookLog,
    SupplierPayout,
)
from app.models.petrol_pump import BankAccount, Customer, PaymentReceipt

# Use in-memory SQLite for high-speed, isolated integration tests
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_decentro_integration_suite():
    # 1. Setup in-memory test database
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Override get_db dependency to use the test session
    async def override_get_db():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Pre-seed a test Fleet Customer & Bank Account
        async with async_session() as session:
            test_customer = Customer(
                code="CUST-0099",
                name="GUJARAT ROADWAYS LOGISTICS LTD",
                mobile="9876543210",
                gst_no="24AAACB2233M1Z5",
                pan_no="AAACB2233M",
                credit_limit=500000.0,
                current_outstanding=125000.0,
            )
            session.add(test_customer)

            test_bank = BankAccount(
                account_name="DECENTRO ESCROW / NODAL",
                account_type="BANK",
                balance=200000.0,
            )
            session.add(test_bank)
            await session.commit()
            await session.refresh(test_customer)
            customer_id = test_customer.id

        print(f"\n[TEST 1] Setup complete: Customer #{customer_id} with initial outstanding: INR 125,000.00")

        # =====================================================================
        # 1. Dynamic UPI QR Code Generation
        # =====================================================================
        upi_payload = {
            "amount": 2450.50,
            "purpose_message": "Lane 2 Petrol Bill #1048",
            "lane_id": "LANE-2",
            "bill_no": "BILL-1048",
            "expiry_minutes": 15,
        }
        res = await client.post("/api/v1/decentro/upi/generate-qr", json=upi_payload)
        assert res.status_code == 200, res.text
        upi_data = res.json()
        assert upi_data["amount"] == 2450.50
        assert upi_data["status"] == "PENDING"
        assert upi_data["upi_uri"].startswith("upi://pay?")
        assert upi_data["qr_code_base64"] is not None
        ref_id = upi_data["reference_id"]
        print(f"[TEST 2] Dynamic UPI QR created successfully. Reference: {ref_id}")

        # Check status endpoint
        res_status = await client.get(f"/api/v1/decentro/upi/status/{ref_id}")
        assert res_status.status_code == 200
        assert res_status.json()["reference_id"] == ref_id
        print(f"[TEST 3] UPI QR status verified.")

        # =====================================================================
        # 2. Virtual Account Creation
        # =====================================================================
        va_payload = {
            "customer_id": customer_id,
            "bank_code": "YESB",
            "custom_vpa": "gujaratroadways@yesbank",
        }
        res_va = await client.post("/api/v1/decentro/virtual-account/create", json=va_payload)
        assert res_va.status_code == 200, res_va.text
        va_data = res_va.json()
        assert va_data["customer_id"] == customer_id
        assert va_data["status"] == "ACTIVE"
        van_number = va_data["virtual_account_number"]
        assert van_number.startswith("NSAI")
        print(f"[TEST 4] Virtual Account provisioned: {van_number} for customer #{customer_id}")

        # Query customer virtual account
        res_va_query = await client.get(f"/api/v1/decentro/virtual-account/customer/{customer_id}")
        assert res_va_query.status_code == 200
        assert res_va_query.json()["virtual_account_number"] == van_number
        print(f"[TEST 5] Virtual Account retrieval verified.")

        # =====================================================================
        # 3. Webhook HMAC-SHA256 Signature Verification & Real-Time Reconciliation
        # =====================================================================
        utr_test = f"YESBR5{int(time.time())}9901"
        webhook_body = {
            "attempt": 1,
            "decentroTxnId": f"DEC_TXN_{uuid.uuid4().hex[:8].upper()}",
            "bankReferenceNumber": utr_test,
            "amount": 45000.00,
            "transactionType": "CREDIT",
            "transferType": "NEFT",
            "payerVirtualAccountNumber": van_number,
            "payerAccountNumber": "998877665544",
            "payerName": "GUJARAT ROADWAYS LOGISTICS LTD",
            "payerIfsc": "HDFC0000123",
            "timestamp": "2026-10-20 23:20:00",
            "transactionStatus": "SUCCESS",
        }
        raw_body_bytes = json.dumps(webhook_body).encode("utf-8")

        # 3a. Test Spoofing Defense: Reject missing or wrong HMAC signature
        bad_sig_res = await client.post(
            "/api/v1/decentro/webhooks/incoming",
            content=raw_body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Decentro-Signature": "invalid_spoofed_signature_hash_12345",
            },
        )
        assert bad_sig_res.status_code == 401, f"Expected 401 on bad signature, got {bad_sig_res.status_code}"
        print("[TEST 6] Spoofing attack blocked: Invalid HMAC signature rejected with 401 Unauthorized.")

        # 3b. Test Valid HMAC-SHA256 Signature
        valid_signature = compute_hmac_sha256_hex(raw_body_bytes, settings.DECENTRO_WEBHOOK_SECRET)
        good_res = await client.post(
            "/api/v1/decentro/webhooks/incoming",
            content=raw_body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Decentro-Signature": valid_signature,
            },
        )
        assert good_res.status_code == 200, good_res.text
        recon_data = good_res.json()
        assert recon_data["status"] == "SUCCESS"
        assert recon_data["reconciled"] is True
        assert recon_data["utr"] == utr_test
        assert recon_data["receipt_no"] is not None
        # Outstanding was 125,000 - 45,000 = 80,000
        assert recon_data["updated_outstanding"] == 80000.00
        print(f"[TEST 7] Webhook authenticated & reconciled: Ledger updated (New balance: INR 80,000.00).")

        # 3c. Test Idempotency: Duplicate webhook with same UTR must not double-credit
        dup_res = await client.post(
            "/api/v1/decentro/webhooks/incoming",
            content=raw_body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Decentro-Signature": valid_signature,
            },
        )
        assert dup_res.status_code == 200
        dup_data = dup_res.json()
        assert dup_data["status"] == "ALREADY_PROCESSED"
        print("[TEST 8] Idempotency verified: Duplicate webhook UTR safely acknowledged without double-crediting.")

        # =====================================================================
        # 4. Supplier Payouts with Idempotency Key
        # =====================================================================
        idempotency_key = f"IDEMP_BPCL_INDENT_{int(time.time())}"
        payout_payload = {
            "vendor_name": "BHARAT PETROLEUM CORPORATION LTD",
            "account_number": "112233445566",
            "ifsc": "SBIN0001234",
            "amount": 150000.00,
            "transfer_type": "NEFT",
            "purpose_message": "Decantation Indent 12KL MS BPCL Depot",
            "idempotency_key": idempotency_key,
        }

        # First payout execution
        payout_res = await client.post("/api/v1/decentro/payouts/initiate", json=payout_payload)
        assert payout_res.status_code == 200, payout_res.text
        payout_data = payout_res.json()
        assert payout_data["status"] == "SUCCESS"
        assert payout_data["amount"] == 150000.00
        assert payout_data["bank_reference_number"] is not None
        payout_utr = payout_data["bank_reference_number"]
        print(f"[TEST 9] Supplier Payout executed: INR 150,000 disbursed to BPCL (UTR: {payout_utr}).")

        # Immediate replay with exact same idempotency key
        replay_res = await client.post("/api/v1/decentro/payouts/initiate", json=payout_payload)
        assert replay_res.status_code == 200
        replay_data = replay_res.json()
        assert replay_data["bank_reference_number"] == payout_utr
        assert "Idempotent return" in replay_data["message"]
        print("[TEST 10] Payout idempotency verified: Replay intercepted without double-disbursement.")

        # =====================================================================
        # 5. GSTIN Verification
        # =====================================================================
        # 5a. Format validation rejection
        bad_gstin_res = await client.post("/api/v1/decentro/kyc/verify-gstin", json={"gstin": "12345INVALID"})
        assert bad_gstin_res.status_code == 422
        print("[TEST 11] Malformed GSTIN correctly rejected with 422 Unprocessable Entity.")

        # 5b. Valid GSTIN verification & Customer profile auto-update
        valid_gstin = "24AAACB2233M1Z5"
        gstin_res = await client.post(
            "/api/v1/decentro/kyc/verify-gstin",
            json={
                "gstin": valid_gstin,
                "customer_id": customer_id,
                "update_customer": True,
            },
        )
        assert gstin_res.status_code == 200, gstin_res.text
        gstin_data = gstin_res.json()
        assert gstin_data["is_valid"] is True
        assert gstin_data["state_code"] == "24"
        assert gstin_data["customer_updated"] is True
        assert gstin_data["gstin_status"].upper() == "ACTIVE"
        print(f"[TEST 12] GSTIN {valid_gstin} verified & customer profile auto-updated.")

        # 6. Audit Trail Endpoint Verification
        txns_res = await client.get("/api/v1/decentro/transactions")
        assert txns_res.status_code == 200
        assert txns_res.json()["count"] >= 3
        print(f"[TEST 13] Transaction audit trail confirmed with {txns_res.json()['count']} logged records.")

    print("\n[SUCCESS] ALL 13 DECENTRO ENTERPRISE INTEGRATION TESTS PASSED WITH 100% SUCCESS!\n")


if __name__ == "__main__":
    asyncio.run(test_decentro_integration_suite())
