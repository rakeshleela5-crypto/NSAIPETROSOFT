import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from sqlalchemy.orm.exc import StaleDataError

from app.api.v1.api import api_router
from app.api.v1.endpoints.health import router as health_router
from app.core.config import settings
from app.core.limiter import limiter
from app.core.time import now_ist
from app.db.session import init_db, AsyncSessionLocal


from app.services.scheduler import background_cron_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    try:
        await init_db()
    except Exception as exc:
        print(f"Warning: Database initialization skipped or deferred: {exc}")

    # Launch background scheduler for anomaly detection & automated daily backups (#41, #97, #98, #104)
    cron_task = asyncio.create_task(background_cron_scheduler(initial_delay_sec=30, interval_sec=1800))
    yield
    cron_task.cancel()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Backend API powered by FastAPI and PostgreSQL on Railway",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Rate Limiting Configuration (#2, #18, #42)
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ---------------------------------------------------------------------------
# Strict Security Headers Middleware (#18, #43, #44, #45)
# ---------------------------------------------------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Injects mandatory browser security defense headers:
    - X-Content-Type-Options: nosniff (prevents MIME type sniffing)
    - X-Frame-Options: DENY (prevents clickjacking attacks)
    - Referrer-Policy: strict-origin-when-cross-origin
    - X-XSS-Protection: 1; mode=block
    - Permissions-Policy: geolocation=(), camera=(), microphone=()
    """
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ---------------------------------------------------------------------------
# Strict CORS Configuration (#18)
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://nsaipetrosoft.pages.dev",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*nsaipetrosoft\.pages\.dev$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Decentro HMAC-SHA256 Webhook Security Middleware (#17, #36)
# ---------------------------------------------------------------------------
from app.core.security_decentro import DecentroWebhookSignatureMiddleware
app.add_middleware(DecentroWebhookSignatureMiddleware)

# ---------------------------------------------------------------------------
# Financial & Concurrency Idempotency Middleware (#14, #15, #35)
# ---------------------------------------------------------------------------
from app.core.idempotency import IdempotencyMiddleware, IdempotencyCachedResponse
app.add_middleware(IdempotencyMiddleware)

# Direct root & health endpoints (convenient for Railway health checks)
@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "docs": "/docs",
        "health": "/health",
        "environment": settings.ENVIRONMENT,
    }


@app.exception_handler(IdempotencyCachedResponse)
async def idempotency_cached_response_handler(request: Request, exc: IdempotencyCachedResponse):
    """Replays exact status and cached body for duplicate requests with completed idempotency keys."""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.response_body,
        headers={"X-Cache-Lookup": "HIT", "X-Idempotent-Replay": "true"},
    )


@app.exception_handler(StaleDataError)
async def stale_data_error_handler(request: Request, exc: StaleDataError):
    """Returns HTTP 409 Conflict when optimistic locking version_id detects concurrent modifications."""
    return JSONResponse(
        status_code=409,
        content={
            "detail": "Conflict: Record has been modified by another manager or concurrent transaction. Please refresh the page and retry.",
            "error": "STALE_DATA_ERROR",
            "path": request.url.path,
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, RateLimitExceeded):
        return _rate_limit_exceeded_handler(request, exc)

    import traceback
    err_tb = traceback.format_exc()
    print(f"ERROR on {request.method} {request.url.path}: {exc}\n{err_tb}")
    detail_msg = "An internal server error occurred." if settings.ENVIRONMENT.lower() in ("production", "prod") else str(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": detail_msg, "path": request.url.path},
    )


app.include_router(health_router)
app.include_router(api_router, prefix=settings.API_V1_STR)

# Mount Decentro webhooks directly at root (/webhooks/decentro/*)
from app.routers.banking import webhooks_router
app.include_router(webhooks_router)

# Mount Real-Time Station WebSockets (/ws/station/{station_id}) (#54)
from app.routers.websockets import router as ws_router
app.include_router(ws_router)
