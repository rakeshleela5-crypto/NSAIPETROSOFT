import pytest
from datetime import date
from httpx import ASGITransport, AsyncClient
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.petrol_pump import (
    BankAccount,
    CardSettlement,
    Customer,
    Employee,
    EmployeeShortageLedger,
    Expense,
    FuelProduct,
    LubeProduct,
    LubeSaleEntry,
    Nozzle,
    RateHistory,
    Tank,
    TankDipEntry,
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
        acc3 = BankAccount(id=3, account_name="M SWIPE POS", account_type="POS", balance=0.0)
        prod = FuelProduct(id=1, code="HSD", name="High Speed Diesel", current_rate=92.5)
        rate_hist0 = RateHistory(id=1, product_id=1, rate=92.5, effective_date=date(2026, 1, 1))
        tank = Tank(id=1, tank_name="HSD Underground Tank 1", product_id=1, capacity_liters=20000.0, current_stock=12000.0)
        nozzle = Nozzle(id=1, nozzle_name="Nozzle 1 (HSD)", machine_name="MPD 1", tank_id=1, product_id=1, current_meter=5000.0)
        profile = StationProfileSetting(id=1, station_name="TEST DEALER OUTLET", manager_pin="1234")
        emp = Employee(id=1, name="Ramesh Attendant", code="EMP01", shortage_balance=500.0)
        lube = LubeProduct(id=1, code="SERVO-4T", name="Servo 4T Engine Oil", category="LUBE_OIL", mrp=360.0, sale_price=350.0, cost_price=280.0, current_stock_units=20, reorder_level=5)

        db.add_all([acc1, acc2, acc3, prod, rate_hist0, tank, nozzle, profile, emp, lube])
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

        # Delete vehicle from customer with Manager PIN
        del_veh_res = await client.delete(f"/api/v1/pump/customers/{cust_id}/vehicles/GJ05CD7777?manager_pin=1234")
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

        # 5. Test Retail Cash Invoices CRUD, Stock & Cash Ledger Rollback
        cash_bill_res = await client.post(
            "/api/v1/pump/cash-bills",
            json={
                "bill_no": "POS-TEST-881",
                "vehicle_no": "GJ05AB1234",
                "product_name": "High Speed Diesel",
                "product_code": "HSD",
                "qty": 50.0,
                "rate": 92.5,
                "amount": 4625.0,
                "payment_mode": "CASH",
            },
        )
        assert cash_bill_res.status_code == 200, cash_bill_res.text
        cb_data = cash_bill_res.json()
        assert cb_data["bill_no"] == "POS-TEST-881"
        assert cb_data["amount"] == 4625.0
        bill_id = cb_data["id"]

        # Verify Cash on Hand increased and Tank stock decreased
        async with async_session() as db:
            cash_acc = await db.get(BankAccount, 1)
            assert cash_acc.balance == 104625.0
            hsd_tank = await db.get(Tank, 1)
            assert hsd_tank.current_stock == 11950.0  # 12000 - 50

        # Fetch cash bills list
        bills_res = await client.get("/api/v1/pump/cash-bills")
        assert bills_res.status_code == 200
        bills = bills_res.json()
        assert any(b["bill_no"] == "POS-TEST-881" for b in bills)

        # Void cash bill and verify cash and stock rollback
        del_cb_res = await client.delete(f"/api/v1/pump/cash-bills/{bill_id}?manager_pin=1234")
        assert del_cb_res.status_code == 200, del_cb_res.text

        async with async_session() as db:
            cash_acc = await db.get(BankAccount, 1)
            assert cash_acc.balance == 100000.0  # restored
            hsd_tank = await db.get(Tank, 1)
            assert hsd_tank.current_stock == 12000.0  # restored

        # 6. Test Fuel Rate History Reversion / Rollback
        # Update rate to new test rate
        rate_upd = await client.post(
            "/api/v1/pump/rates",
            json={"product_id": 1, "rate": 98.75, "manager_pin": "1234"},
        )
        assert rate_upd.status_code == 200
        rates_data = (await client.get("/api/v1/pump/rates")).json()
        assert rates_data["products"][0]["rate"] == 98.75
        latest_hist_id = rates_data["history"][0]["id"]

        # Delete the erroneous rate revision
        del_rate_res = await client.delete(f"/api/v1/pump/rates/history/{latest_hist_id}?manager_pin=1234")
        assert del_rate_res.status_code == 200, del_rate_res.text

        # Verify product rate rolled back to prior rate (92.5)
        rates_data_after = (await client.get("/api/v1/pump/rates")).json()
        assert rates_data_after["products"][0]["rate"] == 92.5

        # 7. Test Nozzle Meter Swap Deletion & Rollback
        swap_res = await client.post(
            "/api/v1/pump/nozzles/1/meter-swap",
            json={
                "old_final_meter": 5000.0,
                "new_initial_meter": 0.0,
                "reason": "Totalizer repair",
                "wm_seal_no": "WM-SWAP-1",
                "manager_pin": "1234",
            },
        )
        assert swap_res.status_code == 200
        swaps_list = (await client.get("/api/v1/pump/nozzles/1/meter-swaps")).json()
        assert len(swaps_list) >= 1
        swap_id = swaps_list[0]["id"]

        # Verify nozzle current_meter is 0.0
        async with async_session() as db:
            noz = await db.get(Nozzle, 1)
            assert noz.current_meter == 0.0

        # Void meter swap and verify current_meter reverts to 5000.0
        del_swap_res = await client.delete(f"/api/v1/pump/nozzles/meter-swaps/{swap_id}?manager_pin=1234")
        assert del_swap_res.status_code == 200
        async with async_session() as db:
            noz = await db.get(Nozzle, 1)
            assert noz.current_meter == 5000.0

        # 8. Test Tank Strapping Calibration Point Addition & Deletion
        pt_res = await client.post(
            "/api/v1/pump/tanks/1/strapping-chart/point",
            json={"dip_cm": 125.5, "volume_liters": 11340.0, "notes": "Test Calibration Point"},
        )
        assert pt_res.status_code == 200
        pt_id = pt_res.json()["id"]

        chart_res = await client.get("/api/v1/pump/tanks/1/strapping-chart")
        assert chart_res.status_code == 200
        chart_points = chart_res.json()["calibration_points"]
        assert any(p["dip_cm"] == 125.5 and p["volume_liters"] == 11340.0 for p in chart_points)

        # Delete strapping point
        del_pt_res = await client.delete(f"/api/v1/pump/tanks/strapping-chart/{pt_id}?manager_pin=1234")
        assert del_pt_res.status_code == 200

        # 9. Test Packaged Lube Sale, Cash Increment, Listing, and Voiding with Stock & Cash Rollback
        lube_res = await client.post(
            "/api/v1/pump/lubes/sale",
            json={
                "lube_product_id": 1,
                "qty_units": 2,
                "rate": 350.0,
                "payment_mode": "CASH",
            },
        )
        assert lube_res.status_code == 200, lube_res.text
        lube_data = lube_res.json()
        assert lube_data["total_amount"] == 700.0
        assert lube_data["remaining_stock_units"] == 18
        lube_sale_id = lube_data["id"]

        # Verify Cash on Hand increased
        async with async_session() as db:
            cash_acc = await db.get(BankAccount, 1)
            assert cash_acc.balance == 100700.0

        # Verify lube sales listing
        sales_list_res = await client.get("/api/v1/pump/lubes/sales")
        assert sales_list_res.status_code == 200
        lube_sales = sales_list_res.json()
        assert any(s["id"] == lube_sale_id and s["total_amount"] == 700.0 for s in lube_sales)

        # Void lube sale and verify stock restored to 20 and Cash on Hand restored to 100000.0
        del_lube_res = await client.delete(f"/api/v1/pump/lubes/sales/{lube_sale_id}?manager_pin=1234")
        assert del_lube_res.status_code == 200, del_lube_res.text

        async with async_session() as db:
            lube_prod = await db.get(LubeProduct, 1)
            assert lube_prod.current_stock_units == 20
            cash_acc = await db.get(BankAccount, 1)
            assert cash_acc.balance == 100000.0

        # 10. Test Employee Shortage Recovery and Voiding with Balance Rollback
        rec_res = await client.post(
            "/api/v1/pump/employees/1/settle-shortage",
            json={
                "amount": 200.0,
                "settlement_type": "CASH_RECOVERY",
                "notes": "Cash recovery from Ramesh",
                "manager_pin": "1234",
            },
        )
        assert rec_res.status_code == 200, rec_res.text
        assert rec_res.json()["remaining_shortage_balance"] == 300.0

        # Verify shortage history
        shortages_res = await client.get("/api/v1/pump/employees/1/shortages")
        assert shortages_res.status_code == 200
        shortage_history = shortages_res.json()["ledger"]
        assert len(shortage_history) >= 1
        rec_entry_id = shortage_history[0]["id"]

        # Void recovery and verify employee balance restores to 500.0
        del_shortage_res = await client.delete(f"/api/v1/pump/employees/shortages/{rec_entry_id}?manager_pin=1234")
        assert del_shortage_res.status_code == 200, del_shortage_res.text
        assert del_shortage_res.json()["new_shortage_balance"] == 500.0

        async with async_session() as db:
            emp_rec = await db.get(Employee, 1)
            assert emp_rec.shortage_balance == 500.0

        # 11. Test Expense Voucher Creation & Rollback on Void
        exp_res = await client.post(
            "/api/v1/pump/expenses",
            json={
                "category": "ELECTRICITY BILL",
                "amount": 1500.0,
                "paid_to": "Torrent Power",
                "narration": "Forecourt meter bill",
            },
        )
        assert exp_res.status_code == 200, exp_res.text
        exp_id = exp_res.json()["id"]

        async with async_session() as db:
            cash_acc = await db.get(BankAccount, 1)
            assert cash_acc.balance == 98500.0

        # Delete expense voucher with Manager PIN
        del_exp_res = await client.delete(f"/api/v1/pump/expenses/{exp_id}?manager_pin=1234")
        assert del_exp_res.status_code == 200, del_exp_res.text

        async with async_session() as db:
            cash_acc = await db.get(BankAccount, 1)
            assert cash_acc.balance == 100000.0

        # 12. Test Card Settlement Creation & Voiding with POS Account Balance Rollback
        card_res = await client.post(
            "/api/v1/pump/card-settlements",
            json={
                "machine_name": "M SWIPE",
                "batch_no": "9901",
                "slip_count": 5,
                "amount": 4500.0,
            },
        )
        assert card_res.status_code == 200, card_res.text
        settle_id = card_res.json()["id"]

        async with async_session() as db:
            pos_acc = await db.get(BankAccount, 3)
            assert pos_acc.balance == 4500.0

        # Void card settlement batch with Manager PIN
        del_card_res = await client.delete(f"/api/v1/pump/card-settlements/{settle_id}?manager_pin=1234")
        assert del_card_res.status_code == 200, del_card_res.text

        async with async_session() as db:
            pos_acc = await db.get(BankAccount, 3)
            assert pos_acc.balance == 0.0

        # 13. Test Tank Physical Dip Creation & Deletion
        dip_res = await client.post(
            "/api/v1/pump/dips",
            json={
                "tank_id": 1,
                "opening_dip": 180.0,
                "opening_stock": 15500.0,
                "closing_dip": 185.0,
                "closing_stock": 16000.0,
                "notes": "Daily morning dip reading",
            },
        )
        assert dip_res.status_code == 200, dip_res.text
        dip_id = dip_res.json()["id"]

        del_dip_res = await client.delete(f"/api/v1/pump/dips/{dip_id}?manager_pin=1234")
        assert del_dip_res.status_code == 200, del_dip_res.text

        # 14. Test Bank Account Deletion Safety Guards
        # Trying to delete primary Cash account (id=1) must fail with 400
        del_primary_res = await client.delete("/api/v1/pump/bank-accounts/1?manager_pin=1234")
        assert del_primary_res.status_code == 400

        # Trying to delete Bank account with positive balance must fail with 400
        del_funded_res = await client.delete("/api/v1/pump/bank-accounts/2?manager_pin=1234")
        assert del_funded_res.status_code == 400

        # Create a temporary zero-balance bank account and delete successfully
        new_bank_res = await client.post(
            "/api/v1/pump/bank-accounts",
            json={"account_name": "TEST ESCROW", "account_type": "SAVINGS", "balance": 0.0},
        )
        assert new_bank_res.status_code == 200
        new_bank_id = new_bank_res.json()["id"]

        del_bank_res = await client.delete(f"/api/v1/pump/bank-accounts/{new_bank_id}?manager_pin=1234")
        assert del_bank_res.status_code == 200

        # 15. Test Customer Deletion Safety Guards
        # Create a customer with active outstanding debt, must fail deletion with 400
        debt_cust_res = await client.post(
            "/api/v1/pump/customers",
            json={"name": "IN_DEBT TRANSPORT CORP", "mobile": "9888877777", "credit_limit": 50000.0, "opening_balance": 15000.0},
        )
        assert debt_cust_res.status_code == 200
        debt_cust_id = debt_cust_res.json()["id"]

        del_active_cust = await client.delete(f"/api/v1/pump/customers/{debt_cust_id}?manager_pin=1234")
        assert del_active_cust.status_code == 400

        # Create zero-balance customer and delete with Manager PIN successfully
        new_cust_res = await client.post(
            "/api/v1/pump/customers",
            json={"name": "TEMPORARY TRIAL LOGISTICS", "mobile": "9999900000", "credit_limit": 10000.0, "opening_balance": 0.0},
        )
        assert new_cust_res.status_code == 200
        new_cust_id = new_cust_res.json()["id"]

        del_cust_res = await client.delete(f"/api/v1/pump/customers/{new_cust_id}?manager_pin=1234")
        assert del_cust_res.status_code == 200

        # 16. Test Lube Product Deletion Safety Guards
        # LubeProduct #1 has 20 units in stock, must fail with 400
        del_stocked_lube = await client.delete("/api/v1/pump/lubes/1?manager_pin=1234")
        assert del_stocked_lube.status_code == 400

        # Create zero-stock lube product and delete with Manager PIN
        new_lube_res = await client.post(
            "/api/v1/pump/lubes",
            json={
                "item_code": "EMPTY-LUB-01",
                "item_name": "EMPTY LUBE CANISTER",
                "category": "BRAKE FLUID",
                "pack_size": "250ml",
                "mrp": 120.0,
                "cost_price": 80.0,
                "sale_price": 110.0,
                "stock_qty": 0,
            },
        )
        assert new_lube_res.status_code == 200
        new_lube_id = new_lube_res.json()["id"]

        del_empty_lube = await client.delete(f"/api/v1/pump/lubes/{new_lube_id}?manager_pin=1234")
        assert del_empty_lube.status_code == 200



