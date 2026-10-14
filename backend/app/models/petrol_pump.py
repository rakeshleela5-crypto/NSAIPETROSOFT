from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class FuelProduct(Base):
    __tablename__ = "fuel_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), default="Ltr")
    current_rate: Mapped[float] = mapped_column(Float, default=0.0)
    vat_percent: Mapped[float] = mapped_column(Float, default=0.0)
    cess_percent: Mapped[float] = mapped_column(Float, default=0.0)
    density_standard: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    tanks = relationship("Tank", back_populates="product")
    nozzles = relationship("Nozzle", back_populates="product")
    rates = relationship("RateHistory", back_populates="product")


class RateHistory(Base):
    __tablename__ = "rate_histories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("fuel_products.id"), nullable=False)
    rate: Mapped[float] = mapped_column(Float, nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    product = relationship("FuelProduct", back_populates="rates")


class Tank(Base):
    __tablename__ = "tanks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tank_name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("fuel_products.id"), nullable=False)
    capacity_liters: Mapped[float] = mapped_column(Float, default=20000.0)
    current_stock: Mapped[float] = mapped_column(Float, default=0.0)
    current_dip_cm: Mapped[float] = mapped_column(Float, default=0.0)
    min_alert_level: Mapped[float] = mapped_column(Float, default=3000.0)

    product = relationship("FuelProduct", back_populates="tanks")
    nozzles = relationship("Nozzle", back_populates="tank")
    dip_entries = relationship("TankDipEntry", back_populates="tank")


class Nozzle(Base):
    __tablename__ = "nozzles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nozzle_name: Mapped[str] = mapped_column(String(50), nullable=False)
    machine_name: Mapped[str] = mapped_column(String(50), nullable=False, default="MPD 1")
    tank_id: Mapped[int] = mapped_column(Integer, ForeignKey("tanks.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("fuel_products.id"), nullable=False)
    current_meter: Mapped[float] = mapped_column(Float, default=0.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    tank = relationship("Tank", back_populates="nozzles")
    product = relationship("FuelProduct", back_populates="nozzles")


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="Attendant")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), default="Gujarat")
    gst_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    pan_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    mobile: Mapped[str] = mapped_column(String(20), nullable=False)
    credit_limit: Mapped[float] = mapped_column(Float, default=0.0)
    current_outstanding: Mapped[float] = mapped_column(Float, default=0.0)
    bill_period: Mapped[str] = mapped_column(String(50), default="30 day")
    is_tanker: Mapped[bool] = mapped_column(Boolean, default=False)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    vehicles = relationship("Vehicle", back_populates="customer", cascade="all, delete-orphan")
    credit_sales = relationship("CreditSale", back_populates="customer")
    payments = relationship("PaymentReceipt", back_populates="customer")


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id"), nullable=False)
    vehicle_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    vehicle_type: Mapped[str] = mapped_column(String(50), default="Truck")

    customer = relationship("Customer", back_populates="vehicles")


class Shift(Base):
    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    so_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    shift_name: Mapped[str] = mapped_column(String(50), default="First")
    status: Mapped[str] = mapped_column(String(20), default="Open")
    total_sale_amount: Mapped[float] = mapped_column(Float, default=0.0)
    total_cash: Mapped[float] = mapped_column(Float, default=0.0)
    total_credit: Mapped[float] = mapped_column(Float, default=0.0)
    total_digital: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    meter_readings = relationship("ShiftMeterReading", back_populates="shift", cascade="all, delete-orphan")
    credit_sales = relationship("CreditSale", back_populates="shift")
    expenses = relationship("Expense", back_populates="shift")
    settlement = relationship("ShiftSettlement", back_populates="shift", uselist=False)


class ShiftMeterReading(Base):
    __tablename__ = "shift_meter_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shift_id: Mapped[int] = mapped_column(Integer, ForeignKey("shifts.id"), nullable=False)
    nozzle_id: Mapped[int] = mapped_column(Integer, ForeignKey("nozzles.id"), nullable=False)
    employee_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("employees.id"), nullable=True)
    opening_meter: Mapped[float] = mapped_column(Float, default=0.0)
    closing_meter: Mapped[float] = mapped_column(Float, default=0.0)
    testing_qty: Mapped[float] = mapped_column(Float, default=0.0)
    sale_qty: Mapped[float] = mapped_column(Float, default=0.0)
    rate: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    vat_amount: Mapped[float] = mapped_column(Float, default=0.0)
    lube_amount: Mapped[float] = mapped_column(Float, default=0.0)

    shift = relationship("Shift", back_populates="meter_readings")
    nozzle = relationship("Nozzle")
    employee = relationship("Employee")


class CreditSale(Base):
    __tablename__ = "credit_sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shift_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("shifts.id"), nullable=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id"), nullable=False)
    vehicle_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("vehicles.id"), nullable=True)
    vehicle_no: Mapped[str] = mapped_column(String(50), nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("fuel_products.id"), nullable=False)
    nozzle_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("nozzles.id"), nullable=True)
    slip_no: Mapped[str] = mapped_column(String(50), default="0")
    bill_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    rate: Mapped[float] = mapped_column(Float, nullable=False)
    qty: Mapped[float] = mapped_column(Float, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    discount_percent: Mapped[float] = mapped_column(Float, default=0.0)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0)
    cash_paid: Mapped[float] = mapped_column(Float, default=0.0)
    credit_amount: Mapped[float] = mapped_column(Float, nullable=False)
    customer_balance_after: Mapped[float] = mapped_column(Float, default=0.0)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    shift = relationship("Shift", back_populates="credit_sales")
    customer = relationship("Customer", back_populates="credit_sales")
    product = relationship("FuelProduct")
    vehicle = relationship("Vehicle")
    nozzle = relationship("Nozzle")


class PaymentReceipt(Base):
    __tablename__ = "payment_receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    receipt_no: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id"), nullable=False)
    shift_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("shifts.id"), nullable=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    payment_mode: Mapped[str] = mapped_column(String(50), default="CASH")
    bank_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    receiving_account: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cheque_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    tcs_percent: Mapped[float] = mapped_column(Float, default=0.0)
    tcs_amount: Mapped[float] = mapped_column(Float, default=0.0)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_cheque_bounced: Mapped[bool] = mapped_column(Boolean, default=False)

    customer = relationship("Customer", back_populates="payments")


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shift_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("shifts.id"), nullable=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    narration: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    paid_to: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    shift = relationship("Shift", back_populates="expenses")


class ShiftSettlement(Base):
    __tablename__ = "shift_settlements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shift_id: Mapped[int] = mapped_column(Integer, ForeignKey("shifts.id"), nullable=False, unique=True)
    employee_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("employees.id"), nullable=True)
    denomination_json: Mapped[str] = mapped_column(Text, default="{}")
    cash_total: Mapped[float] = mapped_column(Float, default=0.0)
    digital_total: Mapped[float] = mapped_column(Float, default=0.0)
    credit_total: Mapped[float] = mapped_column(Float, default=0.0)
    expense_total: Mapped[float] = mapped_column(Float, default=0.0)
    expected_cash: Mapped[float] = mapped_column(Float, default=0.0)
    actual_cash: Mapped[float] = mapped_column(Float, default=0.0)
    gap_amount: Mapped[float] = mapped_column(Float, default=0.0)
    settled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    shift = relationship("Shift", back_populates="settlement")
    employee = relationship("Employee")


class TankDipEntry(Base):
    __tablename__ = "tank_dip_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shift_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("shifts.id"), nullable=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    tank_id: Mapped[int] = mapped_column(Integer, ForeignKey("tanks.id"), nullable=False)
    opening_dip: Mapped[float] = mapped_column(Float, default=0.0)
    opening_stock: Mapped[float] = mapped_column(Float, default=0.0)
    receipt_liters: Mapped[float] = mapped_column(Float, default=0.0)
    closing_dip: Mapped[float] = mapped_column(Float, default=0.0)
    closing_stock: Mapped[float] = mapped_column(Float, default=0.0)
    dip_wise_sale: Mapped[float] = mapped_column(Float, default=0.0)
    meter_wise_sale: Mapped[float] = mapped_column(Float, default=0.0)
    variation_liters: Mapped[float] = mapped_column(Float, default=0.0)
    tolerance_limit: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    tank = relationship("Tank", back_populates="dip_entries")


class PurchaseEntry(Base):
    __tablename__ = "purchase_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    invoice_no: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    dealer_name: Mapped[str] = mapped_column(String(150), default="BHARAT PETROLEUM CO LTD")
    tanker_vehicle_no: Mapped[str] = mapped_column(String(50), nullable=False)
    wooden_seals: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    aluminum_seals: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sample_density: Mapped[float] = mapped_column(Float, default=0.0)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("fuel_products.id"), nullable=False)
    tank_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tanks.id"), nullable=True)
    qty_kl: Mapped[float] = mapped_column(Float, default=0.0)
    qty_liters: Mapped[float] = mapped_column(Float, default=0.0)
    rate_per_kl: Mapped[float] = mapped_column(Float, default=0.0)
    gross_amount: Mapped[float] = mapped_column(Float, default=0.0)
    basic_excise: Mapped[float] = mapped_column(Float, default=0.0)
    vat_percent: Mapped[float] = mapped_column(Float, default=0.0)
    vat_amount: Mapped[float] = mapped_column(Float, default=0.0)
    cess_percent: Mapped[float] = mapped_column(Float, default=0.0)
    cess_amount: Mapped[float] = mapped_column(Float, default=0.0)
    tcs_amount: Mapped[float] = mapped_column(Float, default=0.0)
    freight: Mapped[float] = mapped_column(Float, default=0.0)
    final_amount: Mapped[float] = mapped_column(Float, default=0.0)

    product = relationship("FuelProduct")
    tank = relationship("Tank")


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    account_name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    account_type: Mapped[str] = mapped_column(String(50), default="BANK")
    balance: Mapped[float] = mapped_column(Float, default=0.0)
