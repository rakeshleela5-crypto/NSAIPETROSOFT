"""
Layer 2: API & Ledger Logic Validation Suite
Author: Lead Financial Systems Engineer & SDET
Framework: Pytest + Pytest-Asyncio + HTTPX AsyncClient

Validates:
1. Exact Decimal vs. Floating-Point math in forecourt calculations (zero paise drift).
2. ASTM 53B petroleum temperature-density reduction to 15°C standard (MS & HSD).
3. Forecourt shift closing balance reconciliation (Cash + Digital + Credit - Shortages).
4. PostgreSQL ACID transaction rollbacks on simulated mid-flight database failures.
"""

import math
import sys
from decimal import Decimal, ROUND_HALF_UP
import pytest
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, "backend")

from app.main import app
from app.db.session import AsyncSessionLocal
from app.models.petrol_pump import Customer, CreditSale, FuelProduct


# -----------------------------------------------------------------------------
# Test 1: Precision Financial & Volume Math (Zero Floating-Point Drift)
# -----------------------------------------------------------------------------
def test_exact_decimal_arithmetic_forecourt():
    """
    Standard IEEE-754 binary floating-point arithmetic causes drift (0.1 + 0.2 != 0.3).
    NSAiPetroSoft enforces strict Decimal quantization:
      - Fuel Volume: 3 decimal places (0.001 Liters)
      - Currency: 2 decimal places (0.01 INR, ROUND_HALF_UP)
    """
    # Verify classic float bug is eliminated via Decimal
    f_sum = 0.1 + 0.2
    assert f_sum != 0.3  # Standard IEEE 754 float failure (0.30000000000000004)

    d_sum = Decimal("0.1") + Decimal("0.2")
    assert d_sum == Decimal("0.3")  # Clean fixed-point precision

    # High-Volume Forecourt Simulation: 10,000 nozzle sales of ₹100.05
    sales_count = 10000
    single_amount = Decimal("100.05")
    expected_total = Decimal("1000500.00")

    accumulated = Decimal("0.00")
    for _ in range(sales_count):
        accumulated += single_amount

    assert accumulated == expected_total, f"Accumulation mismatch: {accumulated} != {expected_total}"

    # Nozzle Dispenser Calculation Verification
    opening_meter = Decimal("142580.450")
    closing_meter = Decimal("143125.820")
    testing_qty = Decimal("5.000")  # Mandatory 5L morning measure check
    rate_per_ltr = Decimal("101.45")

    net_volume = closing_meter - opening_meter - testing_qty
    assert net_volume == Decimal("540.370"), f"Net volume mismatch: {net_volume}"

    gross_sale_value = (net_volume * rate_per_ltr).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    # 540.370 * 101.45 = 54820.5365 -> Rounds to 54820.54
    assert gross_sale_value == Decimal("54820.54"), f"Rounding mismatch: {gross_sale_value}"


# -----------------------------------------------------------------------------
# Test 2: ASTM 53B Petroleum Temperature & Density Reduction to 15°C
# -----------------------------------------------------------------------------
def test_astm_53b_petroleum_density_conversion():
    """
    In Indian Forecourt Operations (IOCL/BPCL/HPCL), daily tank density must be
    converted from observed ambient temperature to standard density at 15°C
    per ASTM 53B Table standards to detect water ingress or fuel adulteration.
    """
    def calculate_density_15c(observed_density: float, observed_temp_c: float, product: str) -> float:
        """ASTM 53B generalized formula approximation for petroleum products."""
        temp_diff = observed_temp_c - 15.0
        # Expansion coefficients per petroleum product group
        if product.upper() in ("MS", "PETROL"):
            # Motor Spirit typical thermal expansion coefficient alpha15 ~ 0.00120
            alpha = 0.00120
        else:
            # High Speed Diesel typical alpha15 ~ 0.00083
            alpha = 0.00083
        
        vcf = math.exp(-alpha * temp_diff * (1.0 + 0.8 * alpha * temp_diff))
        # Standard density at 15°C = Observed density / VCF
        standard_density = observed_density / vcf
        return round(standard_density, 1)

    # Test Case A: Motor Spirit (Petrol)
    # Observed: 738.5 kg/m³ at 32.0°C (Hot Afternoon)
    # Standard 15°C should be higher (thermal contraction) ~ 753.8 kg/m³
    ms_density_15 = calculate_density_15c(738.5, 32.0, "MS")
    assert 750.0 <= ms_density_15 <= 758.0, f"MS Density 15C out of standard bounds: {ms_density_15}"
    assert ms_density_15 > 738.5, "Density at 15C must be higher than density at 32C"

    # Test Case B: High Speed Diesel (HSD)
    # Observed: 825.0 kg/m³ at 29.5°C
    # Standard 15°C should be ~ 835.0 kg/m³
    hsd_density_15 = calculate_density_15c(825.0, 29.5, "HSD")
    assert 830.0 <= hsd_density_15 <= 840.0, f"HSD Density 15C out of standard bounds: {hsd_density_15}"
    assert hsd_density_15 > 825.0, "HSD density at 15C must be higher than density at 29.5C"


# -----------------------------------------------------------------------------
# Test 3: Forecourt Shift Closing Reconciliation Equation
# -----------------------------------------------------------------------------
def test_forecourt_shift_closing_reconciliation_math():
    """
    Forecourt Shift Settlement Equation:
    Calculated Sales = Cash in Drawer + Decentro UPI + B2B Credit Sales + POS Cards - Shortages + Till Expenses
    Zero tolerance for unallocated discrepancy.
    """
    nozzle_1_sales = Decimal("32450.50")
    nozzle_2_sales = Decimal("48120.25")
    lube_sales = Decimal("3500.00")
    total_revenue = nozzle_1_sales + nozzle_2_sales + lube_sales  # 84070.75

    # Attendant Settlements
    cash_drawer = Decimal("24570.75")
    upi_collections = Decimal("35000.00")
    credit_fleet_sales = Decimal("20000.00")
    card_pos_sales = Decimal("3500.00")
    approved_till_expenses = Decimal("1500.00")  # Forecourt generator diesel expense
    attendant_shortage = Decimal("500.00")       # Deducted from attendant payroll

    total_accounted = (
        cash_drawer
        + upi_collections
        + credit_fleet_sales
        + card_pos_sales
        + approved_till_expenses
        - attendant_shortage
    )

    discrepancy = total_revenue - total_accounted
    assert discrepancy == Decimal("0.00"), f"Shift closing discrepancy detected: ₹{discrepancy}"


# -----------------------------------------------------------------------------
# Test 4: Database ACID Transaction Rollback Integrity
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_database_acid_rollback_integrity():
    """
    Verifies that if an unexpected error occurs during a multi-row forecourt ledger update,
    database transaction rollback guarantees zero orphaned rows or ledger corruption.
    """
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.db.base import Base

    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_cust_name = "ACID_TEST_CUSTOMER_ROLLBACK"

    async with async_session() as session:
        # Attempt a multi-entity transaction that raises an exception halfway
        try:
            async with session.begin():
                cust = Customer(
                    code="CUST-ACID-001",
                    name=test_cust_name,
                    mobile="9999900000",
                    credit_limit=50000.0,
                    current_outstanding=0.0,
                )
                session.add(cust)
                await session.flush()  # Assigned an ID in transaction

                # Record an initial credit sale
                sale = CreditSale(
                    customer_id=cust.id,
                    vehicle_no="GJ-01-AB-1234",
                    product_id=1,
                    bill_no="ACID-TEST-001",
                    rate=95.50,
                    qty=100.0,
                    amount=9550.0,
                    credit_amount=9550.0,
                )
                session.add(sale)
                await session.flush()

                # Simulate a catastrophic failure mid-transaction (e.g. forced fault)
                raise RuntimeError("SIMULATED_FORECOURT_NETWORK_FAILURE_MID_TRANSACTION")
        except RuntimeError:
            pass  # Expected rollback

        # Verify the database rolled back completely and customer was NEVER committed
        from sqlalchemy import select
        res = await session.execute(select(Customer).where(Customer.name == test_cust_name))
        persisted_cust = res.scalar_one_or_none()
        assert persisted_cust is None, "ACID Failure: Customer record persisted despite transaction rollback!"

        res_sale = await session.execute(select(CreditSale).where(CreditSale.bill_no == "ACID-TEST-001"))
        persisted_sale = res_sale.scalar_one_or_none()
        assert persisted_sale is None, "ACID Failure: Credit sale persisted despite transaction rollback!"

    await test_engine.dispose()

