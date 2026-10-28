import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
import psutil
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db

router = APIRouter()


@router.get("/health", summary="Deep Health Check & Operational Metrics (#74, #103)")
async def check_health(db: AsyncSession = Depends(get_db)):
    """
    Railway & Production Health Probe (#74, #103):
    1. Executes SELECT 1 on PostgreSQL to verify real-time query execution.
    2. Calculates precise database query round-trip latency in milliseconds.
    3. Reads actual process RSS memory consumption via psutil in megabytes.
    4. Returns {status: "ok", db: "connected", latency_ms: ..., memory_mb: ...}.
    """
    t0 = time.perf_counter()
    db_connected = True
    db_error = None

    try:
        res = await db.execute(text("SELECT 1"))
        val = res.scalar()
        if val != 1:
            db_connected = False
            db_error = f"Unexpected query scalar: {val}"
    except Exception as exc:
        db_connected = False
        db_error = str(exc)

    latency_ms = round((time.perf_counter() - t0) * 1000, 2)

    try:
        proc = psutil.Process()
        mem_info = proc.memory_info()
        memory_mb = round(mem_info.rss / (1024 * 1024), 2)
        cpu_percent = proc.cpu_percent(interval=None)
    except Exception:
        memory_mb = 0.0
        cpu_percent = 0.0

    payload = {
        "status": "ok" if db_connected else "degraded",
        "db": "connected" if db_connected else "error",
        "database": "connected" if db_connected else f"error: {db_error}",
        "latency_ms": latency_ms,
        "memory_mb": memory_mb,
        "cpu_percent": cpu_percent,
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0",
        "service": settings.PROJECT_NAME,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if not db_connected:
        payload["db_error"] = db_error
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=payload,
        )

    return payload
