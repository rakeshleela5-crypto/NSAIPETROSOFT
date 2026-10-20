import base64
import hashlib
import hmac
from typing import Optional
from fastapi import Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.config import settings
from app.core.logging_config import decentro_logger


def compute_hmac_sha256_hex(payload: bytes, secret: str) -> str:
    """Compute standard HMAC-SHA256 hex digest."""
    return hmac.new(
        key=secret.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha256,
    ).hexdigest()


def compute_hmac_sha256_base64(payload: bytes, secret: str) -> str:
    """Compute HMAC-SHA256 base64 digest."""
    digest = hmac.new(
        key=secret.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode("utf-8")


def verify_hmac_signature(
    payload: bytes,
    received_signature: Optional[str],
    secret: str,
) -> bool:
    """
    Timing-attack resistant verification of HMAC-SHA256 signature.
    Supports both hex and base64 digest representations.
    """
    if not received_signature or not secret:
        return False

    received_sig_clean = received_signature.strip()

    # Compare against hex digest
    expected_hex = compute_hmac_sha256_hex(payload, secret)
    if hmac.compare_digest(expected_hex.lower(), received_sig_clean.lower()):
        return True

    # Compare against base64 digest
    expected_b64 = compute_hmac_sha256_base64(payload, secret)
    if hmac.compare_digest(expected_b64, received_sig_clean):
        return True

    return False


async def verify_decentro_webhook_signature(request: Request) -> bool:
    """
    FastAPI Route Dependency to verify HMAC-SHA256 signature of incoming Decentro Webhooks.
    Raises HTTPException(401) on missing or spoofed signature.
    """
    raw_body = await request.body()
    secret = settings.DECENTRO_WEBHOOK_SECRET

    # Extract signature from common Decentro webhook headers
    signature = (
        request.headers.get("X-Decentro-Signature")
        or request.headers.get("x-decentro-signature")
        or request.headers.get("X-Signature")
        or request.headers.get("x-signature")
        or request.headers.get("X-Webhook-Signature")
        or request.headers.get("x-webhook-signature")
        or request.headers.get("signature")
    )

    # Allow local development/simulation bypass only if simulation mode is enabled and test flag passed
    is_simulation = getattr(settings, "DECENTRO_SIMULATION_MODE", False) or "demo" in settings.DECENTRO_CLIENT_ID.lower()
    if is_simulation and request.headers.get("X-Decentro-Simulation-Bypass") == "true":
        decentro_logger.warning(
            "Webhook signature check bypassed via X-Decentro-Simulation-Bypass header (DEV MODE ONLY)",
            extra={"path": request.url.path, "client_ip": request.client.host if request.client else "unknown"},
        )
        return True

    if not signature:
        decentro_logger.warning(
            "Decentro webhook rejected: Missing HMAC-SHA256 signature header",
            extra={
                "client_ip": request.client.host if request.client else "unknown",
                "headers": dict(request.headers),
                "path": request.url.path,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Decentro webhook signature header (X-Decentro-Signature).",
        )

    is_valid = verify_hmac_signature(raw_body, signature, secret)
    if not is_valid:
        decentro_logger.error(
            "Decentro webhook spoofing attempt detected: Invalid HMAC signature",
            extra={
                "client_ip": request.client.host if request.client else "unknown",
                "received_sig": signature[:8] + "...",
                "body_len": len(raw_body),
                "path": request.url.path,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Decentro webhook HMAC-SHA256 signature.",
        )

    return True


class DecentroWebhookSignatureMiddleware(BaseHTTPMiddleware):
    """
    ASGI Middleware to automatically intercept incoming calls to Decentro Webhook endpoints
    and verify HMAC-SHA256 signature before allowing execution.
    """

    WEBHOOK_PREFIXES = (
        "/api/v1/decentro/webhooks",
        "/decentro/webhooks",
        "/api/v1/webhooks/decentro",
        "/webhooks/decentro",
    )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path.rstrip("/")
        is_webhook = any(path.startswith(prefix) for prefix in self.WEBHOOK_PREFIXES)
        if is_webhook and request.method == "POST":
            # Read body bytes
            raw_body = await request.body()
            secret = settings.DECENTRO_WEBHOOK_SECRET

            signature = (
                request.headers.get("X-Decentro-Signature")
                or request.headers.get("x-decentro-signature")
                or request.headers.get("X-Signature")
                or request.headers.get("x-signature")
                or request.headers.get("X-Webhook-Signature")
                or request.headers.get("x-webhook-signature")
                or request.headers.get("signature")
            )

            is_simulation = (
                getattr(settings, "DECENTRO_SIMULATION_MODE", False)
                or "demo" in settings.DECENTRO_CLIENT_ID.lower()
            )
            bypass = is_simulation and request.headers.get("X-Decentro-Simulation-Bypass") == "true"

            if not bypass:
                if not signature or not verify_hmac_signature(raw_body, signature, secret):
                    decentro_logger.error(
                        "Middleware blocked unauthorized webhook request: invalid/missing HMAC signature",
                        extra={
                            "path": request.url.path,
                            "client_ip": request.client.host if request.client else "unknown",
                        },
                    )
                    return JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={
                            "error": "UNAUTHORIZED_WEBHOOK",
                            "detail": "Decentro HMAC-SHA256 signature verification failed.",
                        },
                    )

            # Re-feed raw body into request for downstream router/dependencies
            async def receive():
                return {"type": "http.request", "body": raw_body, "more_body": False}

            request._receive = receive

        return await call_next(request)
