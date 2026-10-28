import asyncio
from contextlib import asynccontextmanager
import json
import os
import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

import app.core.idempotency as idempotency_mod
from app.core.config import settings
from app.core.security import create_access_token
from app.core.security_decentro import compute_hmac_sha256_hex
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.audit import IdempotencyKey
from app.models.petrol_pump import BankAccount, Customer, PaymentReceipt, User


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@asynccontextmanager
async def setup_test_context():
    """
    Sets up an isolated SQLite test database engine and sessionmaker
    for end-to-end integration tests.
    """
    db_file = f"test_e2e_{uuid.uuid4().hex[:8]}.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_file}",
        connect_args={"timeout": 30},
        echo=False,
    )
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(SQLModel.metadata.create_all)

    async def override_get_db():
        async with async_session() as session:
            yield session

    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = override_get_db
    idempotency_mod.AsyncSessionLocal = async_session

    try:
        yield async_session
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
        if os.path.exists(db_file):
            try:
                os.remove(db_file)
            except Exception:
                pass


@pytest.mark.asyncio
async def test_idempotency_business_logic_executes_only_once():
    """
    Verification Requirement 1:
    Sending two identical POST requests with the same X-Idempotency-Key
    executes the business logic only once.
    """
    async with setup_test_context() as async_session:
        # Seed Bank Account and Customer
        async with async_session() as session:
            bank = BankAccount(
                id=1,
                account_name="CASH ON HAND",
                account_type="CASH",
                balance=10000.0,
            )
            customer = Customer(
                id=1,
                code="CUST-IDEMP-01",
                name="Reliable Freight Logistics",
                mobile="9876543210",
                current_outstanding=1000.0,
            )
            session.add_all([bank, customer])
            await session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            idempotency_key = f"IDEMP-KEY-{uuid.uuid4().hex[:12].upper()}"
            payment_payload = {
                "customer_id": 1,
                "amount": 250.0,
                "payment_mode": "CASH",
                "receiving_account": "CASH ON HAND",
                "remarks": "Part-payment for diesel invoice",
                "receipt_no": f"RCP-IDEMP-{uuid.uuid4().hex[:6].upper()}",
            }
            headers = {"X-Idempotency-Key": idempotency_key}

            # Request 1: Initial creation request
            resp1 = await client.post("/api/v1/pump/payments", json=payment_payload, headers=headers)
            assert resp1.status_code == 200, f"Initial request failed: {resp1.text}"
            assert resp1.headers.get("X-Idempotent-Replay") is None
            data1 = resp1.json()
            assert data1["status"] == "success"
            assert data1["amount"] == 250.0

            # Request 2: Identical replay with exact same X-Idempotency-Key
            resp2 = await client.post("/api/v1/pump/payments", json=payment_payload, headers=headers)
            assert resp2.status_code == 200, f"Replay request failed: {resp2.text}"
            assert resp2.headers.get("X-Idempotent-Replay") == "true", "Expected X-Idempotent-Replay header"
            assert resp2.headers.get("X-Cache-Lookup") == "HIT"
            data2 = resp2.json()
            assert data2 == data1, "Replayed response body must exactly match original response body"

            # Verify Business Logic Executed ONLY ONCE in Database
            async with async_session() as session:
                cust = (await session.execute(select(Customer).where(Customer.id == 1))).scalar_one()
                receipts = (await session.execute(select(PaymentReceipt).where(PaymentReceipt.customer_id == 1))).scalars().all()
                idemp_record = (await session.execute(select(IdempotencyKey).where(IdempotencyKey.key == idempotency_key))).scalar_one()

                # Customer balance should be 1000.0 - 250.0 = 750.0 (DEDUCTED EXACTLY ONCE, NOT 500.0)
                assert cust.current_outstanding == 750.0, f"Expected 750.0, found {cust.current_outstanding}"
                # Only ONE payment receipt must exist
                assert len(receipts) == 1, f"Expected 1 receipt in DB, found {len(receipts)}"
                # Idempotency key state must be marked COMPLETED
                assert idemp_record.status == "COMPLETED"
                assert idemp_record.response_status == 200


@pytest.mark.asyncio
async def test_concurrent_credit_balance_deductions_locking():
    """
    Verification Requirement 2:
    Concurrent credit balance deductions lock properly and never result
    in negative or corrupted balances.
    """
    async with setup_test_context() as async_session:
        # Seed Customer with starting outstanding dues of INR 500.0
        async with async_session() as session:
            bank = BankAccount(
                id=1,
                account_name="CASH ON HAND",
                account_type="CASH",
                balance=50000.0,
            )
            customer = Customer(
                id=2,
                code="CUST-CONC-02",
                name="Trans Gujarat Carriers",
                mobile="9825123456",
                current_outstanding=500.0,
            )
            session.add_all([bank, customer])
            await session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # A. Test concurrent execution: 5 tasks attempting deductions simultaneously
            tasks = [
                client.post(
                    "/api/v1/pump/payments",
                    json={
                        "customer_id": 2,
                        "amount": 100.0,
                        "payment_mode": "CASH",
                        "receiving_account": "CASH ON HAND",
                        "remarks": f"Concurrent payment attempt {i}",
                        "receipt_no": f"RCP-CONC-{i}-{uuid.uuid4().hex[:6].upper()}",
                    },
                )
                for i in range(5)
            ]
            responses = await asyncio.gather(*tasks)
            status_codes = [r.status_code for r in responses]

            # Valid status codes: 200 (committed) or 409 (conflict serialized by locking)
            for sc in status_codes:
                assert sc in (200, 409), f"Unexpected status code under concurrency: {sc}"

            successful_count = sum(1 for sc in status_codes if sc == 200)
            assert successful_count >= 1, "At least one concurrent transaction must succeed"

            # Check DB consistency after concurrency: exact arithmetic, no corruption
            async with async_session() as session:
                cust = (await session.execute(select(Customer).where(Customer.id == 2))).scalar_one()
                receipts = (await session.execute(select(PaymentReceipt).where(PaymentReceipt.customer_id == 2))).scalars().all()

                expected_balance = 500.0 - (successful_count * 100.0)
                assert cust.current_outstanding == expected_balance, (
                    f"Balance corrupted! Expected {expected_balance}, got {cust.current_outstanding}"
                )
                assert len(receipts) == successful_count

            # B. Test Overdraft / Clamp: Deductions larger than remaining balance never go below 0
            overdraft_amount = cust.current_outstanding + 1000.0  # Excessive payment
            over_resp = await client.post(
                "/api/v1/pump/payments",
                json={
                    "customer_id": 2,
                    "amount": overdraft_amount,
                    "payment_mode": "CASH",
                    "receiving_account": "CASH ON HAND",
                    "remarks": "Excess payment to verify non-negative clamp",
                    "receipt_no": f"RCP-CLAMP-{uuid.uuid4().hex[:6].upper()}",
                },
            )
            assert over_resp.status_code == 200

            async with async_session() as session:
                cust_final = (await session.execute(select(Customer).where(Customer.id == 2))).scalar_one()
                assert cust_final.current_outstanding == 0.0, (
                    f"Balance went negative! Expected 0.0, got {cust_final.current_outstanding}"
                )
                assert cust_final.current_outstanding >= 0.0


@pytest.mark.asyncio
async def test_decentro_webhook_hmac_signature_rejection():
    """
    Verification Requirement 3:
    Invalid HMAC signatures on Decentro webhooks are rejected with HTTP 401/403.
    """
    async with setup_test_context() as async_session:
        # Seed Decentro Escrow Account
        async with async_session() as session:
            bank = BankAccount(
                id=1,
                account_name="DECENTRO ESCROW / PRIMARY",
                account_type="BANK",
                balance=100000.0,
            )
            session.add(bank)
            await session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            webhook_payload = {
                "decentroTxnId": f"DEC_WH_{uuid.uuid4().hex[:8].upper()}",
                "bankReferenceNumber": f"UTR_WH_{uuid.uuid4().hex[:8].upper()}",
                "amount": 25000.0,
                "transferType": "RTGS",
                "payerVirtualAccountNumber": "NSAI9999",
                "payerName": "Patel Petro Carriers",
                "payerAccountNumber": "918020098765432",
                "payerIfsc": "HDFC0000128",
            }
            body_bytes = json.dumps(webhook_payload).encode("utf-8")

            # 1. Missing HMAC signature header -> HTTP 401 Unauthorized
            res_missing = await client.post(
                "/api/v1/webhooks/decentro/collections",
                content=body_bytes,
                headers={"Content-Type": "application/json"},
            )
            assert res_missing.status_code in (401, 403), f"Expected 401/403, got {res_missing.status_code}"
            assert "signature" in res_missing.text.lower() or "unauthorized" in res_missing.text.lower()

            # 2. Tampered / invalid HMAC signature header -> HTTP 401 Unauthorized
            invalid_sig = "deadbeefbadc0ffee1234567890abcdef1234567890abcdef1234567890abcdef"
            res_invalid = await client.post(
                "/api/v1/webhooks/decentro/collections",
                content=body_bytes,
                headers={
                    "Content-Type": "application/json",
                    "X-Decentro-Signature": invalid_sig,
                },
            )
            assert res_invalid.status_code in (401, 403), f"Expected 401/403, got {res_invalid.status_code}"
            assert "signature" in res_invalid.text.lower() or "unauthorized" in res_invalid.text.lower()

            # 3. Valid HMAC signature computed with shared secret -> HTTP 200 OK
            valid_sig = compute_hmac_sha256_hex(body_bytes, settings.DECENTRO_WEBHOOK_SECRET)
            res_valid = await client.post(
                "/api/v1/webhooks/decentro/collections",
                content=body_bytes,
                headers={
                    "Content-Type": "application/json",
                    "X-Decentro-Signature": valid_sig,
                },
            )
            assert res_valid.status_code == 200, f"Valid signature was unexpectedly rejected: {res_valid.text}"
            assert res_valid.json()["status"] == "SUCCESS"


@pytest.mark.asyncio
async def test_role_guards_block_attendant_from_owner_endpoints():
    """
    Verification Requirement 4:
    Role guards block ATTENDANT users from accessing OWNER payout or audit log endpoints.
    """
    async with setup_test_context() as async_session:
        # Seed OWNER and ATTENDANT users
        async with async_session() as session:
            owner = User(
                id=10,
                username="station_owner",
                full_name="Rajesh Patel (Owner)",
                hashed_password="hashed_pw_secret",
                role="OWNER",
                is_active=True,
            )
            attendant = User(
                id=20,
                username="pump_attendant",
                full_name="Mukesh Kumar (Attendant)",
                hashed_password="hashed_pw_secret",
                role="ATTENDANT",
                is_active=True,
            )
            bank = BankAccount(
                id=1,
                account_name="DECENTRO ESCROW / PRIMARY",
                account_type="BANK",
                balance=1000000.0,
            )
            session.add_all([owner, attendant, bank])
            await session.commit()

        # Generate JWT Bearer tokens
        owner_token = create_access_token({"sub": "station_owner", "role": "OWNER"})
        attendant_token = create_access_token({"sub": "pump_attendant", "role": "ATTENDANT"})

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # -------------------------------------------------------------
            # Endpoint A: GET /api/v1/admin/audit-logs (Strictly OWNER role)
            # -------------------------------------------------------------
            # ATTENDANT token -> HTTP 403 Forbidden
            audit_att_resp = await client.get(
                "/api/v1/admin/audit-logs",
                headers={"Authorization": f"Bearer {attendant_token}"},
            )
            assert audit_att_resp.status_code == 403, (
                f"Expected ATTENDANT to be blocked with 403, got {audit_att_resp.status_code}"
            )
            assert "Forbidden" in audit_att_resp.json()["detail"]

            # OWNER token -> HTTP 200 OK
            audit_own_resp = await client.get(
                "/api/v1/admin/audit-logs",
                headers={"Authorization": f"Bearer {owner_token}"},
            )
            assert audit_own_resp.status_code == 200, (
                f"Expected OWNER to succeed with 200, got {audit_own_resp.status_code}: {audit_own_resp.text}"
            )
            assert "items" in audit_own_resp.json()

            # -------------------------------------------------------------
            # Endpoint B: POST /api/v1/payouts (OWNER & MANAGER roles only)
            # -------------------------------------------------------------
            payout_payload = {
                "vendor_name": "INDIAN OIL CORPORATION LTD",
                "account_number": "918020012345678",
                "ifsc": "SBIN0001001",
                "amount": 75000.0,
                "transfer_type": "RTGS",
                "purpose_message": "OMC HSD 12KL Bulk Purchase",
            }

            # ATTENDANT token -> HTTP 403 Forbidden
            payout_att_resp = await client.post(
                "/api/v1/payouts",
                json=payout_payload,
                headers={"Authorization": f"Bearer {attendant_token}"},
            )
            assert payout_att_resp.status_code == 403, (
                f"Expected ATTENDANT to be blocked from payout with 403, got {payout_att_resp.status_code}"
            )
            assert "Forbidden" in payout_att_resp.json()["detail"]

            # OWNER token -> HTTP 200 OK (Allowed payout execution)
            payout_own_resp = await client.post(
                "/api/v1/payouts",
                json=payout_payload,
                headers={"Authorization": f"Bearer {owner_token}"},
            )
            assert payout_own_resp.status_code == 200, (
                f"Expected OWNER payout to succeed with 200, got {payout_own_resp.status_code}: {payout_own_resp.text}"
            )
            assert payout_own_resp.json()["status"] == "SUCCESS"
            assert payout_own_resp.json()["amount"] == 75000.0
