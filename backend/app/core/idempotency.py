import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import Header, HTTPException, Request, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from app.db.session import get_db, AsyncSessionLocal
from app.models.audit import IdempotencyKey


class IdempotencyCachedResponse(Exception):
    """
    Raised when an incoming request matches a COMPLETED idempotency key.
    Caught by global exception handler to return the exact cached response.
    """
    def __init__(self, status_code: int, response_body: Any):
        self.status_code = status_code
        self.response_body = response_body


async def verify_idempotency_key(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_idempotency_key: Optional[str] = Header(None, alias="X-Idempotency-Key"),
) -> Optional[str]:
    """
    Reusable FastAPI dependency that enforces idempotency on state-mutating requests.
    - If key is currently in progress ('PROCESSING'): Returns HTTP 409 Conflict.
    - If key has already completed ('COMPLETED'): Raises IdempotencyCachedResponse to replay cached body & status.
    - If new: Inserts a record with status='PROCESSING'.
    """
    if not x_idempotency_key or not x_idempotency_key.strip():
        # Header not provided; proceed normally
        return None

    key = x_idempotency_key.strip()

    # Store in request state for ASGI middleware / downstream helpers
    request.state.idempotency_key = key
    if hasattr(request, "scope") and isinstance(request.scope.get("state"), dict):
        request.scope["state"]["idempotency_key"] = key

    # Read cached request body for SHA256 checksum
    body_bytes = await request.body()
    req_hash = hashlib.sha256(body_bytes).hexdigest()

    # Query IdempotencyKey table
    stmt = select(IdempotencyKey).where(IdempotencyKey.key == key)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()

    if existing:
        if existing.status == "PROCESSING":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Transaction with idempotency key '{key}' is currently being processed. Please wait.",
            )
        elif existing.status == "COMPLETED":
            raise IdempotencyCachedResponse(
                status_code=existing.response_status,
                response_body=existing.response_body,
            )
    else:
        # Create initial PROCESSING record
        new_record = IdempotencyKey(
            key=key,
            endpoint=str(request.url.path),
            request_hash=req_hash,
            response_status=200,
            status="PROCESSING",
            created_at=datetime.now(timezone.utc),
        )
        db.add(new_record)
        await db.commit()

    return key


class IdempotencyMiddleware:
    """
    Pure ASGI middleware that intercepts successful HTTP responses
    and persists the response body into the IdempotencyKey table.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if scope["method"] not in ("POST", "PUT", "PATCH"):
            await self.app(scope, receive, send)
            return

        status_code = 200
        response_body_chunks = []

        async def custom_send(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            elif message["type"] == "http.response.body":
                response_body_chunks.append(message.get("body", b""))
            await send(message)

        await self.app(scope, receive, custom_send)

        # After the response finishes, check if an idempotency key was registered
        state = scope.get("state", {})
        key = state.get("idempotency_key") if isinstance(state, dict) else None

        if key and status_code < 500:
            raw_body = b"".join(response_body_chunks)
            try:
                body_json = json.loads(raw_body.decode("utf-8"))
            except Exception:
                body_json = {"raw": raw_body.decode("utf-8", errors="ignore")}

            try:
                async with AsyncSessionLocal() as session:
                    stmt = select(IdempotencyKey).where(IdempotencyKey.key == key)
                    res = await session.execute(stmt)
                    record = res.scalar_one_or_none()
                    if record and record.status == "PROCESSING":
                        record.status = "COMPLETED"
                        record.response_status = status_code
                        record.response_body = body_json
                        await session.commit()
            except Exception as exc:
                print(f"[IdempotencyMiddleware] Note updating key '{key}': {exc}")
