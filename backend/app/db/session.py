from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.core.config import settings
from app.db.base import Base

engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    echo=settings.DB_ECHO,
    pool_pre_ping=True,
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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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
        ]
        for query in migrations:
            try:
                await conn.execute(text(query))
            except Exception as e:
                print(f"Migration note ({query}): {e}")

    # Seed initial petrol pump data if empty
    from app.db.seed import seed_initial_data
    async with AsyncSessionLocal() as session:
        try:
            await seed_initial_data(session)
        except Exception as exc:
            print(f"Seed note: {exc}")
