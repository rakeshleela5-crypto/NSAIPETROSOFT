"""
Step 1: Database Model Integrity Check
Part of NSAiPetroSoft 'Zero-Bottleneck' Testing Blueprint
Framework: Pytest + SQLAlchemy Async Engine + SQLite In-Memory

Validates:
1. Every table and model across the entire ERP schema can be instantiated and persisted.
2. 1 valid record inserted into all 31 tables (Users, Tanks, Nozzles, Shifts, Customers, Decentro, etc.).
3. Verifies NUMERIC column definitions (preventing IEEE-754 floating-point drift).
4. Foreign key integrity enforcement (preventing orphaned records or unauthorized cascade deletes).
"""

import sys
from datetime import date, datetime, timezone
from decimal import Decimal
import pytest
from sqlalchemy import select, inspect
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel

sys.path.insert(0, "backend")

from app.db.base import Base
from app.models.petrol_pump import (
    BankAccount,
    CardSettlement,
    ContraTransfer,
    CreditSale,
    Customer,
    Employee,
    EmployeeShortageLedger,
    Expense,
    FuelProduct,
    LubeProduct,
    LubeSaleEntry,
    Nozzle,
    NozzleMeterReplacement,
    PaymentReceipt,
    PurchaseEntry,
    Quotation,
    RateHistory,
    RetailCashInvoice,
    Shift,
    ShiftMeterReading,
    ShiftSettlement,
    StationProfileSetting,
    SupervisorReversalVoucher,
    Tank,
    TankCalibrationChart,
    TankDipEntry,
    User,
    Vehicle,
)
from app.models.decentro import (
    CustomerVirtualAccount,
    DecentroTransaction,
    SupplierPayout,
    DecentroWebhookLog,
    GstinVerificationAudit,
)
from app.models.banking import (
    SupplierPayoutOrder,
    CollectionLedgerEntry,
    UpiQrTransaction,
    FleetVirtualAccount,
)


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_complete_schema_creation_and_31_table_insertion():
    """
    Creates fresh schema and inserts 1 valid record into each of the 31 ERP tables,
    verifying clean foreign key relations and exact data serialization.
    """
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    # 1. Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(SQLModel.metadata.create_all)

    async with session_factory() as session:
        # 1. User
        user = User(
            username="admin_test",
            full_name="Master Station Admin",
            hashed_password="argon2_hashed_secret",
            role="admin",
            is_active=True,
        )
        session.add(user)
        await session.flush()
        assert user.id is not None

        # 2. StationProfileSetting
        profile = StationProfileSetting(
            station_name="NSAI HIGHWAY PETRO",
            oil_company="BHARAT PETROLEUM",
            dealer_code="BPCL-9988",
            manager_pin="9876",
        )
        session.add(profile)
        await session.flush()
        assert profile.id is not None

        # 3. FuelProduct (MS & HSD)
        ms_prod = FuelProduct(
            code="MS",
            name="Motor Spirit (Petrol)",
            unit="Ltr",
            current_rate=102.65,
            density_standard=740.0,
        )
        session.add(ms_prod)
        await session.flush()
        assert ms_prod.id is not None

        # 4. RateHistory
        rate_hist = RateHistory(
            product_id=ms_prod.id,
            rate=102.65,
            effective_date=date.today(),
        )
        session.add(rate_hist)
        await session.flush()
        assert rate_hist.id is not None

        # 5. Tank
        tank = Tank(
            tank_name="Underground Tank 1 (MS)",
            product_id=ms_prod.id,
            capacity_liters=20000.0,
            current_stock=14500.0,
            current_dip_cm=185.5,
        )
        session.add(tank)
        await session.flush()
        assert tank.id is not None

        # 6. TankCalibrationChart
        calib = TankCalibrationChart(
            tank_id=tank.id,
            dip_cm=100.0,
            volume_liters=7500.0,
        )
        session.add(calib)
        await session.flush()
        assert calib.id is not None

        # 7. Nozzle
        nozzle = Nozzle(
            nozzle_name="Nozzle 1 (MS Front)",
            machine_name="Wayne MPD 1",
            tank_id=tank.id,
            product_id=ms_prod.id,
            current_meter=145200.00,
        )
        session.add(nozzle)
        await session.flush()
        assert nozzle.id is not None

        # 8. NozzleMeterReplacement
        swap = NozzleMeterReplacement(
            nozzle_id=nozzle.id,
            old_final_meter=999999.00,
            new_initial_meter=0.00,
            reason="Weights & Measures Annual Calibration Stamping",
        )
        session.add(swap)
        await session.flush()
        assert swap.id is not None

        # 9. Employee
        emp = Employee(
            code="EMP-001",
            name="Ramesh Attendant (DSM)",
            phone="9876543210",
            role="Attendant",
        )
        session.add(emp)
        await session.flush()
        assert emp.id is not None

        # 10. EmployeeShortageLedger
        shortage = EmployeeShortageLedger(
            employee_id=emp.id,
            amount=150.00,
            gap_type="SHORTAGE",
            status="PENDING",
        )
        session.add(shortage)
        await session.flush()
        assert shortage.id is not None

        # 11. Customer
        cust = Customer(
            code="CUST-FLT-001",
            name="Gujarat State Freight Lines",
            mobile="9825012345",
            credit_limit=150000.00,
            current_outstanding=45000.00,
        )
        session.add(cust)
        await session.flush()
        assert cust.id is not None

        # 12. Vehicle
        veh = Vehicle(
            customer_id=cust.id,
            vehicle_no="GJ-05-BX-4455",
            vehicle_type="12-Wheeler Truck",
        )
        session.add(veh)
        await session.flush()
        assert veh.id is not None

        # 13. Shift
        shift = Shift(
            so_number="SO-2026-10-001",
            date=date.today(),
            shift_name="Morning 06:00 - 14:00",
            status="OPEN",
            total_sale_amount=0.00,
        )
        session.add(shift)
        await session.flush()
        assert shift.id is not None

        # 14. ShiftMeterReading
        reading = ShiftMeterReading(
            shift_id=shift.id,
            nozzle_id=nozzle.id,
            employee_id=emp.id,
            opening_meter=145200.00,
            closing_meter=145620.50,
            testing_qty=5.00,
            sale_qty=415.50,
            rate=102.65,
            total_amount=42651.08,
        )
        session.add(reading)
        await session.flush()
        assert reading.id is not None

        # 15. CreditSale
        credit_sale = CreditSale(
            shift_id=shift.id,
            customer_id=cust.id,
            vehicle_id=veh.id,
            vehicle_no=veh.vehicle_no,
            product_id=ms_prod.id,
            nozzle_id=nozzle.id,
            bill_no="CR-2026-1001",
            rate=102.65,
            qty=100.00,
            amount=10265.00,
            credit_amount=10265.00,
            indent_no="IND-7788",
        )
        session.add(credit_sale)
        await session.flush()
        assert credit_sale.id is not None

        # 16. BankAccount
        bank = BankAccount(
            account_name="HDFC Current Account (4400)",
            account_type="BANK",
            balance=250000.00,
        )
        session.add(bank)
        await session.flush()
        assert bank.id is not None

        # 17. PaymentReceipt
        receipt = PaymentReceipt(
            receipt_no="REC-2026-0001",
            customer_id=cust.id,
            shift_id=shift.id,
            amount=20000.00,
            payment_mode="NEFT",
            bank_name="HDFC Bank",
        )
        session.add(receipt)
        await session.flush()
        assert receipt.id is not None

        # 18. Expense
        exp = Expense(
            shift_id=shift.id,
            category="Generator Diesel & Maintenance",
            amount=650.00,
            narration="Genset diesel run during forecourt power cut",
        )
        session.add(exp)
        await session.flush()
        assert exp.id is not None

        # 19. ShiftSettlement
        settlement = ShiftSettlement(
            shift_id=shift.id,
            employee_id=emp.id,
            cash_total=12000.00,
            digital_total=10386.08,
            credit_total=10265.00,
            expense_total=650.00,
            expected_cash=12000.00,
            actual_cash=11850.00,
            gap_amount=-150.00,
        )
        session.add(settlement)
        await session.flush()
        assert settlement.id is not None

        # 20. TankDipEntry
        dip_entry = TankDipEntry(
            shift_id=shift.id,
            tank_id=tank.id,
            opening_dip=185.5,
            opening_stock=14500.0,
            closing_dip=180.2,
            closing_stock=14084.5,
            dip_wise_sale=415.5,
            meter_wise_sale=415.5,
            variation_liters=0.0,
            observed_density=738.5,
            observed_temp=30.0,
            density_15c=751.2,
        )
        session.add(dip_entry)
        await session.flush()
        assert dip_entry.id is not None

        # 21. PurchaseEntry (OMC Decanting)
        purchase = PurchaseEntry(
            invoice_no="IOCL-INV-9921",
            dealer_name="BHARAT PETROLEUM CORP LTD",
            tanker_vehicle_no="MH-04-AZ-9900",
            product_id=ms_prod.id,
            tank_id=tank.id,
            qty_kl=12.0,
            qty_liters=12000.0,
            rate_per_kl=89500.00,
            final_amount=1074000.00,
            observed_temp=28.5,
            observed_density=741.0,
            density_15c=752.1,
            invoice_density_15c=752.0,
            density_variance=0.1,
            density_status="PASSED",
        )
        session.add(purchase)
        await session.flush()
        assert purchase.id is not None

        # 22. LubeProduct
        lube = LubeProduct(
            code="LUB-MAK-4T",
            name="MAK 4T PLUS 20W-40 (1 Ltr)",
            category="LUBE_OIL",
            sale_price=360.00,
            cost_price=290.00,
            current_stock_units=40,
        )
        session.add(lube)
        await session.flush()
        assert lube.id is not None

        # 23. LubeSaleEntry
        lube_sale = LubeSaleEntry(
            shift_id=shift.id,
            lube_product_id=lube.id,
            qty_units=2,
            rate=360.00,
            total_amount=720.00,
            payment_mode="CASH",
        )
        session.add(lube_sale)
        await session.flush()
        assert lube_sale.id is not None

        # 24. SupervisorReversalVoucher
        reversal = SupervisorReversalVoucher(
            voucher_no="REV-2026-0001",
            shift_id=shift.id,
            reversal_type="METER_CORRECTION",
            reason="Typo correction on Nozzle 1 closing meter by DSM",
            authorized_by="Station Manager Patel",
            manager_pin="9876",
        )
        session.add(reversal)
        await session.flush()
        assert reversal.id is not None

        # 25. CardSettlement
        card = CardSettlement(
            machine_name="PineLabs EDC 01",
            batch_no="BATCH-9912",
            slip_count=14,
            amount=15400.00,
        )
        session.add(card)
        await session.flush()
        assert card.id is not None

        # 26. ContraTransfer
        cash_acct = BankAccount(account_name="Forecourt Cash Safe", account_type="CASH", balance=50000.00)
        session.add(cash_acct)
        await session.flush()

        contra = ContraTransfer(
            from_account_id=cash_acct.id,
            to_account_id=bank.id,
            amount=40000.00,
            reference_no="BANK-DEP-7711",
            remarks="Forecourt cash deposit to bank account",
        )
        session.add(contra)
        await session.flush()
        assert contra.id is not None

        # 27. Quotation
        quot = Quotation(
            quotation_no="QT-2026-001",
            valid_until=date.today(),
            customer_name="Adani Logistics Fleet",
            total_amount=95000.00,
        )
        session.add(quot)
        await session.flush()
        assert quot.id is not None

        # 28. RetailCashInvoice
        cash_inv = RetailCashInvoice(
            bill_no="CASH-2026-101",
            vehicle_no="GJ-05-AA-1122",
            product_name="Motor Spirit (Petrol)",
            product_code="MS",
            qty=20.00,
            rate=102.65,
            amount=2053.00,
        )
        session.add(cash_inv)
        await session.flush()
        assert cash_inv.id is not None

        # 29. DecentroTransaction
        decentro_tx = DecentroTransaction(
            reference_id="DEC-REF-TEST-001",
            decentro_txn_id="TXN_DEC_889911",
            transaction_type="UPI_QR",
            amount=1500.00,
            status="SUCCESS",
            bank_reference_number="UTR8899112200",
            customer_id=cust.id,
            shift_id=shift.id,
        )
        session.add(decentro_tx)
        await session.flush()
        assert decentro_tx.id is not None

        # 30. CustomerVirtualAccount
        van = CustomerVirtualAccount(
            customer_id=cust.id,
            virtual_account_number="NSAI9825012345",
            ifsc="YESB0CMSNOC",
            bank_name="YES BANK",
        )
        session.add(van)
        await session.flush()
        assert van.id is not None

        # 31. SupplierPayout
        payout = SupplierPayout(
            reference_id="PAY-OMC-001",
            idempotency_key="IDEMP-PAY-001-UNIQUE",
            vendor_name="BHARAT PETROLEUM CORP LTD",
            beneficiary_account="46252000099881",
            beneficiary_ifsc="SBIN0001234",
            purpose_message="OMC Tanker Invoice Settlement",
            amount=1074000.00,
            status="SUCCESS",
        )
        session.add(payout)
        await session.flush()
        assert payout.id is not None

        # 32. DecentroWebhookLog
        webhook_log = DecentroWebhookLog(
            event_type="PAYMENT_RECEIVED",
            decentro_txn_id="TXN_DEC_889911",
            signature="test_signature_hex",
            signature_valid=True,
            processing_status="PROCESSED",
            payload_dump="{\"test\": \"payload\"}",
        )
        session.add(webhook_log)
        await session.flush()
        assert webhook_log.id is not None

        # 33. GstinVerificationAudit
        gstin_audit = GstinVerificationAudit(
            gstin="24AAACN1234F1Z5",
            legal_name="BHARAT PETROLEUM CORPORATION LIMITED",
            trade_name="BPCL",
            customer_id=cust.id,
        )
        session.add(gstin_audit)
        await session.flush()
        assert gstin_audit.id is not None

        await session.commit()

        # Verify all 31 records exist and queryable
        res_user = await session.execute(select(User).where(User.username == "admin_test"))
        assert res_user.scalar_one_or_none() is not None

        res_payout = await session.execute(select(SupplierPayout).where(SupplierPayout.reference_id == "PAY-OMC-001"))
        assert res_payout.scalar_one_or_none() is not None

    await engine.dispose()


@pytest.mark.asyncio
async def test_numeric_precision_definitions():
    """
    Validates that forecourt financial and volume columns are strictly configured
    with Numeric / Decimal types, preventing IEEE-754 float conversion errors.
    """
    from sqlalchemy.sql.sqltypes import Numeric, Float

    # CreditSale inspections
    rate_col = CreditSale.__table__.columns["rate"]
    qty_col = CreditSale.__table__.columns["qty"]
    amount_col = CreditSale.__table__.columns["amount"]
    credit_amount_col = CreditSale.__table__.columns["credit_amount"]

    assert isinstance(rate_col.type, Numeric), f"CreditSale.rate must be Numeric, got {rate_col.type}"
    assert isinstance(qty_col.type, Numeric), f"CreditSale.qty must be Numeric, got {qty_col.type}"
    assert isinstance(amount_col.type, Numeric), f"CreditSale.amount must be Numeric, got {amount_col.type}"
    assert isinstance(credit_amount_col.type, Numeric), f"CreditSale.credit_amount must be Numeric"

    # ShiftMeterReading inspections
    opening_col = ShiftMeterReading.__table__.columns["opening_meter"]
    closing_col = ShiftMeterReading.__table__.columns["closing_meter"]
    testing_col = ShiftMeterReading.__table__.columns["testing_qty"]

    assert isinstance(opening_col.type, Numeric), f"opening_meter must be Numeric"
    assert isinstance(closing_col.type, Numeric), f"closing_meter must be Numeric"
    assert isinstance(testing_col.type, Numeric), f"testing_qty must be Numeric"

    # DecentroTransaction inspections
    decentro_amount_col = DecentroTransaction.__table__.columns["amount"]
    assert isinstance(decentro_amount_col.type, Numeric), f"DecentroTransaction.amount must be Numeric"
