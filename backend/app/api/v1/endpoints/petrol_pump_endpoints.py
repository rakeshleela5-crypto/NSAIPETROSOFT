from datetime import date, datetime, timedelta, timezone
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user_optional, require_roles
from app.core.time import today_ist, now_ist
from app.db.session import get_db
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
)

router = APIRouter()


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

    # Sum today's payment receipts
    cash_pay_res = await db.execute(
        select(func.coalesce(func.sum(PaymentReceipt.amount), 0.0))
        .where(PaymentReceipt.date == today, PaymentReceipt.payment_mode == "CASH")
    )
    today_cash_receipts = float(cash_pay_res.scalar() or 0.0)

    digital_pay_res = await db.execute(
        select(func.coalesce(func.sum(PaymentReceipt.amount), 0.0))
        .where(PaymentReceipt.date == today, PaymentReceipt.payment_mode != "CASH")
    )
    today_digital_receipts = float(digital_pay_res.scalar() or 0.0)

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


@router.get("/rates", summary="List Fuel Products and Rates")
async def get_rates(db: AsyncSession = Depends(get_db)):
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

    return {
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


@router.post("/rates", summary="Update Product Rate")
async def update_rate(
    data: RateUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    product = await db.get(FuelProduct, data.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    eff_date = data.effective_date or today_ist()
    product.current_rate = data.rate

    entry = RateHistory(product_id=product.id, rate=data.rate, effective_date=eff_date)
    db.add(entry)
    await db.commit()
    return {"message": "Rate updated successfully", "product": product.name, "new_rate": product.current_rate}


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
    if payload.manager_pin != "1234":
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
        "so_number": latest_shift.so_number if latest_shift else "SO-00018",
        "date": str(latest_shift.date) if latest_shift else str(today_ist()),
        "shift_name": latest_shift.shift_name if latest_shift else "First",
        "status": latest_shift.status if latest_shift else "Open",
        "employees": employees,
        "nozzles": nozzle_list,
    }


@router.post("/shifts/save", summary="Save Shift Nozzle Meter Readings")
async def save_shift_meters(data: ShiftSaveRequest, db: AsyncSession = Depends(get_db)):
    today_dt = data.date or today_ist()
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
        if data.supervisor_pin != "1234":
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
    await db.execute(delete(ShiftMeterReading).where(ShiftMeterReading.shift_id == shift.id))

    total_sale_amt = 0.0
    total_vat_amt = 0.0

    for r in data.readings:
        nozzle_stmt = select(Nozzle).where(Nozzle.id == r.nozzle_id).with_for_update()
        nozzle_res = await db.execute(nozzle_stmt)
        nozzle = nozzle_res.scalar_one_or_none()
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

        # Atomically deduct tank stock
        if nozzle.tank_id and sale_qty > 0:
            tank_stmt = select(Tank).where(Tank.id == nozzle.tank_id).with_for_update()
            tank_res = await db.execute(tank_stmt)
            tank = tank_res.scalar_one_or_none()
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


@router.post("/shifts/{shift_id}/close", summary="Finalize & Close Shift (Enforce Immutability)")
async def close_shift_endpoint(
    shift_id: int,
    payload: ShiftCloseRequest = ShiftCloseRequest(),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Shift).where(Shift.id == shift_id).with_for_update()
    res = await db.execute(stmt)
    shift = res.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift.status = "Closed"
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
    if payload.manager_pin != "1234":
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


@router.post("/credit-sales", summary="Create Credit Slip Sale & WhatsApp Delivery")
async def create_credit_sale(data: CreditSaleCreate, db: AsyncSession = Depends(get_db)):
    if data.qty <= 0:
        raise HTTPException(status_code=400, detail="Fuel quantity must be greater than zero")
    if data.cash_paid < 0:
        raise HTTPException(status_code=400, detail="Cash paid cannot be negative")
    if data.discount_percent < 0 or data.discount_percent > 100:
        raise HTTPException(status_code=400, detail="Discount percentage must be between 0 and 100")

    # Concurrency Lock: Lock customer row to guarantee atomic balance update
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

    rate = data.rate if data.rate is not None else product.current_rate
    gross_amount = round(data.qty * rate, 2)
    dis_amt = round((gross_amount * data.discount_percent) / 100, 2)
    net_amount = gross_amount - dis_amt
    credit_amount = max(0.0, round(net_amount - data.cash_paid, 2))

    # Check credit limit alert & strict enforcement
    new_outstanding = round(customer.current_outstanding + credit_amount, 2)
    limit_warning = new_outstanding > customer.credit_limit if customer.credit_limit > 0 else False
    if limit_warning and credit_amount > 0:
        if data.manager_override_pin != "1234":
            raise HTTPException(
                status_code=400,
                detail=f"CREDIT LIMIT EXCEEDED: Customer limit is ₹{customer.credit_limit:,.2f}. Current dues are ₹{customer.current_outstanding:,.2f}, resulting balance would be ₹{new_outstanding:,.2f}. Manager authorization PIN required to proceed.",
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

    # Auto-associate with current open shift if available
    active_shift_res = await db.execute(
        select(Shift).where(Shift.status == "Open").order_by(desc(Shift.id)).limit(1)
    )
    active_shift = active_shift_res.scalar_one_or_none()
    shift_id = data.shift_id or (active_shift.id if active_shift else None)
    if shift_id:
        sh_stmt = select(Shift).where(Shift.id == shift_id).with_for_update()
        sh_res = await db.execute(sh_stmt)
        sh_obj = sh_res.scalar_one_or_none()
        if sh_obj and sh_obj.status in ("Closed", "Settled"):
            if data.manager_override_pin != "1234":
                raise HTTPException(
                    status_code=403,
                    detail="SHIFT IMMUTABILITY ENFORCED: Target shift is finalized and closed. Cannot append credit slip to a closed shift without supervisor authorization PIN.",
                )

    # Optional tank stock atomic deduction
    if data.nozzle_id:
        nozzle = await db.get(Nozzle, data.nozzle_id)
        if nozzle and nozzle.tank_id:
            tank_stmt = select(Tank).where(Tank.id == nozzle.tank_id).with_for_update()
            tank_res = await db.execute(tank_stmt)
            tank = tank_res.scalar_one_or_none()
            if tank:
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
async def delete_credit_sale(sale_id: int, db: AsyncSession = Depends(get_db)):
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


@router.post("/payments", summary="Record Customer Payment Receipt")
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
    receipt_no = f"RCP-{next_id:04d}"

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
async def delete_payment_receipt(payment_id: int, db: AsyncSession = Depends(get_db)):
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


class CardSettlementCreate(BaseModel):
    machine_name: str
    batch_no: str
    slip_count: int
    amount: float


@router.post("/card-settlements", summary="Record EDC POS Terminal Settlement")
async def create_card_settlement(data: CardSettlementCreate, db: AsyncSession = Depends(get_db)):
    bank_query = select(BankAccount).where(
        func.upper(BankAccount.account_name).like(f"%{data.machine_name.upper().strip()}%")
    )
    bank_res = await db.execute(bank_query)
    bank_acc = bank_res.scalar_one_or_none()
    if bank_acc:
        bank_acc.balance += data.amount
        await db.commit()
        return {
            "status": "success",
            "message": f"Batch #{data.batch_no} recorded. ₹{data.amount} credited to {bank_acc.account_name}",
            "new_balance": bank_acc.balance,
        }
    return {
        "status": "success",
        "message": f"Batch #{data.batch_no} recorded for {data.machine_name}",
    }


# -------------------------------------------------------------
# 5. Customer & Vehicle Master API
# -------------------------------------------------------------
class CustomerCreate(BaseModel):
    name: str
    mobile: str
    city: Optional[str] = None
    state: str = "Gujarat"
    address: Optional[str] = None
    gst_no: Optional[str] = None
    pan_no: Optional[str] = None
    credit_limit: float = 0.0
    bill_period: str = "30 day"


class VehicleCreate(BaseModel):
    customer_id: int
    vehicle_no: str
    vehicle_type: str = "Truck"


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
async def create_customer(data: CustomerCreate, db: AsyncSession = Depends(get_db)):
    count_res = await db.execute(select(func.count(Customer.id)))
    code = f"{(count_res.scalar() or 0) + 1}"
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
        bill_period=data.bill_period,
    )
    db.add(cust)
    await db.commit()
    return {"message": "Customer created successfully", "id": cust.id, "code": cust.code, "name": cust.name}


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
    notes: Optional[str] = None


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
            "dip_sale": e.dip_wise_sale,
            "meter_sale": e.meter_wise_sale,
            "variation": e.variation_liters,
            "tolerance_limit": e.tolerance_limit,
        }
        for e in entries
    ]


@router.post("/dips", summary="Record Daily Tank Dip and Calculate Variation")
async def create_tank_dip(data: TankDipCreate, db: AsyncSession = Depends(get_db)):
    tank = await db.get(Tank, data.tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")

    # Formula 1: Dip Wise Sale = Opening Stock + Inward Receipt - Closing Stock
    dip_sale = round(data.opening_stock + data.receipt_liters - data.closing_stock, 2)

    # Formula 2: Get totalizer meter sale for nozzles drawing from this tank for today's shifts
    meter_res = await db.execute(
        select(func.coalesce(func.sum(ShiftMeterReading.sale_qty), 0.0))
        .join(Nozzle, ShiftMeterReading.nozzle_id == Nozzle.id)
        .join(Shift, ShiftMeterReading.shift_id == Shift.id)
        .where(Nozzle.tank_id == tank.id, Shift.date == today_ist())
    )
    meter_sale = round(float(meter_res.scalar() or 0.0), 2)

    # Formula 3: Variation = Physical Dip Sale - Meter Totalizer Sale
    variation = round(dip_sale - meter_sale, 2)

    # Statutory Evaporation limit: 0.59% for Petrol (MS), 0.15% for Diesel (HSD)
    is_petrol = "MS" in tank.tank_name.upper() or "PETROL" in tank.tank_name.upper()
    tolerance_pct = 0.59 if is_petrol else 0.15
    tolerance_limit = round(-1 * (meter_sale * tolerance_pct / 100), 2)

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
        dip_wise_sale=dip_sale,
        meter_wise_sale=meter_sale,
        variation_liters=variation,
        tolerance_limit=tolerance_limit,
        notes=data.notes,
    )
    db.add(entry)
    await db.commit()

    return {
        "message": "Tank dip recorded successfully",
        "tank_name": tank.tank_name,
        "dip_wise_sale": dip_sale,
        "meter_wise_sale": meter_sale,
        "variation_liters": variation,
        "tolerance_limit": tolerance_limit,
        "exceeds_tolerance": variation < tolerance_limit,
    }


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


@router.post("/settlements/save", summary="Persist Cashier Shift Settlement to Database")
async def save_settlement(data: SettlementSaveRequest, db: AsyncSession = Depends(get_db)):
    # 1. Resolve or create shift with row-level lock
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
        if data.supervisor_pin != "1234":
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
        emp = await db.get(Employee, data.employee_id)
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
    if payload.manager_pin != "1234":
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
            if data.manager_override_pin != "1234":
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
async def delete_purchase(purchase_id: int, db: AsyncSession = Depends(get_db)):
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
    target_date = report_date or today_ist()
    tanks_res = await db.execute(select(Tank).options(selectinload(Tank.product)))
    tanks = tanks_res.scalars().all()

    report_data = []
    for t in tanks:
        prod_name = t.product.name if t.product else "Fuel"
        # 1. Receipts (purchases) for this tank on target date
        purch_res = await db.execute(
            select(func.coalesce(func.sum(PurchaseEntry.qty_liters), 0.0))
            .where(PurchaseEntry.tank_id == t.id, PurchaseEntry.date == target_date)
        )
        receipt = float(purch_res.scalar() or 0.0)

        # 2. Meter sale & testing from ShiftMeterReading for nozzles on this tank on target date
        nozzles_res = await db.execute(select(Nozzle.id).where(Nozzle.tank_id == t.id))
        nozzle_ids = nozzles_res.scalars().all()

        if nozzle_ids:
            sales_res = await db.execute(
                select(
                    func.coalesce(func.sum(ShiftMeterReading.sale_qty), 0.0),
                    func.coalesce(func.sum(ShiftMeterReading.testing_qty), 0.0),
                )
                .join(Shift, ShiftMeterReading.shift_id == Shift.id)
                .where(ShiftMeterReading.nozzle_id.in_(nozzle_ids), Shift.date == target_date)
            )
            sale_row = sales_res.one_or_none()
            meter_sale = float(sale_row[0] if sale_row else 0.0)
            testing = float(sale_row[1] if sale_row else 0.0)
        else:
            meter_sale = 0.0
            testing = 0.0

        net_sale = round(meter_sale - testing, 2)

        # 3. Latest Dip Entry on or before target date
        dip_res = await db.execute(
            select(TankDipEntry)
            .where(TankDipEntry.tank_id == t.id, TankDipEntry.date <= target_date)
            .order_by(desc(TankDipEntry.date), desc(TankDipEntry.id))
            .limit(1)
        )
        latest_dip = dip_res.scalar_one_or_none()

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
            "meter_sale": round(meter_sale, 2),
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

        register.append({
            "nozzle_id": n.id,
            "nozzle_name": n.nozzle_name,
            "machine_name": n.machine_name,
            "product": n.product.name if n.product else "Fuel",
            "current_meter": n.current_meter,
            "last_stamping_date": str(last_date),
            "next_stamping_due": str(next_due),
            "days_left": days_left,
            "wm_seal_no": latest_swap.wm_seal_no if latest_swap else "WM-IND-2026-A",
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
            "standard_density": 830.0 if "HSD" in (d.tank.tank_name if d.tank else "") else 745.0,
            "status": "RECORDED",
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

    return {
        "purchase": purch_list,
        "sales": sales_list,
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
        "gst_lube": [],
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
    if cash_acc:
        cash_acc.balance = max(0.0, round(cash_acc.balance - data.amount, 2))

    await db.commit()
    return {"status": "success", "message": f"Expense of ₹{data.amount} recorded"}


@router.delete("/expenses/{expense_id}", summary="Delete Expense & Restore Cash On Hand")
async def delete_expense(expense_id: int, db: AsyncSession = Depends(get_db)):
    exp = await db.get(Expense, expense_id)
    if not exp:
        raise HTTPException(status_code=404, detail=f"Expense #{expense_id} not found")

    # Restore Cash On Hand balance
    cash_acc_res = await db.execute(select(BankAccount).where(BankAccount.account_name == "CASH ON HAND"))
    cash_acc = cash_acc_res.scalar_one_or_none()
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
    await db.commit()

    return {
        "status": "success",
        "message": f"Transferred ₹{data.amount} from {from_acc.account_name} to {to_acc.account_name}",
        "from_balance": from_acc.balance,
        "to_balance": to_acc.balance,
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

    total_purchase = sum(s.amount for s in sales)
    pmt_res = await db.execute(
        select(func.sum(PaymentReceipt.amount)).where(PaymentReceipt.customer_id == customer_id)
    )
    total_paid = pmt_res.scalar() or 0.0
    paid_period = round(float(total_paid), 2)
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
@router.get("/stamping-reminders", summary="Weights & Measures Nozzle Stamping Schedule")
async def get_stamping_reminders(db: AsyncSession = Depends(get_db)):
    nozzles_res = await db.execute(select(Nozzle).options(selectinload(Nozzle.tank)))
    nozzles = nozzles_res.scalars().all()
    today = today_ist()
    next_due_dt = date(today.year + 1, 5, 15) if today.month > 5 else date(today.year, 5, 15)
    last_stamped_dt = date(next_due_dt.year - 1, 5, 15)
    days_rem = (next_due_dt - today).days

    reminders = []
    for n in nozzles:
        reminders.append({
            "nozzle_id": n.id,
            "nozzle_name": n.nozzle_name,
            "tank": n.tank.tank_name if n.tank else "Tank",
            "last_stamped": last_stamped_dt.strftime("%d-%b-%Y"),
            "next_due": next_due_dt.strftime("%d-%b-%Y"),
            "days_remaining": days_rem,
            "status": "VALID",
        })
    if not reminders:
        for i in range(1, 7):
            reminders.append({
                "nozzle_id": i,
                "nozzle_name": f"HSD {i}" if i <= 4 else f"MS {i-4}",
                "tank": "HSD Tank 1" if i <= 4 else "MS Tank 1",
                "last_stamped": last_stamped_dt.strftime("%d-%b-%Y"),
                "next_due": next_due_dt.strftime("%d-%b-%Y"),
                "days_remaining": days_rem,
                "status": "VALID",
            })
    return reminders


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


# -------------------------------------------------------------
# 20. Packaged Lubricants (Lubes / DEF / AdBlue) API
# -------------------------------------------------------------
class LubeProductCreate(BaseModel):
    code: str
    name: str
    category: str = "LUBE_OIL"  # LUBE_OIL, 2T_OIL, DEF_ADBLUE, GREASE, COOLANT
    package_size: str = "1 Ltr"
    barcode: Optional[str] = None
    mrp: float
    sale_price: float
    cost_price: float = 0.0
    current_stock_units: int = 10
    reorder_level: int = 5


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
    stmt = select(LubeProduct).where(LubeProduct.code == payload.code.strip().upper())
    res = await db.execute(stmt)
    lube = res.scalar_one_or_none()
    if not lube:
        lube = LubeProduct(code=payload.code.strip().upper())
        db.add(lube)

    lube.name = payload.name.strip()
    lube.category = payload.category
    lube.package_size = payload.package_size
    lube.barcode = payload.barcode
    lube.mrp = payload.mrp
    lube.sale_price = payload.sale_price
    lube.cost_price = payload.cost_price
    lube.current_stock_units = payload.current_stock_units
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

    # Deduct discrete package units from stock
    lube.current_stock_units -= payload.qty_units

    sale_entry = LubeSaleEntry(
        shift_id=payload.shift_id,
        lube_product_id=lube.id,
        qty_units=payload.qty_units,
        rate=rate,
        total_amount=total_amount,
        date=today_ist(),
        payment_mode=payload.payment_mode,
    )
    db.add(sale_entry)
    await db.commit()

    return {
        "status": "success",
        "message": f"Sold {payload.qty_units} unit(s) of '{lube.name}' for ₹{total_amount:.2f}",
        "remaining_stock_units": lube.current_stock_units,
        "total_amount": total_amount,
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
    manager_pin: Optional[str] = "1234"


@router.get("/station-profile", summary="Get Dealership / Station Profile Settings")
async def get_station_profile_endpoint(db: AsyncSession = Depends(get_db)):
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
    return {
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
        "manager_pin": prof.manager_pin or "1234",
    }


@router.post("/station-profile", summary="Save Dealership / Station Profile Settings")
async def save_station_profile_endpoint(payload: StationProfilePayload, db: AsyncSession = Depends(get_db)):
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
    if payload.manager_pin:
        prof.manager_pin = payload.manager_pin.strip()

    await db.commit()
    await db.refresh(prof)
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
        "manager_pin": prof.manager_pin,
    }


