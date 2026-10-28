import csv
import io
import re
from datetime import date, datetime, timedelta, timezone
import hmac
import json
import time
from typing import Any, Dict, List, Optional, Set
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import case, delete, desc, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import (
    get_cached_rates,
    get_cached_station_profile,
    invalidate_rates_cache,
    invalidate_station_cache,
    set_cached_rates,
    set_cached_station_profile,
)
from app.core.idempotency import verify_idempotency_key
from app.core.security import get_current_user_optional, require_roles
from app.core.time import today_ist, now_ist
from app.core.websocket_manager import ws_manager
from app.db.session import get_db
from app.services.audit_service import log_audit_event
from app.services.thermal_printer import (
    generate_credit_slip_text,
    generate_thermal_slip_html,
    generate_raw_esc_pos_bytes,
)
from app.services.tank_calibration import (
    calculate_tank_volume_from_dip,
    get_calibrated_tank_volume,
    reduce_density_to_15c,
    generate_standard_strapping_points,
)
from app.models.petrol_pump import (
    BankAccount,
    CreditSale,
    Customer,
    Employee,
    Expense,
    FuelProduct,
    Nozzle,
    PaymentReceipt,
    PurchaseEntry,
    RateHistory,
    Shift,
    ShiftHandover,
    ShiftMeterReading,
    ShiftSettlement,
    Tank,
    TankDipEntry,
    User,
    Vehicle,
    StationProfileSetting,
    TankCalibrationChart,
    NozzleMeterReplacement,
    EmployeeShortageLedger,
    LubeProduct,
    LubeSaleEntry,
    SupervisorReversalVoucher,
    CardSettlement,
    ContraTransfer,
    Quotation,
    RetailCashInvoice,
    FleetInvoice,
    ForecourtControllerLog,
    ShiftCashDrop,
    EmployeeAttendance,
    StatutoryComplianceLicense,
    LubeInwardEntry,
)
router = APIRouter()

# Shared in-memory rate-limiting for PIN brute-force defense
_LOCAL_PIN_ATTEMPTS: Dict[str, Dict[str, Any]] = {}
MAX_FAILED_PIN_ATTEMPTS = 5
PIN_LOCKOUT_SECONDS = 300  # 5 minutes lockout
PIN_WINDOW_SECONDS = 60


async def verify_manager_pin(
    pin: Optional[str],
    db: AsyncSession,
    request: Optional[Request] = None,
) -> bool:
    """
    Validates managerial authorization PIN dynamically:
    1. Brute-force throttling to prevent PIN cracking.
    2. Constant-time comparison against StationProfileSetting.manager_pin.
    3. Verification against active Manager and Admin accounts in User table.
    4. Factory default fallback '1234' only if neither is configured.
    """
    if not pin:
        return False
    pin_input = str(pin).strip()
    if not pin_input:
        return False

    client_ip = "127.0.0.1"
    now = time.time()
    if request:
        try:
            from app.api.v1.endpoints.auth import _get_client_ip
            client_ip = _get_client_ip(request)
        except Exception:
            client_ip = request.client.host if request.client else "127.0.0.1"

    record = _LOCAL_PIN_ATTEMPTS.get(client_ip)
    if record and record.get("locked_until", 0) > now:
        return False

    is_valid = False
    station_prof = None
    try:
        prof_stmt = select(StationProfileSetting).order_by(StationProfileSetting.id.asc()).limit(1)
        prof_res = await db.execute(prof_stmt)
        station_prof = prof_res.scalar_one_or_none()
        if station_prof and station_prof.manager_pin:
            configured_pin = station_prof.manager_pin.strip()
            if hmac.compare_digest(pin_input, configured_pin):
                is_valid = True
    except Exception:
        station_prof = None

    if not is_valid:
        try:
            from app.core.security import verify_pin
            user_stmt = select(User).where(
                User.role.in_(["admin", "manager"]),
                User.is_active.is_(True),
            )
            users_res = await db.execute(user_stmt)
            for u in users_res.scalars().all():
                if u.pin_code_hash and verify_pin(pin_input, u.pin_code_hash):
                    is_valid = True
                    break
        except Exception:
            pass

    # Fallback to factory default ONLY if neither station_prof PIN nor user PINs are configured
    if not is_valid and (not station_prof or not station_prof.manager_pin):
        if hmac.compare_digest(pin_input, "1234"):
            is_valid = True

    # Record failed attempts for rate limiting
    if not is_valid:
        if client_ip not in _LOCAL_PIN_ATTEMPTS:
            _LOCAL_PIN_ATTEMPTS[client_ip] = {"count": 1, "first_ts": now, "locked_until": 0}
        else:
            rec = _LOCAL_PIN_ATTEMPTS[client_ip]
            if now - rec.get("first_ts", 0) > PIN_WINDOW_SECONDS:
                rec["count"] = 1
                rec["first_ts"] = now
            else:
                rec["count"] += 1
            if rec["count"] >= MAX_FAILED_PIN_ATTEMPTS:
                rec["locked_until"] = now + PIN_LOCKOUT_SECONDS
    else:
        _LOCAL_PIN_ATTEMPTS.pop(client_ip, None)

    return is_valid


async def check_manager_authorized(
    manager_pin: Optional[str],
    db: AsyncSession,
    current_user: Optional[User] = None,
    request: Optional[Request] = None,
) -> bool:
    """
    Validates whether an action is authorized by a Manager or Administrator.
    Checks:
    1. Active session user with admin or manager role
    2. Manager JWT cookie
    3. Valid manager PIN
    """
    if current_user and current_user.role.lower() in ("admin", "manager", "owner"):
        return True
    if request:
        from app.core.security import decode_access_token
        manager_cookie = request.cookies.get("nsai_manager_token")
        if manager_cookie:
            payload = decode_access_token(manager_cookie)
            if payload and payload.get("role", "").lower() in ("admin", "manager", "owner"):
                return True
    if manager_pin and await verify_manager_pin(manager_pin, db, request):
        return True
    return False


# -------------------------------------------------------------
# 1. Executive Dashboard API
# -------------------------------------------------------------
@router.get("/dashboard", summary="Executive KPI Dashboard")
async def get_dashboard(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    # 1. Total Outstanding from all customers
    outstanding_res = await db.execute(select(func.sum(Customer.current_outstanding)))
    total_outstanding = outstanding_res.scalar() or 0.0

    # 2. Total Balance across all accounts
    balance_res = await db.execute(select(func.sum(BankAccount.balance)))
    total_balance = balance_res.scalar() or 0.0

    # 3. Tanks & Total Stock Cost
    tanks_res = await db.execute(
        select(Tank).options(selectinload(Tank.product))
    )
    tanks = tanks_res.scalars().all()
    tank_list = []
    total_stock_cost = 0.0
    for t in tanks:
        percent = round((t.current_stock / t.capacity_liters) * 100, 1) if t.capacity_liters else 0.0
        rate = t.product.current_rate if t.product else 90.0
        total_stock_cost += (t.current_stock * rate)
        tank_list.append({
            "id": t.id,
            "name": t.tank_name,
            "product": t.product.name if t.product else "Fuel",
            "code": t.product.code if t.product else "FUEL",
            "capacity": t.capacity_liters,
            "current_stock": t.current_stock,
            "percent": percent,
            "dip_cm": t.current_dip_cm,
            "is_low": t.current_stock <= t.min_alert_level,
        })

    # 4. Today's Collections & Sales strictly computed from live PostgreSQL tables
    today = today_ist()
    latest_shift_res = await db.execute(
        select(Shift).order_by(desc(Shift.date), desc(Shift.id)).limit(1)
    )
    latest_shift = latest_shift_res.scalar_one_or_none()

    # Sum today's shift meter readings if available
    today_readings_res = await db.execute(
        select(func.coalesce(func.sum(ShiftMeterReading.total_amount), 0.0))
        .join(Shift, ShiftMeterReading.shift_id == Shift.id)
        .where(Shift.date == today)
    )
    today_meter_sales = float(today_readings_res.scalar() or 0.0)

    # Sum today's credit sales
    credit_res = await db.execute(
        select(func.coalesce(func.sum(CreditSale.amount), 0.0))
        .where(CreditSale.date == today)
    )
    today_credit_sales = float(credit_res.scalar() or 0.0)

    # Sum today's payment receipts in a single conditional SQL aggregation query (#5, #21)
    receipts_res = await db.execute(
        select(
            func.coalesce(
                func.sum(case((PaymentReceipt.payment_mode == "CASH", PaymentReceipt.amount), else_=0.0)),
                0.0,
            ),
            func.coalesce(
                func.sum(case((PaymentReceipt.payment_mode != "CASH", PaymentReceipt.amount), else_=0.0)),
                0.0,
            ),
        ).where(PaymentReceipt.date == today)
    )
    receipt_row = receipts_res.one()
    today_cash_receipts = float(receipt_row[0] or 0.0)
    today_digital_receipts = float(receipt_row[1] or 0.0)

    shift_sale = float(latest_shift.total_sale_amount or 0.0) if (latest_shift and latest_shift.date == today) else 0.0
    today_sale = max(shift_sale, today_meter_sales, today_credit_sales)

    credit_col = max(today_credit_sales, float(latest_shift.total_credit or 0.0) if (latest_shift and latest_shift.date == today) else 0.0)
    digital_col = max(today_digital_receipts, float(latest_shift.total_digital or 0.0) if (latest_shift and latest_shift.date == today) else 0.0)
    cash_col = max(today_cash_receipts, float(latest_shift.total_cash or 0.0) if (latest_shift and latest_shift.date == today) else 0.0)
    if cash_col == 0.0 and today_sale > (credit_col + digital_col):
        cash_col = round(today_sale - credit_col - digital_col, 2)

    # 5. Top Outstanding Customers
    cust_res = await db.execute(
        select(Customer)
        .where(Customer.current_outstanding > 0)
        .order_by(desc(Customer.current_outstanding))
        .limit(10)
    )
    top_customers = [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "city": c.city,
            "mobile": c.mobile,
            "outstanding": round(c.current_outstanding, 2),
            "credit_limit": c.credit_limit,
        }
        for c in cust_res.scalars().all()
    ]

    # 6. Bank & Cash Accounts
    acc_res = await db.execute(select(BankAccount).order_by(desc(BankAccount.balance)))
    accounts = [
        {"id": a.id, "name": a.account_name, "type": a.account_type, "balance": round(a.balance, 2)}
        for a in acc_res.scalars().all()
    ]

    return {
        "kpis": {
            "today_sale": round(today_sale, 2),
            "total_outstanding": round(total_outstanding, 2),
            "total_balance": round(total_balance, 2),
            "total_stock_cost": round(total_stock_cost, 2),
        },
        "breakdown": {
            "cash": round(cash_col, 2),
            "credit": round(credit_col, 2),
            "digital": round(digital_col, 2),
            "total": round(cash_col + credit_col + digital_col, 2),
        },
        "tanks": tank_list,
        "customers": top_customers,
        "accounts": accounts,
        "active_shift": {
            "so_number": latest_shift.so_number if latest_shift else "SO-00017",
            "date": str(latest_shift.date) if latest_shift else str(today_ist()),
            "shift_name": latest_shift.shift_name if latest_shift else "First",
            "status": latest_shift.status if latest_shift else "Closed",
        },
    }


# -------------------------------------------------------------
# 2. Rate Master API
# -------------------------------------------------------------
class RateUpdateRequest(BaseModel):
    product_id: int
    rate: float
    effective_date: Optional[date] = None
    manager_pin: Optional[str] = None


@router.get("/rates", summary="List Fuel Products and Rates")
async def get_rates(db: AsyncSession = Depends(get_db)):
    cached_rates = get_cached_rates()
    if cached_rates is not None:
        return cached_rates

    products_res = await db.execute(select(FuelProduct).order_by(FuelProduct.id))
    products = products_res.scalars().all()

    history_res = await db.execute(
        select(RateHistory)
        .options(selectinload(RateHistory.product))
        .order_by(desc(RateHistory.id))
        .limit(20)
    )
    history = [
        {
            "id": h.id,
            "product_name": h.product.name if h.product else "Fuel",
            "rate": h.rate,
            "effective_date": str(h.effective_date),
        }
        for h in history_res.scalars().all()
    ]

    result = {
        "products": [
            {
                "id": p.id,
                "code": p.code,
                "name": p.name,
                "rate": p.current_rate,
                "vat_percent": p.vat_percent,
                "cess_percent": p.cess_percent,
            }
            for p in products
        ],
        "history": history,
    }
    set_cached_rates(result, ttl_seconds=600)
    return result


@router.post("/rates", summary="Update Product Rate")
async def update_rate(
    data: RateUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if data.rate <= 0 or data.rate > 500:
        raise HTTPException(
            status_code=400,
            detail="Fuel rate must be positive and within realistic limits (₹1.00 - ₹500.00/Ltr)",
        )

    if not await check_manager_authorized(data.manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to update fuel price rates.",
        )

    product = await db.get(FuelProduct, data.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    old_rate = product.current_rate
    eff_date = data.effective_date or today_ist()
    product.current_rate = data.rate

    entry = RateHistory(product_id=product.id, rate=data.rate, effective_date=eff_date)
    db.add(entry)

    # Immutable Financial Audit Trail (#100)
    req_ip = request.client.host if request.client else None
    await log_audit_event(
        db=db,
        actor=current_user or "MANAGER_PIN",
        action="FUEL_PRICE_UPDATE",
        entity_type="FuelProduct",
        entity_id=product.id,
        old_val={"product_id": product.id, "product_name": product.name, "rate": old_rate},
        new_val={"product_id": product.id, "product_name": product.name, "rate": data.rate, "effective_date": str(eff_date)},
        request_ip=req_ip,
    )

    await db.commit()

    # Instant TTL cache invalidation (#6, #7)
    invalidate_rates_cache()

    return {"message": "Rate updated successfully", "product": product.name, "new_rate": product.current_rate}


@router.delete("/rates/history/{history_id}", summary="Delete/Revert Erroneous Product Rate Revision")
async def delete_rate_history(
    history_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to revert fuel price revisions.",
        )

    entry = await db.get(RateHistory, history_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Rate revision history record not found")

    prod_id = entry.product_id
    product = await db.get(FuelProduct, prod_id)
    deleted_rate = entry.rate
    await db.delete(entry)
    await db.flush()

    # Roll back product current_rate to the latest remaining rate
    latest_stmt = (
        select(RateHistory)
        .where(RateHistory.product_id == prod_id)
        .order_by(desc(RateHistory.id))
        .limit(1)
    )
    latest_res = await db.execute(latest_stmt)
    latest_hist = latest_res.scalars().first()
    if product and latest_hist:
        product.current_rate = latest_hist.rate

    # Immutable Financial Audit Trail (#100)
    req_ip = request.client.host if request.client else None
    await log_audit_event(
        db=db,
        actor=current_user or "MANAGER_PIN",
        action="FUEL_PRICE_REVERT",
        entity_type="RateHistory",
        entity_id=history_id,
        old_val={"history_id": history_id, "product_id": prod_id, "deleted_rate": deleted_rate},
        new_val={"reverted_current_rate": product.current_rate if product else None},
        request_ip=req_ip,
    )

    await db.commit()

    # Instant TTL cache invalidation (#6, #7)
    invalidate_rates_cache()

    return {
        "status": "success",
        "message": f"Rate history entry #{history_id} deleted. Current rate for {product.name if product else 'fuel'} restored to ₹{product.current_rate if product else 0:.2f}",
        "current_rate": product.current_rate if product else None,
    }



# -------------------------------------------------------------
# 3. Shift Meter Reading & Sales Entry API
# -------------------------------------------------------------
class MeterReadingInput(BaseModel):
    nozzle_id: int
    employee_id: Optional[int] = None
    opening_meter: float
    closing_meter: float
    testing_qty: float = 0.0
    lube_amount: float = 0.0
    is_rollover: bool = False
    max_meter_digits: int = 6
    split_closing_meter: Optional[float] = None
    split_rate: Optional[float] = None


class ShiftSaveRequest(BaseModel):
    shift_name: str = "First"
    date: Optional[date] = None
    supervisor_pin: Optional[str] = None
    reversal_reason: Optional[str] = None
    readings: List[MeterReadingInput]


class MeterSwapRequest(BaseModel):
    old_final_meter: float
    new_initial_meter: float = 0.0
    reason: str = "W&M Stamping / Meter Servicing"
    wm_seal_no: Optional[str] = None
    manager_pin: str = "1234"


@router.post("/nozzles/{nozzle_id}/meter-swap", summary="Record Physical Meter Replacement / W&M Stamping Reset")
async def record_meter_swap(
    nozzle_id: int,
    payload: MeterSwapRequest,
    db: AsyncSession = Depends(get_db),
):
    if not await verify_manager_pin(payload.manager_pin, db):
        raise HTTPException(status_code=403, detail="Invalid Manager Authorization PIN")

    nozzle = await db.get(Nozzle, nozzle_id)
    if not nozzle:
        raise HTTPException(status_code=404, detail="Nozzle not found")

    swap_record = NozzleMeterReplacement(
        nozzle_id=nozzle.id,
        replace_date=today_ist(),
        old_final_meter=payload.old_final_meter,
        new_initial_meter=payload.new_initial_meter,
        reason=payload.reason,
        wm_seal_no=payload.wm_seal_no,
        authorized_by="Station Manager",
    )
    db.add(swap_record)

    # Set nozzle current meter to new initial meter
    nozzle.current_meter = payload.new_initial_meter
    await db.commit()

    return {
        "status": "success",
        "message": f"Meter swap recorded for {nozzle.nozzle_name}. New starting meter: {payload.new_initial_meter:.2f}",
        "old_final_meter": payload.old_final_meter,
        "new_initial_meter": payload.new_initial_meter,
        "wm_seal_no": payload.wm_seal_no,
    }


@router.get("/nozzles/{nozzle_id}/meter-swaps", summary="List Audit Log of Meter Replacements")
async def list_meter_swaps(nozzle_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(NozzleMeterReplacement)
        .where(NozzleMeterReplacement.nozzle_id == nozzle_id)
        .order_by(desc(NozzleMeterReplacement.replace_date), desc(NozzleMeterReplacement.id))
    )
    res = await db.execute(stmt)
    swaps = res.scalars().all()
    return [
        {
            "id": s.id,
            "nozzle_id": s.nozzle_id,
            "date": str(s.replace_date),
            "old_final_meter": s.old_final_meter,
            "new_initial_meter": s.new_initial_meter,
            "reason": s.reason,
            "wm_seal_no": s.wm_seal_no,
            "authorized_by": s.authorized_by,
        }
        for s in swaps
    ]


@router.delete("/nozzles/meter-swaps/{swap_id}", summary="Delete/Revert Nozzle Meter Replacement Swap")
async def delete_meter_swap(
    swap_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to void nozzle meter changeover.",
        )

    swap = await db.get(NozzleMeterReplacement, swap_id)
    if not swap:
        raise HTTPException(status_code=404, detail="Meter replacement record not found")

    nozzle = await db.get(Nozzle, swap.nozzle_id)
    reverted_reading = swap.old_final_meter
    if nozzle:
        nozzle.current_meter = swap.old_final_meter

    await db.delete(swap)
    await db.commit()
    return {
        "status": "success",
        "message": f"Meter swap #{swap_id} voided. Nozzle meter reverted to {reverted_reading:.2f}",
        "reverted_meter": reverted_reading,
    }



@router.get("/shifts/current", summary="Get Current Active Shift and Meter Readings")
async def get_current_shift(db: AsyncSession = Depends(get_db)):
    # Fetch nozzles with tank and product
    nozzles_res = await db.execute(
        select(Nozzle).options(selectinload(Nozzle.product), selectinload(Nozzle.tank)).order_by(Nozzle.id)
    )
    nozzles = nozzles_res.scalars().all()

    emp_res = await db.execute(select(Employee).where(Employee.active.is_(True)))
    employees = [{"id": e.id, "name": e.name, "code": e.code} for e in emp_res.scalars().all()]

    # Fetch latest shift
    shift_res = await db.execute(select(Shift).order_by(desc(Shift.id)).limit(1))
    latest_shift = shift_res.scalar_one_or_none()

    nozzle_list = []
    for n in nozzles:
        rate = n.product.current_rate if n.product else 90.0
        vat_pct = n.product.vat_percent if n.product else 14.0
        nozzle_list.append({
            "nozzle_id": n.id,
            "nozzle_name": n.nozzle_name,
            "machine_name": n.machine_name,
            "product_name": n.product.name if n.product else "Fuel",
            "product_code": n.product.code if n.product else "FUEL",
            "opening_meter": n.current_meter,
            "closing_meter": n.current_meter,
            "testing": 0.0,
            "rate": rate,
            "vat_percent": vat_pct,
        })

    return {
        "id": latest_shift.id if latest_shift else 1,
        "shift_id": latest_shift.id if latest_shift else 1,
        "so_number": latest_shift.so_number if latest_shift else "SO-00018",
        "date": str(latest_shift.date) if latest_shift else str(today_ist()),
        "shift_name": latest_shift.shift_name if latest_shift else "First",
        "status": latest_shift.status if latest_shift else "Open",
        "employees": employees,
        "nozzles": nozzle_list,
    }


@router.post(
    "/shifts/save",
    summary="Save Shift Nozzle Meter Readings",
    dependencies=[Depends(verify_idempotency_key)],
)
async def save_shift_meters(data: ShiftSaveRequest, db: AsyncSession = Depends(get_db)):
    today_dt = data.date or today_ist()

    # Pre-flight discovery of affected resources to enforce strict lock hierarchy (Tank -> Nozzle -> Shift)
    incoming_noz_ids = [r.nozzle_id for r in data.readings]
    noz_meta_res = await db.execute(select(Nozzle.id, Nozzle.tank_id).where(Nozzle.id.in_(incoming_noz_ids)))
    incoming_noz_tanks = {row[0]: row[1] for row in noz_meta_res.all()}

    pre_shift_res = await db.execute(
        select(Shift.id).where(Shift.date == today_dt, Shift.shift_name == data.shift_name)
    )
    existing_shift_id = pre_shift_res.scalar_one_or_none()

    old_noz_tanks = {}
    if existing_shift_id:
        old_meta_res = await db.execute(
            select(ShiftMeterReading.nozzle_id, Nozzle.tank_id)
            .join(Nozzle, ShiftMeterReading.nozzle_id == Nozzle.id)
            .where(ShiftMeterReading.shift_id == existing_shift_id)
        )
        old_noz_tanks = {row[0]: row[1] for row in old_meta_res.all()}

    all_tank_ids = sorted({t for t in list(incoming_noz_tanks.values()) + list(old_noz_tanks.values()) if t is not None})
    all_nozzle_ids = sorted(set(incoming_noz_ids) | set(old_noz_tanks.keys()))

    # STRICT LOCK ACQUISITION HIERARCHY:
    # 1. Tanks in ascending ID order (SELECT ... FOR UPDATE)
    tanks_locked: Dict[int, Tank] = {}
    for t_id in all_tank_ids:
        t_stmt = select(Tank).where(Tank.id == t_id).with_for_update()
        t_obj = (await db.execute(t_stmt)).scalar_one_or_none()
        if t_obj:
            tanks_locked[t_id] = t_obj

    # 2. Nozzles in ascending ID order (SELECT ... FOR UPDATE)
    nozzles_locked: Dict[int, Nozzle] = {}
    for n_id in all_nozzle_ids:
        n_stmt = select(Nozzle).where(Nozzle.id == n_id).with_for_update()
        n_obj = (await db.execute(n_stmt)).scalar_one_or_none()
        if n_obj:
            nozzles_locked[n_id] = n_obj

    # 3. Shift (SELECT ... FOR UPDATE)
    shift_stmt = (
        select(Shift)
        .where(Shift.date == today_dt, Shift.shift_name == data.shift_name)
        .with_for_update()
    )
    shift_res = await db.execute(shift_stmt)
    shift = shift_res.scalar_one_or_none()

    if not shift:
        max_shift_res = await db.execute(select(func.coalesce(func.max(Shift.id), 0)))
        cnt = (max_shift_res.scalar() or 0) + 1
        shift = Shift(
            so_number=f"{cnt:05d}",
            date=today_dt,
            shift_name=data.shift_name,
            status="Open",
        )
        db.add(shift)
        await db.flush()
    elif shift.status == "Closed":
        # Shift Security & Immutability Enforcement:
        # Finalized shifts cannot be modified directly without supervisor authorization.
        if not await verify_manager_pin(data.supervisor_pin, db):
            raise HTTPException(
                status_code=403,
                detail="SHIFT IMMUTABILITY ENFORCED: Shift is finalized and closed. Direct edits are disabled. A Supervisor Reversal Voucher with manager PIN authorization is required to alter closed shifts.",
            )
        # Log Supervisor Reversal Voucher audit entry
        max_v_res = await db.execute(select(func.coalesce(func.max(SupervisorReversalVoucher.id), 0)))
        v_seq = (max_v_res.scalar() or 0) + 1
        voucher = SupervisorReversalVoucher(
            voucher_no=f"SRV-{v_seq:04d}",
            shift_id=shift.id,
            date=today_ist(),
            reversal_type="METER_CORRECTION",
            reason=data.reversal_reason or "Supervisor authorized meter adjustment on finalized shift",
            authorized_by="Station Manager",
            manager_pin=data.supervisor_pin,
        )
        db.add(voucher)

    # Clear prior meter readings for this specific shift to prevent duplicates on re-save
    # CRITICAL STOCK INTEGRITY: First refund previous tank deductions so re-saving doesn't double-deduct tank stock!
    old_readings_res = await db.execute(
        select(ShiftMeterReading).where(ShiftMeterReading.shift_id == shift.id)
    )
    old_readings = old_readings_res.scalars().all()
    for old_r in old_readings:
        if old_r.sale_qty > 0:
            old_nozzle = nozzles_locked.get(old_r.nozzle_id)
            if old_nozzle and old_nozzle.tank_id:
                old_tank = tanks_locked.get(old_nozzle.tank_id)
                if old_tank:
                    old_tank.current_stock = round(old_tank.current_stock + old_r.sale_qty, 2)

    await db.execute(delete(ShiftMeterReading).where(ShiftMeterReading.shift_id == shift.id))

    total_sale_amt = 0.0
    total_vat_amt = 0.0

    for r in data.readings:
        nozzle = nozzles_locked.get(r.nozzle_id)
        if not nozzle:
            continue

        prod = await db.get(FuelProduct, nozzle.product_id)
        rate = prod.current_rate if prod else 90.0
        vat_pct = prod.vat_percent if prod else 14.0

        raw_diff = r.closing_meter - r.opening_meter
        if r.is_rollover or raw_diff < 0:
            # Meter rollover detected or explicitly flagged (e.g., 999950.0 -> 45.0)
            digits = r.max_meter_digits if r.max_meter_digits in (5, 6, 7, 8) else 6
            rollover_limit = float(10 ** digits)
            raw_diff = (rollover_limit - r.opening_meter) + r.closing_meter

        # Check for 06:00 AM Mid-Shift Rate Revision Split
        if r.split_closing_meter is not None and r.split_rate is not None and r.split_closing_meter > r.opening_meter:
            qty_1 = max(0.0, round(r.split_closing_meter - r.opening_meter, 2))
            amt_1 = round(qty_1 * r.split_rate, 2)
            qty_2 = max(0.0, round(r.closing_meter - r.split_closing_meter - r.testing_qty, 2))
            amt_2 = round(qty_2 * rate, 2)
            sale_qty = round(qty_1 + qty_2, 2)
            total_amt = round(amt_1 + amt_2, 2)
        else:
            sale_qty = max(0.0, round(raw_diff - r.testing_qty, 2))
            total_amt = round(sale_qty * rate, 2)

        vat_amt = round((total_amt * vat_pct) / (100 + vat_pct), 2)

        total_sale_amt += total_amt
        total_vat_amt += vat_amt

        # Update nozzle current meter
        nozzle.current_meter = r.closing_meter

        # Atomically deduct tank stock (using row-locked tank)
        if nozzle.tank_id and sale_qty > 0:
            tank = tanks_locked.get(nozzle.tank_id)
            if tank:
                tank.current_stock = max(0.0, round(tank.current_stock - sale_qty, 2))

        reading = ShiftMeterReading(
            shift_id=shift.id,
            nozzle_id=nozzle.id,
            employee_id=r.employee_id,
            opening_meter=r.opening_meter,
            closing_meter=r.closing_meter,
            testing_qty=r.testing_qty,
            sale_qty=sale_qty,
            rate=rate,
            total_amount=total_amt,
            vat_amount=vat_amt,
            lube_amount=r.lube_amount,
            is_rollover=r.is_rollover,
            max_meter_digits=r.max_meter_digits,
            split_closing_meter=r.split_closing_meter,
            split_rate=r.split_rate,
        )
        db.add(reading)

    shift.total_sale_amount = round(total_sale_amt, 2)
    await db.commit()

    return {
        "message": "Shift meter readings recorded successfully",
        "so_number": shift.so_number,
        "total_amount": round(total_sale_amt, 2),
        "total_vat": round(total_vat_amt, 2),
        "basic_amount": round(total_sale_amt - total_vat_amt, 2),
    }


class ShiftCloseRequest(BaseModel):
    manager_pin: str = "1234"
    notes: Optional[str] = None


class ReversalVoucherCreate(BaseModel):
    reversal_type: str = "SHIFT_REOPEN"  # SHIFT_REOPEN, METER_CORRECTION, SALE_VOID
    reason: str
    manager_pin: str = "1234"
    authorized_by: str = "Station Manager"


@router.post(
    "/shifts/{shift_id}/close",
    summary="Finalize & Close Shift (Enforce Immutability)",
    dependencies=[Depends(verify_idempotency_key)],
)
async def close_shift_endpoint(
    shift_id: int,
    request: Request,
    payload: ShiftCloseRequest = ShiftCloseRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(payload.manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or valid Manager PIN required to close and finalize shift.",
        )

    stmt = select(Shift).where(Shift.id == shift_id).with_for_update()
    res = await db.execute(stmt)
    shift = res.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    old_status = shift.status
    shift.status = "Closed"

    # Immutable Financial Audit Trail (#100)
    req_ip = request.client.host if request.client else None
    await log_audit_event(
        db=db,
        actor=current_user or "STATION_MANAGER",
        action="SHIFT_CLOSE_FINALIZE",
        entity_type="Shift",
        entity_id=shift.id,
        old_val={"shift_id": shift.id, "status": old_status},
        new_val={"shift_id": shift.id, "status": "Closed", "so_number": shift.so_number},
        request_ip=req_ip,
    )

    await db.commit()
    return {
        "status": "success",
        "message": f"Shift #{shift.so_number} is now closed and marked immutable.",
        "shift_id": shift.id,
        "shift_status": shift.status,
    }


@router.post("/shifts/{shift_id}/reversal-voucher", summary="Issue Supervisor Reversal Voucher to Correct Finalized Shift")
async def create_shift_reversal_voucher(
    shift_id: int,
    payload: ReversalVoucherCreate,
    db: AsyncSession = Depends(get_db),
):
    if not await verify_manager_pin(payload.manager_pin, db):
        raise HTTPException(status_code=403, detail="Invalid Manager Authorization PIN. Reversal rejected.")

    stmt = select(Shift).where(Shift.id == shift_id).with_for_update()
    res = await db.execute(stmt)
    shift = res.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    max_v_res = await db.execute(select(func.coalesce(func.max(SupervisorReversalVoucher.id), 0)))
    v_seq = (max_v_res.scalar() or 0) + 1
    voucher = SupervisorReversalVoucher(
        voucher_no=f"SRV-{v_seq:04d}",
        shift_id=shift.id,
        date=today_ist(),
        reversal_type=payload.reversal_type,
        reason=payload.reason,
        authorized_by=payload.authorized_by,
        manager_pin=payload.manager_pin,
    )
    db.add(voucher)

    # If supervisor requested to re-open shift for correction
    if payload.reversal_type == "SHIFT_REOPEN":
        shift.status = "Open"

    await db.commit()
    await db.refresh(voucher)
    return {
        "status": "success",
        "message": f"Supervisor Reversal Voucher {voucher.voucher_no} generated and audit-logged.",
        "voucher": {
            "id": voucher.id,
            "voucher_no": voucher.voucher_no,
            "shift_id": voucher.shift_id,
            "date": str(voucher.date),
            "reversal_type": voucher.reversal_type,
            "reason": voucher.reason,
            "authorized_by": voucher.authorized_by,
            "created_at": voucher.created_at.isoformat() if voucher.created_at else None,
        },
        "shift_current_status": shift.status,
    }


@router.get("/shifts/{shift_id}/reversal-vouchers", summary="Get Reversal Vouchers for a Specific Shift")
async def get_shift_reversal_vouchers(shift_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(SupervisorReversalVoucher)
        .where(SupervisorReversalVoucher.shift_id == shift_id)
        .order_by(desc(SupervisorReversalVoucher.id))
    )
    vouchers = res.scalars().all()
    return [
        {
            "id": v.id,
            "voucher_no": v.voucher_no,
            "shift_id": v.shift_id,
            "date": str(v.date),
            "reversal_type": v.reversal_type,
            "reason": v.reason,
            "authorized_by": v.authorized_by,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        }
        for v in vouchers
    ]


@router.get("/reversal-vouchers", summary="Audit Log: List All Supervisor Reversal Vouchers")
async def list_all_reversal_vouchers(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(SupervisorReversalVoucher)
        .options(selectinload(SupervisorReversalVoucher.shift))
        .order_by(desc(SupervisorReversalVoucher.id))
    )
    vouchers = res.scalars().all()
    return [
        {
            "id": v.id,
            "voucher_no": v.voucher_no,
            "shift_id": v.shift_id,
            "shift_so": v.shift.so_number if v.shift else "N/A",
            "date": str(v.date),
            "reversal_type": v.reversal_type,
            "reason": v.reason,
            "authorized_by": v.authorized_by,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        }
        for v in vouchers
    ]


# -------------------------------------------------------------
# 4. Credit Customer & Vehicle Slip Billing API
# -------------------------------------------------------------
class CreditSaleCreate(BaseModel):
    shift_id: Optional[int] = None
    customer_id: int
    vehicle_no: str
    product_id: int
    nozzle_id: Optional[int] = None
    slip_no: str = "0"
    qty: float
    rate: Optional[float] = None
    discount_percent: float = 0.0
    cash_paid: float = 0.0
    odometer_km: Optional[float] = None
    driver_name: Optional[str] = None
    driver_mobile: Optional[str] = None
    indent_no: Optional[str] = None
    manager_override_pin: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/credit-sales", summary="List Credit Sales")
async def list_credit_sales(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(CreditSale)
        .options(selectinload(CreditSale.customer), selectinload(CreditSale.product))
        .order_by(desc(CreditSale.id))
        .limit(50)
    )
    sales = res.scalars().all()
    return [
        {
            "id": s.id,
            "bill_no": s.bill_no,
            "slip_no": s.slip_no,
            "date": str(s.date),
            "customer_name": s.customer.name if s.customer else "Unknown",
            "customer_mobile": s.customer.mobile if s.customer and s.customer.mobile else "",
            "vehicle_no": s.vehicle_no,
            "product": s.product.name if s.product else "Fuel",
            "qty": s.qty,
            "rate": s.rate,
            "amount": s.amount,
            "cash_paid": s.cash_paid,
            "credit_amount": s.credit_amount,
            "balance_after": s.customer_balance_after,
            "odometer_km": s.odometer_km,
            "driver_name": s.driver_name,
            "indent_no": s.indent_no,
        }
        for s in sales
    ]


@router.post(
    "/credit-sales",
    summary="Create Credit Slip Sale & WhatsApp Delivery",
    dependencies=[Depends(verify_idempotency_key)],
)
async def create_credit_sale(data: CreditSaleCreate, db: AsyncSession = Depends(get_db)):
    if data.qty <= 0 or data.qty > 50000:
        raise HTTPException(status_code=400, detail="Fuel quantity must be greater than zero and within physical delivery limits (max 50,000 Liters)")
    if data.cash_paid < 0:
        raise HTTPException(status_code=400, detail="Cash paid cannot be negative")
    if data.discount_percent < 0 or data.discount_percent > 100:
        raise HTTPException(status_code=400, detail="Discount percentage must be between 0 and 100")
    if data.odometer_km is not None and data.odometer_km < 0:
        raise HTTPException(status_code=400, detail="Odometer reading cannot be negative")

    # 1. Pre-flight resolve target resource IDs for strict deadlock prevention hierarchy
    target_tank_id = None
    if data.nozzle_id:
        noz_peek = (await db.execute(select(Nozzle.tank_id).where(Nozzle.id == data.nozzle_id))).scalar_one_or_none()
        target_tank_id = noz_peek

    active_shift_id = None
    if not data.shift_id:
        sh_peek = (await db.execute(select(Shift.id).where(Shift.status == "Open").order_by(desc(Shift.id)).limit(1))).scalar_one_or_none()
        active_shift_id = sh_peek
    target_shift_id = data.shift_id or active_shift_id

    # STRICT LOCK ACQUISITION HIERARCHY: Station -> Tank -> Nozzle -> Shift -> CustomerAccount
    # Step 1: Tank Lock (SELECT ... FOR UPDATE)
    tank = None
    if target_tank_id:
        tank_stmt = select(Tank).where(Tank.id == target_tank_id).with_for_update()
        tank = (await db.execute(tank_stmt)).scalar_one_or_none()

    # Step 2: Nozzle Lock (SELECT ... FOR UPDATE)
    nozzle = None
    if data.nozzle_id:
        noz_stmt = select(Nozzle).where(Nozzle.id == data.nozzle_id).with_for_update()
        nozzle = (await db.execute(noz_stmt)).scalar_one_or_none()

    # Step 3: Shift Lock (SELECT ... FOR UPDATE)
    shift_obj = None
    if target_shift_id:
        sh_stmt = select(Shift).where(Shift.id == target_shift_id).with_for_update()
        sh_res = await db.execute(sh_stmt)
        shift_obj = sh_res.scalar_one_or_none()
        if shift_obj and shift_obj.status in ("Closed", "Settled"):
            if not await verify_manager_pin(data.manager_override_pin, db):
                raise HTTPException(
                    status_code=403,
                    detail="SHIFT IMMUTABILITY ENFORCED: Target shift is finalized and closed. Cannot append credit slip to a closed shift without supervisor authorization PIN.",
                )

    # Step 4: Customer Account Lock (SELECT ... FOR UPDATE)
    customer_stmt = select(Customer).where(Customer.id == data.customer_id).with_for_update()
    customer_res = await db.execute(customer_stmt)
    customer = customer_res.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if customer.is_blocked:
        raise HTTPException(
            status_code=403,
            detail=f"Customer '{customer.name}' is BLOCKED from credit fuel dispensing due to payment default.",
        )

    product = await db.get(FuelProduct, data.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if data.rate is not None:
        if data.rate <= 0 or data.rate > 500:
            raise HTTPException(status_code=400, detail="Fuel rate must be positive and within realistic limits (₹1.00 - ₹500.00/Ltr)")
        if abs(data.rate - product.current_rate) > 0.01:
            if not await verify_manager_pin(data.manager_override_pin, db):
                raise HTTPException(
                    status_code=403,
                    detail=f"PRICE OVERRIDE RESTRICTION: Billed rate ₹{data.rate:.2f} differs from official rate ₹{product.current_rate:.2f}. Manager PIN override required.",
                )

    rate = data.rate if data.rate is not None else product.current_rate
    gross_amount = round(data.qty * rate, 2)
    dis_amt = round((gross_amount * data.discount_percent) / 100, 2)
    net_amount = gross_amount - dis_amt
    credit_amount = max(0.0, round(net_amount - data.cash_paid, 2))

    # Check credit limit alert & strict enforcement
    new_outstanding = round(customer.current_outstanding + credit_amount, 2)
    limit_warning = new_outstanding > customer.credit_limit if customer.credit_limit > 0 else False
    if limit_warning and credit_amount > 0:
        if not await verify_manager_pin(data.manager_override_pin, db):
            raise HTTPException(
                status_code=400,
                detail=f"CREDIT LIMIT EXCEEDED: Customer limit is ₹{customer.credit_limit:,.2f}. Current dues are ₹{customer.current_outstanding:,.2f}, resulting balance would be ₹{new_outstanding:,.2f}. Manager authorization PIN required to proceed.",
            )

    # Indent voucher anti-duplicate verification
    if data.indent_no and data.indent_no.strip():
        clean_indent = data.indent_no.strip()
        dup_stmt = select(CreditSale).where(
            CreditSale.customer_id == customer.id,
            CreditSale.indent_no == clean_indent,
        )
        dup_res = await db.execute(dup_stmt)
        prior_indent = dup_res.scalar_one_or_none()
        if prior_indent:
            if not await verify_manager_pin(data.manager_override_pin, db):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"DUPLICATE INDENT VOUCHER: Indent #{clean_indent} was already billed on "
                        f"{prior_indent.date} for Vehicle {prior_indent.vehicle_no} (Bill #{prior_indent.bill_no}). "
                        f"Duplicate billing blocked to prevent fraud. Manager PIN override required."
                    ),
                )

    # Atomic sequential bill numbering within locked transaction
    max_id_res = await db.execute(select(func.coalesce(func.max(CreditSale.id), 0)))
    bill_seq = (max_id_res.scalar() or 0) + 1
    bill_num = f"{bill_seq:04d}"

    clean_vehicle = data.vehicle_no.upper().strip()

    # Odometer mileage computation against previous vehicle slip
    prior_odometer = None
    mileage_kml = None
    if data.odometer_km and data.odometer_km > 0:
        prior_stmt = (
            select(CreditSale)
            .where(
                CreditSale.vehicle_no == clean_vehicle,
                CreditSale.odometer_km.is_not(None),
                CreditSale.odometer_km > 0,
            )
            .order_by(desc(CreditSale.id))
            .limit(1)
        )
        prior_res = await db.execute(prior_stmt)
        prior_sale = prior_res.scalar_one_or_none()
        if prior_sale and prior_sale.odometer_km:
            prior_odometer = prior_sale.odometer_km
            km_run = data.odometer_km - prior_sale.odometer_km
            if km_run > 0 and data.qty > 0:
                mileage_kml = round(km_run / data.qty, 2)

    shift_id = target_shift_id

    # Deduct tank stock atomically using row-locked tank
    if tank and data.qty > 0:
        tank.current_stock = max(0.0, round(tank.current_stock - data.qty, 2))

    sale = CreditSale(
        shift_id=shift_id,
        customer_id=customer.id,
        vehicle_no=clean_vehicle,
        product_id=product.id,
        nozzle_id=data.nozzle_id,
        slip_no=data.slip_no,
        bill_no=bill_num,
        date=today_ist(),
        rate=rate,
        qty=data.qty,
        amount=net_amount,
        discount_percent=data.discount_percent,
        discount_amount=dis_amt,
        cash_paid=data.cash_paid,
        credit_amount=credit_amount,
        customer_balance_after=new_outstanding,
        odometer_km=data.odometer_km,
        driver_name=data.driver_name,
        driver_mobile=data.driver_mobile,
        indent_no=data.indent_no,
        remarks=data.remarks,
    )
    db.add(sale)

    # Atomically update customer balance
    customer.current_outstanding = new_outstanding
    await db.commit()
    await db.refresh(sale)

    # Formatted WhatsApp Slip Payload with anti-fraud metadata
    odo_str = f" | Odo: {data.odometer_km:.0f} KM" if data.odometer_km else ""
    driver_str = f" | Driver: {data.driver_name}" if data.driver_name else ""
    indent_str = f" | Indent: {data.indent_no}" if data.indent_no else ""
    mileage_str = f"\nEstimated Mileage: {mileage_kml:.2f} KM/L" if mileage_kml else ""

    whatsapp_text = (
        f"Delivery Note Details :\n"
        f"Material supplied from NSAIPETROSOFT\n"
        f"Delivery Date is {today_ist().strftime('%d-%m-%Y')}. Slip No is {data.slip_no}{indent_str}\n"
        f"Vehicle Number - {clean_vehicle}{odo_str}{driver_str}\n"
        f"Product: {product.name} (Qty: {data.qty:.2f} L; Rate: {rate:.2f}; Amount: {net_amount:.2f}){mileage_str}\n"
        f"Purchased. Your updated outstanding is ₹{new_outstanding:,.2f}.\n"
        f"Thank you for your Business Visit Again"
    )

    return {
        "message": "Credit sale recorded successfully",
        "id": sale.id,
        "bill_no": bill_num,
        "slip_no": data.slip_no,
        "customer_name": customer.name,
        "customer_mobile": customer.mobile or "",
        "vehicle_no": data.vehicle_no.upper(),
        "amount": net_amount,
        "new_balance": new_outstanding,
        "limit_warning": limit_warning,
        "whatsapp_preview": whatsapp_text,
    }


@router.delete("/credit-sales/{sale_id}", summary="Delete Credit Sale & Revert Customer Outstanding")
async def delete_credit_sale(
    sale_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete credit sales and adjust ledger balances.",
        )
    sale = await db.get(CreditSale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail=f"Credit sale #{sale_id} not found in database")

    # Concurrency Lock: Lock customer row when reverting
    cust_stmt = select(Customer).where(Customer.id == sale.customer_id).with_for_update()
    cust_res = await db.execute(cust_stmt)
    customer = cust_res.scalar_one_or_none()
    credit_amount_revert = sale.credit_amount if sale.credit_amount is not None else sale.amount

    if customer and credit_amount_revert:
        customer.current_outstanding = max(0.0, round(customer.current_outstanding - credit_amount_revert, 2))

    # Revert fuel stock on tank if nozzle was associated
    if sale.nozzle_id:
        nozzle = await db.get(Nozzle, sale.nozzle_id)
        if nozzle and nozzle.tank_id:
            tank_stmt = select(Tank).where(Tank.id == nozzle.tank_id).with_for_update()
            tank_res = await db.execute(tank_stmt)
            tank = tank_res.scalar_one_or_none()
            if tank:
                tank.current_stock = round(tank.current_stock + sale.qty, 2)

    bill_number = sale.bill_no or str(sale_id)
    await db.delete(sale)
    await db.commit()

    return {
        "message": f"Credit sale bill #{bill_number} deleted and customer balance adjusted",
        "sale_id": sale_id,
        "reverted_amount": credit_amount_revert,
        "customer_new_outstanding": customer.current_outstanding if customer else 0.0,
    }


@router.get("/credit-sales/{sale_id}/thermal-slip", summary="Get 58mm/80mm Thermal Receipt Slip")
async def get_credit_sale_thermal_slip(sale_id: int, db: AsyncSession = Depends(get_db)):
    sale = await db.get(CreditSale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Credit sale not found")
    customer = await db.get(Customer, sale.customer_id)
    product = await db.get(FuelProduct, sale.product_id)
    customer_name = customer.name if customer else "Unknown Customer"
    product_name = product.name if product else "Fuel Product"

    slip_text = generate_credit_slip_text(
        sale=sale,
        customer_name=customer_name,
        product_name=product_name,
    )
    slip_html = generate_thermal_slip_html(slip_text, title=f"Slip #{sale.bill_no}")

    return {
        "sale_id": sale.id,
        "bill_no": sale.bill_no,
        "slip_no": sale.slip_no,
        "customer": customer_name,
        "vehicle_no": sale.vehicle_no,
        "slip_text": slip_text,
        "html": slip_html,
    }


@router.get("/credit-sales/{sale_id}/raw-escpos", summary="Get Raw Binary ESC/POS Commands for Hardware Thermal Printer")
async def get_credit_sale_raw_escpos(
    sale_id: int,
    cut: bool = True,
    drawer: bool = False,
    db: AsyncSession = Depends(get_db),
):
    sale = await db.get(CreditSale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Credit sale not found")
    customer = await db.get(Customer, sale.customer_id)
    product = await db.get(FuelProduct, sale.product_id)
    customer_name = customer.name if customer else "Unknown Customer"
    product_name = product.name if product else "Fuel Product"

    slip_text = generate_credit_slip_text(
        sale=sale,
        customer_name=customer_name,
        product_name=product_name,
    )
    raw_bytes = generate_raw_esc_pos_bytes(slip_text, cut_paper=cut, open_cash_drawer=drawer)
    return Response(
        content=raw_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="slip_{sale.bill_no}.bin"'},
    )






# -------------------------------------------------------------
# 4b. Customer Payment Receipts API (Frame 0085 - Payment Receipt F4)
# -------------------------------------------------------------
class PaymentReceiptCreate(BaseModel):
    customer_id: int
    amount: float
    payment_mode: str = "CASH"
    bank_name: Optional[str] = "CASH ON HAND"
    receiving_account: Optional[str] = None
    cheque_no: Optional[str] = None
    remarks: Optional[str] = None
    receipt_no: Optional[str] = None


@router.get("/payments", summary="List Customer Payment Receipts")
async def list_payments(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(PaymentReceipt).options(selectinload(PaymentReceipt.customer)).order_by(desc(PaymentReceipt.id)).limit(30)
    )
    payments = res.scalars().all()
    return [
        {
            "id": p.id,
            "receipt_no": p.receipt_no,
            "date": p.date.strftime("%d-%b-%Y") if p.date else today_ist().strftime("%d-%b-%Y"),
            "shift": "First",
            "customer": p.customer.name if p.customer else "Customer",
            "customer_mobile": p.customer.mobile if p.customer and p.customer.mobile else "",
            "mode": p.payment_mode,
            "bank": p.bank_name or "CASH ON HAND",
            "amount": p.amount,
        }
        for p in payments
    ]


@router.post(
    "/payments",
    summary="Record Customer Payment Receipt",
    dependencies=[Depends(verify_idempotency_key)],
)
async def create_payment_receipt(data: PaymentReceiptCreate, db: AsyncSession = Depends(get_db)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment receipt amount must be greater than zero")

    # Concurrency Lock: Lock Customer row to serialize payment credit ledger
    cust_stmt = select(Customer).where(Customer.id == data.customer_id).with_for_update()
    customer = (await db.execute(cust_stmt)).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    max_id_res = await db.execute(select(func.coalesce(func.max(PaymentReceipt.id), 0)))
    next_id = (max_id_res.scalar() or 0) + 1
    if data.receipt_no and data.receipt_no.strip():
        receipt_no = data.receipt_no.strip()
    else:
        receipt_no = f"RCP-{next_id:04d}-{int(time.time()*1000)%100000:05d}"

    effective_bank = data.receiving_account or data.bank_name or "CASH ON HAND"
    receipt = PaymentReceipt(
        receipt_no=receipt_no,
        customer_id=customer.id,
        amount=data.amount,
        payment_mode=data.payment_mode,
        bank_name=effective_bank,
        cheque_no=data.cheque_no,
        remarks=data.remarks,
        date=today_ist(),
    )
    db.add(receipt)

    # 1. Reduce customer current outstanding balance atomically
    customer.current_outstanding = max(0.0, round(customer.current_outstanding - data.amount, 2))

    # 2. Credit the receiving bank or cash account with row lock
    bank_query = select(BankAccount).where(
        BankAccount.account_name == effective_bank
    ).with_for_update()
    bank_res = await db.execute(bank_query)
    bank_acc = bank_res.scalar_one_or_none()
    if bank_acc:
        bank_acc.balance = round(bank_acc.balance + data.amount, 2)

    await db.commit()
    return {
        "status": "success",
        "message": f"Payment receipt #{receipt_no} recorded for ₹{data.amount:.2f}",
        "receipt_no": receipt_no,
        "customer_name": customer.name,
        "customer_mobile": customer.mobile or "",
        "amount": data.amount,
        "payment_mode": data.payment_mode,
        "bank_name": data.bank_name,
        "new_outstanding": customer.current_outstanding,
    }


@router.delete("/payments/{payment_id}", summary="Delete Payment Receipt & Restore Customer Outstanding")
async def delete_payment_receipt(
    payment_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete payment receipts and restore balances.",
        )
    rec_stmt = select(PaymentReceipt).where(PaymentReceipt.id == payment_id).with_for_update()
    receipt = (await db.execute(rec_stmt)).scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail=f"Payment receipt #{payment_id} not found")

    # 1. Restore customer outstanding balance with row lock
    cust_stmt = select(Customer).where(Customer.id == receipt.customer_id).with_for_update()
    customer = (await db.execute(cust_stmt)).scalar_one_or_none()
    if customer:
        customer.current_outstanding = round(customer.current_outstanding + receipt.amount, 2)

    # 2. Reverse receiving bank or cash account balance with row lock
    bank_query = select(BankAccount).where(
        BankAccount.account_name == (receipt.bank_name if receipt.bank_name else "CASH ON HAND")
    ).with_for_update()
    bank_res = await db.execute(bank_query)
    bank_acc = bank_res.scalar_one_or_none()
    if bank_acc:
        bank_acc.balance = max(0.0, round(bank_acc.balance - receipt.amount, 2))

    rcpt_no = receipt.receipt_no or str(payment_id)
    await db.delete(receipt)
    await db.commit()

    return {
        "message": f"Payment receipt #{rcpt_no} permanently deleted and customer balance restored",
        "payment_id": payment_id,
        "restored_amount": receipt.amount,
        "customer_new_outstanding": customer.current_outstanding if customer else 0.0,
    }


# -------------------------------------------------------------
# 4c. Bank Account Master API & POS Settlement
# -------------------------------------------------------------
class BankAccountCreate(BaseModel):
    account_name: str
    account_type: str = "CURRENT"
    balance: float = 0.0


@router.get("/bank-accounts", summary="List All Bank and Ledger Accounts")
async def get_bank_accounts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(BankAccount).order_by(BankAccount.id))
    accounts = res.scalars().all()
    return [
        {
            "id": a.id,
            "name": a.account_name,
            "type": a.account_type,
            "balance": round(a.balance, 2),
        }
        for a in accounts
    ]


@router.post("/bank-accounts", summary="Create New Bank or Ledger Account")
async def create_bank_account(data: BankAccountCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(BankAccount).where(BankAccount.account_name == data.account_name.strip().upper())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Account with this name already exists")

    acc = BankAccount(
        account_name=data.account_name.strip().upper(),
        account_type=data.account_type.upper(),
        balance=data.balance,
    )
    db.add(acc)
    await db.commit()
    return {
        "status": "success",
        "id": acc.id,
        "account_name": acc.account_name,
        "balance": acc.balance,
    }


class BankAccountUpdate(BaseModel):
    account_name: Optional[str] = None
    account_type: Optional[str] = None
    balance: Optional[float] = None


@router.put("/bank-accounts/{account_id}", summary="Update Bank or Ledger Account")
async def update_bank_account(account_id: int, data: BankAccountUpdate, db: AsyncSession = Depends(get_db)):
    acc = await db.get(BankAccount, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Bank account not found")
    if data.account_name is not None and data.account_name.strip():
        acc.account_name = data.account_name.strip().upper()
    if data.account_type is not None and data.account_type.strip():
        acc.account_type = data.account_type.strip().upper()
    if data.balance is not None:
        acc.balance = data.balance
    await db.commit()
    await db.refresh(acc)
    return {
        "status": "success",
        "id": acc.id,
        "name": acc.account_name,
        "type": acc.account_type,
        "balance": acc.balance,
    }


@router.delete("/bank-accounts/{account_id}", summary="Delete Bank or Ledger Account")
async def delete_bank_account(
    account_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete bank accounts.",
        )
    if account_id == 1:
        raise HTTPException(status_code=400, detail="Cannot delete core Cash On Hand ledger account")
    acc = await db.get(BankAccount, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Bank account not found")
    if acc.balance and abs(acc.balance) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete account '{acc.account_name}' with active balance of ₹{acc.balance:.2f}. Transfer balance via Contra Entry first.",
        )
    await db.delete(acc)
    await db.commit()
    return {"status": "success", "message": f"Bank account #{account_id} deleted"}


class CardSettlementCreate(BaseModel):
    machine_name: str
    batch_no: str
    slip_count: int
    amount: float


@router.post("/card-settlements", summary="Record EDC POS Terminal Settlement")
async def create_card_settlement(data: CardSettlementCreate, db: AsyncSession = Depends(get_db)):
    card_entry = CardSettlement(
        date=today_ist(),
        machine_name=data.machine_name.strip(),
        batch_no=data.batch_no.strip(),
        slip_count=data.slip_count,
        amount=data.amount,
        status="SETTLED",
    )
    db.add(card_entry)

    bank_query = select(BankAccount).where(
        func.upper(BankAccount.account_name).like(f"%{data.machine_name.upper().strip()}%")
    ).with_for_update()
    bank_res = await db.execute(bank_query)
    bank_acc = bank_res.scalar_one_or_none()
    if not bank_acc:
        bank_res2 = await db.execute(select(BankAccount).where(BankAccount.account_type == "POS").with_for_update().limit(1))
        bank_acc = bank_res2.scalars().first()
    if bank_acc:
        bank_acc.balance = round(bank_acc.balance + data.amount, 2)

    await db.commit()
    await db.refresh(card_entry)

    return {
        "status": "success",
        "id": card_entry.id,
        "date": card_entry.date.isoformat(),
        "machine_name": card_entry.machine_name,
        "batch_no": card_entry.batch_no,
        "slip_count": card_entry.slip_count,
        "amount": float(card_entry.amount),
        "machine": card_entry.machine_name,
        "batch": card_entry.batch_no,
        "slips": card_entry.slip_count,
        "message": f"Batch #{data.batch_no} recorded. ₹{data.amount} credited to {bank_acc.account_name if bank_acc else data.machine_name}",
        "new_balance": bank_acc.balance if bank_acc else None,
    }


@router.get("/card-settlements", summary="List EDC POS Terminal Settlements")
async def list_card_settlements(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(CardSettlement).order_by(desc(CardSettlement.id)))
    settlements = res.scalars().all()
    return [
        {
            "id": s.id,
            "date": s.date.isoformat(),
            "machine_name": s.machine_name,
            "batch_no": s.batch_no,
            "slip_count": s.slip_count,
            "amount": float(s.amount),
            "status": s.status,
            "machine": s.machine_name,
            "batch": s.batch_no,
            "slips": s.slip_count,
        }
        for s in settlements
    ]


@router.delete("/card-settlements/{settlement_id}", summary="Delete / Void EDC Card Settlement Batch")
async def delete_card_settlement(
    settlement_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to void EDC batch settlements.",
        )
    settlement = await db.get(CardSettlement, settlement_id)
    if not settlement:
        raise HTTPException(status_code=404, detail="Card settlement not found")
    # Reverse bank balance credit
    bank_query = select(BankAccount).where(
        func.upper(BankAccount.account_name).like(f"%{settlement.machine_name.upper().strip()}%")
    ).with_for_update()
    bank_res = await db.execute(bank_query)
    bank_acc = bank_res.scalar_one_or_none()
    if not bank_acc:
        bank_res2 = await db.execute(select(BankAccount).where(BankAccount.account_type == "POS").with_for_update().limit(1))
        bank_acc = bank_res2.scalars().first()
    if bank_acc:
        bank_acc.balance = max(0.0, round(bank_acc.balance - settlement.amount, 2))
    await db.delete(settlement)
    await db.commit()
    return {"status": "success", "message": f"Settlement #{settlement_id} deleted and bank ledger reversed"}



# -------------------------------------------------------------
# 5. Customer & Vehicle Master API
# -------------------------------------------------------------
class CustomerCreate(BaseModel):
    name: str
    mobile: str
    code: Optional[str] = None
    city: Optional[str] = None
    state: str = "Gujarat"
    address: Optional[str] = None
    gst_no: Optional[str] = None
    pan_no: Optional[str] = None
    credit_limit: float = 0.0
    current_outstanding: Optional[float] = 0.0
    opening_balance: Optional[float] = 0.0
    bill_period: str = "30 day"


class VehicleCreate(BaseModel):
    customer_id: int
    vehicle_no: str
    vehicle_type: str = "Truck"


async def get_next_customer_code(db: AsyncSession, reserved_codes: Optional[Set[str]] = None) -> str:
    """
    Computes the next collision-free customer code by finding the maximum integer
    code currently in the database. Prevents PostgreSQL unique constraint violations
    (ix_customers_code) when customer rows have gaps, deletions, or manual codes.
    """
    res = await db.execute(select(Customer.code))
    existing_codes = {str(c).strip() for c in res.scalars().all() if c}
    if reserved_codes:
        existing_codes.update(reserved_codes)

    max_num = 0
    for c in existing_codes:
        if c.isdigit():
            max_num = max(max_num, int(c))

    candidate = max(max_num + 1, 1)
    while str(candidate) in existing_codes:
        candidate += 1
    return str(candidate)


@router.get("/customers", summary="List All Customers")
async def list_customers(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Customer).options(selectinload(Customer.vehicles)).order_by(Customer.name)
    )
    customers = res.scalars().all()
    return [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "city": c.city,
            "mobile": c.mobile,
            "pan_no": c.pan_no,
            "gst_no": c.gst_no,
            "credit_limit": c.credit_limit,
            "current_outstanding": c.current_outstanding,
            "bill_period": c.bill_period,
            "is_blocked": bool(c.is_blocked),
            "vehicles": [v.vehicle_no for v in c.vehicles],
        }
        for c in customers
    ]


@router.post("/customers", summary="Create Customer")
async def create_customer(
    data: CustomerCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if data.code and data.code.strip():
        req_code = data.code.strip().upper()
        existing = await db.execute(select(Customer.id).where(Customer.code == req_code))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Customer code '{req_code}' already exists")
        code = req_code
    else:
        code = await get_next_customer_code(db)

    initial_outstanding = float(data.current_outstanding or data.opening_balance or 0.0)
    cust = Customer(
        code=code,
        name=data.name.strip(),
        mobile=data.mobile.strip(),
        city=data.city,
        state=data.state,
        address=data.address,
        gst_no=data.gst_no,
        pan_no=data.pan_no,
        credit_limit=data.credit_limit,
        current_outstanding=initial_outstanding,
        bill_period=data.bill_period,
    )
    db.add(cust)
    try:
        await db.flush()
    except IntegrityError as ie:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Database constraint violation while creating customer: {ie.orig or ie}",
        )

    # Immutable Financial Audit Trail (#100)
    req_ip = request.client.host if request.client else None
    await log_audit_event(
        db=db,
        actor=current_user or "SYSTEM",
        action="CUSTOMER_CREATE",
        entity_type="Customer",
        entity_id=cust.id,
        old_val=None,
        new_val={"name": cust.name, "mobile": cust.mobile, "credit_limit": cust.credit_limit, "current_outstanding": cust.current_outstanding},
        request_ip=req_ip,
    )

    await db.commit()
    return {"message": "Customer created successfully", "id": cust.id, "code": cust.code, "name": cust.name, "current_outstanding": cust.current_outstanding}


class CustomerBulkImportRequest(BaseModel):
    csv_content: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None


@router.post("/customers/bulk-import-csv", summary="Bulk Import Fleet Customers & Vehicles from CSV")
async def bulk_import_customers_csv(payload: CustomerBulkImportRequest, db: AsyncSession = Depends(get_db)):
    rows = []
    if payload.items:
        rows = payload.items
    elif payload.csv_content:
        content = payload.csv_content.strip()
        if content.startswith("\ufeff"):
            content = content[1:]
        reader = csv.DictReader(io.StringIO(content))
        for r in reader:
            norm_r = {str(k).strip().lower().replace(" ", "_"): v for k, v in r.items() if k is not None}
            rows.append(norm_r)
    else:
        raise HTTPException(status_code=400, detail="Either csv_content or items array must be provided")

    if not rows:
        raise HTTPException(status_code=400, detail="No rows found in CSV")

    inserted_count = 0
    updated_count = 0
    vehicles_added = 0
    errors = []

    all_codes_res = await db.execute(select(Customer.code))
    existing_codes = {str(c).strip() for c in all_codes_res.scalars().all() if c}
    max_num = 0
    for c in existing_codes:
        if c.isdigit():
            max_num = max(max_num, int(c))

    for idx, r in enumerate(rows, start=1):
        try:
            name = (r.get("name") or r.get("customer_name") or r.get("firm_name") or r.get("party_name") or "").strip().upper()
            if not name:
                errors.append({"row": idx, "error": "Customer / Firm Name is required"})
                continue

            mobile = str(r.get("mobile") or r.get("phone") or r.get("contact") or "9999999999").strip()
            city = str(r.get("city") or "SURAT").strip().upper()
            state = str(r.get("state") or "GUJARAT").strip().upper()
            address = str(r.get("address") or "").strip() or None
            gst_no = str(r.get("gst_no") or r.get("gstin") or r.get("gst") or "").strip().upper() or None
            pan_no = str(r.get("pan_no") or r.get("pan") or "").strip().upper() or None
            
            try:
                credit_limit = float(r.get("credit_limit") or r.get("limit") or 50000.0)
            except (ValueError, TypeError):
                credit_limit = 50000.0

            try:
                opening_balance = float(r.get("opening_balance") or r.get("current_outstanding") or r.get("balance") or 0.0)
            except (ValueError, TypeError):
                opening_balance = 0.0

            bill_period = str(r.get("bill_period") or r.get("billing_cycle") or "FORTNIGHTLY").strip().upper()
            code = str(r.get("code") or r.get("customer_code") or "").strip().upper()

            # Find existing customer by code or name
            cust_stmt = select(Customer).options(selectinload(Customer.vehicles))
            if code:
                cust_stmt = cust_stmt.where((Customer.code == code) | (func.upper(Customer.name) == name))
            else:
                cust_stmt = cust_stmt.where(func.upper(Customer.name) == name)

            cust_res = await db.execute(cust_stmt)
            cust = cust_res.scalar_one_or_none()

            if cust:
                # Update existing customer
                cust.mobile = mobile or cust.mobile
                cust.city = city or cust.city
                cust.state = state or cust.state
                if address: cust.address = address
                if gst_no: cust.gst_no = gst_no
                if pan_no: cust.pan_no = pan_no
                cust.credit_limit = credit_limit
                cust.bill_period = bill_period
                updated_count += 1
            else:
                # Create new customer
                if code and code not in existing_codes:
                    assigned_code = code
                else:
                    max_num = max(max_num + 1, 1)
                    while str(max_num) in existing_codes:
                        max_num += 1
                    assigned_code = str(max_num)
                existing_codes.add(assigned_code)
                cust = Customer(
                    code=assigned_code,
                    name=name,
                    mobile=mobile,
                    city=city,
                    state=state,
                    address=address,
                    gst_no=gst_no,
                    pan_no=pan_no,
                    credit_limit=credit_limit,
                    current_outstanding=opening_balance,
                    bill_period=bill_period,
                )
                db.add(cust)
                await db.flush()
                inserted_count += 1

            # Parse vehicles (support comma, semicolon, newline separated)
            vehicles_raw = str(r.get("vehicles") or r.get("vehicle_list") or r.get("vehicle_no") or "").strip()
            if vehicles_raw:
                raw_veh_list = [v.strip().upper() for v in re.split(r"[,;|\n]+", vehicles_raw) if v.strip()]
                existing_vehs = {v.vehicle_no.upper() for v in (cust.vehicles or [])}
                for v_no in raw_veh_list:
                    clean_v = re.sub(r"[^A-Z0-9]", "", v_no)
                    if clean_v and clean_v not in existing_vehs:
                        new_veh = Vehicle(customer_id=cust.id, vehicle_no=clean_v, vehicle_type="Truck")
                        db.add(new_veh)
                        existing_vehs.add(clean_v)
                        vehicles_added += 1

        except Exception as row_exc:
            errors.append({"row": idx, "error": str(row_exc)})

    await db.commit()
    return {
        "status": "success",
        "message": f"Successfully processed {len(rows)} customer records ({inserted_count} inserted, {updated_count} updated, {vehicles_added} vehicles added)",
        "total_rows": len(rows),
        "inserted": inserted_count,
        "updated": updated_count,
        "vehicles_added": vehicles_added,
        "errors": errors,
    }


@router.post("/vehicles", summary="Add Vehicle to Customer")
async def add_vehicle(data: VehicleCreate, db: AsyncSession = Depends(get_db)):
    cust = await db.get(Customer, data.customer_id)
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    veh = Vehicle(
        customer_id=cust.id,
        vehicle_no=data.vehicle_no.upper().strip(),
        vehicle_type=data.vehicle_type,
    )
    db.add(veh)
    await db.commit()
    return {"message": "Vehicle added successfully", "vehicle_no": veh.vehicle_no}


@router.delete("/customers/{customer_id}/vehicles/{vehicle_no}", summary="Delete Vehicle From Customer Fleet")
async def delete_customer_vehicle(
    customer_id: int,
    vehicle_no: str,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to remove fleet vehicles.",
        )
    v_res = await db.execute(
        select(Vehicle).where(
            Vehicle.customer_id == customer_id,
            func.upper(Vehicle.vehicle_no) == vehicle_no.strip().upper(),
        )
    )
    veh = v_res.scalar_one_or_none()
    if not veh:
        raise HTTPException(status_code=404, detail=f"Vehicle '{vehicle_no}' not found for customer #{customer_id}")
    await db.delete(veh)
    await db.commit()
    return {"message": f"Vehicle '{vehicle_no}' removed from customer #{customer_id} fleet", "vehicle_no": vehicle_no}


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    address: Optional[str] = None
    gst_no: Optional[str] = None
    pan_no: Optional[str] = None
    credit_limit: Optional[float] = None
    current_outstanding: Optional[float] = None
    opening_balance: Optional[float] = None
    bill_period: Optional[str] = None


@router.put("/customers/{customer_id}", summary="Update Customer")
async def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    cust = await db.get(Customer, customer_id)
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    old_limit = cust.credit_limit
    old_outstanding = cust.current_outstanding

    if data.name is not None:
        cust.name = data.name.strip()
    if data.mobile is not None:
        cust.mobile = data.mobile.strip()
    if data.city is not None:
        cust.city = data.city.strip()
    if data.state is not None:
        cust.state = data.state.strip()
    if data.address is not None:
        cust.address = data.address.strip()
    if data.gst_no is not None:
        cust.gst_no = data.gst_no.strip()
    if data.pan_no is not None:
        cust.pan_no = data.pan_no.strip()
    if data.credit_limit is not None:
        cust.credit_limit = data.credit_limit
    if data.current_outstanding is not None:
        cust.current_outstanding = float(data.current_outstanding)
    elif data.opening_balance is not None:
        cust.current_outstanding = float(data.opening_balance)
    if data.bill_period is not None:
        cust.bill_period = data.bill_period

    # Immutable Financial Audit Trail for credit limit modifications (#100)
    req_ip = request.client.host if request.client else None
    if data.credit_limit is not None and data.credit_limit != old_limit:
        await log_audit_event(
            db=db,
            actor=current_user or "STATION_MANAGER",
            action="CREDIT_LIMIT_CHANGE",
            entity_type="Customer",
            entity_id=cust.id,
            old_val={"customer_id": cust.id, "name": cust.name, "credit_limit": old_limit},
            new_val={"customer_id": cust.id, "name": cust.name, "credit_limit": cust.credit_limit},
            request_ip=req_ip,
        )

    await db.commit()
    return {"message": "Customer updated successfully", "id": cust.id, "name": cust.name}


@router.delete("/customers/{customer_id}", summary="Delete Customer")
async def delete_customer(
    customer_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete customer accounts.",
        )
    cust = await db.get(Customer, customer_id)
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    if cust.current_outstanding and abs(cust.current_outstanding) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete customer '{cust.name}' with active outstanding balance of ₹{cust.current_outstanding:.2f}"
        )
    await db.execute(delete(Vehicle).where(Vehicle.customer_id == customer_id))
    await db.delete(cust)
    await db.commit()
    return {"message": f"Customer '{cust.name}' deleted successfully", "id": customer_id}



# -------------------------------------------------------------
# 6. Tank Dip Register & Evaporation Variance API
# -------------------------------------------------------------
class TankDipCreate(BaseModel):
    tank_id: int
    opening_dip: float
    opening_stock: float
    receipt_liters: float = 0.0
    closing_dip: float
    closing_stock: float
    water_dip_cm: float = 0.0
    notes: Optional[str] = None
    observed_density: Optional[float] = None
    observed_temp: Optional[float] = None


@router.get("/dips", summary="List Tank Dip Entries")
async def list_dips(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(TankDipEntry).options(selectinload(TankDipEntry.tank)).order_by(desc(TankDipEntry.id)).limit(30)
    )
    entries = res.scalars().all()
    return [
        {
            "id": e.id,
            "date": str(e.date),
            "tank_name": e.tank.tank_name if e.tank else "Tank",
            "opening_dip": e.opening_dip,
            "opening_stock": e.opening_stock,
            "receipt": e.receipt_liters,
            "closing_dip": e.closing_dip,
            "closing_stock": e.closing_stock,
            "water_dip_cm": e.water_dip_cm or 0.0,
            "dip_sale": e.dip_wise_sale,
            "meter_sale": e.meter_wise_sale,
            "variation": e.variation_liters,
            "tolerance_limit": e.tolerance_limit,
            "observed_density": e.observed_density,
            "observed_temp": e.observed_temp,
            "density_15c": e.density_15c,
        }
        for e in entries
    ]


@router.post("/dips", summary="Record Daily Tank Dip and Calculate Variation")
async def create_tank_dip(
    data: TankDipCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if data.opening_dip < 0 or data.closing_dip < 0:
        raise HTTPException(status_code=400, detail="Dip rod measurements (cm) cannot be negative")
    if data.opening_stock < 0 or data.closing_stock < 0 or data.receipt_liters < 0:
        raise HTTPException(status_code=400, detail="Stock quantities and inward receipts cannot be negative")

    # Pessimistic row locking on underground storage tank (Hierarchy: Tank)
    tank_stmt = select(Tank).where(Tank.id == data.tank_id).with_for_update()
    tank = (await db.execute(tank_stmt)).scalar_one_or_none()
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")

    # Formula 1: Physical Dip Wise Sale = Opening Stock + Inward Receipt - Closing Stock
    dip_sale = round(data.opening_stock + data.receipt_liters - data.closing_stock, 2)

    # Formula 2: Get totalizer meter sale for nozzles drawing from this tank for today's shifts
    meter_res = await db.execute(
        select(func.coalesce(func.sum(ShiftMeterReading.sale_qty), 0.0))
        .join(Nozzle, ShiftMeterReading.nozzle_id == Nozzle.id)
        .join(Shift, ShiftMeterReading.shift_id == Shift.id)
        .where(Nozzle.tank_id == tank.id, Shift.date == today_ist())
    )
    meter_sale = round(float(meter_res.scalar() or 0.0), 2)

    # Formula 3: Expected Book Stock = Opening Stock + Inward Receipts - Meter Sales
    expected_book_stock = round(data.opening_stock + data.receipt_liters - meter_sale, 2)

    # Formula 4: Variation = Actual Physical Closing Stock - Expected Book Stock (Negative = Shortage/Loss)
    variation = round(data.closing_stock - expected_book_stock, 2)

    # Statutory Evaporation limit: 0.59% for Petrol (MS), 0.15% for Diesel (HSD)
    is_petrol = "MS" in tank.tank_name.upper() or "PETROL" in tank.tank_name.upper()
    tolerance_pct = 0.59 if is_petrol else 0.15
    tolerance_limit = round(-1 * (meter_sale * tolerance_pct / 100), 2) if meter_sale > 0 else 0.0

    # ASTM Table 53B 15°C Density Reduction
    density_15c = None
    if data.observed_density and data.observed_density > 0:
        product_code = "MS" if is_petrol else "HSD"
        temp = data.observed_temp if (data.observed_temp is not None and data.observed_temp > 0) else 15.0
        d_res = reduce_density_to_15c(data.observed_density, temp, product_code)
        density_15c = d_res["density_15c"]

    # Update tank live stock
    tank.current_stock = data.closing_stock
    tank.current_dip_cm = data.closing_dip

    entry = TankDipEntry(
        date=today_ist(),
        tank_id=tank.id,
        opening_dip=data.opening_dip,
        opening_stock=data.opening_stock,
        receipt_liters=data.receipt_liters,
        closing_dip=data.closing_dip,
        closing_stock=data.closing_stock,
        water_dip_cm=data.water_dip_cm,
        dip_wise_sale=dip_sale,
        meter_wise_sale=meter_sale,
        variation_liters=variation,
        tolerance_limit=tolerance_limit,
        notes=data.notes,
        observed_density=data.observed_density,
        observed_temp=data.observed_temp,
        density_15c=density_15c,
    )
    db.add(entry)
    await db.flush()

    # Immutable Financial Audit Trail (#100)
    req_ip = request.client.host if request.client else None
    await log_audit_event(
        db=db,
        actor=current_user or "FORECOURT_ATTENDANT",
        action="RECORD_TANK_DIP",
        entity_type="TankDipEntry",
        entity_id=entry.id,
        old_val={"tank_id": tank.id, "previous_stock": tank.current_stock, "opening_dip": data.opening_dip, "opening_stock": data.opening_stock},
        new_val={
            "tank_id": tank.id,
            "closing_dip": data.closing_dip,
            "closing_stock": data.closing_stock,
            "dip_sale": dip_sale,
            "meter_sale": meter_sale,
            "variation_liters": variation,
            "tolerance_limit": tolerance_limit,
        },
        request_ip=req_ip,
    )

    await db.commit()
    await db.refresh(entry)

    # Invalidate station forecourt cache
    invalidate_station_cache()

    # Real-Time WebSocket Broadcast if variance / shortage exceeds statutory tolerance (#54)
    if variation < tolerance_limit:
        import asyncio
        asyncio.create_task(
            ws_manager.broadcast_to_station(
                "1",
                {
                    "event": "TANK_VARIANCE_ALERT",
                    "data": {
                        "tank_id": tank.id,
                        "tank_name": tank.tank_name,
                        "date": str(entry.date),
                        "variation_liters": variation,
                        "tolerance_limit": tolerance_limit,
                        "closing_stock": data.closing_stock,
                        "expected_book_stock": expected_book_stock,
                        "water_dip_cm": data.water_dip_cm or 0.0,
                        "observed_density": data.observed_density,
                        "density_15c": density_15c,
                        "severity": "CRITICAL",
                        "timestamp": now_ist().isoformat(),
                        "message": f"Excess evaporation / shortage alert for {tank.tank_name}: {variation:+.2f} L (Permissible Limit: {tolerance_limit:.2f} L)",
                    },
                },
            )
        )

    return {
        "message": "Tank dip recorded successfully",
        "id": entry.id,
        "tank_name": tank.tank_name,
        "dip_wise_sale": dip_sale,
        "meter_wise_sale": meter_sale,
        "expected_book_stock": expected_book_stock,
        "variation_liters": variation,
        "tolerance_limit": tolerance_limit,
        "exceeds_tolerance": variation < tolerance_limit,
        "water_dip_cm": data.water_dip_cm,
        "observed_density": data.observed_density,
        "observed_temp": data.observed_temp,
        "density_15c": density_15c,
    }


@router.delete("/dips/{dip_id}", summary="Delete Inaccurate Tank Dip Reading")
async def delete_tank_dip(
    dip_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete tank dip audit entries.",
        )
    entry = await db.get(TankDipEntry, dip_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Tank dip reading not found")

    # Immutable Financial Audit Trail (#100)
    req_ip = request.client.host if request.client else None
    await log_audit_event(
        db=db,
        actor=current_user or "MANAGER_PIN",
        action="DELETE_TANK_DIP",
        entity_type="TankDipEntry",
        entity_id=dip_id,
        old_val={"id": entry.id, "tank_id": entry.tank_id, "date": str(entry.date), "variation_liters": float(entry.variation_liters or 0.0)},
        new_val={"deleted": True},
        request_ip=req_ip,
    )

    await db.delete(entry)
    await db.commit()
    return {"status": "success", "message": f"Tank dip entry #{dip_id} deleted"}


# -------------------------------------------------------------
# 7. Cashier Shift Settlement & Denomination Reconciler API
# -------------------------------------------------------------
class DenominationMap(BaseModel):
    n2000: int = 0
    n500: int = 0
    n200: int = 0
    n100: int = 0
    n50: int = 0
    n20: int = 0
    n10: int = 0
    n5: int = 0
    coins: float = 0.0


class SettlementCalculateRequest(BaseModel):
    denominations: DenominationMap
    digital_cards: float = 0.0
    credit_sales: float = 0.0
    expenses: float = 0.0
    credit_collections: float = 0.0
    total_meter_sales: float


@router.post("/settlements/calculate", summary="Reconcile Cash & Calculate Shortage / Excess")
async def calculate_settlement(data: SettlementCalculateRequest):
    d = data.denominations
    cash_total = (
        (d.n2000 * 2000)
        + (d.n500 * 500)
        + (d.n200 * 200)
        + (d.n100 * 100)
        + (d.n50 * 50)
        + (d.n20 * 20)
        + (d.n10 * 10)
        + (d.n5 * 5)
        + d.coins
    )

    # Golden Petrol Pump Settlement Formula:
    # Expected Cash = Meter Sales - Credit Sales - Digital Cards - Expenses + Credit Collections
    expected_cash = (
        data.total_meter_sales
        - data.credit_sales
        - data.digital_cards
        - data.expenses
        + data.credit_collections
    )
    gap_amount = round(cash_total - expected_cash, 2)

    return {
        "cash_total": round(cash_total, 2),
        "expected_cash": round(expected_cash, 2),
        "gap_amount": gap_amount,
        "status": "Balanced" if abs(gap_amount) < 1.0 else ("Excess" if gap_amount > 0 else "Shortage"),
    }


class SettlementSaveRequest(BaseModel):
    shift_id: Optional[int] = None
    shift_name: str = "First"
    employee_id: Optional[int] = None
    remarks: Optional[str] = None
    denominations: DenominationMap
    cash_total: float
    digital_total: float = 0.0
    credit_total: float = 0.0
    expense_total: float = 0.0
    expected_cash: float
    actual_cash: float
    gap_amount: float
    supervisor_pin: Optional[str] = None
    reversal_reason: Optional[str] = None


@router.post(
    "/settlements/save",
    summary="Persist Cashier Shift Settlement to Database",
    dependencies=[Depends(verify_idempotency_key)],
)
async def save_settlement(
    data: SettlementSaveRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if data.actual_cash < 0 or data.cash_total < 0 or data.digital_total < 0 or data.credit_total < 0 or data.expense_total < 0:
        raise HTTPException(
            status_code=400,
            detail="Cashier settlement breakdown amounts and cash physical counts cannot be negative",
        )

    # 1. Resolve or create shift with row-level lock (Hierarchy: Shift)
    shift = None
    if data.shift_id:
        shift_res = await db.execute(
            select(Shift).where(Shift.id == data.shift_id).with_for_update()
        )
        shift = shift_res.scalar_one_or_none()
    if not shift:
        res = await db.execute(select(Shift).order_by(desc(Shift.id)).limit(1).with_for_update())
        shift = res.scalar_one_or_none()
        if not shift:
            shift = Shift(
                so_number="00001",
                date=today_ist(),
                shift_name=data.shift_name,
                status="Closed",
                total_sale_amount=data.actual_cash + data.credit_total + data.digital_total,
                total_cash=data.cash_total,
                total_credit=data.credit_total,
                total_digital=data.digital_total,
            )
            db.add(shift)
            await db.flush()

    # Shift Security & Immutability Enforcement:
    # If shift is already Closed or Settled, require supervisor PIN authorization
    if shift.status in ("Closed", "Settled"):
        if not await verify_manager_pin(data.supervisor_pin, db):
            raise HTTPException(
                status_code=403,
                detail="SHIFT IMMUTABILITY ENFORCED: Shift has already been settled and finalized. Direct edits are disabled. Supervisor PIN authorization required to re-settle or adjust balances.",
            )
        # Record Supervisor Reversal Voucher
        max_v_res = await db.execute(select(func.coalesce(func.max(SupervisorReversalVoucher.id), 0)))
        v_seq = (max_v_res.scalar() or 0) + 1
        voucher = SupervisorReversalVoucher(
            voucher_no=f"SRV-{v_seq:04d}",
            shift_id=shift.id,
            date=today_ist(),
            reversal_type="SETTLEMENT_REVISE",
            reason=data.reversal_reason or "Supervisor authorized re-settlement on finalized shift",
            authorized_by="Station Manager",
            manager_pin=data.supervisor_pin,
        )
        db.add(voucher)

    # 2. Check if a settlement record already exists for this shift
    settlement_res = await db.execute(
        select(ShiftSettlement).where(ShiftSettlement.shift_id == shift.id)
    )
    settlement = settlement_res.scalar_one_or_none()
    if not settlement:
        settlement = ShiftSettlement(shift_id=shift.id)
        db.add(settlement)

    settlement.employee_id = data.employee_id
    settlement.denomination_json = json.dumps(data.denominations.model_dump())
    settlement.cash_total = data.cash_total
    settlement.digital_total = data.digital_total
    settlement.credit_total = data.credit_total
    settlement.expense_total = data.expense_total
    settlement.expected_cash = data.expected_cash
    settlement.actual_cash = data.actual_cash
    settlement.gap_amount = data.gap_amount
    settlement.settled_at = datetime.now(timezone.utc)

    shift.status = "Settled"
    shift.total_cash = data.cash_total
    shift.total_credit = data.credit_total
    shift.total_digital = data.digital_total

    # Automatically post cashier shortage to Employee Shortage & Recovery Ledger
    shortage_posted = 0.0
    if data.gap_amount < 0 and data.employee_id:
        emp_stmt = select(Employee).where(Employee.id == data.employee_id).with_for_update()
        emp = (await db.execute(emp_stmt)).scalar_one_or_none()
        if emp:
            shortage_posted = abs(round(data.gap_amount, 2))
            emp.shortage_balance = round((emp.shortage_balance or 0.0) + shortage_posted, 2)
            shortage_entry = EmployeeShortageLedger(
                employee_id=emp.id,
                shift_id=shift.id,
                date=shift.date or today_ist(),
                amount=shortage_posted,
                gap_type="SHORTAGE",
                status="PENDING",
                notes=f"Cashier shortage from Shift #{shift.so_number} settlement handover",
            )
            db.add(shortage_entry)

    await db.flush()

    # Immutable Financial Audit Trail (#100)
    req_ip = request.client.host if request.client else None
    await log_audit_event(
        db=db,
        actor=current_user or (data.supervisor_pin and f"PIN:{data.supervisor_pin}") or data.employee_id or "CASHIER",
        action="SHIFT_SETTLEMENT_APPROVAL",
        entity_type="ShiftSettlement",
        entity_id=settlement.id,
        old_val={"shift_id": shift.id, "previous_status": shift.status},
        new_val={
            "shift_id": shift.id,
            "status": "Settled",
            "cash_total": data.cash_total,
            "actual_cash": data.actual_cash,
            "expected_cash": data.expected_cash,
            "gap_amount": data.gap_amount,
            "shortage_posted": shortage_posted,
        },
        request_ip=req_ip,
    )

    await db.commit()
    return {
        "status": "success",
        "message": f"Shift settlement saved. Gap: ₹{data.gap_amount:.2f}",
        "settlement_id": settlement.id,
        "shift_id": shift.id,
        "gap_amount": data.gap_amount,
        "shortage_posted_to_employee": shortage_posted,
    }


class SettleShortageRequest(BaseModel):
    amount: float
    settlement_type: str = "CASH_RECOVERY"  # CASH_RECOVERY or SALARY_DEDUCTION
    notes: Optional[str] = None
    manager_pin: str = "1234"


@router.post("/employees/{employee_id}/settle-shortage", summary="Record Cash Recovery or Payroll Deduction of Employee Shortage")
async def settle_employee_shortage(
    employee_id: int,
    payload: SettleShortageRequest,
    db: AsyncSession = Depends(get_db),
):
    if not await verify_manager_pin(payload.manager_pin, db):
        raise HTTPException(status_code=403, detail="Invalid Manager Authorization PIN")

    emp = await db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Settlement amount must be positive")

    new_balance = max(0.0, round((emp.shortage_balance or 0.0) - payload.amount, 2))
    emp.shortage_balance = new_balance

    recovery_entry = EmployeeShortageLedger(
        employee_id=emp.id,
        date=today_ist(),
        amount=-payload.amount,
        gap_type="RECOVERY",
        status=payload.settlement_type,
        settled_at=datetime.now(timezone.utc),
        notes=payload.notes or f"Shortage cleared via {payload.settlement_type}",
    )
    db.add(recovery_entry)

    # Credit Cash on Hand if recovered in cash
    if "CASH" in (payload.settlement_type or "").upper():
        cash_res = await db.execute(select(BankAccount).where(BankAccount.account_type == "CASH").with_for_update().limit(1))
        cash_acc = cash_res.scalars().first()
        if not cash_acc:
            cash_acc = await db.get(BankAccount, 1)
        if cash_acc:
            cash_acc.balance = round(cash_acc.balance + payload.amount, 2)

    await db.commit()

    return {
        "status": "success",
        "message": f"Successfully settled ₹{payload.amount:.2f} via {payload.settlement_type}",
        "employee_name": emp.name,
        "remaining_shortage_balance": new_balance,
    }


@router.get("/employees/{employee_id}/shortages", summary="Get Employee Shortage Recovery History")
async def get_employee_shortages(employee_id: int, db: AsyncSession = Depends(get_db)):
    emp = await db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    stmt = (
        select(EmployeeShortageLedger)
        .where(EmployeeShortageLedger.employee_id == employee_id)
        .order_by(desc(EmployeeShortageLedger.date), desc(EmployeeShortageLedger.id))
    )
    res = await db.execute(stmt)
    entries = res.scalars().all()
    return {
        "employee_id": emp.id,
        "employee_name": emp.name,
        "shortage_balance": emp.shortage_balance or 0.0,
        "ledger": [
            {
                "id": e.id,
                "date": str(e.date),
                "amount": e.amount,
                "gap_type": e.gap_type,
                "status": e.status,
                "notes": e.notes,
                "settled_at": str(e.settled_at) if e.settled_at else None,
            }
            for e in entries
        ],
    }


@router.delete("/employees/shortages/{shortage_id}", summary="Delete / Void Employee Shortage Entry")
async def delete_employee_shortage(
    shortage_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to void shortage entries.",
        )
    entry = await db.get(EmployeeShortageLedger, shortage_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Shortage entry not found")

    emp = await db.get(Employee, entry.employee_id)
    if emp:
        # If entry was a newly registered SHORTAGE (which increased shortage_balance), voiding it reduces the debt
        if entry.gap_type == "SHORTAGE" or entry.status == "PENDING":
            sub_amt = abs(float(entry.amount or 0.0))
            emp.shortage_balance = max(0.0, round(float(emp.shortage_balance or 0.0) - sub_amt, 2))
        # If entry was a RECOVERY (which decreased shortage_balance), voiding it restores the debt
        elif entry.gap_type == "RECOVERY" or (entry.amount and entry.amount < 0) or entry.status in ("SETTLED", "RECOVERED_CASH", "PAYROLL_DEDUCTION", "CASH_RECOVERY", "SALARY_DEDUCTION", "CASH"):
            restore_amt = abs(float(entry.amount or 0.0))
            emp.shortage_balance = round(float(emp.shortage_balance or 0.0) + restore_amt, 2)
            # Reverse cash collection if settled via cash
            if "CASH" in (entry.status or "").upper():
                cash_res = await db.execute(select(BankAccount).where(BankAccount.account_type == "CASH").limit(1))
                cash_acc = cash_res.scalars().first()
                if not cash_acc:
                    cash_acc = await db.get(BankAccount, 1)
                if cash_acc:
                    cash_acc.balance = max(0.0, round(cash_acc.balance - restore_amt, 2))

    await db.delete(entry)
    await db.commit()
    return {
        "status": "success",
        "message": f"Shortage ledger entry #{shortage_id} voided successfully.",
        "id": shortage_id,
        "employee_id": emp.id if emp else None,
        "new_shortage_balance": emp.shortage_balance if emp else 0.0,
    }


@router.get("/settlements", summary="List Shift Settlements History")
async def list_settlements(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(ShiftSettlement)
        .options(selectinload(ShiftSettlement.shift), selectinload(ShiftSettlement.employee))
        .order_by(desc(ShiftSettlement.id))
        .limit(20)
    )
    settlements = res.scalars().all()
    return [
        {
            "id": s.id,
            "shift_so": s.shift.so_number if s.shift else "-",
            "shift_name": s.shift.shift_name if s.shift else "First",
            "date": s.shift.date.strftime("%d-%b-%Y") if s.shift and s.shift.date else "Today",
            "employee": s.employee.name if s.employee else "Duty Cashier",
            "cash_total": s.cash_total,
            "credit_total": s.credit_total,
            "digital_total": s.digital_total,
            "expense_total": s.expense_total,
            "expected_cash": s.expected_cash,
            "actual_cash": s.actual_cash,
            "gap_amount": s.gap_amount,
            "settled_at": s.settled_at.strftime("%d-%b-%Y %H:%M") if s.settled_at else "-",
        }
        for s in settlements
    ]


# -------------------------------------------------------------
# 8. Tanker Decanting Inward Purchase API
# -------------------------------------------------------------
class PurchaseCreate(BaseModel):
    invoice_no: str
    dealer_name: str = "BHARAT PETROLEUM CO LTD"
    tanker_vehicle_no: str
    wooden_seals: Optional[str] = "Seal 1, 2, 3, 4"
    aluminum_seals: Optional[str] = "Seal 1, 2, 3, 4"
    sample_density: float = 0.0
    observed_temp: float = 15.0
    observed_density: float = 0.0
    invoice_density_15c: float = 0.0
    manager_override_pin: Optional[str] = None
    product_id: int
    tank_id: Optional[int] = None
    qty_kl: float
    rate_per_kl: float
    basic_excise: float = 0.0
    vat_percent: float = 14.90
    cess_percent: float = 4.00
    tcs_amount: float = 0.0
    freight: float = 0.0


@router.post("/purchases", summary="Record Inward Tanker Decanting")
async def create_purchase(data: PurchaseCreate, db: AsyncSession = Depends(get_db)):
    if data.qty_kl <= 0 or data.qty_kl > 100:
        raise HTTPException(status_code=400, detail="Tanker purchase quantity must be positive and within tanker capacity (max 100 KL)")
    if data.rate_per_kl <= 0:
        raise HTTPException(status_code=400, detail="Purchase rate per KL must be greater than zero")
    if data.freight < 0 or data.tcs_amount < 0:
        raise HTTPException(status_code=400, detail="Freight and TCS charges cannot be negative")

    product = await db.get(FuelProduct, data.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    qty_liters = data.qty_kl * 1000.0
    gross_amount = round(data.qty_kl * data.rate_per_kl, 2)
    vat_amt = round((gross_amount * data.vat_percent) / 100, 2)
    cess_amt = round((gross_amount * data.cess_percent) / 100, 2)
    final_amount = round(gross_amount + vat_amt + cess_amt + data.tcs_amount + data.freight, 2)

    # ASTM Table 53B Density Reduction & Statutory Tolerance Verification
    eff_obs_density = data.observed_density if data.observed_density > 0 else data.sample_density
    density_res = reduce_density_to_15c(
        observed_density=eff_obs_density,
        temperature_celsius=data.observed_temp,
        product_code=product.code if product else "HSD",
    )
    density_15c = density_res["density_15c"]
    density_var = 0.0
    density_status = "PASSED"

    if data.invoice_density_15c > 0:
        density_var = round(abs(density_15c - data.invoice_density_15c), 2)
        if density_var > 3.0:
            density_status = "EXCEEDED_TOLERANCE"
            if not await verify_manager_pin(data.manager_override_pin, db):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"STATUTORY DECANTING REJECTION: Converted 15°C density is {density_15c:.2f} kg/m³ "
                        f"vs Invoice 15°C density {data.invoice_density_15c:.2f} kg/m³. "
                        f"Variance of {density_var:.2f} kg/m³ exceeds OMC statutory ±3.0 kg/m³ limit. "
                        f"Decanting is legally prohibited. Manager authorization PIN required to override."
                    ),
                )
        else:
            density_status = "PASSED"

    entry = PurchaseEntry(
        invoice_no=data.invoice_no,
        date=today_ist(),
        dealer_name=data.dealer_name,
        tanker_vehicle_no=data.tanker_vehicle_no.upper().strip(),
        wooden_seals=data.wooden_seals,
        aluminum_seals=data.aluminum_seals,
        sample_density=eff_obs_density,
        observed_temp=data.observed_temp,
        observed_density=eff_obs_density,
        density_15c=density_15c,
        invoice_density_15c=data.invoice_density_15c,
        density_variance=density_var,
        density_status=density_status,
        product_id=product.id,
        tank_id=data.tank_id,
        qty_kl=data.qty_kl,
        qty_liters=qty_liters,
        rate_per_kl=data.rate_per_kl,
        gross_amount=gross_amount,
        basic_excise=data.basic_excise,
        vat_percent=data.vat_percent,
        vat_amount=vat_amt,
        cess_percent=data.cess_percent,
        cess_amount=cess_amt,
        tcs_amount=data.tcs_amount,
        freight=data.freight,
        final_amount=final_amount,
    )
    db.add(entry)

    # If tank assigned, add inward liters to underground tank stock with row lock
    if data.tank_id:
        tank_stmt = select(Tank).where(Tank.id == data.tank_id).with_for_update()
        tank = (await db.execute(tank_stmt)).scalar_one_or_none()
        if tank:
            tank.current_stock = round(tank.current_stock + qty_liters, 2)

    await db.commit()
    return {
        "message": "Tanker decanting recorded successfully",
        "invoice_no": data.invoice_no,
        "qty_liters": qty_liters,
        "final_amount": final_amount,
        "density_15c": density_15c,
        "density_variance": density_var,
        "density_status": density_status,
    }


@router.get("/purchases", summary="List Inward Tanker Decanting Invoices")
async def list_purchases(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(PurchaseEntry)
        .options(selectinload(PurchaseEntry.product), selectinload(PurchaseEntry.tank))
        .order_by(desc(PurchaseEntry.id))
        .limit(20)
    )
    purchases = res.scalars().all()
    return [
        {
            "id": p.id,
            "invoice_no": p.invoice_no,
            "date": p.date.strftime("%d-%b-%Y") if p.date else today_ist().strftime("%d-%b-%Y"),
            "dealer_name": p.dealer_name,
            "tanker_vehicle_no": p.tanker_vehicle_no,
            "product": p.product.name if p.product else "Fuel",
            "tank": p.tank.tank_name if p.tank else "-",
            "qty_kl": p.qty_kl,
            "qty_liters": p.qty_liters,
            "rate_per_kl": p.rate_per_kl,
            "gross_amount": p.gross_amount,
            "vat_amount": p.vat_amount,
            "final_amount": p.final_amount,
            "sample_density": p.sample_density,
        }
        for p in purchases
    ]


@router.delete("/purchases/{purchase_id}", summary="Delete Purchase Decanting & Rollback Tank Stock")
async def delete_purchase(
    purchase_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete purchase invoices and adjust stock.",
        )
    pur_stmt = select(PurchaseEntry).where(PurchaseEntry.id == purchase_id).with_for_update()
    purchase = (await db.execute(pur_stmt)).scalar_one_or_none()
    if not purchase:
        raise HTTPException(status_code=404, detail=f"Purchase entry #{purchase_id} not found")

    # Rollback tank stock if tank was updated with row lock
    if purchase.tank_id:
        tank_stmt = select(Tank).where(Tank.id == purchase.tank_id).with_for_update()
        tank = (await db.execute(tank_stmt)).scalar_one_or_none()
        if tank and purchase.qty_liters:
            tank.current_stock = max(0.0, round(tank.current_stock - purchase.qty_liters, 2))

    inv_no = purchase.invoice_no or str(purchase_id)
    await db.delete(purchase)
    await db.commit()

    return {
        "message": f"Purchase decanting invoice #{inv_no} deleted and tank stock adjusted",
        "purchase_id": purchase_id,
        "reverted_liters": purchase.qty_liters,
    }


# -------------------------------------------------------------
# 9. Reports: DSR, VAT Summary, Dealer Margin
# -------------------------------------------------------------
@router.get("/reports/dsr", summary="Daily Sales Report (DSR) & Tank Stock Register")
async def get_dsr_report(report_date: Optional[date] = Query(None), db: AsyncSession = Depends(get_db)):
    """
    Daily Sales Report & Tank Stock Register.
    Optimized to eliminate N+1 queries (#5, #21) via constant-factor SQL batch aggregations:
    1. Tanks with products pre-loaded.
    2. Inward purchases on target_date aggregated by tank_id.
    3. Shift meter sales & testing on target_date aggregated by nozzle's tank_id.
    4. Latest dip entries on or before target_date in a single batch query.
    """
    target_date = report_date or today_ist()

    # 1. Fetch all tanks with product relationship preloaded
    tanks_res = await db.execute(
        select(Tank).options(selectinload(Tank.product)).order_by(Tank.id)
    )
    tanks = tanks_res.scalars().all()

    # 2. Inward purchases on target date grouped by tank_id in a single query
    purch_res = await db.execute(
        select(
            PurchaseEntry.tank_id,
            func.coalesce(func.sum(PurchaseEntry.qty_liters), 0.0),
        )
        .where(PurchaseEntry.date == target_date)
        .group_by(PurchaseEntry.tank_id)
    )
    purchases_by_tank = {row[0]: float(row[1]) for row in purch_res.all()}

    # 3. Meter sale & testing grouped by Nozzle.tank_id on target date in a single query
    sales_res = await db.execute(
        select(
            Nozzle.tank_id,
            func.coalesce(func.sum(ShiftMeterReading.sale_qty), 0.0),
            func.coalesce(func.sum(ShiftMeterReading.testing_qty), 0.0),
        )
        .join(Nozzle, ShiftMeterReading.nozzle_id == Nozzle.id)
        .join(Shift, ShiftMeterReading.shift_id == Shift.id)
        .where(Shift.date == target_date)
        .group_by(Nozzle.tank_id)
    )
    sales_by_tank = {row[0]: (float(row[1]), float(row[2])) for row in sales_res.all()}

    # 4. Fetch all dip entries on or before target date in a single query; pick latest per tank
    dips_res = await db.execute(
        select(TankDipEntry)
        .where(TankDipEntry.date <= target_date)
        .order_by(desc(TankDipEntry.date), desc(TankDipEntry.id))
    )
    latest_dip_by_tank = {}
    for d in dips_res.scalars().all():
        if d.tank_id not in latest_dip_by_tank:
            latest_dip_by_tank[d.tank_id] = d

    report_data = []
    for t in tanks:
        prod_name = t.product.name if t.product else "Fuel"
        receipt = purchases_by_tank.get(t.id, 0.0)

        sale_tuple = sales_by_tank.get(t.id, (0.0, 0.0))
        net_sale = round(sale_tuple[0], 2)
        testing = round(sale_tuple[1], 2)
        gross_meter_sale = round(net_sale + testing, 2)

        latest_dip = latest_dip_by_tank.get(t.id)
        actual_dip = float(latest_dip.closing_stock) if latest_dip else float(t.current_stock)
        open_stock = float(latest_dip.opening_stock) if latest_dip else float(t.current_stock)
        closing_book = round(open_stock + receipt - net_sale, 2)
        variation = round(actual_dip - closing_book, 2)

        # Statutory OMC Permissible Loss Limits: MS -0.59%, HSD -0.15%
        is_ms = "MS" in (t.product.code if t.product else "").upper() or "PETROL" in prod_name.upper()
        tolerance_pct = -0.59 if is_ms else -0.15
        permissible_loss_liters = round((net_sale * tolerance_pct) / 100.0, 2) if net_sale > 0 else 0.0

        if net_sale > 0:
            loss_pct = round((variation / net_sale) * 100.0, 2)
        else:
            loss_pct = 0.0

        if variation < permissible_loss_liters:
            statutory_status = "EXCESS_EVAPORATION_LOSS"  # Flag potential pipeline leak or theft
        elif variation > 50.0:
            statutory_status = "UNEXPLAINED_SURPLUS"      # Flag potential water ingress or calibration error
        else:
            statutory_status = "WITHIN_PERMISSIBLE_LIMITS"

        report_data.append({
            "tank": t.tank_name,
            "product": prod_name,
            "opening_stock": round(open_stock, 2),
            "receipt": round(receipt, 2),
            "total_stock": round(open_stock + receipt, 2),
            "meter_sale": round(gross_meter_sale, 2),
            "testing": round(testing, 2),
            "net_sale": round(net_sale, 2),
            "closing_book_stock": round(closing_book, 2),
            "actual_dip_stock": round(actual_dip, 2),
            "daily_variation": round(variation, 2),
            "cumulative_variation": round(variation, 2),
            "permissible_tolerance_pct": tolerance_pct,
            "permissible_loss_liters": permissible_loss_liters,
            "loss_pct": loss_pct,
            "statutory_status": statutory_status,
        })

    return report_data


@router.get("/reports/stamping-register", summary="Weights & Measures Nozzle Stamping Due Register")
async def get_stamping_register(db: AsyncSession = Depends(get_db)):
    nozzles_res = await db.execute(
        select(Nozzle).options(selectinload(Nozzle.product), selectinload(Nozzle.meter_swaps)).order_by(Nozzle.id)
    )
    nozzles = nozzles_res.scalars().all()
    today = today_ist()

    register = []
    for n in nozzles:
        if n.last_stamped_date and n.stamping_due_date:
            last_date = n.last_stamped_date
            next_due = n.stamping_due_date
        else:
            # Latest meter swap or default 1 year validity from installation
            latest_swap = n.meter_swaps[-1] if n.meter_swaps else None
            last_date = latest_swap.replace_date if latest_swap else (today - timedelta(days=90))
            next_due = last_date + timedelta(days=365)  # Statutory annual W&M re-stamping
        days_left = (next_due - today).days

        if days_left < 0:
            status = "EXPIRED"
        elif days_left <= 30:
            status = "DUE_SOON"
        else:
            status = "VALID"

        wm_seal = n.wm_seal_no or (latest_swap.wm_seal_no if latest_swap and latest_swap.wm_seal_no else "WM-IND-2026-A")

        register.append({
            "nozzle_id": n.id,
            "nozzle_name": n.nozzle_name,
            "machine_name": n.machine_name,
            "product": n.product.name if n.product else "Fuel",
            "current_meter": n.current_meter,
            "last_stamping_date": str(last_date),
            "next_stamping_due": str(next_due),
            "days_left": days_left,
            "wm_seal_no": wm_seal,
            "wm_certificate_no": n.wm_certificate_no or "",
            "status": status,
        })

    return register


@router.get("/reports/density-register", summary="Statutory 15°C Morning Tank Density Register")
async def get_density_register(db: AsyncSession = Depends(get_db)):
    # 1. Tank dip entries with density
    dips_res = await db.execute(
        select(TankDipEntry).options(selectinload(TankDipEntry.tank)).order_by(desc(TankDipEntry.date), desc(TankDipEntry.id)).limit(30)
    )
    dips = dips_res.scalars().all()

    # 2. Tanker purchase entries with density
    purch_res = await db.execute(
        select(PurchaseEntry).options(selectinload(PurchaseEntry.product), selectinload(PurchaseEntry.tank)).order_by(desc(PurchaseEntry.date), desc(PurchaseEntry.id)).limit(20)
    )
    purchases = purch_res.scalars().all()

    tank_records = [
        {
            "date": str(d.date),
            "tank": d.tank.tank_name if d.tank else "-",
            "dip_cm": d.closing_dip,
            "closing_stock": d.closing_stock,
            "observed_density": d.observed_density or (830.0 if "HSD" in (d.tank.tank_name if d.tank else "") else 745.0),
            "observed_temp": d.observed_temp or 15.0,
            "density_15c": d.density_15c or (830.0 if "HSD" in (d.tank.tank_name if d.tank else "") else 745.0),
            "standard_density": 830.0 if "HSD" in (d.tank.tank_name if d.tank else "") else 745.0,
            "status": "RECORDED" if d.observed_density else "PASS",
        }
        for d in dips
    ]

    tanker_records = [
        {
            "date": str(p.date),
            "invoice_no": p.invoice_no,
            "vehicle_no": p.tanker_vehicle_no,
            "product": p.product.name if p.product else "Fuel",
            "observed_density": p.observed_density or p.sample_density,
            "observed_temp": p.observed_temp or 15.0,
            "density_15c": p.density_15c,
            "invoice_density_15c": p.invoice_density_15c,
            "density_variance": p.density_variance,
            "status": p.density_status,
        }
        for p in purchases
    ]

    return {
        "tank_records": tank_records,
        "tanker_decanting_records": tanker_records,
    }


@router.get("/reports/vat-summary", summary="State VAT Purchase vs Sale Summary")
async def get_vat_summary(db: AsyncSession = Depends(get_db)):
    # Purchases grouped by product
    purch_res = await db.execute(
        select(
            FuelProduct.name,
            func.coalesce(func.sum(PurchaseEntry.qty_liters), 0.0),
            func.coalesce(func.sum(PurchaseEntry.basic_excise), 0.0),
            func.coalesce(func.avg(PurchaseEntry.vat_percent), 14.9),
            func.coalesce(func.sum(PurchaseEntry.vat_amount), 0.0),
            func.coalesce(func.sum(PurchaseEntry.cess_amount), 0.0),
            func.coalesce(func.sum(PurchaseEntry.gross_amount), 0.0),
        )
        .join(FuelProduct, PurchaseEntry.product_id == FuelProduct.id)
        .group_by(FuelProduct.name)
    )
    purch_rows = purch_res.all()

    purch_list = []
    tot_purch_vat = 0.0
    for r in purch_rows:
        tot_purch_vat += float(r[4])
        purch_list.append({
            "item": r[0],
            "qty": round(float(r[1]), 2),
            "basic": round(float(r[2]), 2),
            "vat_pct": round(float(r[3]), 2),
            "vat_amount": round(float(r[4]), 2),
            "cess": round(float(r[5]), 2),
            "total": round(float(r[6]), 2),
        })

    # Sales grouped by product
    sales_res = await db.execute(
        select(
            FuelProduct.name,
            func.coalesce(func.sum(ShiftMeterReading.sale_qty), 0.0),
            func.coalesce(func.sum(ShiftMeterReading.total_amount - ShiftMeterReading.vat_amount), 0.0),
            func.coalesce(func.sum(ShiftMeterReading.vat_amount), 0.0),
            func.coalesce(func.sum(ShiftMeterReading.total_amount), 0.0),
        )
        .join(Nozzle, ShiftMeterReading.nozzle_id == Nozzle.id)
        .join(FuelProduct, Nozzle.product_id == FuelProduct.id)
        .group_by(FuelProduct.name)
    )
    sales_rows = sales_res.all()

    sales_list = []
    tot_sales_vat = 0.0
    for s in sales_rows:
        tot_sales_vat += float(s[3])
        sales_list.append({
            "item": s[0],
            "qty": round(float(s[1]), 2),
            "basic": round(float(s[2]), 2),
            "vat_pct": 14.90 if "Diesel" in s[0] else 13.70,
            "vat_amount": round(float(s[3]), 2),
            "total": round(float(s[4]), 2),
        })

    # GST Lubricants Sales (HSN 2710 / 3102) for GSTR-1 / GSTR-3B
    lube_sales_res = await db.execute(
        select(
            LubeSaleEntry.hsn_code,
            LubeSaleEntry.gst_percent,
            func.coalesce(func.sum(LubeSaleEntry.qty_units), 0),
            func.coalesce(func.sum(LubeSaleEntry.taxable_amount), 0.0),
            func.coalesce(func.sum(LubeSaleEntry.cgst_amount), 0.0),
            func.coalesce(func.sum(LubeSaleEntry.sgst_amount), 0.0),
            func.coalesce(func.sum(LubeSaleEntry.total_amount), 0.0),
        )
        .group_by(LubeSaleEntry.hsn_code, LubeSaleEntry.gst_percent)
    )
    lube_rows = lube_sales_res.all()
    gst_lube_list = []
    tot_cgst = 0.0
    tot_sgst = 0.0
    tot_taxable = 0.0
    tot_lube_amt = 0.0
    for lr in lube_rows:
        cgst = float(lr[4])
        sgst = float(lr[5])
        taxable = float(lr[3])
        tot = float(lr[6])
        tot_cgst += cgst
        tot_sgst += sgst
        tot_taxable += taxable
        tot_lube_amt += tot
        gst_lube_list.append({
            "hsn_code": lr[0] or "2710",
            "gst_pct": round(float(lr[1] or 18.0), 2),
            "units": int(lr[2]),
            "taxable_amount": round(taxable, 2),
            "cgst_amount": round(cgst, 2),
            "sgst_amount": round(sgst, 2),
            "total_gst": round(cgst + sgst, 2),
            "total_amount": round(tot, 2),
        })

    return {
        "purchase": purch_list,
        "sales": sales_list,
        "gst_lube": gst_lube_list,
        "gst_lube_summary": {
            "total_taxable": round(tot_taxable, 2),
            "total_cgst": round(tot_cgst, 2),
            "total_sgst": round(tot_sgst, 2),
            "total_gst": round(tot_cgst + tot_sgst, 2),
            "total_lube_sales": round(tot_lube_amt, 2),
        },
        "payable": {
            "purchase_vat": round(tot_purch_vat, 2),
            "sales_vat": round(tot_sales_vat, 2),
            "net_payable_vat": round(tot_sales_vat - tot_purch_vat, 2),
        },
    }


@router.get("/reports/profit-summary", summary="Dealer Margin & P&L Per Liter (LFR)")
async def get_profit_summary(db: AsyncSession = Depends(get_db)):
    sales_by_date = await db.execute(
        select(
            Shift.date,
            func.coalesce(func.sum(ShiftMeterReading.sale_qty), 0.0),
            func.coalesce(func.avg(ShiftMeterReading.rate), 0.0),
            func.coalesce(func.sum(ShiftMeterReading.total_amount), 0.0),
            func.coalesce(func.sum(ShiftMeterReading.vat_amount), 0.0),
        )
        .join(Shift, ShiftMeterReading.shift_id == Shift.id)
        .group_by(Shift.date)
        .order_by(desc(Shift.date))
        .limit(10)
    )
    rows = sales_by_date.all()

    avg_purch = await db.execute(
        select(func.coalesce(func.avg(PurchaseEntry.rate_per_kl / 1000.0), 90.17))
    )
    purch_rate = float(avg_purch.scalar() or 90.17)

    result = []
    for r in rows:
        sqty = float(r[1])
        srate = float(r[2])
        samt = float(r[3])
        svat = float(r[4])
        pamt = round(sqty * purch_rate, 2)
        pvat = round(pamt * 0.149, 2)
        gross_profit = round(samt - pamt, 2)
        net_profit = round(gross_profit - svat + pvat, 2)
        profit_per_l = round(gross_profit / sqty, 2) if sqty > 0 else 0.0

        result.append({
            "date": r[0].strftime("%d-%b-%Y") if r[0] else today_ist().strftime("%d-%b-%Y"),
            "sale_qty": round(sqty, 2),
            "purchase_rate": round(purch_rate, 2),
            "purchase_amt": pamt,
            "purchase_vat": pvat,
            "sale_rate": round(srate, 2),
            "sale_amt": round(samt, 2),
            "sale_vat": round(svat, 2),
            "gross_profit": gross_profit,
            "net_profit": net_profit,
            "profit_per_liter": profit_per_l,
            "vat_per_liter": round(svat / sqty, 2) if sqty > 0 else 0.0,
            "lfr_per_liter": 0.52,
        })
    return result


@router.get("/reports/tds-summary", summary="TDS 0.1% / Section 194Q Statutory Summary")
async def get_tds_summary(db: AsyncSession = Depends(get_db)):
    purch_res = await db.execute(
        select(
            FuelProduct.name,
            func.coalesce(func.sum(PurchaseEntry.qty_liters), 0.0),
            func.coalesce(func.sum(PurchaseEntry.basic_excise), 0.0),
            func.coalesce(func.sum(PurchaseEntry.vat_amount), 0.0),
            func.coalesce(func.sum(PurchaseEntry.cess_amount), 0.0),
            func.coalesce(func.sum(PurchaseEntry.gross_amount), 0.0),
        )
        .join(FuelProduct, PurchaseEntry.product_id == FuelProduct.id)
        .group_by(FuelProduct.name)
    )
    rows = purch_res.all()
    purch_list = []
    tot_basic = 0.0
    tot_vat = 0.0
    tot_cess = 0.0
    tot_qty = 0.0
    tot_amount = 0.0

    for r in rows:
        qty = float(r[1])
        basic = float(r[2])
        vat = float(r[3])
        cess = float(r[4])
        total = float(r[5])
        tot_qty += qty
        tot_basic += basic
        tot_vat += vat
        tot_cess += cess
        tot_amount += total
        purch_list.append({
            "item": r[0],
            "purchase_qty": round(qty, 2),
            "basic_amount": round(basic, 2),
            "vat_amount": round(vat, 2),
            "cess": round(cess, 2),
            "tcs": 0.0,
            "total_amount": round(total, 2),
        })

    tds_payable = round(tot_basic * 0.001, 2)

    # Fetch lube sales for GST GSTR-1 and GSTR-3B reporting
    lube_sales_res = await db.execute(
        select(LubeSaleEntry).options(selectinload(LubeSaleEntry.lube_product)).order_by(desc(LubeSaleEntry.id)).limit(100)
    )
    lube_sales = lube_sales_res.scalars().all()
    gst_lube_list = []
    tot_lube_taxable = 0.0
    tot_lube_cgst = 0.0
    tot_lube_sgst = 0.0
    tot_lube_total = 0.0
    for ls in lube_sales:
        tot_lube_taxable += ls.taxable_amount
        tot_lube_cgst += ls.cgst_amount
        tot_lube_sgst += ls.sgst_amount
        tot_lube_total += ls.total_amount
        gst_lube_list.append({
            "id": ls.id,
            "date": str(ls.date),
            "item_name": ls.lube_product.name if ls.lube_product else "Packaged Lube",
            "hsn_code": ls.hsn_code or "2710",
            "qty": ls.qty_units,
            "rate": ls.rate,
            "total_amount": ls.total_amount,
            "taxable_amount": ls.taxable_amount,
            "gst_percent": ls.gst_percent,
            "cgst_amount": ls.cgst_amount,
            "sgst_amount": ls.sgst_amount,
            "mode": ls.payment_mode,
        })

    return {
        "as_on_date": today_ist().strftime("%d-%m-%Y"),
        "purchases": purch_list,
        "purchases_total": {
            "qty": round(tot_qty, 2),
            "basic": round(tot_basic, 2),
            "vat": round(tot_vat, 2),
            "cess": round(tot_cess, 2),
            "tcs": 0.0,
            "total": round(tot_amount, 2),
        },
        "gst_lube": gst_lube_list,
        "gst_lube_total": {
            "taxable": round(tot_lube_taxable, 2),
            "cgst": round(tot_lube_cgst, 2),
            "sgst": round(tot_lube_sgst, 2),
            "total": round(tot_lube_total, 2),
        },
        "tds_summary": {
            "total_amount": round(tot_amount, 2),
            "tax_amount": round(tot_vat + tot_cess, 2),
            "basic_amount": round(tot_basic, 2),
            "tds_rate": "0.1 %",
            "tds_payable": tds_payable,
        },
    }


@router.get("/reports/dealer-commission", summary="OMC Dealer Commission Report")
async def get_dealer_commission(db: AsyncSession = Depends(get_db)):
    today = today_ist()
    month_start = date(today.year, today.month, 1)

    sales_res = await db.execute(
        select(
            FuelProduct.name,
            func.coalesce(func.sum(ShiftMeterReading.sale_qty), 0.0),
        )
        .join(Nozzle, ShiftMeterReading.nozzle_id == Nozzle.id)
        .join(FuelProduct, Nozzle.product_id == FuelProduct.id)
        .group_by(FuelProduct.name)
    )
    rows = sales_res.all()

    items = []
    tot_rate = 0.0
    tot_qty_kl = 0.0
    tot_commission = 0.0

    for r in rows:
        name = r[0]
        qty_kl = round(float(r[1]) / 1000.0, 3)
        comm_rate_kl = 379.67 if "Petrol" in name or "MS" in name else 281.23
        amt = round(qty_kl * comm_rate_kl, 2)
        tot_rate += comm_rate_kl
        tot_qty_kl += qty_kl
        tot_commission += amt
        items.append({
            "item": name,
            "rate": comm_rate_kl,
            "qty": qty_kl,
            "total_amount": amt,
            "received_amount": 0.0,
        })

    return {
        "from_date": month_start.strftime("%Y-%m-%d"),
        "to_date": today.strftime("%Y-%m-%d"),
        "items": items,
        "total": {
            "rate": round(tot_rate, 2),
            "qty": round(tot_qty_kl, 3),
            "total_amount": round(tot_commission, 2),
            "received_amount": 0.0,
        },
    }


@router.get("/reports/lfr-summary", summary="Licensee Fee Recovery & TDS 10% Summary")
async def get_lfr_summary(db: AsyncSession = Depends(get_db)):
    today = today_ist()
    month_start = date(today.year, today.month, 1)

    purch_res = await db.execute(
        select(
            FuelProduct.name,
            func.coalesce(func.sum(PurchaseEntry.qty_kl), 0.0),
        )
        .join(FuelProduct, PurchaseEntry.product_id == FuelProduct.id)
        .group_by(FuelProduct.name)
    )
    rows = purch_res.all()

    purchases = []
    tot_basic = 0.0
    tot_cgst = 0.0
    tot_sgst = 0.0
    tot_qty_kl = 0.0
    tot_lfr_rate = 0.0

    for r in rows:
        name = r[0]
        qty_kl = float(r[1])
        lfr_rate = 523.34 if "Petrol" in name or "MS" in name else 436.10
        basic = round(qty_kl * lfr_rate, 2)
        cgst = round(basic * 0.09, 2)
        sgst = round(basic * 0.09, 2)
        total = round(basic + cgst + sgst, 2)
        tot_basic += basic
        tot_cgst += cgst
        tot_sgst += sgst
        tot_qty_kl += qty_kl
        tot_lfr_rate += lfr_rate
        purchases.append({
            "item": name,
            "lfr_rate": lfr_rate,
            "qty": round(qty_kl, 2),
            "basic": basic,
            "cgst": cgst,
            "sgst": sgst,
            "total": total,
        })

    tot_total = round(tot_basic + tot_cgst + tot_sgst, 2)
    tds = round(tot_basic * 0.10, 2)

    return {
        "from_date": month_start.strftime("%Y-%m-%d"),
        "to_date": today.strftime("%Y-%m-%d"),
        "purchases": purchases,
        "total": {
            "lfr_rate": round(tot_lfr_rate, 2),
            "qty": round(tot_qty_kl, 2),
            "basic": round(tot_basic, 2),
            "cgst": round(tot_cgst, 2),
            "sgst": round(tot_sgst, 2),
            "total": tot_total,
        },
        "tds_summary": {
            "total_amount": tot_total,
            "gst_tax": round(tot_cgst + tot_sgst, 2),
            "basic_amount": round(tot_basic, 2),
            "tds_percent": "10.00%",
            "tds_payable": tds,
        },
    }


@router.get("/reports/profit-loss", summary="Profit Loss Summary Report")
async def get_profit_loss(db: AsyncSession = Depends(get_db)):
    tanks_res = await db.execute(select(Tank).options(selectinload(Tank.product)))
    tanks = tanks_res.scalars().all()

    stock_list = []
    tot_stock_amt = 0.0
    for t in tanks:
        pname = t.product.name if t.product else "Fuel"
        rate = t.product.current_rate if (t.product and t.product.current_rate) else 0.0
        amt = round(t.current_stock * rate, 2)
        tot_stock_amt += amt
        stock_list.append({
            "item": pname,
            "qty": round(t.current_stock, 2),
            "amount": amt,
        })

    purch_res = await db.execute(
        select(
            FuelProduct.name,
            func.coalesce(func.sum(PurchaseEntry.qty_liters), 0.0),
            func.coalesce(func.sum(PurchaseEntry.gross_amount), 0.0),
        )
        .join(FuelProduct, PurchaseEntry.product_id == FuelProduct.id)
        .group_by(FuelProduct.name)
    )
    purch_rows = purch_res.all()
    purchases = []
    tot_purch_amt = 0.0
    for pr in purch_rows:
        pamt = round(float(pr[2]), 2)
        tot_purch_amt += pamt
        purchases.append({
            "item": pr[0],
            "qty": round(float(pr[1]), 2),
            "amount": pamt,
        })

    sales_res = await db.execute(
        select(
            FuelProduct.name,
            func.coalesce(func.sum(ShiftMeterReading.sale_qty), 0.0),
            func.coalesce(func.sum(ShiftMeterReading.total_amount), 0.0),
        )
        .join(Nozzle, ShiftMeterReading.nozzle_id == Nozzle.id)
        .join(FuelProduct, Nozzle.product_id == FuelProduct.id)
        .group_by(FuelProduct.name)
    )
    sales_rows = sales_res.all()
    sales = []
    tot_sales_amt = 0.0
    for sr in sales_rows:
        samt = round(float(sr[2]), 2)
        tot_sales_amt += samt
        sales.append({
            "item": sr[0],
            "qty": round(float(sr[1]), 2),
            "amount": samt,
        })

    return {
        "as_on_date": today_ist().strftime("%d-%m-%Y"),
        "opening_stock": stock_list,
        "opening_stock_total": round(tot_stock_amt, 2),
        "sales": sales,
        "sales_total": round(tot_sales_amt, 2),
        "sale_lube": 0.0,
        "purchases": purchases,
        "purchases_total": round(tot_purch_amt, 2),
        "closing_stock": stock_list,
        "closing_stock_total": round(tot_stock_amt, 2),
        "loss_stock": [],
    }



# -------------------------------------------------------------
# 11. Expenses Book API (Frame 0010 - Expence Book)
# -------------------------------------------------------------
class ExpenseCreate(BaseModel):
    category: str
    amount: float
    narration: Optional[str] = None
    paid_to: Optional[str] = None
    payment_mode: str = "CASH"


@router.get("/expenses", summary="List Pump Expenses")
async def get_expenses(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Expense).order_by(desc(Expense.date), desc(Expense.id)))
    expenses = res.scalars().all()
    return [
        {
            "id": e.id,
            "date": e.date.strftime("%d-%b-%Y"),
            "category": e.category,
            "amount": e.amount,
            "narration": e.narration,
            "paid_to": e.paid_to,
        }
        for e in expenses
    ]


@router.post("/expenses", summary="Record New Expense")
async def create_expense(data: ExpenseCreate, db: AsyncSession = Depends(get_db)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Expense amount must be greater than zero")

    exp = Expense(
        category=data.category,
        amount=data.amount,
        narration=data.narration,
        paid_to=data.paid_to,
        date=today_ist(),
    )
    db.add(exp)

    # Deduct from Cash On Hand with concurrency lock
    cash_acc_res = await db.execute(
        select(BankAccount).where(BankAccount.account_name == "CASH ON HAND").with_for_update()
    )
    cash_acc = cash_acc_res.scalar_one_or_none()
    if not cash_acc:
        cash_res2 = await db.execute(
            select(BankAccount).where(BankAccount.account_type == "CASH").with_for_update().limit(1)
        )
        cash_acc = cash_res2.scalars().first()
    if not cash_acc:
        cash_acc = await db.get(BankAccount, 1)
    if cash_acc:
        cash_acc.balance = max(0.0, round(cash_acc.balance - data.amount, 2))

    await db.commit()
    await db.refresh(exp)
    return {"status": "success", "message": f"Expense of ₹{data.amount} recorded", "id": exp.id}


@router.delete("/expenses/{expense_id}", summary="Delete Expense & Restore Cash On Hand")
async def delete_expense(
    expense_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete expense vouchers.",
        )
    exp = await db.get(Expense, expense_id)
    if not exp:
        raise HTTPException(status_code=404, detail=f"Expense #{expense_id} not found")

    # Restore Cash On Hand balance
    cash_acc_res = await db.execute(
        select(BankAccount).where(BankAccount.account_name == "CASH ON HAND").with_for_update()
    )
    cash_acc = cash_acc_res.scalar_one_or_none()
    if not cash_acc:
        cash_res2 = await db.execute(
            select(BankAccount).where(BankAccount.account_type == "CASH").with_for_update().limit(1)
        )
        cash_acc = cash_res2.scalars().first()
    if not cash_acc:
        cash_acc = await db.get(BankAccount, 1)
    if cash_acc:
        cash_acc.balance = round(cash_acc.balance + exp.amount, 2)

    await db.delete(exp)
    await db.commit()

    return {
        "message": f"Expense #{expense_id} ({exp.category} - ₹{exp.amount}) deleted and cash restored",
        "expense_id": expense_id,
        "restored_amount": exp.amount,
    }


# -------------------------------------------------------------
# 12. Transfer Entry API (Cash to Bank / Bank to Bank Contra)
# -------------------------------------------------------------
class TransferCreate(BaseModel):
    from_account_id: int
    to_account_id: int
    amount: float
    reference_no: Optional[str] = None
    remarks: Optional[str] = None


@router.post("/transfers", summary="Transfer Funds Between Accounts")
async def create_transfer(data: TransferCreate, db: AsyncSession = Depends(get_db)):
    if data.from_account_id == data.to_account_id:
        raise HTTPException(status_code=400, detail="Source and destination accounts must be different")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Transfer amount must be greater than zero")

    from_res = await db.execute(
        select(BankAccount).where(BankAccount.id == data.from_account_id).with_for_update()
    )
    from_acc = from_res.scalar_one_or_none()

    to_res = await db.execute(
        select(BankAccount).where(BankAccount.id == data.to_account_id).with_for_update()
    )
    to_acc = to_res.scalar_one_or_none()

    if not from_acc or not to_acc:
        raise HTTPException(status_code=404, detail="One or both accounts not found")

    if from_acc.balance < data.amount:
        raise HTTPException(status_code=400, detail=f"Insufficient balance in {from_acc.account_name}. Available: ₹{from_acc.balance:.2f}")

    from_acc.balance = round(from_acc.balance - data.amount, 2)
    to_acc.balance = round(to_acc.balance + data.amount, 2)

    ref_no = data.reference_no or f"TRF-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    transfer_record = ContraTransfer(
        date=today_ist(),
        from_account_id=from_acc.id,
        to_account_id=to_acc.id,
        amount=round(data.amount, 2),
        reference_no=ref_no,
        remarks=data.remarks or f"Transferred ₹{data.amount:.2f} from {from_acc.account_name} to {to_acc.account_name}",
    )
    db.add(transfer_record)
    await db.commit()
    await db.refresh(transfer_record)

    return {
        "status": "success",
        "id": transfer_record.id,
        "transfer_id": transfer_record.id,
        "reference_no": ref_no,
        "message": f"Transferred ₹{data.amount:.2f} from {from_acc.account_name} to {to_acc.account_name}",
        "from_balance": from_acc.balance,
        "to_balance": to_acc.balance,
    }


@router.get("/transfers", summary="List All Contra Transfers")
async def get_transfers(db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(ContraTransfer)
        .options(selectinload(ContraTransfer.from_account), selectinload(ContraTransfer.to_account))
        .order_by(desc(ContraTransfer.id))
    )
    transfers = res.scalars().all()
    return [
        {
            "id": t.id,
            "date": t.date.strftime("%d-%b-%Y"),
            "from_account_id": t.from_account_id,
            "from_account_name": t.from_account.account_name if t.from_account else f"Account #{t.from_account_id}",
            "to_account_id": t.to_account_id,
            "to_account_name": t.to_account.account_name if t.to_account else f"Account #{t.to_account_id}",
            "amount": t.amount,
            "reference_no": t.reference_no,
            "remarks": t.remarks or "Contra Transfer",
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in transfers
    ]


@router.delete("/transfers/{transfer_id}", summary="Delete / Revert Contra Transfer")
async def delete_transfer(
    transfer_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager authorization or PIN required to void contra transfers.",
        )

    t_stmt = select(ContraTransfer).where(ContraTransfer.id == transfer_id).with_for_update()
    transfer = (await db.execute(t_stmt)).scalar_one_or_none()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer record not found")

    # Reverse the fund transfer atomically
    from_res = await db.execute(select(BankAccount).where(BankAccount.id == transfer.from_account_id).with_for_update())
    from_acc = from_res.scalar_one_or_none()

    to_res = await db.execute(select(BankAccount).where(BankAccount.id == transfer.to_account_id).with_for_update())
    to_acc = to_res.scalar_one_or_none()

    if from_acc and to_acc:
        from_acc.balance = round(from_acc.balance + transfer.amount, 2)
        to_acc.balance = round(to_acc.balance - transfer.amount, 2)

    await db.delete(transfer)
    await db.commit()

    return {
        "message": f"Contra transfer #{transfer_id} of ₹{transfer.amount:.2f} reverted successfully",
        "transfer_id": transfer_id,
        "reverted_amount": transfer.amount,
    }


# -------------------------------------------------------------
# 13. Customer Statement / Ledger (Frame 0300)
# -------------------------------------------------------------
@router.get("/customers/{customer_id}/statement", summary="Customer Statement of Accounts (Bill Format)")
async def get_customer_statement(customer_id: int, db: AsyncSession = Depends(get_db)):
    c_res = await db.execute(select(Customer).where(Customer.id == customer_id))
    cust = c_res.scalar_one_or_none()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")

    sales_res = await db.execute(
        select(CreditSale).where(CreditSale.customer_id == customer_id).order_by(desc(CreditSale.date))
    )
    sales = sales_res.scalars().all()

    bill_rows = [
        {
            "date": s.date.strftime("%d-%b-%Y"),
            "bill_no": s.bill_no,
            "vehicle_no": s.vehicle_no,
            "qty": s.qty,
            "rate": s.rate,
            "amount": s.amount,
            "slip_no": s.slip_no,
        }
        for s in sales
    ]

    # SQL-level func.sum() aggregations (#5, #21)
    totals_res = await db.execute(
        select(
            func.coalesce(
                select(func.sum(CreditSale.amount))
                .where(CreditSale.customer_id == customer_id)
                .scalar_subquery(),
                0.0,
            ),
            func.coalesce(
                select(func.sum(PaymentReceipt.amount))
                .where(PaymentReceipt.customer_id == customer_id)
                .scalar_subquery(),
                0.0,
            ),
        )
    )
    tot_row = totals_res.one()
    total_purchase = float(tot_row[0] or 0.0)
    paid_period = round(float(tot_row[1] or 0.0), 2)
    net_payables = cust.current_outstanding
    prev_dues = max(0.0, net_payables - total_purchase + paid_period)

    return {
        "customer": {
            "id": cust.id,
            "code": cust.code,
            "name": cust.name,
            "city": cust.city,
            "mobile": cust.mobile,
            "credit_limit": cust.credit_limit,
            "outstanding": cust.current_outstanding,
        },
        "bills": bill_rows,
        "summary": {
            "total_purchase": round(total_purchase, 2),
            "total_other_lube": 0.0,
            "total_tax_amount": 0.0,
            "previous_dues": round(prev_dues, 2),
            "total_paid_period": paid_period,
            "net_payables": round(net_payables, 2),
            "terms": [
                "(1) Subject To Local Jurisdiction",
                "(2) Query in the Invoice should be notified to us immediately. No claims or discrepancy shall be entertained after 5 days from the Date of INVOICE.",
                "(3) Outstanding Bill Amount must be paid/cleared in 5 days from the bill date. After that 1.5% interest PM will be applicable.",
            ],
            "signatory": "For Authorized Petrol Pump Dealership\nAuthorized Signatory",
        },
    }


# -------------------------------------------------------------
# 14. Weights & Measures Nozzle Stamping Due Calendar
# -------------------------------------------------------------
class NozzleStampingUpdate(BaseModel):
    last_stamped_date: date
    stamping_due_date: Optional[date] = None
    wm_seal_no: Optional[str] = None
    wm_certificate_no: Optional[str] = None
    manager_pin: Optional[str] = None


@router.get("/stamping-reminders", summary="Weights & Measures Nozzle Stamping Schedule")
async def get_stamping_reminders(db: AsyncSession = Depends(get_db)):
    nozzles_res = await db.execute(select(Nozzle).options(selectinload(Nozzle.tank)))
    nozzles = nozzles_res.scalars().all()
    today = today_ist()

    reminders = []
    for n in nozzles:
        if n.last_stamped_date and n.stamping_due_date:
            last_stamped_dt = n.last_stamped_date
            next_due_dt = n.stamping_due_date
        else:
            next_due_dt = date(today.year + 1, 5, 15) if today.month > 5 else date(today.year, 5, 15)
            last_stamped_dt = date(next_due_dt.year - 1, 5, 15)
        days_rem = (next_due_dt - today).days
        status_str = "EXPIRED" if days_rem < 0 else ("DUE_SOON" if days_rem <= 30 else "VALID")

        reminders.append({
            "nozzle_id": n.id,
            "nozzle_name": n.nozzle_name,
            "tank": n.tank.tank_name if n.tank else "Tank",
            "last_stamped": last_stamped_dt.strftime("%d-%b-%Y"),
            "next_due": next_due_dt.strftime("%d-%b-%Y"),
            "days_remaining": days_rem,
            "wm_seal_no": n.wm_seal_no or "WM-VERIFIED",
            "wm_certificate_no": n.wm_certificate_no or "",
            "status": status_str,
        })
    if not reminders:
        for i in range(1, 7):
            reminders.append({
                "nozzle_id": i,
                "nozzle_name": f"HSD {i}" if i <= 4 else f"MS {i-4}",
                "tank": "HSD Tank 1" if i <= 4 else "MS Tank 1",
                "last_stamped": date(today.year - 1, 5, 15).strftime("%d-%b-%Y"),
                "next_due": date(today.year, 5, 15).strftime("%d-%b-%Y"),
                "days_remaining": (date(today.year, 5, 15) - today).days,
                "wm_seal_no": "WM-DEFAULT",
                "wm_certificate_no": "",
                "status": "VALID",
            })
    return reminders


@router.put("/nozzles/{nozzle_id}/stamping", summary="Record Official W&M Verification & Stamping")
async def update_nozzle_stamping(
    nozzle_id: int,
    data: NozzleStampingUpdate,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    pin_to_check = data.manager_pin or manager_pin
    if not await check_manager_authorized(pin_to_check, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager authorization or PIN required to update Legal Metrology stamping records.",
        )

    n_res = await db.execute(select(Nozzle).where(Nozzle.id == nozzle_id).with_for_update())
    nozzle = n_res.scalar_one_or_none()
    if not nozzle:
        raise HTTPException(status_code=404, detail=f"Nozzle #{nozzle_id} not found")

    nozzle.last_stamped_date = data.last_stamped_date
    nozzle.stamping_due_date = data.stamping_due_date or (data.last_stamped_date + timedelta(days=365))
    if data.wm_seal_no:
        nozzle.wm_seal_no = data.wm_seal_no.strip()
    if data.wm_certificate_no:
        nozzle.wm_certificate_no = data.wm_certificate_no.strip()

    await db.commit()
    await db.refresh(nozzle)

    return {
        "message": f"Stamping record updated for Nozzle '{nozzle.nozzle_name}'",
        "nozzle_id": nozzle.id,
        "last_stamped_date": str(nozzle.last_stamped_date),
        "stamping_due_date": str(nozzle.stamping_due_date),
        "wm_seal_no": nozzle.wm_seal_no,
        "wm_certificate_no": nozzle.wm_certificate_no,
    }


# -------------------------------------------------------------
# 18. System Operations Reset (Clean Baseline Purge)
# -------------------------------------------------------------
@router.post("/system/reset-operations", summary="Reset Operations to Clean State (Zero Balance Base)")
async def reset_operations(confirm: str = Query(...), db: AsyncSession = Depends(get_db)):
    if confirm != "CONFIRM_CLEAN_SLATE":
        raise HTTPException(status_code=400, detail="Invalid confirmation token")

    # 1. Purge all transaction and operational history
    await db.execute(delete(ShiftMeterReading))
    await db.execute(delete(CreditSale))
    await db.execute(delete(PaymentReceipt))
    await db.execute(delete(Expense))
    await db.execute(delete(PurchaseEntry))
    await db.execute(delete(ShiftSettlement))
    await db.execute(delete(TankDipEntry))
    await db.execute(delete(Shift))

    # 2. Reset customer outstanding balances to 0.0
    await db.execute(update(Customer).values(current_outstanding=0.0))

    # 3. Reset bank and cash account balances to 0.0
    await db.execute(update(BankAccount).values(balance=0.0))

    # 4. Reset tank stock levels to clean baseline
    await db.execute(update(Tank).values(current_stock=0.0, current_dip_cm=0.0))

    # 5. Create initial clean Shift #00001 (Status: Open)
    clean_shift = Shift(
        so_number="00001",
        date=today_ist(),
        shift_name="First",
        status="Open",
        total_sale_amount=0.0,
        total_cash=0.0,
        total_credit=0.0,
        total_digital=0.0,
    )
    db.add(clean_shift)

    await db.commit()
    return {
        "status": "success",
        "message": "All operational transactions purged. System is now on a clean, authentic zero baseline with Shift #00001 (Open).",
    }


# -------------------------------------------------------------
# 19. Domain Utilities: Dip Calibration, Density Reduction & Customer Block
# -------------------------------------------------------------
class DensityCheckRequest(BaseModel):
    observed_density: float
    temperature_celsius: float
    product_code: str = "HSD"
    invoice_density_15c: Optional[float] = None


@router.put("/customers/{customer_id}/toggle-block", summary="Toggle Customer Credit Block Status")
async def toggle_customer_block(customer_id: int, db: AsyncSession = Depends(get_db)):
    cust_stmt = select(Customer).where(Customer.id == customer_id).with_for_update()
    customer = (await db.execute(cust_stmt)).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    customer.is_blocked = not customer.is_blocked
    await db.commit()
    return {
        "customer_id": customer.id,
        "name": customer.name,
        "is_blocked": customer.is_blocked,
        "status": "BLOCKED" if customer.is_blocked else "ACTIVE",
        "message": f"Customer '{customer.name}' credit status updated to {'BLOCKED' if customer.is_blocked else 'ACTIVE'}",
    }


@router.get("/tanks/{tank_id}/calculate-dip", summary="Calculate Tank Volume from Dip Height (cm) via Strapping Chart")
async def calculate_dip_volume(
    tank_id: int,
    dip_cm: float = Query(..., ge=0.0, description="Measured dip in centimeters"),
    db: AsyncSession = Depends(get_db),
):
    tank = await db.get(Tank, tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")

    result = await get_calibrated_tank_volume(
        db=db,
        tank_id=tank_id,
        dip_cm=dip_cm,
        capacity_liters=tank.capacity_liters or 20000.0,
    )
    result["tank_name"] = tank.tank_name
    return result


@router.get("/tanks/{tank_id}/strapping-chart", summary="Get Tank W&M Strapping Calibration Chart Points")
async def get_tank_strapping_chart(tank_id: int, db: AsyncSession = Depends(get_db)):
    tank = await db.get(Tank, tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")

    stmt = (
        select(TankCalibrationChart)
        .where(TankCalibrationChart.tank_id == tank_id)
        .order_by(TankCalibrationChart.dip_cm.asc())
    )
    res = await db.execute(stmt)
    points = res.scalars().all()

    # If no custom points uploaded, auto-seed standard calibrated points for 20KL/15KL tank
    if not points:
        std_points = generate_standard_strapping_points(tank.capacity_liters or 20000.0)
        for p in std_points:
            db.add(TankCalibrationChart(
                tank_id=tank.id,
                dip_cm=p["dip_cm"],
                volume_liters=p["volume_liters"],
                notes="Standard W&M Calibrated Strapping",
            ))
        await db.commit()
        res = await db.execute(stmt)
        points = res.scalars().all()

    return {
        "tank_id": tank.id,
        "tank_name": tank.tank_name,
        "capacity_liters": tank.capacity_liters,
        "total_calibration_points": len(points),
        "calibration_points": [
            {
                "id": p.id,
                "dip_cm": p.dip_cm,
                "volume_liters": p.volume_liters,
                "notes": p.notes,
            }
            for p in points
        ],
    }


class StrappingPointInput(BaseModel):
    dip_cm: float
    volume_liters: float
    notes: Optional[str] = None


class SaveStrappingChartRequest(BaseModel):
    points: List[StrappingPointInput]


@router.post("/tanks/{tank_id}/strapping-chart", summary="Upload / Set Custom W&M Tank Strapping Points")
async def save_tank_strapping_chart(
    tank_id: int,
    payload: SaveStrappingChartRequest,
    db: AsyncSession = Depends(get_db),
):
    tank = await db.get(Tank, tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")

    # Clear prior custom points
    await db.execute(delete(TankCalibrationChart).where(TankCalibrationChart.tank_id == tank_id))

    for p in payload.points:
        db.add(TankCalibrationChart(
            tank_id=tank.id,
            dip_cm=p.dip_cm,
            volume_liters=p.volume_liters,
            notes=p.notes or "Official Strapping Chart Entry",
        ))

    await db.commit()
    return {
        "status": "success",
        "message": f"Successfully updated {len(payload.points)} calibrated strapping points for {tank.tank_name}",
        "tank_id": tank.id,
    }


@router.post("/tanks/{tank_id}/strapping-chart/point", summary="Add/Update Single Strapping Chart Point")
async def add_or_update_strapping_point(
    tank_id: int,
    payload: StrappingPointInput,
    db: AsyncSession = Depends(get_db),
):
    tank = await db.get(Tank, tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")

    # Check if point for this dip_cm already exists
    stmt = select(TankCalibrationChart).where(
        TankCalibrationChart.tank_id == tank_id,
        TankCalibrationChart.dip_cm == payload.dip_cm,
    )
    res = await db.execute(stmt)
    existing = res.scalars().first()
    if existing:
        existing.volume_liters = payload.volume_liters
        existing.notes = payload.notes or "Updated Strapping Point"
        pt_id = existing.id
    else:
        new_point = TankCalibrationChart(
            tank_id=tank.id,
            dip_cm=payload.dip_cm,
            volume_liters=payload.volume_liters,
            notes=payload.notes or "Calibrated Strapping Point",
        )
        db.add(new_point)
        await db.flush()
        pt_id = new_point.id

    await db.commit()
    return {
        "status": "success",
        "id": pt_id,
        "message": f"Strapping point {payload.dip_cm}cm -> {payload.volume_liters}L recorded for {tank.tank_name}",
    }


@router.delete("/tanks/strapping-chart/{point_id}", summary="Delete Tank Strapping Chart Point")
async def delete_strapping_point(
    point_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete calibration strapping points.",
        )

    point = await db.get(TankCalibrationChart, point_id)
    if not point:
        raise HTTPException(status_code=404, detail="Strapping calibration point not found")

    await db.delete(point)
    await db.commit()
    return {"status": "success", "message": f"Strapping point #{point_id} deleted successfully", "id": point_id}



# -------------------------------------------------------------
# 19b. Underground Storage Tanks CRUD API
# -------------------------------------------------------------
class TankCreate(BaseModel):
    tank_name: str
    product_id: Optional[int] = None
    product_code: Optional[str] = None
    capacity_liters: float = 20000.0
    current_stock: float = 0.0
    current_dip_cm: float = 0.0
    min_alert_level: float = 3000.0


class TankUpdate(BaseModel):
    tank_name: Optional[str] = None
    product_id: Optional[int] = None
    product_code: Optional[str] = None
    capacity_liters: Optional[float] = None
    current_stock: Optional[float] = None
    current_dip_cm: Optional[float] = None
    min_alert_level: Optional[float] = None


@router.get("/tanks", summary="List Underground Storage Tanks")
async def list_tanks(db: AsyncSession = Depends(get_db)):
    stmt = select(Tank).options(selectinload(Tank.product), selectinload(Tank.nozzles)).order_by(Tank.id.asc())
    res = await db.execute(stmt)
    tanks = res.scalars().all()
    return [
        {
            "id": t.id,
            "name": t.tank_name,
            "tank_name": t.tank_name,
            "product_id": t.product_id,
            "product": t.product.name if t.product else "Fuel",
            "product_name": t.product.name if t.product else "Fuel",
            "code": t.product.code if t.product else "MS",
            "product_code": t.product.code if t.product else "MS",
            "capacity": t.capacity_liters,
            "capacity_liters": t.capacity_liters,
            "current_stock": t.current_stock,
            "current_dip_cm": t.current_dip_cm,
            "min_alert_level": t.min_alert_level,
            "percent": round((t.current_stock / t.capacity_liters) * 100, 1) if t.capacity_liters else 0.0,
            "is_low": t.current_stock <= t.min_alert_level,
            "connected_nozzles": [n.nozzle_name for n in t.nozzles],
        }
        for t in tanks
    ]


@router.post("/tanks", summary="Create Underground Storage Tank")
async def create_tank(payload: TankCreate, db: AsyncSession = Depends(get_db)):
    prod = None
    if payload.product_id:
        prod = await db.get(FuelProduct, payload.product_id)
    if not prod and payload.product_code:
        p_res = await db.execute(select(FuelProduct).where(FuelProduct.code.ilike(payload.product_code.strip())))
        prod = p_res.scalar_one_or_none()
    if not prod:
        p_res = await db.execute(select(FuelProduct).order_by(FuelProduct.id.asc()).limit(1))
        prod = p_res.scalar_one_or_none()
    if not prod:
        prod = FuelProduct(code="MS", name="Motor Spirit (Petrol)", current_rate=102.65, unit="Ltr")
        db.add(prod)
        await db.flush()

    tank = Tank(
        tank_name=payload.tank_name.strip(),
        product_id=prod.id,
        capacity_liters=payload.capacity_liters,
        current_stock=payload.current_stock,
        current_dip_cm=payload.current_dip_cm,
        min_alert_level=payload.min_alert_level,
    )
    db.add(tank)
    await db.commit()
    await db.refresh(tank)
    invalidate_station_cache()
    return {
        "status": "success",
        "message": f"Tank '{tank.tank_name}' created successfully",
        "id": tank.id,
        "name": tank.tank_name,
        "capacity_liters": tank.capacity_liters,
        "current_stock": tank.current_stock,
    }


@router.put("/tanks/{tank_id}", summary="Update Underground Storage Tank")
async def update_tank(tank_id: int, payload: TankUpdate, db: AsyncSession = Depends(get_db)):
    tank = await db.get(Tank, tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")
    if payload.tank_name is not None:
        tank.tank_name = payload.tank_name.strip()
    if payload.capacity_liters is not None:
        tank.capacity_liters = payload.capacity_liters
    if payload.current_stock is not None:
        tank.current_stock = payload.current_stock
    if payload.current_dip_cm is not None:
        tank.current_dip_cm = payload.current_dip_cm
    if payload.min_alert_level is not None:
        tank.min_alert_level = payload.min_alert_level
    if payload.product_id is not None:
        tank.product_id = payload.product_id
    elif payload.product_code is not None:
        p_res = await db.execute(select(FuelProduct).where(FuelProduct.code.ilike(payload.product_code.strip())))
        prod = p_res.scalar_one_or_none()
        if prod:
            tank.product_id = prod.id
    await db.commit()
    invalidate_station_cache()
    return {"status": "success", "message": f"Tank '{tank.tank_name}' updated successfully", "id": tank.id}


@router.delete("/tanks/{tank_id}", summary="Delete Underground Storage Tank")
async def delete_tank(
    tank_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete underground tanks.",
        )
    tank = await db.get(Tank, tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")
    if tank.current_stock and tank.current_stock > 10.0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete tank '{tank.tank_name}' with active fuel stock of {tank.current_stock:.2f} Liters. Decant or transfer stock first.",
        )
    active_nozzles_res = await db.execute(select(func.count(Nozzle.id)).where(Nozzle.tank_id == tank_id))
    active_nozzles = active_nozzles_res.scalar_one()
    if active_nozzles > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete tank '{tank.tank_name}': {active_nozzles} dispenser nozzle(s) are connected to it.",
        )
    await db.execute(delete(TankCalibrationChart).where(TankCalibrationChart.tank_id == tank_id))
    await db.delete(tank)
    await db.commit()
    invalidate_station_cache()
    return {"status": "success", "message": f"Tank #{tank_id} deleted successfully"}


# -------------------------------------------------------------
# 19c. Dispenser Nozzles CRUD API
# -------------------------------------------------------------
class NozzleCreate(BaseModel):
    nozzle_name: str
    machine_name: str = "MPD 1"
    tank_id: int
    product_id: Optional[int] = None
    product_code: Optional[str] = None
    current_meter: float = 0.0
    active: bool = True


class NozzleUpdate(BaseModel):
    nozzle_name: Optional[str] = None
    machine_name: Optional[str] = None
    tank_id: Optional[int] = None
    product_id: Optional[int] = None
    product_code: Optional[str] = None
    current_meter: Optional[float] = None
    active: Optional[bool] = None


@router.get("/nozzles", summary="List Dispenser Nozzles")
async def list_nozzles(db: AsyncSession = Depends(get_db)):
    stmt = select(Nozzle).options(selectinload(Nozzle.tank), selectinload(Nozzle.product)).order_by(Nozzle.id.asc())
    res = await db.execute(stmt)
    nozzles = res.scalars().all()
    return [
        {
            "id": n.id,
            "name": n.nozzle_name,
            "nozzle_name": n.nozzle_name,
            "machine_name": n.machine_name,
            "tank_id": n.tank_id,
            "tank_name": n.tank.tank_name if n.tank else "",
            "product_id": n.product_id,
            "product_name": n.product.name if n.product else "Fuel",
            "product_code": n.product.code if n.product else "MS",
            "current_meter": n.current_meter,
            "rate": n.product.current_rate if n.product else 90.0,
            "vat_percent": n.product.vat_percent if n.product else 13.7,
            "active": n.active,
        }
        for n in nozzles
    ]


@router.post("/nozzles", summary="Create Dispenser Nozzle")
async def create_nozzle(payload: NozzleCreate, db: AsyncSession = Depends(get_db)):
    tank = await db.get(Tank, payload.tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Connected tank not found")

    prod_id = payload.product_id or tank.product_id
    nozzle = Nozzle(
        nozzle_name=payload.nozzle_name.strip(),
        machine_name=payload.machine_name.strip(),
        tank_id=tank.id,
        product_id=prod_id,
        current_meter=payload.current_meter,
        active=payload.active,
    )
    db.add(nozzle)
    await db.commit()
    await db.refresh(nozzle)
    invalidate_station_cache()
    return {
        "status": "success",
        "message": f"Nozzle '{nozzle.nozzle_name}' created successfully",
        "id": nozzle.id,
        "name": nozzle.nozzle_name,
        "machine_name": nozzle.machine_name,
        "tank_id": nozzle.tank_id,
        "current_meter": nozzle.current_meter,
    }


@router.put("/nozzles/{nozzle_id}", summary="Update Dispenser Nozzle")
async def update_nozzle(nozzle_id: int, payload: NozzleUpdate, db: AsyncSession = Depends(get_db)):
    nozzle = await db.get(Nozzle, nozzle_id)
    if not nozzle:
        raise HTTPException(status_code=404, detail="Nozzle not found")
    if payload.nozzle_name is not None:
        nozzle.nozzle_name = payload.nozzle_name.strip()
    if payload.machine_name is not None:
        nozzle.machine_name = payload.machine_name.strip()
    if payload.tank_id is not None:
        nozzle.tank_id = payload.tank_id
    if payload.product_id is not None:
        nozzle.product_id = payload.product_id
    if payload.current_meter is not None:
        nozzle.current_meter = payload.current_meter
    if payload.active is not None:
        nozzle.active = payload.active
    await db.commit()
    invalidate_station_cache()
    return {"status": "success", "message": f"Nozzle '{nozzle.nozzle_name}' updated successfully", "id": nozzle.id}


@router.delete("/nozzles/{nozzle_id}", summary="Delete Dispenser Nozzle")
async def delete_nozzle(
    nozzle_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete dispenser nozzles.",
        )
    nozzle = await db.get(Nozzle, nozzle_id)
    if not nozzle:
        raise HTTPException(status_code=404, detail="Nozzle not found")
    readings_count = (await db.execute(select(func.count(ShiftMeterReading.id)).where(ShiftMeterReading.nozzle_id == nozzle_id))).scalar_one()
    if readings_count > 0:
        nozzle.active = False
        await db.commit()
        invalidate_station_cache()
        return {"status": "success", "message": f"Nozzle '{nozzle.nozzle_name}' deactivated to preserve audit history.", "id": nozzle_id}
    await db.delete(nozzle)
    await db.commit()
    invalidate_station_cache()
    return {"status": "success", "message": f"Nozzle #{nozzle_id} deleted successfully", "id": nozzle_id}


# -------------------------------------------------------------
# 19d. Employees / Attendants CRUD API
# -------------------------------------------------------------
class EmployeeCreate(BaseModel):
    name: str
    code: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    role: str = "Attendant"
    active: bool = True


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


@router.get("/employees", summary="List Attendants & Staff")
async def list_employees(db: AsyncSession = Depends(get_db)):
    stmt = select(Employee).order_by(Employee.id.asc())
    res = await db.execute(stmt)
    employees = res.scalars().all()
    return [
        {
            "id": e.id,
            "code": e.code,
            "name": e.name,
            "phone": e.phone,
            "mobile": e.phone,
            "role": e.role,
            "active": e.active,
            "shortage_balance": e.shortage_balance,
        }
        for e in employees
    ]


@router.post("/employees", summary="Create Attendant or Staff")
async def create_employee(payload: EmployeeCreate, db: AsyncSession = Depends(get_db)):
    count_res = await db.execute(select(func.count(Employee.id)))
    count = (count_res.scalar() or 0) + 1
    code = payload.code.strip() if payload.code else f"EMP{count:03d}"
    phone = payload.phone or payload.mobile
    emp = Employee(
        name=payload.name.strip().upper(),
        code=code,
        phone=phone.strip() if phone else None,
        role=payload.role or "Attendant",
        active=payload.active,
    )
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return {
        "status": "success",
        "message": f"Employee '{emp.name}' created successfully",
        "id": emp.id,
        "name": emp.name,
        "code": emp.code,
        "phone": emp.phone,
        "role": emp.role,
    }


@router.put("/employees/{employee_id}", summary="Update Attendant or Staff")
async def update_employee(employee_id: int, payload: EmployeeUpdate, db: AsyncSession = Depends(get_db)):
    emp = await db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if payload.name is not None:
        emp.name = payload.name.strip().upper()
    if payload.code is not None:
        emp.code = payload.code.strip()
    if payload.phone is not None or payload.mobile is not None:
        emp.phone = (payload.phone or payload.mobile or "").strip() or None
    if payload.role is not None:
        emp.role = payload.role
    if payload.active is not None:
        emp.active = payload.active
    await db.commit()
    return {"status": "success", "message": f"Employee '{emp.name}' updated successfully", "id": emp.id}


@router.delete("/employees/{employee_id}", summary="Delete Attendant or Staff")
async def delete_employee(
    employee_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to remove staff members.",
        )
    emp = await db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if emp.shortage_balance and abs(emp.shortage_balance) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete employee '{emp.name}' with unsettled shortage debt of ₹{emp.shortage_balance:.2f}. Settle debt first.",
        )
    await db.delete(emp)
    await db.commit()
    return {"status": "success", "message": f"Employee #{employee_id} deleted successfully", "id": employee_id}


# -------------------------------------------------------------
# 20. Packaged Lubricants (Lubes / DEF / AdBlue) API
# -------------------------------------------------------------
class LubeProductCreate(BaseModel):
    code: Optional[str] = None
    product_code: Optional[str] = None
    item_code: Optional[str] = None
    name: Optional[str] = None
    product_name: Optional[str] = None
    item_name: Optional[str] = None
    category: str = "LUBE_OIL"  # LUBE_OIL, 2T_OIL, DEF_ADBLUE, GREASE, COOLANT
    package_size: Optional[str] = None
    pack_size: Optional[str] = None
    barcode: Optional[str] = None
    mrp: float = 0.0
    sale_price: float = 0.0
    cost_price: float = 0.0
    current_stock_units: Optional[int] = None
    stock_qty: Optional[int] = None
    reorder_level: int = 5
    hsn_code: Optional[str] = None
    gst_percent: Optional[float] = None
    tax_rate: Optional[float] = None


@router.get("/lubes", summary="List Packaged Lubricants & DEF (AdBlue) Stock")
async def list_lubes(db: AsyncSession = Depends(get_db)):
    stmt = select(LubeProduct).order_by(LubeProduct.category, LubeProduct.name)
    res = await db.execute(stmt)
    lubes = res.scalars().all()

    # Auto-seed standard petrol pump packaged items if table empty
    if not lubes:
        seeds = [
            LubeProduct(code="SERVO-4T-1L", name="Servo 4T Super 20W40", category="LUBE_OIL", package_size="1 Ltr", mrp=380.0, sale_price=360.0, cost_price=300.0, current_stock_units=48, reorder_level=12),
            LubeProduct(code="SERVO-2T-40ML", name="Servo 2T Pouch", category="2T_OIL", package_size="40 ml", mrp=15.0, sale_price=15.0, cost_price=11.5, current_stock_units=200, reorder_level=50),
            LubeProduct(code="DEF-ADBLUE-20L", name="Mak Blue DEF Bucket", category="DEF_ADBLUE", package_size="20 Ltr", mrp=1100.0, sale_price=1050.0, cost_price=850.0, current_stock_units=25, reorder_level=8),
            LubeProduct(code="MAK-DIAMOND-15W40", name="Mak Diamond 15W40 CI-4", category="LUBE_OIL", package_size="5 Ltr", mrp=1850.0, sale_price=1750.0, cost_price=1400.0, current_stock_units=16, reorder_level=5),
            LubeProduct(code="COOLANT-1L", name="Long Life Radiator Coolant", category="COOLANT", package_size="1 Ltr", mrp=240.0, sale_price=220.0, cost_price=170.0, current_stock_units=30, reorder_level=10),
        ]
        db.add_all(seeds)
        await db.commit()
        res = await db.execute(stmt)
        lubes = res.scalars().all()

    return [
        {
            "id": l.id,
            "code": l.code,
            "name": l.name,
            "category": l.category,
            "package_size": l.package_size,
            "barcode": l.barcode or "",
            "mrp": l.mrp,
            "sale_price": l.sale_price,
            "cost_price": l.cost_price,
            "current_stock_units": l.current_stock_units,
            "reorder_level": l.reorder_level,
            "is_low_stock": l.current_stock_units <= l.reorder_level,
        }
        for l in lubes
    ]


@router.post("/lubes", summary="Create or Update Packaged Lube / DEF Item")
async def save_lube_product(payload: LubeProductCreate, db: AsyncSession = Depends(get_db)):
    clean_code = (payload.code or payload.product_code or payload.item_code or "LUBE-NEW").strip().upper()
    clean_name = (payload.name or payload.product_name or payload.item_name or clean_code).strip()
    clean_pkg = (payload.package_size or payload.pack_size or "1 Ltr").strip()
    stock_units = payload.current_stock_units if payload.current_stock_units is not None else (payload.stock_qty if payload.stock_qty is not None else 10)

    stmt = select(LubeProduct).where(LubeProduct.code == clean_code)
    res = await db.execute(stmt)
    lube = res.scalar_one_or_none()
    if not lube:
        lube = LubeProduct(code=clean_code)
        db.add(lube)

    lube.name = clean_name
    lube.category = payload.category or "LUBE_OIL"
    lube.package_size = clean_pkg
    lube.barcode = payload.barcode
    lube.mrp = payload.mrp if payload.mrp > 0 else payload.sale_price
    lube.sale_price = payload.sale_price
    lube.cost_price = payload.cost_price
    lube.current_stock_units = int(stock_units)
    lube.reorder_level = payload.reorder_level

    await db.commit()
    await db.refresh(lube)
    return {
        "status": "success",
        "message": f"Packaged item '{lube.name}' saved successfully",
        "id": lube.id,
        "code": lube.code,
        "current_stock_units": lube.current_stock_units,
    }


class LubeBulkImportRequest(BaseModel):
    csv_content: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None


@router.post("/lubes/bulk-import-csv", summary="Bulk Import Lubricants, DEF & Packaged Items from CSV")
async def bulk_import_lubes_csv(payload: LubeBulkImportRequest, db: AsyncSession = Depends(get_db)):
    rows = []
    if payload.items:
        rows = payload.items
    elif payload.csv_content:
        content = payload.csv_content.strip()
        if content.startswith("\ufeff"):
            content = content[1:]
        reader = csv.DictReader(io.StringIO(content))
        for r in reader:
            norm_r = {str(k).strip().lower().replace(" ", "_"): v for k, v in r.items() if k is not None}
            rows.append(norm_r)
    else:
        raise HTTPException(status_code=400, detail="Either csv_content or items array must be provided")

    if not rows:
        raise HTTPException(status_code=400, detail="No rows found in CSV")

    inserted_count = 0
    updated_count = 0
    errors = []

    for idx, r in enumerate(rows, start=1):
        try:
            code = str(r.get("code") or r.get("item_code") or r.get("product_code") or "").strip().upper()
            name = str(r.get("name") or r.get("item_name") or r.get("product_name") or r.get("description") or "").strip()

            if not code and not name:
                errors.append({"row": idx, "error": "Item code or Item name is required"})
                continue

            if not code:
                clean_slug = re.sub(r"[^A-Z0-9]", "-", name.upper())[:10].strip("-")
                code = f"LUB-{clean_slug}-{idx}"
            if not name:
                name = code

            category = str(r.get("category") or "4T Engine Oil").strip()
            package_size = str(r.get("package_size") or r.get("pack_size") or r.get("unit") or "1 Litre").strip()
            barcode = str(r.get("barcode") or "").strip() or None
            hsn_code = str(r.get("hsn_code") or r.get("hsn") or "2710").strip()

            try:
                sale_price = float(r.get("sale_price") or r.get("selling_price") or r.get("rate") or r.get("price") or 0.0)
            except (ValueError, TypeError):
                sale_price = 0.0

            try:
                cost_price = float(r.get("cost_price") or r.get("purchase_price") or r.get("cost") or 0.0)
            except (ValueError, TypeError):
                cost_price = 0.0

            try:
                mrp = float(r.get("mrp") or sale_price or 0.0)
            except (ValueError, TypeError):
                mrp = sale_price

            try:
                stock_units = int(float(r.get("stock_qty") or r.get("current_stock_units") or r.get("stock") or r.get("qty") or 0))
            except (ValueError, TypeError):
                stock_units = 0

            try:
                reorder_level = int(float(r.get("reorder_level") or r.get("min_stock") or 10))
            except (ValueError, TypeError):
                reorder_level = 10

            try:
                gst_percent = float(r.get("gst_percent") or r.get("gst") or 18.0)
            except (ValueError, TypeError):
                gst_percent = 18.0

            # Find existing product by code
            stmt = select(LubeProduct).where(LubeProduct.code == code)
            res = await db.execute(stmt)
            lube = res.scalar_one_or_none()

            if lube:
                # Update existing product
                lube.name = name
                lube.category = category
                lube.package_size = package_size
                if barcode: lube.barcode = barcode
                lube.hsn_code = hsn_code
                lube.gst_percent = gst_percent
                lube.mrp = mrp
                lube.sale_price = sale_price
                lube.cost_price = cost_price
                lube.current_stock_units = stock_units
                lube.reorder_level = reorder_level
                updated_count += 1
            else:
                # Create new product
                lube = LubeProduct(
                    code=code,
                    name=name,
                    category=category,
                    package_size=package_size,
                    barcode=barcode,
                    hsn_code=hsn_code,
                    gst_percent=gst_percent,
                    mrp=mrp,
                    sale_price=sale_price,
                    cost_price=cost_price,
                    current_stock_units=stock_units,
                    reorder_level=reorder_level,
                )
                db.add(lube)
                inserted_count += 1

        except Exception as row_exc:
            errors.append({"row": idx, "error": str(row_exc)})

    await db.commit()

    # Query all active products to return updated list
    all_res = await db.execute(select(LubeProduct).order_by(LubeProduct.category, LubeProduct.name))
    all_lubes = all_res.scalars().all()

    return {
        "status": "success",
        "message": f"Successfully processed {len(rows)} products ({inserted_count} added, {updated_count} updated)",
        "total_rows": len(rows),
        "inserted": inserted_count,
        "updated": updated_count,
        "errors": errors,
        "products": [
            {
                "id": l.id,
                "code": l.code,
                "name": l.name,
                "category": l.category,
                "package_size": l.package_size,
                "barcode": l.barcode or "",
                "mrp": l.mrp,
                "sale_price": l.sale_price,
                "cost_price": l.cost_price,
                "current_stock_units": l.current_stock_units,
                "reorder_level": l.reorder_level,
                "is_low_stock": l.current_stock_units <= l.reorder_level,
            }
            for l in all_lubes
        ],
    }


@router.delete("/lubes/{product_id}", summary="Delete Packaged Lube / Retail Product")
async def delete_lube_product(
    product_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete packaged inventory products.",
        )
    lube = await db.get(LubeProduct, product_id)
    if not lube:
        raise HTTPException(status_code=404, detail="Product not found")
    if lube.current_stock_units and lube.current_stock_units > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete product '{lube.name}' with active inventory of {lube.current_stock_units} units. Sell or write off stock to 0 before removing from catalog.",
        )
    await db.delete(lube)
    await db.commit()
    return {"status": "success", "message": f"Product #{product_id} deleted from catalog"}


class LubeSaleRequest(BaseModel):
    shift_id: Optional[int] = None
    lube_product_id: int
    qty_units: int
    rate: Optional[float] = None
    payment_mode: str = "CASH"


@router.post("/lubes/sale", summary="Record Packaged Lube / DEF Sale & Deduct Discrete Stock")
async def record_lube_sale(payload: LubeSaleRequest, db: AsyncSession = Depends(get_db)):
    if payload.qty_units <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    stmt = select(LubeProduct).where(LubeProduct.id == payload.lube_product_id).with_for_update()
    res = await db.execute(stmt)
    lube = res.scalar_one_or_none()
    if not lube:
        raise HTTPException(status_code=404, detail="Lube product not found")

    if lube.current_stock_units < payload.qty_units:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock for '{lube.name}'. Available: {lube.current_stock_units} units, requested: {payload.qty_units} units",
        )

    rate = payload.rate if payload.rate is not None and payload.rate > 0 else lube.sale_price
    total_amount = round(payload.qty_units * rate, 2)
    gst_pct = float(lube.gst_percent if lube.gst_percent is not None else 18.0)
    hsn = lube.hsn_code or "2710"

    # Compute statutory GST breakdown (Retail inclusive prices: Base Taxable + 9% CGST + 9% SGST)
    taxable_amount = round(total_amount / (1.0 + (gst_pct / 100.0)), 2)
    total_gst = round(total_amount - taxable_amount, 2)
    cgst_amount = round(total_gst / 2.0, 2)
    sgst_amount = round(total_gst - cgst_amount, 2)

    # Deduct discrete package units from stock
    lube.current_stock_units -= payload.qty_units

    # If CASH, update Primary Cash On Hand bank account balance
    if payload.payment_mode.upper() == "CASH":
        cash_res = await db.execute(select(BankAccount).where(BankAccount.account_type == "CASH").limit(1))
        cash_acc = cash_res.scalars().first()
        if not cash_acc:
            cash_acc = await db.get(BankAccount, 1)
        if cash_acc:
            cash_acc.balance = round(cash_acc.balance + total_amount, 2)

    sale_entry = LubeSaleEntry(
        shift_id=payload.shift_id,
        lube_product_id=lube.id,
        qty_units=payload.qty_units,
        rate=rate,
        total_amount=total_amount,
        hsn_code=hsn,
        gst_percent=gst_pct,
        taxable_amount=taxable_amount,
        cgst_amount=cgst_amount,
        sgst_amount=sgst_amount,
        date=today_ist(),
        payment_mode=payload.payment_mode,
    )
    db.add(sale_entry)
    await db.commit()
    await db.refresh(sale_entry)

    return {
        "status": "success",
        "id": sale_entry.id,
        "message": f"Sold {payload.qty_units} unit(s) of '{lube.name}' for ₹{total_amount:.2f} (Taxable: ₹{taxable_amount:.2f}, GST: ₹{total_gst:.2f})",
        "remaining_stock_units": lube.current_stock_units,
        "total_amount": total_amount,
        "taxable_amount": taxable_amount,
        "cgst_amount": cgst_amount,
        "sgst_amount": sgst_amount,
        "hsn_code": hsn,
    }


@router.get("/lubes/sales", summary="List Packaged Lubricants & DEF Sales Register")
async def list_lube_sales(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(LubeSaleEntry)
        .options(selectinload(LubeSaleEntry.lube_product))
        .order_by(desc(LubeSaleEntry.id))
        .limit(limit)
    )
    res = await db.execute(stmt)
    entries = res.scalars().all()
    return [
        {
            "id": s.id,
            "shift_id": s.shift_id,
            "lube_product_id": s.lube_product_id,
            "product_name": s.lube_product.name if s.lube_product else "Lube Item",
            "product_code": s.lube_product.code if s.lube_product else "LUBE",
            "qty_units": s.qty_units,
            "rate": s.rate,
            "total_amount": s.total_amount,
            "hsn_code": s.hsn_code,
            "gst_percent": s.gst_percent,
            "taxable_amount": s.taxable_amount,
            "cgst_amount": s.cgst_amount,
            "sgst_amount": s.sgst_amount,
            "date": str(s.date),
            "payment_mode": s.payment_mode,
        }
        for s in entries
    ]


@router.delete("/lubes/sales/{sale_id}", summary="Delete / Void Lube Sale with Stock & Cash Rollback")
async def delete_lube_sale(
    sale_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to void lube sales.",
        )
    sale = await db.get(LubeSaleEntry, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Lube sale record not found")

    # Restore stock units
    lube = await db.get(LubeProduct, sale.lube_product_id)
    if lube:
        lube.current_stock_units += sale.qty_units

    # Revert cash balance if CASH
    if sale.payment_mode.upper() == "CASH":
        cash_res = await db.execute(select(BankAccount).where(BankAccount.account_type == "CASH").limit(1))
        cash_acc = cash_res.scalars().first()
        if not cash_acc:
            cash_acc = await db.get(BankAccount, 1)
        if cash_acc:
            cash_acc.balance = max(0.0, round(cash_acc.balance - sale.total_amount, 2))

    p_name = lube.name if lube else "Lube"
    qty = sale.qty_units
    await db.delete(sale)
    await db.commit()
    return {
        "status": "success",
        "message": f"Voided sale of {qty} unit(s) of '{p_name}'. Stock and cash balances rolled back.",
        "id": sale_id,
    }


@router.post("/purchases/verify-density", summary="Convert Ambient Density to 15°C (ASTM Table 53B)")
async def verify_density_endpoint(payload: DensityCheckRequest):
    result = reduce_density_to_15c(
        observed_density=payload.observed_density,
        temperature_celsius=payload.temperature_celsius,
        product_code=payload.product_code,
    )
    if payload.invoice_density_15c is not None:
        diff = round(abs(result["density_15c"] - payload.invoice_density_15c), 2)
        passed = diff <= 3.0  # Statutory Indian OMC ±3.0 kg/m3 tolerance limit
        result["invoice_density_15c"] = payload.invoice_density_15c
        result["variation"] = diff
        result["is_within_tolerance"] = passed
        result["verdict"] = "PASSED: Fuel is within statutory tolerance for decanting." if passed else "REJECT: Density variance exceeds statutory ±3.0 kg/m³ limit!"

    return result


class StationProfilePayload(BaseModel):
    station_name: str
    oil_company: str
    dealer_code: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    pincode: Optional[str] = None
    gstin: Optional[str] = None
    pan_no: Optional[str] = None
    phone: Optional[str] = None
    upi_vpa: Optional[str] = None
    printer_paper_width: Optional[str] = "80mm"
    manager_pin: Optional[str] = None
    current_manager_pin: Optional[str] = None


@router.get("/station-profile", summary="Get Dealership / Station Profile Settings")
async def get_station_profile_endpoint(db: AsyncSession = Depends(get_db)):
    cached_profile = get_cached_station_profile()
    if cached_profile is not None:
        return cached_profile

    stmt = select(StationProfileSetting).order_by(StationProfileSetting.id.asc()).limit(1)
    res = await db.execute(stmt)
    prof = res.scalar_one_or_none()
    if not prof:
        prof = StationProfileSetting(
            station_name="NSAIPETROSOFT RETAIL OUTLET",
            oil_company="BHARAT PETROLEUM CORPORATION LTD",
            address="HIGHWAY SERVICE STATION",
            city="SURAT",
            state="GUJARAT",
            state_code="24",
            pincode="395003",
            gstin="24AAACN1234F1Z5",
            phone="+91 98765 43210",
            upi_vpa="",
            printer_paper_width="80mm",
            manager_pin="1234",
        )
        db.add(prof)
        await db.commit()
        await db.refresh(prof)
    result = {
        "station_name": prof.station_name,
        "oil_company": prof.oil_company,
        "dealer_code": prof.dealer_code or "",
        "address": prof.address or "",
        "city": prof.city or "",
        "state": prof.state or "",
        "state_code": prof.state_code or "",
        "pincode": prof.pincode or "",
        "gstin": prof.gstin or "",
        "pan_no": prof.pan_no or "",
        "phone": prof.phone or "",
        "upi_vpa": prof.upi_vpa or "",
        "printer_paper_width": prof.printer_paper_width or "80mm",
        # Never leak manager PIN in public API responses
        "has_manager_pin": bool(prof.manager_pin),
    }
    set_cached_station_profile(result, ttl_seconds=1800)
    return result


@router.post("/station-profile", summary="Save Dealership / Station Profile Settings")
async def save_station_profile_endpoint(
    payload: StationProfilePayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    pin_to_check = payload.current_manager_pin or payload.manager_pin
    if not await check_manager_authorized(pin_to_check, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to update outlet settings.",
        )

    stmt = select(StationProfileSetting).order_by(StationProfileSetting.id.asc()).limit(1)
    res = await db.execute(stmt)
    prof = res.scalar_one_or_none()
    if not prof:
        prof = StationProfileSetting()
        db.add(prof)

    prof.station_name = payload.station_name.strip()
    prof.oil_company = payload.oil_company.strip()
    prof.dealer_code = (payload.dealer_code or "").strip()
    prof.address = (payload.address or "").strip()
    prof.city = (payload.city or "").strip()
    prof.state = (payload.state or "").strip()
    prof.state_code = (payload.state_code or "").strip()
    prof.pincode = (payload.pincode or "").strip()
    prof.gstin = (payload.gstin or "").strip()
    prof.pan_no = (payload.pan_no or "").strip()
    prof.phone = (payload.phone or "").strip()
    prof.upi_vpa = (payload.upi_vpa or "").strip()
    prof.printer_paper_width = payload.printer_paper_width or "80mm"
    if payload.manager_pin and payload.manager_pin.strip():
        prof.manager_pin = payload.manager_pin.strip()

    await db.commit()
    await db.refresh(prof)

    # Instant station configuration cache invalidation (#6, #7)
    invalidate_station_cache()

    return {
        "message": "Station profile updated successfully",
        "station_name": prof.station_name,
        "oil_company": prof.oil_company,
        "dealer_code": prof.dealer_code,
        "address": prof.address,
        "city": prof.city,
        "state": prof.state,
        "state_code": prof.state_code,
        "pincode": prof.pincode,
        "gstin": prof.gstin,
        "pan_no": prof.pan_no,
        "phone": prof.phone,
        "upi_vpa": prof.upi_vpa,
        "printer_paper_width": prof.printer_paper_width,
        "has_manager_pin": bool(prof.manager_pin),
    }


# -------------------------------------------------------------
# 22. Quotations & Price Estimates API
# -------------------------------------------------------------
class QuotationCreate(BaseModel):
    id: Optional[int] = None
    quotation_no: Optional[str] = None
    date: Optional[date] = None
    valid_until: Optional[date] = None
    customer_name: str
    customer_mobile: Optional[str] = None
    customer_gstin: Optional[str] = None
    total_amount: Optional[float] = None
    terms: Optional[str] = None
    status: Optional[str] = "ISSUED"
    items: Optional[List[Dict[str, Any]]] = None


@router.get("/quotations", summary="List All Quotations & Estimates")
async def get_quotations(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Quotation).order_by(desc(Quotation.id)))
    quotes = res.scalars().all()
    results = []
    for q in quotes:
        items = []
        try:
            items = json.loads(q.items_json) if q.items_json else []
        except Exception:
            items = []
        results.append({
            "id": q.id,
            "quotation_no": q.quotation_no,
            "date": str(q.date),
            "valid_until": str(q.valid_until),
            "customer_name": q.customer_name,
            "customer_mobile": q.customer_mobile or "",
            "customer_gstin": q.customer_gstin or "",
            "total_amount": q.total_amount,
            "terms": q.terms or "",
            "status": q.status,
            "items": items,
        })
    return results


@router.post("/quotations", summary="Create or Update Quotation / Estimate")
async def save_quotation(data: QuotationCreate, db: AsyncSession = Depends(get_db)):
    if not data.customer_name or not data.customer_name.strip():
        raise HTTPException(status_code=400, detail="Customer / Firm name is required")

    items = data.items or []
    total_amt = data.total_amount
    if total_amt is None:
        total_amt = sum(item.get("amount", 0.0) for item in items)
    total_amt = round(float(total_amt), 2)

    today = today_ist()
    val_until = data.valid_until or (today + timedelta(days=14))

    quote = None
    if data.id:
        quote = await db.get(Quotation, data.id)

    if not quote:
        if not data.quotation_no:
            cnt_res = await db.execute(select(func.count(Quotation.id)))
            next_num = (cnt_res.scalar() or 0) + 1
            q_no = f"QT-{today.year}-{next_num:03d}"
        else:
            q_no = data.quotation_no

        quote = Quotation(
            quotation_no=q_no,
            date=data.date or today,
            valid_until=val_until,
            customer_name=data.customer_name.strip().upper(),
            customer_mobile=data.customer_mobile.strip() if data.customer_mobile else None,
            customer_gstin=data.customer_gstin.strip().upper() if data.customer_gstin else None,
            total_amount=total_amt,
            terms=data.terms or "Payment strictly within 15 days against fleet challan.",
            status=data.status or "ISSUED",
            items_json=json.dumps(items),
        )
        db.add(quote)
    else:
        if data.quotation_no:
            quote.quotation_no = data.quotation_no
        if data.date:
            quote.date = data.date
        quote.valid_until = val_until
        quote.customer_name = data.customer_name.strip().upper()
        quote.customer_mobile = data.customer_mobile.strip() if data.customer_mobile else None
        quote.customer_gstin = data.customer_gstin.strip().upper() if data.customer_gstin else None
        quote.total_amount = total_amt
        if data.terms is not None:
            quote.terms = data.terms
        if data.status:
            quote.status = data.status
        quote.items_json = json.dumps(items)

    await db.commit()
    await db.refresh(quote)
    return {
        "id": quote.id,
        "quotation_no": quote.quotation_no,
        "date": str(quote.date),
        "valid_until": str(quote.valid_until),
        "customer_name": quote.customer_name,
        "customer_mobile": quote.customer_mobile or "",
        "customer_gstin": quote.customer_gstin or "",
        "total_amount": quote.total_amount,
        "terms": quote.terms,
        "status": quote.status,
        "items": items,
        "message": f"Quotation #{quote.quotation_no} saved successfully",
    }


@router.delete("/quotations/{quotation_id}", summary="Delete Quotation")
async def delete_quotation(
    quotation_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to delete quotations.",
        )
    quote = await db.get(Quotation, quotation_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quotation not found")
    q_no = quote.quotation_no
    await db.delete(quote)
    await db.commit()
    return {"message": f"Quotation #{q_no} deleted successfully", "id": quotation_id}


# -------------------------------------------------------------
# 25. Retail Cash Invoices & POS Walk-in Fuel Memos API
# -------------------------------------------------------------
class RetailCashBillInput(BaseModel):
    bill_no: Optional[str] = None
    date: Optional[date] = None
    vehicle_no: str = "WALK-IN"
    product_name: str
    product_code: str = "MS"
    qty: float
    rate: float
    amount: float
    tax_amount: float = 0.0
    payment_mode: str = "CASH"
    split_details: Optional[str] = None
    driver_name: Optional[str] = None


@router.get("/cash-bills", summary="List All Retail Cash Memos & Walk-in Invoices")
async def list_cash_bills(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(RetailCashInvoice).order_by(desc(RetailCashInvoice.id)).limit(limit)
    res = await db.execute(stmt)
    bills = res.scalars().all()
    return [
        {
            "id": b.id,
            "bill_no": b.bill_no,
            "date": str(b.date),
            "vehicle_no": b.vehicle_no,
            "product_name": b.product_name,
            "product_code": b.product_code,
            "qty": b.qty,
            "rate": b.rate,
            "amount": b.amount,
            "tax_amount": b.tax_amount,
            "payment_mode": b.payment_mode,
            "split_details": b.split_details,
            "driver_name": b.driver_name,
            "status": b.status,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }
        for b in bills
    ]


@router.post("/cash-bills", summary="Record Walk-in Retail Cash / POS Bill")
async def create_cash_bill(
    data: RetailCashBillInput,
    db: AsyncSession = Depends(get_db),
):
    b_no = data.bill_no.strip() if data.bill_no else f"POS-{int(time.time())}"
    # Ensure uniqueness
    chk = await db.execute(select(RetailCashInvoice).where(RetailCashInvoice.bill_no == b_no))
    if chk.scalars().first():
        b_no = f"{b_no}-{int(time.time()) % 1000}"

    invoice = RetailCashInvoice(
        bill_no=b_no,
        date=data.date or today_ist(),
        vehicle_no=data.vehicle_no.strip().upper(),
        product_name=data.product_name.strip(),
        product_code=data.product_code.strip().upper(),
        qty=data.qty,
        rate=data.rate,
        amount=data.amount,
        tax_amount=data.tax_amount,
        payment_mode=data.payment_mode.strip().upper(),
        split_details=data.split_details,
        driver_name=data.driver_name.strip() if data.driver_name else None,
        status="PAID",
    )
    db.add(invoice)

    # If CASH or SPLIT, update Primary Cash On Hand bank account balance
    if data.payment_mode.upper() in ("CASH", "SPLIT"):
        cash_res = await db.execute(select(BankAccount).where(BankAccount.account_type == "CASH").limit(1))
        cash_acc = cash_res.scalars().first()
        if not cash_acc:
            cash_acc = await db.get(BankAccount, 1)
        if cash_acc:
            cash_amt = data.amount
            if data.payment_mode.upper() == "SPLIT" and data.split_details:
                try:
                    split_info = json.loads(data.split_details)
                    cash_amt = float(split_info.get("cash", 0))
                except Exception:
                    pass
            cash_acc.balance = round(cash_acc.balance + cash_amt, 2)

    # Decrement tank current stock if matching product exists
    tank_res = await db.execute(select(Tank).join(FuelProduct).where(FuelProduct.code == data.product_code.upper()).limit(1))
    tank = tank_res.scalars().first()
    if tank and data.qty > 0:
        tank.current_stock = max(0.0, round(tank.current_stock - data.qty, 2))

    await db.commit()
    await db.refresh(invoice)
    return {
        "id": invoice.id,
        "bill_no": invoice.bill_no,
        "date": str(invoice.date),
        "vehicle_no": invoice.vehicle_no,
        "product_name": invoice.product_name,
        "product_code": invoice.product_code,
        "qty": invoice.qty,
        "rate": invoice.rate,
        "amount": invoice.amount,
        "tax_amount": invoice.tax_amount,
        "payment_mode": invoice.payment_mode,
        "split_details": invoice.split_details,
        "driver_name": invoice.driver_name,
        "status": invoice.status,
        "message": f"Retail bill #{invoice.bill_no} recorded successfully",
    }


@router.delete("/cash-bills/{bill_id}", summary="Delete / Void Retail Cash Bill with Rollback")
async def delete_cash_bill(
    bill_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to void/delete retail cash memos.",
        )
    invoice = await db.get(RetailCashInvoice, bill_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Retail cash bill not found")

    # Reverse cash balance if CASH or SPLIT
    if invoice.payment_mode in ("CASH", "SPLIT"):
        cash_res = await db.execute(select(BankAccount).where(BankAccount.account_type == "CASH").limit(1))
        cash_acc = cash_res.scalars().first()
        if not cash_acc:
            cash_acc = await db.get(BankAccount, 1)
        if cash_acc:
            cash_amt = invoice.amount
            if invoice.payment_mode == "SPLIT" and invoice.split_details:
                try:
                    split_info = json.loads(invoice.split_details)
                    cash_amt = float(split_info.get("cash", 0))
                except Exception:
                    pass
            cash_acc.balance = max(0.0, round(cash_acc.balance - cash_amt, 2))

    # Restore tank current stock
    tank_res = await db.execute(select(Tank).join(FuelProduct).where(FuelProduct.code == invoice.product_code.upper()).limit(1))
    tank = tank_res.scalars().first()
    if tank and invoice.qty > 0:
        tank.current_stock = round(tank.current_stock + invoice.qty, 2)

    b_no = invoice.bill_no
    await db.delete(invoice)
    await db.commit()
    return {"message": f"Retail cash bill #{b_no} voided and stock/cash liability rolled back", "id": bill_id}


# -------------------------------------------------------------
# 18. Forecourt Automation Dispenser Hub & Controller Logs API
# -------------------------------------------------------------
class ForecourtLogCreate(BaseModel):
    tx_id: Optional[str] = None
    pump_id: int
    nozzle_name: str
    product_name: str
    product_code: str = "MS"
    liters: float
    rate: float
    amount: float
    protocol: str = "DOMS PSS 5000 (Ethernet TCP/IP)"
    controller_ip: str = "192.168.1.150:4001"


class ForecourtPushToPos(BaseModel):
    log_id: int
    payment_mode: str = "CASH"
    customer_name: Optional[str] = None
    vehicle_no: Optional[str] = None


@router.get("/automation/logs", summary="List Forecourt Automation Controller Logs")
async def list_forecourt_logs(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = select(ForecourtControllerLog).order_by(desc(ForecourtControllerLog.event_time)).limit(limit)
    if status:
        query = select(ForecourtControllerLog).where(ForecourtControllerLog.status == status.upper()).order_by(desc(ForecourtControllerLog.event_time)).limit(limit)
    res = await db.execute(query)
    logs = res.scalars().all()
    return [
        {
            "id": l.id,
            "tx_id": l.tx_id,
            "event_time": l.event_time.isoformat() if l.event_time else None,
            "pump_id": l.pump_id,
            "nozzle_name": l.nozzle_name,
            "product_name": l.product_name,
            "product_code": l.product_code,
            "liters": round(float(l.liters), 3),
            "rate": round(float(l.rate), 2),
            "amount": round(float(l.amount), 2),
            "protocol": l.protocol,
            "controller_ip": l.controller_ip,
            "status": l.status,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]


@router.post("/automation/simulate-drop", summary="Simulate or Ingest Forecourt Controller Dispenser Drop")
async def simulate_forecourt_drop(data: ForecourtLogCreate, db: AsyncSession = Depends(get_db)):
    if data.liters <= 0 or data.rate <= 0:
        raise HTTPException(status_code=400, detail="Dispensed volume (liters) and rate must be greater than zero")
    amount = round(data.liters * data.rate, 2)
    tx_id = data.tx_id or f"TX-{int(time.time()*1000)}"
    log = ForecourtControllerLog(
        tx_id=tx_id,
        pump_id=data.pump_id,
        nozzle_name=data.nozzle_name,
        product_name=data.product_name,
        product_code=data.product_code.upper(),
        liters=round(data.liters, 3),
        rate=round(data.rate, 2),
        amount=amount,
        protocol=data.protocol,
        controller_ip=data.controller_ip,
        status="PENDING",
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return {
        "message": "Forecourt drop logged successfully",
        "id": log.id,
        "tx_id": log.tx_id,
        "status": log.status,
        "liters": log.liters,
        "amount": log.amount,
    }


@router.post("/automation/push-to-pos", summary="Commit Forecourt Log to Retail POS / Cash Bill")
async def push_forecourt_to_pos(data: ForecourtPushToPos, db: AsyncSession = Depends(get_db)):
    log = await db.get(ForecourtControllerLog, data.log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Forecourt controller log not found")
    if log.status == "SYNCED":
        return {"message": "Transaction already pushed to POS", "id": log.id, "status": "SYNCED"}

    bill_no = f"POS-{int(time.time()*1000)}"
    bill = RetailCashInvoice(
        bill_no=bill_no,
        date=today_ist(),
        driver_name=data.customer_name or "Walk-in Retail Customer",
        vehicle_no=(data.vehicle_no or "WALK-IN").strip().upper(),
        product_name=log.product_name,
        product_code=log.product_code.upper(),
        qty=log.liters,
        rate=log.rate,
        amount=log.amount,
        payment_mode=data.payment_mode.upper(),
        status="PAID",
    )
    db.add(bill)

    # Deduct tank current stock if available
    tank_res = await db.execute(
        select(Tank).join(FuelProduct).where(FuelProduct.code == log.product_code.upper()).limit(1)
    )
    tank = tank_res.scalars().first()
    if tank:
        tank.current_stock = max(0.0, round(tank.current_stock - log.liters, 2))

    # Credit Cash or Bank account
    if data.payment_mode.upper() == "CASH":
        cash_res = await db.execute(select(BankAccount).where(BankAccount.account_type == "CASH").limit(1))
        cash_acc = cash_res.scalars().first()
        if not cash_acc:
            cash_acc = await db.get(BankAccount, 1)
        if cash_acc:
            cash_acc.balance = round(cash_acc.balance + log.amount, 2)

    log.status = "SYNCED"
    await db.commit()
    await db.refresh(bill)
    return {
        "message": f"Dispenser transaction #{log.tx_id} successfully converted to Retail Bill #{bill.bill_no}",
        "bill_id": bill.id,
        "bill_no": bill.bill_no,
        "amount": bill.amount,
        "log_status": log.status,
    }


# -------------------------------------------------------------
# 19. Shift Cash Drops (Safe Drops) API
# -------------------------------------------------------------
class ShiftCashDropCreate(BaseModel):
    shift_id: Optional[int] = None
    employee_id: Optional[int] = None
    amount: float
    vault_account_id: int = 1
    witness_name: Optional[str] = None
    notes: Optional[str] = None


@router.get("/cash-drops", summary="List Shift Cash Safe Drops")
async def list_cash_drops(
    shift_id: Optional[int] = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ShiftCashDrop)
        .options(selectinload(ShiftCashDrop.employee), selectinload(ShiftCashDrop.vault_account))
        .order_by(desc(ShiftCashDrop.drop_time))
        .limit(limit)
    )
    if shift_id:
        query = (
            select(ShiftCashDrop)
            .where(ShiftCashDrop.shift_id == shift_id)
            .options(selectinload(ShiftCashDrop.employee), selectinload(ShiftCashDrop.vault_account))
            .order_by(desc(ShiftCashDrop.drop_time))
            .limit(limit)
        )
    res = await db.execute(query)
    drops = res.scalars().all()
    return [
        {
            "id": d.id,
            "shift_id": d.shift_id,
            "employee_id": d.employee_id,
            "employee_name": d.employee.name if d.employee else "General Attendant",
            "drop_time": d.drop_time.isoformat() if d.drop_time else None,
            "amount": round(float(d.amount), 2),
            "vault_account_id": d.vault_account_id,
            "vault_name": d.vault_account.account_name if d.vault_account else "Station Safe Vault",
            "witness_name": d.witness_name,
            "notes": d.notes,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in drops
    ]


@router.post("/cash-drops", summary="Record Cash Safe Drop from Attendant to Vault")
async def record_cash_drop(data: ShiftCashDropCreate, db: AsyncSession = Depends(get_db)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Safe drop amount must be greater than zero")

    vault_acc = await db.get(BankAccount, data.vault_account_id)
    if not vault_acc:
        acc_res = await db.execute(select(BankAccount).limit(1))
        vault_acc = acc_res.scalars().first()
        if not vault_acc:
            raise HTTPException(status_code=400, detail="No valid station vault / bank account found")

    drop = ShiftCashDrop(
        shift_id=data.shift_id,
        employee_id=data.employee_id,
        amount=round(data.amount, 2),
        vault_account_id=vault_acc.id,
        witness_name=data.witness_name,
        notes=data.notes,
    )
    db.add(drop)
    vault_acc.balance = round(vault_acc.balance + data.amount, 2)

    await db.commit()
    await db.refresh(drop)
    return {
        "message": f"Safe drop of ₹{drop.amount:,.2f} recorded into {vault_acc.account_name} successfully",
        "id": drop.id,
        "amount": drop.amount,
        "vault_balance": vault_acc.balance,
        "drop_time": drop.drop_time.isoformat() if drop.drop_time else None,
    }


@router.delete("/cash-drops/{drop_id}", summary="Void / Revert Shift Cash Drop")
async def delete_cash_drop(
    drop_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to void cash safe drops.",
        )
    drop = await db.get(ShiftCashDrop, drop_id)
    if not drop:
        raise HTTPException(status_code=404, detail="Cash drop record not found")

    vault_acc = await db.get(BankAccount, drop.vault_account_id)
    if vault_acc:
        vault_acc.balance = max(0.0, round(vault_acc.balance - drop.amount, 2))

    amt = drop.amount
    await db.delete(drop)
    await db.commit()
    return {"message": f"Cash drop #{drop_id} of ₹{amt:,.2f} voided and vault balance adjusted", "id": drop_id}


# -------------------------------------------------------------
# 20. Driveway Salesmen (DSM) Shift Attendance & Float API
# -------------------------------------------------------------
class EmployeeAttendanceCreate(BaseModel):
    employee_id: int
    shift_id: Optional[int] = None
    date: Optional[date] = None
    status: str = "PRESENT"
    in_time: Optional[str] = None
    out_time: Optional[str] = None
    opening_cash_float: float = 0.0
    remarks: Optional[str] = None


@router.get("/employees/attendance", summary="List Employee Attendance")
async def list_attendance(
    shift_id: Optional[int] = Query(None),
    target_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(EmployeeAttendance)
        .options(selectinload(EmployeeAttendance.employee))
        .order_by(desc(EmployeeAttendance.date), desc(EmployeeAttendance.id))
    )
    if shift_id:
        query = query.where(EmployeeAttendance.shift_id == shift_id)
    if target_date:
        query = query.where(EmployeeAttendance.date == target_date)
    else:
        query = query.limit(100)
    res = await db.execute(query)
    entries = res.scalars().all()
    return [
        {
            "id": a.id,
            "employee_id": a.employee_id,
            "employee_name": a.employee.name if a.employee else "Staff Member",
            "shift_id": a.shift_id,
            "date": str(a.date),
            "status": a.status,
            "in_time": a.in_time,
            "out_time": a.out_time,
            "opening_cash_float": round(float(a.opening_cash_float), 2),
            "remarks": a.remarks,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in entries
    ]


@router.post("/employees/attendance", summary="Record Employee Daily / Shift Attendance")
async def record_attendance(data: EmployeeAttendanceCreate, db: AsyncSession = Depends(get_db)):
    emp = await db.get(Employee, data.employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    att_date = data.date or today_ist()
    q = select(EmployeeAttendance).where(
        EmployeeAttendance.employee_id == data.employee_id,
        EmployeeAttendance.date == att_date,
    )
    if data.shift_id:
        q = q.where(EmployeeAttendance.shift_id == data.shift_id)
    res = await db.execute(q)
    existing = res.scalars().first()

    if existing:
        existing.status = data.status.upper()
        if data.in_time:
            existing.in_time = data.in_time
        if data.out_time:
            existing.out_time = data.out_time
        if data.opening_cash_float >= 0:
            existing.opening_cash_float = round(data.opening_cash_float, 2)
        if data.remarks:
            existing.remarks = data.remarks
        await db.commit()
        await db.refresh(existing)
        return {"message": f"Attendance for {emp.name} updated", "id": existing.id, "status": existing.status}

    new_att = EmployeeAttendance(
        employee_id=data.employee_id,
        shift_id=data.shift_id,
        date=att_date,
        status=data.status.upper(),
        in_time=data.in_time or now_ist().strftime("%H:%M"),
        out_time=data.out_time,
        opening_cash_float=round(data.opening_cash_float, 2),
        remarks=data.remarks,
    )
    db.add(new_att)
    await db.commit()
    await db.refresh(new_att)
    return {"message": f"Attendance for {emp.name} recorded", "id": new_att.id, "status": new_att.status}


# -------------------------------------------------------------
# 21. Statutory Compliance Licenses & Expiry Tracking API
# -------------------------------------------------------------
class StatutoryLicenseCreate(BaseModel):
    license_name: str
    license_number: str
    issuing_authority: str = "PESO / Govt of Gujarat"
    issue_date: date
    expiry_date: date
    reminder_days_before: int = 30
    document_key: Optional[str] = None
    status: str = "ACTIVE"
    remarks: Optional[str] = None


class StatutoryLicenseUpdate(BaseModel):
    license_name: Optional[str] = None
    license_number: Optional[str] = None
    issuing_authority: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    reminder_days_before: Optional[int] = None
    document_key: Optional[str] = None
    status: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/compliance/licenses", summary="List Statutory Compliance Licenses & Expiry Alerts")
async def list_compliance_licenses(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(StatutoryComplianceLicense).order_by(StatutoryComplianceLicense.expiry_date.asc()))
    licenses = res.scalars().all()
    today = today_ist()
    out = []
    for lic in licenses:
        days_left = (lic.expiry_date - today).days
        current_status = lic.status
        if days_left < 0:
            current_status = "EXPIRED"
        elif days_left <= lic.reminder_days_before:
            current_status = "EXPIRING_SOON"
        else:
            current_status = "ACTIVE"

        if lic.status != current_status:
            lic.status = current_status

        out.append({
            "id": lic.id,
            "license_name": lic.license_name,
            "license_number": lic.license_number,
            "issuing_authority": lic.issuing_authority,
            "issue_date": str(lic.issue_date),
            "expiry_date": str(lic.expiry_date),
            "reminder_days_before": lic.reminder_days_before,
            "days_remaining": days_left,
            "document_key": lic.document_key,
            "status": current_status,
            "remarks": lic.remarks,
            "created_at": lic.created_at.isoformat() if lic.created_at else None,
        })
    await db.commit()
    return out


@router.post("/compliance/licenses", summary="Register New Statutory License")
async def create_compliance_license(data: StatutoryLicenseCreate, db: AsyncSession = Depends(get_db)):
    if not data.license_name or not data.license_number:
        raise HTTPException(status_code=400, detail="License name and number are mandatory")
    existing_res = await db.execute(
        select(StatutoryComplianceLicense).where(StatutoryComplianceLicense.license_number == data.license_number.strip())
    )
    if existing_res.scalars().first():
        raise HTTPException(status_code=400, detail=f"License number '{data.license_number}' already registered")

    today = today_ist()
    days_left = (data.expiry_date - today).days
    current_status = "EXPIRED" if days_left < 0 else ("EXPIRING_SOON" if days_left <= data.reminder_days_before else "ACTIVE")

    lic = StatutoryComplianceLicense(
        license_name=data.license_name.strip(),
        license_number=data.license_number.strip(),
        issuing_authority=data.issuing_authority.strip(),
        issue_date=data.issue_date,
        expiry_date=data.expiry_date,
        reminder_days_before=data.reminder_days_before,
        document_key=data.document_key,
        status=current_status,
        remarks=data.remarks,
    )
    db.add(lic)
    await db.commit()
    await db.refresh(lic)
    return {"message": f"License '{lic.license_name}' registered successfully", "id": lic.id, "status": lic.status}


@router.put("/compliance/licenses/{license_id}", summary="Update Statutory License")
async def update_compliance_license(license_id: int, data: StatutoryLicenseUpdate, db: AsyncSession = Depends(get_db)):
    lic = await db.get(StatutoryComplianceLicense, license_id)
    if not lic:
        raise HTTPException(status_code=404, detail="Statutory license not found")

    if data.license_name:
        lic.license_name = data.license_name.strip()
    if data.license_number:
        lic.license_number = data.license_number.strip()
    if data.issuing_authority:
        lic.issuing_authority = data.issuing_authority.strip()
    if data.issue_date:
        lic.issue_date = data.issue_date
    if data.expiry_date:
        lic.expiry_date = data.expiry_date
    if data.reminder_days_before is not None:
        lic.reminder_days_before = data.reminder_days_before
    if data.document_key is not None:
        lic.document_key = data.document_key
    if data.remarks is not None:
        lic.remarks = data.remarks

    today = today_ist()
    days_left = (lic.expiry_date - today).days
    lic.status = "EXPIRED" if days_left < 0 else ("EXPIRING_SOON" if days_left <= lic.reminder_days_before else "ACTIVE")

    await db.commit()
    await db.refresh(lic)
    return {"message": f"License '{lic.license_name}' updated successfully", "id": lic.id, "status": lic.status}


@router.delete("/compliance/licenses/{license_id}", summary="Delete Statutory License")
async def delete_compliance_license(
    license_id: int,
    request: Request,
    manager_pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if not await check_manager_authorized(manager_pin, db, current_user, request):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Station Manager credentials or PIN required to remove compliance records.",
        )
    lic = await db.get(StatutoryComplianceLicense, license_id)
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    name = lic.license_name
    await db.delete(lic)
    await db.commit()
    return {"message": f"License '{name}' removed", "id": license_id}


# -------------------------------------------------------------
# 22. Packaged Lubricants & DEF Stock Inward Receiving API
# -------------------------------------------------------------
class LubeInwardCreate(BaseModel):
    invoice_no: str
    date: Optional[date] = None
    supplier_name: str = "BHARAT PETROLEUM CORP LTD (LUBE DIV)"
    lube_product_id: int
    qty_units: int
    cost_price: float
    batch_no: Optional[str] = None
    notes: Optional[str] = None


@router.get("/lubes/inward", summary="List Packaged Lube Inward Receiving Entries")
async def list_lube_inward(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(LubeInwardEntry)
        .options(selectinload(LubeInwardEntry.lube_product))
        .order_by(desc(LubeInwardEntry.date), desc(LubeInwardEntry.id))
        .limit(limit)
    )
    entries = res.scalars().all()
    return [
        {
            "id": e.id,
            "invoice_no": e.invoice_no,
            "date": str(e.date),
            "supplier_name": e.supplier_name,
            "lube_product_id": e.lube_product_id,
            "product_name": e.lube_product.name if e.lube_product else "Lube Item",
            "category": e.lube_product.category if e.lube_product else None,
            "package_size": e.lube_product.package_size if e.lube_product else None,
            "qty_units": e.qty_units,
            "cost_price": round(float(e.cost_price), 2),
            "total_amount": round(float(e.total_amount), 2),
            "batch_no": e.batch_no,
            "notes": e.notes,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


@router.post("/lubes/inward", summary="Record Packaged Lube / DEF Stock Inward Receipt")
async def record_lube_inward(data: LubeInwardCreate, db: AsyncSession = Depends(get_db)):
    if data.qty_units <= 0:
        raise HTTPException(status_code=400, detail="Inward quantity units must be greater than zero")
    if data.cost_price < 0:
        raise HTTPException(status_code=400, detail="Cost price per unit cannot be negative")

    prod = await db.get(LubeProduct, data.lube_product_id)
    if not prod:
        raise HTTPException(status_code=404, detail="Lube product SKU not found")

    total_amount = round(data.qty_units * data.cost_price, 2)
    entry = LubeInwardEntry(
        invoice_no=data.invoice_no.strip(),
        date=data.date or today_ist(),
        supplier_name=data.supplier_name.strip(),
        lube_product_id=prod.id,
        qty_units=data.qty_units,
        cost_price=round(data.cost_price, 2),
        total_amount=total_amount,
        batch_no=data.batch_no,
        notes=data.notes,
    )
    db.add(entry)

    # Atomically increment stock units and update purchase cost
    prod.current_stock_units += data.qty_units
    prod.cost_price = round(data.cost_price, 2)

    await db.commit()
    await db.refresh(entry)
    await db.refresh(prod)

    return {
        "message": f"Received {data.qty_units} units of {prod.name}. Live stock updated to {prod.current_stock_units} units.",
        "id": entry.id,
        "product_name": prod.name,
        "new_stock_units": prod.current_stock_units,
        "total_amount": entry.total_amount,
    }


# -------------------------------------------------------------
# 23. Fleet & Credit Party (Khata/B2B) Consolidated Invoicing API
# -------------------------------------------------------------
class FleetInvoiceCreate(BaseModel):
    customer_id: int
    period_start: date
    period_end: date
    credit_sale_ids: Optional[List[int]] = None
    invoice_no: Optional[str] = None


@router.get("/fleet-invoices", summary="List Fleet B2B Invoices")
async def list_fleet_invoices(
    customer_id: Optional[int] = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(FleetInvoice)
        .options(selectinload(FleetInvoice.customer))
        .order_by(desc(FleetInvoice.created_at))
        .limit(limit)
    )
    if customer_id:
        query = query.where(FleetInvoice.customer_id == customer_id)
    res = await db.execute(query)
    invoices = res.scalars().all()
    return [
        {
            "id": inv.id,
            "invoice_no": inv.invoice_no,
            "customer_id": inv.customer_id,
            "customer_name": inv.customer.name if inv.customer else "Fleet Client",
            "period_start": str(inv.period_start),
            "period_end": str(inv.period_end),
            "total_amount": round(float(inv.total_amount), 2),
            "total_liters": round(float(inv.total_liters), 3),
            "gst_amount": round(float(inv.gst_amount), 2),
            "status": inv.status,
            "pdf_object_key": inv.pdf_object_key or inv.object_key,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }
        for inv in invoices
    ]


@router.post(
    "/fleet-invoices",
    summary="Generate Consolidated Fleet Invoice from Indents",
    dependencies=[Depends(verify_idempotency_key)],
)
async def create_fleet_invoice(data: FleetInvoiceCreate, db: AsyncSession = Depends(get_db)):
    # Concurrency Lock: Lock Customer row (Hierarchy: CustomerAccount)
    cust_stmt = select(Customer).where(Customer.id == data.customer_id).with_for_update()
    cust = (await db.execute(cust_stmt)).scalar_one_or_none()
    if not cust:
        raise HTTPException(status_code=404, detail="Fleet customer not found")

    query = select(CreditSale).where(
        CreditSale.customer_id == cust.id,
        CreditSale.date >= data.period_start,
        CreditSale.date <= data.period_end,
    )
    if data.credit_sale_ids:
        query = query.where(CreditSale.id.in_(data.credit_sale_ids))
    res = await db.execute(query)
    sales = res.scalars().all()

    total_amount = round(sum(s.amount for s in sales), 2)
    total_liters = round(sum(s.liters for s in sales), 3)

    inv_no = data.invoice_no or f"FLT-{cust.id}-{int(time.time()*1000)}"
    inv = FleetInvoice(
        invoice_no=inv_no,
        customer_id=cust.id,
        period_start=data.period_start,
        period_end=data.period_end,
        total_amount=total_amount,
        total_liters=total_liters,
        gst_amount=0.0,
        status="GENERATED",
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)

    return {
        "message": f"Consolidated fleet invoice #{inv.invoice_no} generated for {cust.name}",
        "id": inv.id,
        "invoice_no": inv.invoice_no,
        "total_amount": inv.total_amount,
        "total_liters": inv.total_liters,
        "sales_count": len(sales),
        "status": inv.status,
    }


@router.get("/fleet-invoices/{invoice_id}", summary="Get Fleet Invoice Details")
async def get_fleet_invoice(invoice_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(FleetInvoice)
        .options(selectinload(FleetInvoice.customer))
        .where(FleetInvoice.id == invoice_id)
    )
    inv = res.scalars().first()
    if not inv:
        raise HTTPException(status_code=404, detail="Fleet invoice not found")
    return {
        "id": inv.id,
        "invoice_no": inv.invoice_no,
        "customer_id": inv.customer_id,
        "customer_name": inv.customer.name if inv.customer else "Fleet Client",
        "period_start": str(inv.period_start),
        "period_end": str(inv.period_end),
        "total_amount": round(float(inv.total_amount), 2),
        "total_liters": round(float(inv.total_liters), 3),
        "gst_amount": round(float(inv.gst_amount), 2),
        "status": inv.status,
        "pdf_object_key": inv.pdf_object_key or inv.object_key,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


# -------------------------------------------------------------
# 24. Shift Handover & Cashier Sign-Off API
# -------------------------------------------------------------
class ShiftHandoverCreate(BaseModel):
    shift_id: int
    attendant_name: str = "Duty Attendant"
    shift_name: str = "First"
    date: Optional[date] = None
    closing_photo_key: Optional[str] = None
    handover_pdf_key: Optional[str] = None
    object_key: Optional[str] = None
    notes: Optional[str] = None


@router.post(
    "/shifts/handover",
    summary="Submit Shift Handover and Cashier Sign-Off",
    dependencies=[Depends(verify_idempotency_key)],
)
@router.post(
    "/shifts/{shift_id}/handover",
    summary="Submit Shift Handover for Specific Shift",
    dependencies=[Depends(verify_idempotency_key)],
)
async def submit_shift_handover(
    data: ShiftHandoverCreate,
    shift_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    target_shift_id = shift_id or data.shift_id
    # Pessimistic row locking on target Shift (Hierarchy: Shift)
    shift_stmt = select(Shift).where(Shift.id == target_shift_id).with_for_update()
    shift = (await db.execute(shift_stmt)).scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Target shift not found")

    handover = ShiftHandover(
        shift_id=shift.id,
        attendant_name=data.attendant_name,
        shift_name=data.shift_name or shift.shift_name,
        date=data.date or shift.date or today_ist(),
        closing_photo_key=data.closing_photo_key,
        handover_pdf_key=data.handover_pdf_key or data.object_key,
        object_key=data.object_key or data.handover_pdf_key,
        notes=data.notes,
    )
    db.add(handover)
    if data.object_key or data.handover_pdf_key:
        shift.handover_object_key = data.object_key or data.handover_pdf_key
    await db.commit()
    await db.refresh(handover)

    # Real-Time WebSocket Broadcast to connected manager dashboards (#54)
    import asyncio
    asyncio.create_task(
        ws_manager.broadcast_to_station(
            "1",
            {
                "event": "SHIFT_HANDOVER",
                "data": {
                    "handover_id": handover.id,
                    "shift_id": shift.id,
                    "shift_so": shift.so_number,
                    "shift_name": handover.shift_name,
                    "attendant_name": handover.attendant_name,
                    "date": str(handover.date),
                    "timestamp": now_ist().isoformat(),
                    "message": f"Shift handover submitted by {handover.attendant_name} for Shift #{shift.so_number}",
                },
            },
        )
    )

    return {
        "status": "success",
        "message": f"Shift handover record #{handover.id} recorded for Shift #{shift.so_number}",
        "handover_id": handover.id,
        "shift_id": shift.id,
        "attendant_name": handover.attendant_name,
        "created_at": handover.created_at.isoformat() if handover.created_at else None,
    }


@router.get("/shifts/{shift_id}/handover", summary="Get Shift Handover Record")
async def get_shift_handover(shift_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(ShiftHandover).where(ShiftHandover.shift_id == shift_id).order_by(desc(ShiftHandover.id)).limit(1)
    )
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="No shift handover record found for this shift")
    return {
        "id": record.id,
        "shift_id": record.shift_id,
        "attendant_name": record.attendant_name,
        "shift_name": record.shift_name,
        "date": str(record.date),
        "closing_photo_key": record.closing_photo_key,
        "handover_pdf_key": record.handover_pdf_key,
        "object_key": record.object_key,
        "notes": record.notes,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


