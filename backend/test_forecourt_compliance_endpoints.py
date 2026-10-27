import pytest
from datetime import date, timedelta
from httpx import ASGITransport, AsyncClient
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.petrol_pump import (
    BankAccount,
    Customer,
    Employee,
    FuelProduct,
    LubeProduct,
    Tank,
    StationProfileSetting,
)

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_forecourt_compliance_and_new_endpoints():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(SQLModel.metadata.create_all)

    async def override_get_db():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    # Seed baseline fixtures
    async with async_session() as db:
        acc1 = BankAccount(id=1, account_name="Main Station Safe Vault", account_type="CASH", balance=50000.0)
        prod = FuelProduct(id=1, code="MS", name="Motor Spirit (Petrol)", current_rate=101.5)
        tank = Tank(id=1, tank_name="MS Tank 1", product_id=1, capacity_liters=20000.0, current_stock=10000.0)
        emp = Employee(id=1, name="Suresh Patel", code="DSM01", role="PUMP_ATTENDANT")
        cust = Customer(id=1, code="CUST01", name="Gujarat State Road Transport", mobile="9876543210", credit_limit=500000.0)
        lube = LubeProduct(id=1, code="MAK4T1L", name="Mak 4T Plus 20W40 1L", category="LUBE_OIL", package_size="1 Ltr", current_stock_units=20, cost_price=280.0, mrp=360.0)
        profile = StationProfileSetting(id=1, station_name="HIGHWAY SUPER PETROLEUM", manager_pin="1234")
        db.add_all([acc1, prod, tank, emp, cust, lube, profile])
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Test Forecourt Controller Log: simulate-drop
        drop_payload = {
            "pump_id": 1,
            "nozzle_name": "Pump 1 - Nozzle 1 (MS)",
            "product_name": "Motor Spirit (Petrol)",
            "product_code": "MS",
            "liters": 15.0,
            "rate": 101.5,
            "amount": 1522.5,
            "protocol": "DOMS PSS 5000 (Ethernet TCP/IP)",
            "controller_ip": "192.168.1.150:4001",
        }
        res_drop = await client.post("/api/v1/pump/automation/simulate-drop", json=drop_payload)
        assert res_drop.status_code == 200, res_drop.text
        drop_data = res_drop.json()
        log_id = drop_data["id"]
        assert drop_data["status"] == "PENDING"
        assert drop_data["liters"] == 15.0

        # List controller logs
        res_logs = await client.get("/api/v1/pump/automation/logs")
        assert res_logs.status_code == 200
        logs = res_logs.json()
        assert len(logs) >= 1
        assert logs[0]["id"] == log_id

        # Push to POS
        res_push = await client.post(
            "/api/v1/pump/automation/push-to-pos",
            json={"log_id": log_id, "payment_mode": "CASH", "customer_name": "Highway Traveler", "vehicle_no": "GJ01AB1234"},
        )
        assert res_push.status_code == 200, res_push.text
        push_data = res_push.json()
        assert push_data["log_status"] == "SYNCED"

        # 2. Test Shift Cash Drop (Safe Drop)
        res_cash_drop = await client.post(
            "/api/v1/pump/cash-drops",
            json={
                "employee_id": 1,
                "amount": 25000.0,
                "vault_account_id": 1,
                "witness_name": "Supervisor Sharma",
                "notes": "Mid-shift vault drop",
            },
        )
        assert res_cash_drop.status_code == 200, res_cash_drop.text
        drop_res_data = res_cash_drop.json()
        cash_drop_id = drop_res_data["id"]
        assert drop_res_data["amount"] == 25000.0

        # List safe drops
        res_drops_list = await client.get("/api/v1/pump/cash-drops")
        assert res_drops_list.status_code == 200
        drops_list = res_drops_list.json()
        assert any(d["id"] == cash_drop_id for d in drops_list)

        # 3. Test Employee Attendance
        res_att = await client.post(
            "/api/v1/pump/employees/attendance",
            json={
                "employee_id": 1,
                "status": "PRESENT",
                "in_time": "06:00",
                "opening_cash_float": 2000.0,
                "remarks": "Morning shift forecourt lead",
            },
        )
        assert res_att.status_code == 200, res_att.text
        att_data = res_att.json()
        assert att_data["status"] == "PRESENT"

        res_att_list = await client.get("/api/v1/pump/employees/attendance")
        assert res_att_list.status_code == 200
        att_list = res_att_list.json()
        assert len(att_list) >= 1
        assert att_list[0]["opening_cash_float"] == 2000.0

        # 4. Test Statutory Compliance Licenses
        today = date.today()
        expiry = today + timedelta(days=20)
        lic_payload = {
            "license_name": "PESO Petroleum Storage License Form XIV",
            "license_number": "P/HQ/GJ/15/99988",
            "issuing_authority": "Petroleum and Explosives Safety Organisation (PESO)",
            "issue_date": str(today - timedelta(days=340)),
            "expiry_date": str(expiry),
            "reminder_days_before": 30,
            "remarks": "Requires renewal inspection submission",
        }
        res_lic = await client.post("/api/v1/pump/compliance/licenses", json=lic_payload)
        assert res_lic.status_code == 200, res_lic.text
        lic_id = res_lic.json()["id"]

        # List licenses and verify alert calculation
        res_lic_list = await client.get("/api/v1/pump/compliance/licenses")
        assert res_lic_list.status_code == 200
        lic_list = res_lic_list.json()
        found_lic = next((l for l in lic_list if l["id"] == lic_id), None)
        assert found_lic is not None
        assert found_lic["status"] == "EXPIRING_SOON"
        assert found_lic["days_remaining"] == 20

        # Update license
        res_lic_up = await client.put(
            f"/api/v1/pump/compliance/licenses/{lic_id}",
            json={"expiry_date": str(today + timedelta(days=365))},
        )
        assert res_lic_up.status_code == 200
        assert res_lic_up.json()["status"] == "ACTIVE"

        # 5. Test Packaged Lube Stock Inward
        res_lube_inward = await client.post(
            "/api/v1/pump/lubes/inward",
            json={
                "invoice_no": "BPCL/LUBE/2026/0441",
                "supplier_name": "BPCL Lube Regional Depot",
                "lube_product_id": 1,
                "qty_units": 10,
                "cost_price": 285.0,
                "batch_no": "B2609A",
                "notes": "Fast-moving 4T motorcycle oil inward",
            },
        )
        assert res_lube_inward.status_code == 200, res_lube_inward.text
        inward_data = res_lube_inward.json()
        assert inward_data["new_stock_units"] == 30  # 20 + 10
        assert inward_data["total_amount"] == 2850.0

        res_inward_list = await client.get("/api/v1/pump/lubes/inward")
        assert res_inward_list.status_code == 200
        assert len(res_inward_list.json()) >= 1

        # 6. Test Fleet Invoices
        res_flt = await client.post(
            "/api/v1/pump/fleet-invoices",
            json={
                "customer_id": 1,
                "period_start": str(today - timedelta(days=15)),
                "period_end": str(today),
            },
        )
        assert res_flt.status_code == 200, res_flt.text
        flt_data = res_flt.json()
        flt_id = flt_data["id"]
        assert "FLT-" in flt_data["invoice_no"]

        res_flt_get = await client.get(f"/api/v1/pump/fleet-invoices/{flt_id}")
        assert res_flt_get.status_code == 200
        assert res_flt_get.json()["customer_name"] == "Gujarat State Road Transport"

        # 7. Test Tank Dip with water_dip_cm
        res_dip = await client.post(
            "/api/v1/pump/dips",
            json={
                "tank_id": 1,
                "opening_dip": 150.0,
                "opening_stock": 10000.0,
                "receipt_liters": 0.0,
                "closing_dip": 145.0,
                "closing_stock": 9600.0,
                "water_dip_cm": 1.5,
                "observed_density": 745.0,
                "observed_temp": 28.0,
                "notes": "Daily morning physical dip with water paste test",
            },
        )
        assert res_dip.status_code == 200, res_dip.text
        dip_res_data = res_dip.json()
        assert dip_res_data["water_dip_cm"] == 1.5

        res_dips_list = await client.get("/api/v1/pump/dips")
        assert res_dips_list.status_code == 200
        dips = res_dips_list.json()
        assert any(d["water_dip_cm"] == 1.5 for d in dips)
