from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.core.config import settings
from app.db.base import Base

engine_kwargs = {
    "echo": settings.DB_ECHO,
    "pool_pre_ping": True,
}
if not settings.SQLALCHEMY_DATABASE_URI.startswith("sqlite"):
    engine_kwargs["pool_size"] = settings.DB_POOL_SIZE
    engine_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW
    engine_kwargs["pool_timeout"] = settings.DB_POOL_TIMEOUT

engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    **engine_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    # Auto-create tables on startup (convenient for initial setup and prototyping)
    from sqlmodel import SQLModel
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(SQLModel.metadata.create_all)

        # Idempotent column migrations for existing PostgreSQL tables
        from sqlalchemy import text
        migrations = [
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS remarks TEXT",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_tanker BOOLEAN DEFAULT FALSE",
            "ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS is_cheque_bounced BOOLEAN DEFAULT FALSE",
            "ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS receiving_account VARCHAR(100)",
            "ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS customer_balance_after DOUBLE PRECISION DEFAULT 0.0",
            "ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS discount_percent DOUBLE PRECISION DEFAULT 0.0",
            "ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION DEFAULT 0.0",
            "ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS cash_paid DOUBLE PRECISION DEFAULT 0.0",
            "ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS remarks TEXT",
            "ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS odometer_km DOUBLE PRECISION",
            "ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100)",
            "ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS driver_mobile VARCHAR(20)",
            "ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS indent_no VARCHAR(50)",
            "ALTER TABLE shift_meter_readings ADD COLUMN IF NOT EXISTS is_rollover BOOLEAN DEFAULT FALSE",
            "ALTER TABLE shift_meter_readings ADD COLUMN IF NOT EXISTS max_meter_digits INTEGER DEFAULT 6",
            "ALTER TABLE shift_meter_readings ADD COLUMN IF NOT EXISTS split_closing_meter DOUBLE PRECISION",
            "ALTER TABLE shift_meter_readings ADD COLUMN IF NOT EXISTS split_rate DOUBLE PRECISION",
            "ALTER TABLE employees ADD COLUMN IF NOT EXISTS shortage_balance DOUBLE PRECISION DEFAULT 0.0",
            "ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS observed_temp DOUBLE PRECISION DEFAULT 15.0",
            "ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS observed_density DOUBLE PRECISION DEFAULT 0.0",
            "ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS density_15c DOUBLE PRECISION DEFAULT 0.0",
            "ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS invoice_density_15c DOUBLE PRECISION DEFAULT 0.0",
            "ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS density_variance DOUBLE PRECISION DEFAULT 0.0",
            "ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS density_status VARCHAR(50) DEFAULT 'PASSED'",
            "ALTER TABLE tank_dip_entries ADD COLUMN IF NOT EXISTS observed_density NUMERIC(12, 3)",
            "ALTER TABLE tank_dip_entries ADD COLUMN IF NOT EXISTS observed_temp NUMERIC(12, 3)",
            "ALTER TABLE tank_dip_entries ADD COLUMN IF NOT EXISTS density_15c NUMERIC(12, 3)",
            # Shift Immutability & Supervisor Reversal Vouchers Table
            """
            CREATE TABLE IF NOT EXISTS supervisor_reversal_vouchers (
                id SERIAL PRIMARY KEY,
                voucher_no VARCHAR(50) UNIQUE NOT NULL,
                shift_id INTEGER NOT NULL REFERENCES shifts(id),
                date DATE NOT NULL,
                reversal_type VARCHAR(50) DEFAULT 'SHIFT_REOPEN',
                reason TEXT NOT NULL,
                authorized_by VARCHAR(100) DEFAULT 'Station Manager',
                manager_pin VARCHAR(20) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
            """,
            # DECIMAL(12, 3) Liters & DECIMAL(12, 2) Currency Hardening (PostgreSQL)
            "ALTER TABLE credit_sales ALTER COLUMN qty TYPE NUMERIC(12, 3)",
            "ALTER TABLE credit_sales ALTER COLUMN rate TYPE NUMERIC(12, 2)",
            "ALTER TABLE credit_sales ALTER COLUMN amount TYPE NUMERIC(12, 2)",
            "ALTER TABLE credit_sales ALTER COLUMN credit_amount TYPE NUMERIC(12, 2)",
            "ALTER TABLE credit_sales ALTER COLUMN discount_percent TYPE NUMERIC(12, 2)",
            "ALTER TABLE credit_sales ALTER COLUMN discount_amount TYPE NUMERIC(12, 2)",
            "ALTER TABLE credit_sales ALTER COLUMN cash_paid TYPE NUMERIC(12, 2)",
            "ALTER TABLE credit_sales ALTER COLUMN customer_balance_after TYPE NUMERIC(12, 2)",
            "ALTER TABLE credit_sales ALTER COLUMN odometer_km TYPE NUMERIC(12, 3)",
            "ALTER TABLE shift_meter_readings ALTER COLUMN opening_meter TYPE NUMERIC(12, 3)",
            "ALTER TABLE shift_meter_readings ALTER COLUMN closing_meter TYPE NUMERIC(12, 3)",
            "ALTER TABLE shift_meter_readings ALTER COLUMN testing_qty TYPE NUMERIC(12, 3)",
            "ALTER TABLE shift_meter_readings ALTER COLUMN sale_qty TYPE NUMERIC(12, 3)",
            "ALTER TABLE shift_meter_readings ALTER COLUMN rate TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_meter_readings ALTER COLUMN total_amount TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_meter_readings ALTER COLUMN vat_amount TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_meter_readings ALTER COLUMN lube_amount TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_meter_readings ALTER COLUMN split_closing_meter TYPE NUMERIC(12, 3)",
            "ALTER TABLE shift_meter_readings ALTER COLUMN split_rate TYPE NUMERIC(12, 2)",
            "ALTER TABLE tanks ALTER COLUMN capacity_liters TYPE NUMERIC(12, 3)",
            "ALTER TABLE tanks ALTER COLUMN current_stock TYPE NUMERIC(12, 3)",
            "ALTER TABLE tanks ALTER COLUMN current_dip_cm TYPE NUMERIC(12, 3)",
            "ALTER TABLE tanks ALTER COLUMN min_alert_level TYPE NUMERIC(12, 3)",
            "ALTER TABLE nozzles ALTER COLUMN current_meter TYPE NUMERIC(12, 3)",
            "ALTER TABLE customers ALTER COLUMN credit_limit TYPE NUMERIC(12, 2)",
            "ALTER TABLE customers ALTER COLUMN current_outstanding TYPE NUMERIC(12, 2)",
            "ALTER TABLE employees ALTER COLUMN shortage_balance TYPE NUMERIC(12, 2)",
            "ALTER TABLE shifts ALTER COLUMN total_sale_amount TYPE NUMERIC(12, 2)",
            "ALTER TABLE shifts ALTER COLUMN total_cash TYPE NUMERIC(12, 2)",
            "ALTER TABLE shifts ALTER COLUMN total_credit TYPE NUMERIC(12, 2)",
            "ALTER TABLE shifts ALTER COLUMN total_digital TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_settlements ALTER COLUMN cash_total TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_settlements ALTER COLUMN digital_total TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_settlements ALTER COLUMN credit_total TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_settlements ALTER COLUMN expense_total TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_settlements ALTER COLUMN expected_cash TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_settlements ALTER COLUMN actual_cash TYPE NUMERIC(12, 2)",
            "ALTER TABLE shift_settlements ALTER COLUMN gap_amount TYPE NUMERIC(12, 2)",
            "ALTER TABLE bank_accounts ALTER COLUMN balance TYPE NUMERIC(12, 2)",
            "ALTER TABLE fuel_products ALTER COLUMN current_rate TYPE NUMERIC(12, 2)",
            "ALTER TABLE fuel_products ALTER COLUMN vat_percent TYPE NUMERIC(12, 2)",
            "ALTER TABLE fuel_products ALTER COLUMN cess_percent TYPE NUMERIC(12, 2)",
            "ALTER TABLE fuel_products ALTER COLUMN density_standard TYPE NUMERIC(12, 3)",
            "ALTER TABLE tank_calibration_charts ALTER COLUMN dip_cm TYPE NUMERIC(12, 3)",
            "ALTER TABLE tank_calibration_charts ALTER COLUMN volume_liters TYPE NUMERIC(12, 3)",
            "ALTER TABLE nozzle_meter_replacements ALTER COLUMN old_final_meter TYPE NUMERIC(12, 3)",
            "ALTER TABLE nozzle_meter_replacements ALTER COLUMN new_initial_meter TYPE NUMERIC(12, 3)",
            "ALTER TABLE employee_shortage_ledgers ALTER COLUMN amount TYPE NUMERIC(12, 2)",
            "ALTER TABLE lube_products ALTER COLUMN mrp TYPE NUMERIC(12, 2)",
            "ALTER TABLE lube_products ALTER COLUMN sale_price TYPE NUMERIC(12, 2)",
            "ALTER TABLE lube_products ALTER COLUMN cost_price TYPE NUMERIC(12, 2)",
            "ALTER TABLE lube_sale_entries ALTER COLUMN rate TYPE NUMERIC(12, 2)",
            "ALTER TABLE lube_sale_entries ALTER COLUMN total_amount TYPE NUMERIC(12, 2)",
            # 5-Year High Volume B-Tree Composite Indexes
            "CREATE INDEX IF NOT EXISTS idx_credit_sales_customer_date ON credit_sales (customer_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_shift_meter_nozzle_shift ON shift_meter_readings (nozzle_id, shift_id)",
            "CREATE INDEX IF NOT EXISTS idx_payment_receipts_customer_date ON payment_receipts (customer_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_tank_dips_tank_date ON tank_dip_entries (tank_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_shifts_date_status ON shifts (date, status)",
            "CREATE INDEX IF NOT EXISTS idx_decentro_txn_id_created ON decentro_transactions (decentro_txn_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_decentro_utr ON decentro_transactions (bank_reference_number)",
        ]
        for query in migrations:
            try:
                await conn.execute(text(query))
            except Exception as e:
                # Idempotent pass if already executed or column in progress
                pass

    # Seed initial petrol pump data if empty
    from app.db.seed import seed_initial_data
    async with AsyncSessionLocal() as session:
        try:
            await seed_initial_data(session)
        except Exception as exc:
            print(f"Seed note: {exc}")
