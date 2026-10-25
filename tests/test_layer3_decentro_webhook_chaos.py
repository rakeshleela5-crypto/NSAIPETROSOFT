"""
Layer 3: Decentro Banking & Webhooks Chaos Test
Author: Lead FinTech Security & Banking Architect
Target: Decentro BaaS Webhooks & Ledger Reconciliation Engine

Validates:
1. Decentro Webhook Idempotency: Fires 5 identical callbacks simultaneously at the exact
   same millisecond to guarantee zero double-crediting in the forecourt ledger.
2. Verified via /api/v1/reconciliation/utr/{utr} asserting count == 1.
3. Cryptographic HMAC-SHA256 signature enforcement (rejects spoofed or tampered requests with 401).
4. Rejection of unauthenticated webhooks missing signature headers.
"""

import asyncio
import hashlib
import hmac
import json
import sys
import time
import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

sys.path.insert(0, "backend")

from app.core.config import settings
from app.core.security_decentro import compute_hmac_sha256_hex
from app.db.base import Base
from app.db.session import get_db
from app.main import app

DECENTRO_WEBHOOK_SECRET = settings.DECENTRO_WEBHOOK_SECRET

def generate_signature(payload: dict, secret: str) -> str:
    raw_body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_decentro_webhook_idempotency():
    """
    Simulates high-concurrency Decentro callback retry storm.
    Fires 5 identical Decentro UPI/Virtual Account callbacks at the exact same millisecond
    to prove your database won't double-credit a ledger.
    """
    test_db_url = "sqlite+aiosqlite:///:memory:"
    engine = create_async_engine(test_db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(SQLModel.metadata.create_all)

    async def override_get_db():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)

    unique_utr = f"629813{int(time.time())}"
    payload = {
        "attempt": 1,
        "timestamp": "2026-10-25 13:10:00",
        "callbackTxnId": f"DEC_TXN_{unique_utr}",
        "originalCallbackTxnId": f"DEC_TXN_{unique_utr}",
        "transactionStatus": "SUCCESS",
        "referenceId": f"INV-PETRO-{unique_utr[:8]}",
        "decentroTxnId": f"DEC_ID_{unique_utr}",
        "transactionMessage": "UPI Collection Successful",
        "transferType": "UPI",
        "bankReferenceNumber": unique_utr,  # UTR Number - MUST be unique in DB
        "beneficiaryAccountNumber": "46252000012345",
        "transactionAmount": 4500.00,
        "payerVpa": "fleetcustomer@ybl",
    }

    signature = generate_signature(payload, DECENTRO_WEBHOOK_SECRET)
    headers = {
        "Content-Type": "application/json",
        "x-decentro-signature": signature,
    }

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Fire 5 identical webhook requests simultaneously
        tasks = [
            client.post("/api/v1/webhooks/decentro", json=payload, headers=headers)
            for _ in range(5)
        ]
        responses = await asyncio.gather(*tasks)

        # All 5 should return 200 OK (so Decentro stops retrying),
        # or 1 returns 200 and 4 return 200/409 gracefully handled
        status_codes = [r.status_code for r in responses]
        assert all(code in (200, 201) for code in status_codes), f"Unexpected status codes: {status_codes}"

        # Inspect responses: at least one was SUCCESS, others ALREADY_PROCESSED
        statuses = [r.json().get("status") for r in responses]
        assert "SUCCESS" in statuses or "ALREADY_PROCESSED" in statuses, f"Responses: {statuses}"

        # Verify via your ledger endpoint that the balance only increased by ₹4,500 ONCE
        ledger_res = await client.get(f"/api/v1/reconciliation/utr/{unique_utr}")
        assert ledger_res.status_code == 200, ledger_res.text
        data = ledger_res.json()
        assert data["count"] == 1, f"Idempotency breach: expected count 1, got {data['count']}"
        assert data["utr"] == unique_utr

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_decentro_webhook_hmac_tamper_rejection():
    """
    Security Test: Verifies that any tampering with payload data or secret
    is instantly rejected with HTTP 401 Unauthorized before touching the database.
    """
    transport = ASGITransport(app=app)

    valid_payload = {
        "bankReferenceNumber": "UTR_SECURITY_CHECK_001",
        "transactionAmount": 1000.00,
        "transactionStatus": "SUCCESS",
    }
    # Compute signature with legitimate secret
    valid_sig = generate_signature(valid_payload, DECENTRO_WEBHOOK_SECRET)

    # Tamper with amount (e.g. attacker changes ₹1,000 to ₹100,000)
    tampered_payload = dict(valid_payload)
    tampered_payload["transactionAmount"] = 100000.00

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Tampered payload with original signature -> MUST REJECT (401)
        res_tampered = await client.post(
            "/api/v1/webhooks/decentro",
            json=tampered_payload,
            headers={"x-decentro-signature": valid_sig},
        )
        assert res_tampered.status_code == 401, f"Expected 401 for tampered payload, got {res_tampered.status_code}"

        # 2. Missing signature header -> MUST REJECT (401)
        res_missing = await client.post(
            "/api/v1/webhooks/decentro",
            json=valid_payload,
        )
        assert res_missing.status_code == 401, f"Expected 401 for missing signature, got {res_missing.status_code}"
