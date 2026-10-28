import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import now_ist, today_ist
from app.core.websocket_manager import ws_manager
from app.db.session import AsyncSessionLocal
from app.models.petrol_pump import Shift, Tank, TankDipEntry
from app.services.backup_service import create_and_store_backup

logger = logging.getLogger(__name__)


async def check_unclosed_shifts_and_tank_anomalies(db: AsyncSession) -> Dict[str, Any]:
    """
    Scheduled Anomaly Detection Worker (#41, #104):
    1. Checks for any unclosed shifts past daily cutoff (e.g. shifts from previous dates with status != 'Closed').
    2. Flags underground tank dip vs. nozzle meter shortages exceeding normal statutory evaporation thresholds:
       - Petrol (MS): -0.59% of sales
       - Diesel (HSD): -0.15% of sales
    3. Broadcasts real-time alert notifications via WebSocket to connected manager/owner dashboards.
    """
    current_date = today_ist()
    unclosed_shifts_found: List[Dict[str, Any]] = []
    tank_shortages_found: List[Dict[str, Any]] = []

    # 1. Check for unclosed shifts past daily cutoff (#104)
    unclosed_stmt = (
        select(Shift)
        .where(
            Shift.status != "Closed",
            Shift.date < current_date,
        )
        .order_by(Shift.date.asc(), Shift.id.asc())
    )
    unclosed_res = await db.execute(unclosed_stmt)
    unclosed_shifts = unclosed_res.scalars().all()

    for shift in unclosed_shifts:
        shift_info = {
            "shift_id": shift.id,
            "so_number": shift.so_number,
            "shift_name": shift.shift_name,
            "date": str(shift.date),
            "status": shift.status,
            "message": f"Unclosed shift #{shift.so_number} ({shift.shift_name}) on date {shift.date} remains unclosed past daily cutoff.",
        }
        unclosed_shifts_found.append(shift_info)

        # Broadcast real-time anomaly alert (#104)
        try:
            await ws_manager.broadcast_to_station(
                "1",
                {
                    "event": "ANOMALY_ALERT",
                    "type": "UNCLOSED_SHIFT",
                    "severity": "WARNING",
                    "timestamp": now_ist().isoformat(),
                    "data": shift_info,
                },
            )
        except Exception as ws_err:
            logger.debug(f"WebSocket broadcast skipped: {ws_err}")

    # 2. Check for tank dip vs. nozzle meter shortages exceeding statutory evaporation limits (#104)
    two_days_ago = current_date - timedelta(days=2)
    tank_shortage_stmt = (
        select(TankDipEntry, Tank)
        .join(Tank, TankDipEntry.tank_id == Tank.id)
        .where(
            TankDipEntry.variation_liters < TankDipEntry.tolerance_limit,
            TankDipEntry.date >= two_days_ago,
        )
        .order_by(desc(TankDipEntry.id))
    )
    tank_res = await db.execute(tank_shortage_stmt)
    rows = tank_res.all()

    for entry, tank in rows:
        var_liters = float(entry.variation_liters or 0.0)
        tol_limit = float(entry.tolerance_limit or 0.0)
        excess_loss = round(var_liters - tol_limit, 2)  # more negative = excess loss

        is_petrol = "MS" in tank.tank_name.upper() or "PETROL" in tank.tank_name.upper()
        evap_threshold_pct = 0.59 if is_petrol else 0.15

        shortage_info = {
            "dip_id": entry.id,
            "tank_id": tank.id,
            "tank_name": tank.tank_name,
            "date": str(entry.date),
            "variation_liters": var_liters,
            "tolerance_limit": tol_limit,
            "excess_loss_liters": excess_loss,
            "evaporation_threshold_pct": evap_threshold_pct,
            "severity": "CRITICAL",
            "message": (
                f"Tank dip shortage on {tank.tank_name}: {var_liters:+.2f} L exceeds normal statutory "
                f"evaporation limit of {tol_limit:.2f} L (excess shortage: {excess_loss:.2f} L)."
            ),
        }
        tank_shortages_found.append(shortage_info)

        # Broadcast real-time anomaly alert (#104)
        try:
            await ws_manager.broadcast_to_station(
                "1",
                {
                    "event": "ANOMALY_ALERT",
                    "type": "TANK_SHORTAGE_EXCEEDED",
                    "severity": "CRITICAL",
                    "timestamp": now_ist().isoformat(),
                    "data": shortage_info,
                },
            )
        except Exception as ws_err:
            logger.debug(f"WebSocket broadcast skipped: {ws_err}")

    summary = {
        "status": "success",
        "checked_at": now_ist().isoformat(),
        "unclosed_shifts_count": len(unclosed_shifts_found),
        "tank_shortages_count": len(tank_shortages_found),
        "total_alerts": len(unclosed_shifts_found) + len(tank_shortages_found),
        "unclosed_shifts": unclosed_shifts_found,
        "tank_shortages": tank_shortages_found,
    }
    logger.info(
        f"Forecourt Anomaly Check: {len(unclosed_shifts_found)} unclosed shifts, {len(tank_shortages_found)} excess tank shortages."
    )
    return summary


async def execute_daily_r2_backup(db: AsyncSession) -> Dict[str, Any]:
    """
    Automated Daily Backup Worker (#97, #98):
    Exports critical ledger and configuration tables as compressed,
    Fernet-encrypted JSON snapshots directly into Cloudflare R2 bucket
    under backups/YYYY-MM-DD/.
    """
    date_str = str(today_ist())
    backup_result = await create_and_store_backup(
        db=db,
        encrypt=True,
        date_folder=date_str,
    )
    logger.info(
        f"Automated Daily Backup completed: {backup_result.get('filename')} "
        f"-> R2 key: {backup_result.get('r2_key')} ({backup_result.get('size_kb')} KB)"
    )
    return backup_result


async def run_daily_scheduler_cycle(db: AsyncSession) -> Dict[str, Any]:
    """Runs both anomaly checks and daily backup in a single scheduled cycle."""
    anomaly_report = await check_unclosed_shifts_and_tank_anomalies(db)
    backup_report = await execute_daily_r2_backup(db)
    return {
        "cycle_timestamp": now_ist().isoformat(),
        "anomaly_report": anomaly_report,
        "backup_report": backup_report,
    }


async def background_cron_scheduler(initial_delay_sec: int = 60, interval_sec: int = 1800):
    """
    FastAPI Lifespan Background Task (#41, #97, #98, #104):
    Periodically checks for cutoff anomalies and runs the daily backup at 23:45 IST.
    """
    logger.info("Background Cron Scheduler started.")
    await asyncio.sleep(initial_delay_sec)

    last_backup_date = None

    while True:
        try:
            current_time = now_ist()
            current_date_str = str(current_time.date())

            # 1. Anomaly checks run periodically
            async with AsyncSessionLocal() as session:
                await check_unclosed_shifts_and_tank_anomalies(session)

            # 2. Automated daily backup runs once per night at 23:45 IST (#97, #98)
            if current_time.hour == 23 and current_time.minute >= 40:
                if last_backup_date != current_date_str:
                    async with AsyncSessionLocal() as session:
                        await execute_daily_r2_backup(session)
                    last_backup_date = current_date_str

        except asyncio.CancelledError:
            logger.info("Background Cron Scheduler cancelled.")
            break
        except Exception as exc:
            logger.error(f"Background scheduler error: {exc}", exc_info=True)

        await asyncio.sleep(interval_sec)
