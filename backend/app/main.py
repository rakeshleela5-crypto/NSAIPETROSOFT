import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.api import api_router
from app.api.v1.endpoints.health import router as health_router
from app.core.config import settings
from app.core.time import now_ist
from app.db.session import init_db, AsyncSessionLocal


async def nightly_backup_scheduler():
    """
    Automated background worker that periodically creates Cloudflare R2 snapshots.
    Ensures a clean snapshot is saved daily during the night shift (23:45 IST).
    """
    await asyncio.sleep(60)  # Initial wait for server to settle
    while True:
        try:
            current_time = now_ist()
            # If during the night shift hour (23:00 IST)
            if current_time.hour == 23 and current_time.minute >= 45:
                from app.services.backup_service import create_and_store_backup
                async with AsyncSessionLocal() as session:
                    await create_and_store_backup(session)
                await asyncio.sleep(3600)  # Sleep 1 hour so it only triggers once tonight
        except Exception as exc:
            print(f"Background nightly backup task note: {exc}")
        await asyncio.sleep(1800)  # Check every 30 minutes


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    try:
        await init_db()
    except Exception as exc:
        print(f"Warning: Database initialization skipped or deferred: {exc}")

    # Launch background automated backup worker
    backup_task = asyncio.create_task(nightly_backup_scheduler())
    yield
    backup_task.cancel()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Backend API powered by FastAPI and PostgreSQL on Railway",
    lifespan=lifespan,
)

# CORS configuration allowing Cloudflare Pages, custom domains, and local development
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
    allow_methods=["*"],
    allow_headers=["*"],
)

# Decentro HMAC-SHA256 Webhook Security Middleware
from app.core.security_decentro import DecentroWebhookSignatureMiddleware
app.add_middleware(DecentroWebhookSignatureMiddleware)

# Direct root & health endpoints (convenient for Railway health checks)
@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "docs": "/docs",
        "health": "/health",
        "environment": settings.ENVIRONMENT,
    }


@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    import traceback
    err_tb = traceback.format_exc()
    print(f"ERROR on {request.method} {request.url.path}: {exc}\n{err_tb}")
    from fastapi.responses import JSONResponse
    detail_msg = "An internal server error occurred." if settings.ENVIRONMENT == "production" else str(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": detail_msg, "path": request.url.path},
    )


app.include_router(health_router)
app.include_router(api_router, prefix=settings.API_V1_STR)

# Also mount Decentro webhooks directly at root (/webhooks/decentro/*)
from app.routers.banking import webhooks_router
app.include_router(webhooks_router)
