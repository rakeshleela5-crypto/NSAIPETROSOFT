from datetime import date, datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.petrol_pump import (
    BankAccount,
    Customer,
    Employee,
    FuelProduct,
    Nozzle,
    RateHistory,
    Shift,
    ShiftMeterReading,
    Tank,
    Vehicle,
)


async def seed_initial_data(db: AsyncSession) -> None:
    # Check if products already exist
    res = await db.execute(select(FuelProduct))
    if res.scalars().first():
        return  # Already seeded

    # 1. Fuel Products
    hsd = FuelProduct(
        code="HSD",
        name="Diesel (HSD)",
        unit="Ltr",
        current_rate=90.21,
        vat_percent=14.90,
        cess_percent=4.00,
        density_standard=830.0,
    )
    ms = FuelProduct(
        code="MS",
        name="Petrol (MS)",
        unit="Ltr",
        current_rate=94.25,
        vat_percent=13.70,
        cess_percent=4.00,
        density_standard=745.0,
    )
    lube = FuelProduct(
        code="LUBE",
        name="Engine Oil 20W40",
        unit="Can",
        current_rate=360.00,
        vat_percent=18.00,
        cess_percent=0.00,
        density_standard=0.0,
    )
    db.add_all([hsd, ms, lube])
    await db.flush()

    # Rate History
    db.add_all([
        RateHistory(product_id=hsd.id, rate=90.21, effective_date=date.today()),
        RateHistory(product_id=ms.id, rate=94.25, effective_date=date.today()),
    ])

    # 2. Tanks
    ms_tank = Tank(
        tank_name="MS Tank 1",
        product_id=ms.id,
        capacity_liters=20000.0,
        current_stock=13150.0,
        current_dip_cm=142.5,
        min_alert_level=4000.0,
    )
    hsd_tank = Tank(
        tank_name="HSD Tank 1",
        product_id=hsd.id,
        capacity_liters=20000.0,
        current_stock=16890.0,
        current_dip_cm=186.0,
        min_alert_level=4000.0,
    )
    db.add_all([ms_tank, hsd_tank])
    await db.flush()

    # 3. Nozzles
    nozzles = [
        Nozzle(nozzle_name="HSD 1", machine_name="MPD 1", tank_id=hsd_tank.id, product_id=hsd.id, current_meter=6254.00),
        Nozzle(nozzle_name="HSD 2", machine_name="MPD 1", tank_id=hsd_tank.id, product_id=hsd.id, current_meter=11254.00),
        Nozzle(nozzle_name="HSD 3", machine_name="MPD 2", tank_id=hsd_tank.id, product_id=hsd.id, current_meter=11256.00),
        Nozzle(nozzle_name="HSD 4", machine_name="MPD 2", tank_id=hsd_tank.id, product_id=hsd.id, current_meter=13256.00),
        Nozzle(nozzle_name="MS 1", machine_name="MPD 1", tank_id=ms_tank.id, product_id=ms.id, current_meter=2014.00),
        Nozzle(nozzle_name="MS 2", machine_name="MPD 1", tank_id=ms_tank.id, product_id=ms.id, current_meter=11247.00),
        Nozzle(nozzle_name="MS 3", machine_name="MPD 2", tank_id=ms_tank.id, product_id=ms.id, current_meter=8547.00),
        Nozzle(nozzle_name="MS 4", machine_name="MPD 2", tank_id=ms_tank.id, product_id=ms.id, current_meter=9258.00),
    ]
    db.add_all(nozzles)

    # 4. Employees
    emp1 = Employee(code="EMP01", name="SANMUKH H CHAUDHARI", phone="+91 9876543210", role="Attendant")
    emp2 = Employee(code="EMP02", name="DINESH Z CHAUDHARI", phone="+91 9876543211", role="Attendant")
    emp3 = Employee(code="EMP03", name="AA", phone="+91 9876543212", role="Cashier")
    db.add_all([emp1, emp2, emp3])

    # 5. Customers & Vehicles
    cust1 = Customer(
        code="22",
        name="LIVAVATI TRANSPORTY",
        address="Near Highway Bypass",
        city="DAHOD",
        state="Gujarat",
        pan_no="ABCDE1234F",
        mobile="+91 9274781188",
        credit_limit=500000.0,
        current_outstanding=164433.60,
        bill_period="30 day",
    )
    cust2 = Customer(
        code="21",
        name="PORT TRANSPORT",
        address="Harbour Industrial Zone",
        city="SURAT",
        state="Gujarat",
        pan_no="PQRST5678G",
        mobile="+91 7096386817",
        credit_limit=1000000.0,
        current_outstanding=795532.21,
        bill_period="30 day",
    )
    cust3 = Customer(
        code="20",
        name="ABC TRANSPORT",
        city="VAPI",
        state="Gujarat",
        mobile="+91 9727181188",
        credit_limit=200000.0,
        current_outstanding=50270.00,
        bill_period="15 day",
    )
    cust4 = Customer(
        code="19",
        name="JITU OD",
        city="AHMEDABAD",
        state="Gujarat",
        mobile="+91 9999999999",
        credit_limit=800000.0,
        current_outstanding=632120.00,
        bill_period="30 day",
    )
    cust5 = Customer(
        code="11",
        name="KEL INFRAS",
        city="VADODARA",
        state="Gujarat",
        mobile="+91 9999999998",
        credit_limit=300000.0,
        current_outstanding=93765.27,
        bill_period="30 day",
    )
    db.add_all([cust1, cust2, cust3, cust4, cust5])
    await db.flush()

    # Vehicles
    db.add_all([
        Vehicle(customer_id=cust1.id, vehicle_no="GJ15AS7487", vehicle_type="Truck"),
        Vehicle(customer_id=cust1.id, vehicle_no="MH19AS7487", vehicle_type="Truck"),
        Vehicle(customer_id=cust2.id, vehicle_no="GJ19AS1454", vehicle_type="Truck"),
        Vehicle(customer_id=cust2.id, vehicle_no="MH14AS2545", vehicle_type="Tanker"),
        Vehicle(customer_id=cust3.id, vehicle_no="GJ18AS557", vehicle_type="Truck"),
        Vehicle(customer_id=cust3.id, vehicle_no="GJ01AS7487", vehicle_type="Truck"),
    ])

    # 6. Bank Accounts
    accounts = [
        BankAccount(account_name="CASH ON HAND", account_type="CASH", balance=450448.86),
        BankAccount(account_name="PAYTM", account_type="WALLET", balance=92683.82),
        BankAccount(account_name="M SWIPE", account_type="POS", balance=799801.26),
        BankAccount(account_name="PETRO CARD", account_type="CARD", balance=3388191.24),
        BankAccount(account_name="HDFC CA 0459", account_type="CURRENT", balance=26000943.17),
        BankAccount(account_name="YES BANK", account_type="CURRENT", balance=10373611.98),
        BankAccount(account_name="GPAY", account_type="WALLET", balance=18015.00),
        BankAccount(account_name="ICICI CARD", account_type="POS", balance=2348016.71),
        BankAccount(account_name="BOB SB 6189", account_type="SAVINGS", balance=536949.77),
        BankAccount(account_name="POST OFFICE SB AC.439", account_type="SAVINGS", balance=17159.00),
    ]
    db.add_all(accounts)

    # 7. Initial Clean Shift #00001 (Zero Starting Base)
    shift = Shift(
        so_number="00001",
        date=date.today(),
        shift_name="First",
        status="Open",
        total_sale_amount=0.0,
        total_cash=0.0,
        total_credit=0.0,
        total_digital=0.0,
    )
    db.add(shift)

    await db.commit()
