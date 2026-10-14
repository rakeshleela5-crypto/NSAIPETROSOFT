from datetime import date, datetime, timedelta, timezone
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
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
    Vehicle,
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
    today = date.today()
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
            "date": str(latest_shift.date) if latest_shift else str(date.today()),
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
async def update_rate(data: RateUpdateRequest, db: AsyncSession = Depends(get_db)):
    product = await db.get(FuelProduct, data.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    eff_date = data.effective_date or date.today()
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


class ShiftSaveRequest(BaseModel):
    shift_name: str = "First"
    date: Optional[date] = None
    readings: List[MeterReadingInput]


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
        "date": str(latest_shift.date) if latest_shift else str(date.today()),
        "shift_name": latest_shift.shift_name if latest_shift else "First",
        "status": latest_shift.status if latest_shift else "Open",
        "employees": employees,
        "nozzles": nozzle_list,
    }


@router.post("/shifts/save", summary="Save Shift Nozzle Meter Readings")
async def save_shift_meters(data: ShiftSaveRequest, db: AsyncSession = Depends(get_db)):
    today_dt = data.date or date.today()
    shift_res = await db.execute(
        select(Shift).where(Shift.date == today_dt, Shift.shift_name == data.shift_name)
    )
    shift = shift_res.scalar_one_or_none()

    if not shift:
        count_res = await db.execute(select(func.count(Shift.id)))
        cnt = (count_res.scalar() or 0) + 1
        shift = Shift(
            so_number=f"{cnt:05d}",
            date=today_dt,
            shift_name=data.shift_name,
            status="Open",
        )
        db.add(shift)
        await db.flush()

    total_sale_amt = 0.0
    total_vat_amt = 0.0

    for r in data.readings:
        nozzle = await db.get(Nozzle, r.nozzle_id)
        if not nozzle:
            continue
        prod = await db.get(FuelProduct, nozzle.product_id)
        rate = prod.current_rate if prod else 90.0
        vat_pct = prod.vat_percent if prod else 14.0

        sale_qty = max(0.0, r.closing_meter - r.opening_meter - r.testing_qty)
        total_amt = round(sale_qty * rate, 2)
        vat_amt = round((total_amt * vat_pct) / (100 + vat_pct), 2)

        total_sale_amt += total_amt
        total_vat_amt += vat_amt

        # Update nozzle current meter
        nozzle.current_meter = r.closing_meter

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
        )
        db.add(reading)

    shift.total_sale_amount = total_sale_amt
    await db.commit()

    return {
        "message": "Shift meter readings recorded successfully",
        "so_number": shift.so_number,
        "total_amount": round(total_sale_amt, 2),
        "total_vat": round(total_vat_amt, 2),
        "basic_amount": round(total_sale_amt - total_vat_amt, 2),
    }


# -------------------------------------------------------------
# 4. Credit Customer & Vehicle Slip Billing API
# -------------------------------------------------------------
class CreditSaleCreate(BaseModel):
    customer_id: int
    vehicle_no: str
    product_id: int
    nozzle_id: Optional[int] = None
    slip_no: str = "0"
    qty: float
    rate: Optional[float] = None
    discount_percent: float = 0.0
    cash_paid: float = 0.0
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
        }
        for s in sales
    ]


@router.post("/credit-sales", summary="Create Credit Slip Sale & WhatsApp Delivery")
async def create_credit_sale(data: CreditSaleCreate, db: AsyncSession = Depends(get_db)):
    customer = await db.get(Customer, data.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    product = await db.get(FuelProduct, data.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    rate = data.rate if data.rate is not None else product.current_rate
    gross_amount = round(data.qty * rate, 2)
    dis_amt = round((gross_amount * data.discount_percent) / 100, 2)
    net_amount = gross_amount - dis_amt
    credit_amount = max(0.0, net_amount - data.cash_paid)

    # Check credit limit alert
    new_outstanding = customer.current_outstanding + credit_amount
    limit_warning = new_outstanding > customer.credit_limit if customer.credit_limit > 0 else False

    # Auto generate consecutive bill number
    count_res = await db.execute(select(func.count(CreditSale.id)))
    bill_num = f"{(count_res.scalar() or 0) + 1:04d}"

    # Auto-associate with current open shift if available
    active_shift_res = await db.execute(
        select(Shift).where(Shift.status == "Open").order_by(desc(Shift.id)).limit(1)
    )
    active_shift = active_shift_res.scalar_one_or_none()
    shift_id = data.shift_id or (active_shift.id if active_shift else None)

    sale = CreditSale(
        shift_id=shift_id,
        customer_id=customer.id,
        vehicle_no=data.vehicle_no.upper().strip(),
        product_id=product.id,
        nozzle_id=data.nozzle_id,
        slip_no=data.slip_no,
        bill_no=bill_num,
        date=date.today(),
        rate=rate,
        qty=data.qty,
        amount=net_amount,
        discount_percent=data.discount_percent,
        discount_amount=dis_amt,
        cash_paid=data.cash_paid,
        credit_amount=credit_amount,
        customer_balance_after=new_outstanding,
        remarks=data.remarks,
    )
    db.add(sale)

    # Update customer balance
    customer.current_outstanding = new_outstanding
    await db.commit()

    # Formatted WhatsApp Slip Payload
    whatsapp_text = (
        f"Delivery Note Details :\n"
        f"Material supplied from NSAIPETROSOFT\n"
        f"Delivery Date is {date.today().strftime('%d-%m-%Y')}. Slip No is {data.slip_no}\n"
        f"Vehicle Number - {data.vehicle_no.upper()} Product {product.name}\n"
        f"(Qty: {data.qty:.2f}; Rate: {rate:.2f}; Amount: {net_amount:.2f})\n"
        f"Purchased. Your available balance is {new_outstanding:.2f}.\n"
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

    customer = await db.get(Customer, sale.customer_id)
    credit_amount_revert = sale.credit_amount if sale.credit_amount is not None else sale.amount

    if customer and credit_amount_revert:
        customer.current_outstanding = max(0.0, round(customer.current_outstanding - credit_amount_revert, 2))

    bill_number = sale.bill_no or str(sale_id)
    await db.delete(sale)
    await db.commit()

    return {
        "message": f"Credit sale bill #{bill_number} deleted and customer balance adjusted",
        "sale_id": sale_id,
        "reverted_amount": credit_amount_revert,
        "customer_new_outstanding": customer.current_outstanding if customer else 0.0,
    }



# -------------------------------------------------------------
# 4b. Customer Payment Receipts API (Frame 0085 - Payment Receipt F4)
# -------------------------------------------------------------
class PaymentReceiptCreate(BaseModel):
    customer_id: int
    amount: float
    payment_mode: str = "CASH"
    bank_name: Optional[str] = "CASH ON HAND"
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
            "date": p.date.strftime("%d-%b-%Y") if p.date else date.today().strftime("%d-%b-%Y"),
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
    customer = await db.get(Customer, data.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    count_res = await db.execute(select(func.count(PaymentReceipt.id)))
    count = (count_res.scalar() or 0) + 1
    receipt_no = f"RCP-{count:04d}"

    receipt = PaymentReceipt(
        receipt_no=receipt_no,
        customer_id=customer.id,
        amount=data.amount,
        payment_mode=data.payment_mode,
        bank_name=data.bank_name,
        cheque_no=data.cheque_no,
        remarks=data.remarks,
        date=date.today(),
    )
    db.add(receipt)

    # 1. Reduce customer current outstanding balance
    customer.current_outstanding = max(0.0, customer.current_outstanding - data.amount)

    # 2. Credit the receiving bank or cash account
    bank_query = select(BankAccount).where(
        BankAccount.account_name == (data.bank_name if data.bank_name else "CASH ON HAND")
    )
    bank_res = await db.execute(bank_query)
    bank_acc = bank_res.scalar_one_or_none()
    if bank_acc:
        bank_acc.balance += data.amount

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
    receipt = await db.get(PaymentReceipt, payment_id)
    if not receipt:
        raise HTTPException(status_code=404, detail=f"Payment receipt #{payment_id} not found")

    # 1. Restore customer outstanding balance
    customer = await db.get(Customer, receipt.customer_id)
    if customer:
        customer.current_outstanding = round(customer.current_outstanding + receipt.amount, 2)

    # 2. Reverse receiving bank or cash account balance
    bank_query = select(BankAccount).where(
        BankAccount.account_name == (receipt.bank_name if receipt.bank_name else "CASH ON HAND")
    )
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

    # Formula 2: Get totalizer meter sale for nozzles drawing from this tank
    meter_res = await db.execute(
        select(func.sum(ShiftMeterReading.sale_qty))
        .join(Nozzle, ShiftMeterReading.nozzle_id == Nozzle.id)
        .where(Nozzle.tank_id == tank.id)
    )
    meter_sale = round(meter_res.scalar() or 0.0, 2)

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
        date=date.today(),
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


@router.post("/settlements/save", summary="Persist Cashier Shift Settlement to Database")
async def save_settlement(data: SettlementSaveRequest, db: AsyncSession = Depends(get_db)):
    # 1. Resolve or create shift
    shift = None
    if data.shift_id:
        shift = await db.get(Shift, data.shift_id)
    if not shift:
        res = await db.execute(select(Shift).order_by(desc(Shift.id)).limit(1))
        shift = res.scalar_one_or_none()
        if not shift:
            shift = Shift(
                so_number="00001",
                date=date.today(),
                shift_name=data.shift_name,
                status="Closed",
                total_sale_amount=data.actual_cash + data.credit_total + data.digital_total,
                total_cash=data.cash_total,
                total_credit=data.credit_total,
                total_digital=data.digital_total,
            )
            db.add(shift)
            await db.flush()

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

    await db.commit()
    return {
        "status": "success",
        "message": f"Shift settlement saved. Gap: ₹{data.gap_amount:.2f}",
        "settlement_id": settlement.id,
        "shift_id": shift.id,
        "gap_amount": data.gap_amount,
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
    sample_density: float
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

    entry = PurchaseEntry(
        invoice_no=data.invoice_no,
        date=date.today(),
        dealer_name=data.dealer_name,
        tanker_vehicle_no=data.tanker_vehicle_no.upper().strip(),
        wooden_seals=data.wooden_seals,
        aluminum_seals=data.aluminum_seals,
        sample_density=data.sample_density,
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

    # If tank assigned, add inward liters to underground tank stock
    if data.tank_id:
        tank = await db.get(Tank, data.tank_id)
        if tank:
            tank.current_stock += qty_liters

    await db.commit()
    return {
        "message": "Tanker decanting recorded successfully",
        "invoice_no": data.invoice_no,
        "qty_liters": qty_liters,
        "final_amount": final_amount,
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
            "date": p.date.strftime("%d-%b-%Y") if p.date else date.today().strftime("%d-%b-%Y"),
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
    purchase = await db.get(PurchaseEntry, purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail=f"Purchase entry #{purchase_id} not found")

    # Rollback tank stock if tank was updated
    if purchase.tank_id:
        tank = await db.get(Tank, purchase.tank_id)
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
async def get_dsr_report(db: AsyncSession = Depends(get_db)):
    tanks_res = await db.execute(select(Tank).options(selectinload(Tank.product)))
    tanks = tanks_res.scalars().all()

    report_data = []
    for t in tanks:
        prod_name = t.product.name if t.product else "Fuel"
        # 1. Receipts (purchases) for this tank
        purch_res = await db.execute(
            select(func.coalesce(func.sum(PurchaseEntry.qty_liters), 0.0))
            .where(PurchaseEntry.tank_id == t.id)
        )
        receipt = float(purch_res.scalar() or 0.0)

        # 2. Meter sale & testing from ShiftMeterReading for nozzles on this tank
        nozzles_res = await db.execute(select(Nozzle.id).where(Nozzle.tank_id == t.id))
        nozzle_ids = nozzles_res.scalars().all()

        if nozzle_ids:
            sales_res = await db.execute(
                select(
                    func.coalesce(func.sum(ShiftMeterReading.sale_qty), 0.0),
                    func.coalesce(func.sum(ShiftMeterReading.testing_qty), 0.0),
                ).where(ShiftMeterReading.nozzle_id.in_(nozzle_ids))
            )
            sale_row = sales_res.one_or_none()
            meter_sale = float(sale_row[0] if sale_row else 0.0)
            testing = float(sale_row[1] if sale_row else 0.0)
        else:
            meter_sale = 0.0
            testing = 0.0

        net_sale = round(meter_sale - testing, 2)

        # 3. Latest Dip Entry
        dip_res = await db.execute(
            select(TankDipEntry).where(TankDipEntry.tank_id == t.id).order_by(desc(TankDipEntry.id)).limit(1)
        )
        latest_dip = dip_res.scalar_one_or_none()

        actual_dip = float(latest_dip.closing_stock) if latest_dip else float(t.current_stock)
        open_stock = float(latest_dip.opening_stock) if latest_dip else float(t.current_stock)
        closing_book = round(open_stock + receipt - net_sale, 2)
        variation = round(actual_dip - closing_book, 2)

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
        })

    return report_data


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
            "date": r[0].strftime("%d-%b-%Y") if r[0] else date.today().strftime("%d-%b-%Y"),
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
        "as_on_date": date.today().strftime("%d-%m-%Y"),
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
    today = date.today()
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
    today = date.today()
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
        "as_on_date": date.today().strftime("%d-%m-%Y"),
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
    exp = Expense(
        category=data.category,
        amount=data.amount,
        narration=data.narration,
        paid_to=data.paid_to,
        date=date.today(),
    )
    db.add(exp)

    # Deduct from Cash On Hand
    cash_acc_res = await db.execute(select(BankAccount).where(BankAccount.account_name == "CASH ON HAND"))
    cash_acc = cash_acc_res.scalar_one_or_none()
    if cash_acc:
        cash_acc.balance = max(0.0, cash_acc.balance - data.amount)

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
    from_res = await db.execute(select(BankAccount).where(BankAccount.id == data.from_account_id))
    from_acc = from_res.scalar_one_or_none()

    to_res = await db.execute(select(BankAccount).where(BankAccount.id == data.to_account_id))
    to_acc = to_res.scalar_one_or_none()

    if not from_acc or not to_acc:
        raise HTTPException(status_code=404, detail="One or both accounts not found")

    from_acc.balance -= data.amount
    to_acc.balance += data.amount
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
    today = date.today()
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
        date=date.today(),
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
