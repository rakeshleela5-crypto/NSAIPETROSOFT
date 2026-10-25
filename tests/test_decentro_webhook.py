import asyncio
import hashlib
import hmac
import json
import os
import sys
import pytest
from httpx import AsyncClient, ASGITransport
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

sys.path.insert(0, "backend")

from app.core.config import settings
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

    payload = {
        "attempt": 1,
        "timestamp": "2026-10-25 13:10:00",
        "callbackTxnId": "DEC_TXN_99887766",
        "originalCallbackTxnId": "DEC_TXN_99887766",
        "transactionStatus": "SUCCESS",
        "referenceId": "INV-PETRO-2026-001",
        "decentroTxnId": "XYZ123456789",
        "transactionMessage": "UPI Collection Successful",
        "transferType": "UPI",
        "bankReferenceNumber": "629813459012",  # UTR Number - MUST be unique in DB
        "beneficiaryAccountNumber": "46252000012345",
        "transactionAmount": 4500.00,
        "payerVpa": "fleetcustomer@ybl"
    }
    
    signature = generate_signature(payload, DECENTRO_WEBHOOK_SECRET)
    headers = {
        "Content-Type": "application/json",
        "x-decentro-signature": signature
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
        assert all(code in (200, 201) for code in status_codes)

        # Verify via your ledger endpoint that the balance only increased by ₹4,500 ONCE
        ledger_res = await client.get("/api/v1/reconciliation/utr/629813459012")
        assert ledger_res.status_code == 200
        assert ledger_res.json()["count"] == 1

    app.dependency_overrides.clear()
    await engine.dispose()
