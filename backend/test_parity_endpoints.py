import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.petrol_pump import (
    BankAccount,
    Customer,
    FuelProduct,
    Nozzle,
    Tank,
    StationProfileSetting,
)

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_parity_crud_endpoints():
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
        acc1 = BankAccount(id=1, account_name="Cash on Hand", account_type="CASH", balance=100000.0)
        acc2 = BankAccount(id=2, account_name="SBI Current A/C", account_type="BANK", balance=50000.0)
        prod = FuelProduct(id=1, code="HSD", name="High Speed Diesel", current_rate=92.5)
        tank = Tank(id=1, tank_name="HSD Underground Tank 1", product_id=1, capacity_liters=20000.0, current_stock=12000.0)
        nozzle = Nozzle(id=1, nozzle_name="Nozzle 1 (HSD)", machine_name="MPD 1", tank_id=1, product_id=1, current_meter=5000.0)
        profile = StationProfileSetting(id=1, station_name="TEST DEALER OUTLET", manager_pin="1234")

        db.add_all([acc1, acc2, prod, tank, nozzle, profile])
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Test Contra Transfer CRUD & Balance Reversal
        trf_res = await client.post(
            "/api/v1/pump/transfers",
            json={
                "from_account_id": 1,
                "to_account_id": 2,
                "amount": 25000.0,
                "remarks": "Cash to SBI Deposit Slip #991",
            },
        )
        assert trf_res.status_code == 200, trf_res.text
        trf_json = trf_res.json()
        assert trf_json["from_balance"] == 75000.0
        assert trf_json["to_balance"] == 75000.0
        transfer_id = trf_json["id"]

        # Fetch transfers list
        list_res = await client.get("/api/v1/pump/transfers")
        assert list_res.status_code == 200
        transfers_list = list_res.json()
        assert len(transfers_list) >= 1
        assert transfers_list[0]["amount"] == 25000.0
        assert transfers_list[0]["from_account_name"] == "Cash on Hand"

        # Void transfer and verify balances revert
        del_trf_res = await client.delete(f"/api/v1/pump/transfers/{transfer_id}?manager_pin=1234")
        assert del_trf_res.status_code == 200, del_trf_res.text

        # Verify balances restored in accounts
        async with async_session() as db:
            a1 = await db.get(BankAccount, 1)
            a2 = await db.get(BankAccount, 2)
            assert a1.balance == 100000.0
            assert a2.balance == 50000.0

        # 2. Test Quotations & Estimates CRUD
        quote_res = await client.post(
            "/api/v1/pump/quotations",
            json={
                "customer_name": "SARVODAYA TRANSPORT LTD",
                "customer_mobile": "9898012345",
                "terms": "Payment in 15 days",
                "items": [
                    {"product_name": "High Speed Diesel", "qty": 2000, "rate": 92.5, "amount": 185000},
                ],
            },
        )
        assert quote_res.status_code == 200, quote_res.text
        q_data = quote_res.json()
        assert q_data["quotation_no"].startswith("QT-")
        assert q_data["total_amount"] == 185000.0
        quote_id = q_data["id"]

        # Fetch quotations
        quotes_list_res = await client.get("/api/v1/pump/quotations")
        assert quotes_list_res.status_code == 200
        quotes = quotes_list_res.json()
        assert len(quotes) >= 1
        assert quotes[0]["customer_name"] == "SARVODAYA TRANSPORT LTD"

        # Delete quotation
        del_q_res = await client.delete(f"/api/v1/pump/quotations/{quote_id}?manager_pin=1234")
        assert del_q_res.status_code == 200
        quotes_after = (await client.get("/api/v1/pump/quotations")).json()
        assert not any(q["id"] == quote_id for q in quotes_after)

        # 3. Test Customer Vehicle Deletion Endpoint
        cust_res = await client.post(
            "/api/v1/pump/customers",
            json={"name": "KALYAN FLEET SERVICES", "mobile": "9825100000", "credit_limit": 100000},
        )
        assert cust_res.status_code == 200
        cust_id = cust_res.json()["id"]

        veh_res = await client.post(
            "/api/v1/pump/vehicles",
            json={"customer_id": cust_id, "vehicle_no": "GJ05CD7777", "vehicle_type": "Tanker"},
        )
        assert veh_res.status_code == 200

        # Delete vehicle from customer
        del_veh_res = await client.delete(f"/api/v1/pump/customers/{cust_id}/vehicles/GJ05CD7777")
        assert del_veh_res.status_code == 200
        assert "removed from customer" in del_veh_res.json()["message"]

        # 4. Test Weights & Measures Nozzle Stamping Update & Reminders
        stamping_res = await client.put(
            "/api/v1/pump/nozzles/1/stamping",
            json={
                "last_stamped_date": "2026-06-15",
                "stamping_due_date": "2027-06-15",
                "wm_seal_no": "WM-LEAD-2026-4491",
                "wm_certificate_no": "CERT-LM-2026/8821",
                "manager_pin": "1234",
            },
        )
        assert stamping_res.status_code == 200, stamping_res.text
        s_data = stamping_res.json()
        assert s_data["wm_seal_no"] == "WM-LEAD-2026-4491"

        # Verify get_stamping_reminders returns recorded seal number
        reminders_res = await client.get("/api/v1/pump/stamping-reminders")
        assert reminders_res.status_code == 200
        rem_list = reminders_res.json()
        nozzle_rem = next((r for r in rem_list if r.get("nozzle_id") == 1), None)
        assert nozzle_rem is not None
        assert nozzle_rem["wm_seal_no"] == "WM-LEAD-2026-4491"
        assert nozzle_rem["last_stamped"] == "15-Jun-2026"
        assert nozzle_rem["next_due"] == "15-Jun-2027"
