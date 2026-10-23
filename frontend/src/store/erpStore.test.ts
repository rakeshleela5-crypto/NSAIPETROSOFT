import { describe, it, expect, beforeEach } from 'vitest';
import { erpStore } from './erpStore';

describe('erpStore - Centralized ACID Forecourt Engine', () => {
  beforeEach(() => {
    erpStore.cleanSlateDatabase(false); // Reset to default clean state
  });

  it('correctly aggregates dashboard KPIs and payment breakdown', () => {
    const kpis = erpStore.getDashboardKPIs();
    expect(kpis.today_sale).toBeGreaterThan(0);
    expect(kpis.total_outstanding).toBeGreaterThan(0);
    expect(kpis.total_balance).toBeGreaterThan(0);
    expect(kpis.total_stock_cost).toBeGreaterThan(0);

    const breakdown = erpStore.getPaymentBreakdown();
    expect(breakdown.total).toBe(kpis.today_sale);
    expect(breakdown.credit).toBeGreaterThan(0);
  });

  it('atomically executes Shift Nozzle Sales and deducts sold fuel from tank book stock', () => {
    const state = erpStore.getState();
    const initialTank1Stock = state.tanks[0].book_stock; // 14250

    // Record sales for Nozzle 1 (connected to Tank 1)
    // Opening 125430.5, Closing 125950.5 (Diff = 520), Testing 10 => Net 510 L
    const result = erpStore.recordShiftNozzleSales([
      {
        nozzle_id: 1,
        closing_meter: 125950.5,
        testing_qty: 10.0,
      },
    ]);

    expect(result.totalNetLitres).toBe(510.0);
    expect(result.totalAmount).toBe(Math.round(510.0 * 102.65 * 100) / 100);

    const updatedState = erpStore.getState();
    expect(updatedState.tanks[0].book_stock).toBe(initialTank1Stock - 510.0);
    expect(updatedState.nozzles[0].opening_meter).toBe(125950.5); // Pre-filled for next shift
  });

  it('atomically executes Credit Bill and enforces hard credit limit check', () => {
    const state = erpStore.getState();
    const customer = state.customers[0];
    const initialOutstanding = customer.current_outstanding;

    // Normal credit bill within limit
    const bill = erpStore.recordCreditBill({
      customer_id: customer.id,
      vehicle_no: 'GJ05AB1234',
      product_name: 'High Speed Diesel (HSD)',
      qty: 100,
      rate: 94.5,
      slip_no: 'SL-991',
    });

    expect(bill.amount).toBe(9450.0);
    const updatedCustomer = erpStore.getState().customers.find((c) => c.id === customer.id)!;
    expect(updatedCustomer.current_outstanding).toBe(initialOutstanding + 9450.0);

    // Bill that exceeds credit limit without override PIN must fail
    expect(() => {
      erpStore.recordCreditBill({
        customer_id: customer.id,
        vehicle_no: 'GJ05AB1234',
        product_name: 'High Speed Diesel (HSD)',
        qty: 10000,
        rate: 94.5,
      });
    }).toThrow(/CREDIT LIMIT EXCEEDED/);

    // Bill that exceeds limit with Manager PIN passes
    const overriddenBill = erpStore.recordCreditBill({
      customer_id: customer.id,
      vehicle_no: 'GJ05AB1234',
      product_name: 'High Speed Diesel (HSD)',
      qty: 5000,
      rate: 94.5,
      manager_override_pin: '1234',
    });
    expect(overriddenBill.amount).toBe(472500.0);
  });

  it('atomically executes Payment Receipt and decrements customer balance and increments cash/bank', () => {
    const state = erpStore.getState();
    const customer = state.customers[0];
    const initialBal = customer.current_outstanding;
    const initialCash = state.bankAccounts[0].balance;

    const receipt = erpStore.recordPaymentReceipt({
      customer_name: customer.name,
      amount: 15000.0,
      payment_mode: 'Cash',
      remarks: 'Part payment',
    });

    expect(receipt.amount).toBe(15000.0);
    const updatedState = erpStore.getState();
    expect(updatedState.customers[0].current_outstanding).toBe(initialBal - 15000.0);
    expect(updatedState.bankAccounts[0].balance).toBe(initialCash + 15000.0);
  });

  it('atomically executes Purchase Decantation, guards against overflow, and updates tank stock', () => {
    const state = erpStore.getState();
    const tank = state.tanks[0];
    const initialStock = tank.current_stock;

    // Normal decantation: 4 KL (4000 L)
    const purchase = erpStore.recordPurchaseDecantation({
      invoice_no: 'BPCL-999',
      dealer_name: 'BPCL',
      tanker_vehicle_no: 'MH-04-1234',
      tank_id: tank.id,
      product_id: 1,
      qty_kl: 4.0,
      rate_per_kl: 85000.0,
      sample_density: 745.0,
      observed_density: 742.0,
      observed_temp: 29.0,
    });

    expect(purchase.qty_liters).toBe(4000.0);
    expect(purchase.tds_amount).toBeGreaterThan(0);
    expect(purchase.lfr_amount).toBeGreaterThan(0);

    const updatedTank = erpStore.getState().tanks.find((t) => t.id === tank.id)!;
    expect(updatedTank.current_stock).toBe(initialStock + 4000.0);

    // Decantation exceeding max capacity must throw unless manager override
    expect(() => {
      erpStore.recordPurchaseDecantation({
        invoice_no: 'BPCL-OVERFLOW',
        dealer_name: 'BPCL',
        tanker_vehicle_no: 'MH-04-1234',
        tank_id: tank.id,
        product_id: 1,
        qty_kl: 20.0, // 20,000 L when current is already > 15,000 in a 20,000 L tank
        rate_per_kl: 85000.0,
        sample_density: 745.0,
        observed_density: 742.0,
        observed_temp: 29.0,
      });
    }).toThrow(/TANK CAPACITY OVERFLOW ALERT/);
  });

  it('atomically executes Contra Transfer between Cash and Bank', () => {
    const state = erpStore.getState();
    const sourceAcc = state.bankAccounts[0]; // Cash
    const destAcc = state.bankAccounts[2]; // HDFC Current
    const initialSourceBal = sourceAcc.balance;
    const initialDestBal = destAcc.balance;

    const transfer = erpStore.recordTransfer({
      from_account_id: sourceAcc.id,
      to_account_id: destAcc.id,
      amount: 10000.0,
      remarks: 'Deposit',
    });

    expect(transfer.amount).toBe(10000.0);
    const updatedState = erpStore.getState();
    expect(updatedState.bankAccounts[0].balance).toBe(initialSourceBal - 10000.0);
    expect(updatedState.bankAccounts[2].balance).toBe(initialDestBal + 10000.0);
  });

  it('prevents customer deletion if customer has non-zero balance or transaction history', () => {
    const state = erpStore.getState();
    const customer = state.customers[0];

    // Customer has outstanding > 0
    expect(() => {
      erpStore.deleteCustomer(customer.id);
    }).toThrow(/CANNOT DELETE CUSTOMER/);

    // Create a zero balance dummy customer with no transactions
    const dummy = erpStore.saveCustomer({
      name: 'NEW CLEAN CUSTOMER',
      mobile: '9999900000',
      credit_limit: 50000,
      current_outstanding: 0,
    });

    erpStore.deleteCustomer(dummy.id);
    expect(erpStore.getState().customers.find((c) => c.id === dummy.id)).toBeUndefined();
  });

  it('exports and restores checksum-verified backup', () => {
    const backup = erpStore.exportBackupJson();
    expect(backup.filename).toContain('NSaiPetroSoft_Backup');
    expect(backup.checksum.length).toBeGreaterThan(0);

    const restoreRes = erpStore.restoreBackupJson(backup.jsonString);
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.recordsRestored).toBeGreaterThan(0);
  });

  it('hydrates state from backend API responses without data loss or disconnection', () => {
    erpStore.hydrateFromBackend({
      customers: [
        {
          id: 99,
          code: 'CUST-099',
          name: 'LIVE FLEET LOGISTICS',
          mobile: '9876543210',
          credit_limit: 100000,
          current_outstanding: 25000,
          bill_period: 'WEEKLY',
          vehicles: ['GJ05ZZ9999'],
        },
      ],
      cardSettlements: [
        {
          id: 1,
          date: '2026-10-22',
          machine: 'PAYTM QR',
          batch: 'B-101',
          slips: 5,
          amount: 12500,
        },
      ],
      products: [
        {
          id: 5,
          product_code: 'LUB-DEF-20L',
          product_name: 'MAK DEF ADBLUE (20L)',
          category: 'Diesel Exhaust Fluid',
          package_size: '20L',
          sale_price: 950,
          cost_price: 750,
          stock_qty: 30,
          reorder_level: 5,
        },
      ],
    });

    const state = erpStore.getState();
    const cust = state.customers.find((c) => c.id === 99);
    expect(cust).toBeDefined();
    expect(cust?.name).toBe('LIVE FLEET LOGISTICS');
    expect(cust?.current_outstanding).toBe(25000);

    const card = state.cardSettlements.find((s) => s.batch_no === 'B-101');
    expect(card).toBeDefined();
    expect(card?.amount).toBe(12500);

    const prod = state.products.find((p) => p.code === 'LUB-DEF-20L');
    expect(prod).toBeDefined();
    expect(prod?.current_stock_units).toBe(30);
  });

  it('saves bank accounts and guards contra transfers between identical accounts or zero amount', () => {
    const acc = erpStore.saveBankAccount({
      name: 'HDFC CURRENT 4455',
      type: 'CURRENT',
      balance: 50000.0,
    });
    expect(acc.id).toBeDefined();
    expect(acc.name).toBe('HDFC CURRENT 4455');
    expect(acc.balance).toBe(50000.0);

    // Transfer from acc to itself must throw
    expect(() => {
      erpStore.recordTransfer({
        from_account_id: acc.id,
        to_account_id: acc.id,
        amount: 5000.0,
      });
    }).toThrow('Source and destination accounts must be different');

    // Transfer with zero amount must throw
    expect(() => {
      erpStore.recordTransfer({
        from_account_id: acc.id,
        to_account_id: 1,
        amount: 0,
      });
    }).toThrow('Transfer amount must be greater than zero');
  });

  it('saves new employee and records cash retail sale with automatic tank deduction', () => {
    const emp = erpStore.saveEmployee({
      name: 'Ramesh Patel',
      code: 'EMP99',
      mobile: '9825112233',
    });
    expect(emp.name).toBe('RAMESH PATEL');
    expect(emp.code).toBe('EMP99');

    const state = erpStore.getState();
    const foundEmp = state.employees.find((e) => e.code === 'EMP99');
    expect(foundEmp).toBeDefined();

    const cashAcc = state.bankAccounts.find((a) => a.type === 'CASH') || state.bankAccounts[0];
    const prevCashBal = cashAcc.balance;
    const msTank = state.tanks.find((t) => t.code === 'MS');
    const prevStock = msTank ? msTank.current_stock : 0;

    erpStore.recordCashSale(2000.0, 'MS', 19.48);

    expect(cashAcc.balance).toBeCloseTo(prevCashBal + 2000.0, 2);
    if (msTank) {
      expect(msTank.current_stock).toBeCloseTo(prevStock - 19.48, 2);
    }
  });

  it('atomically deletes expense and restores cash account balance in store', () => {
    const getCashBal = () => erpStore.getState().bankAccounts.find((a) => a.type === 'CASH')?.balance || 0;
    const initialBal = getCashBal();

    const exp = erpStore.recordExpense({
      category: 'Cleaning Supplies',
      amount: 450.0,
      narration: 'Forecourt sweeping mop',
    });

    expect(getCashBal()).toBeCloseTo(initialBal - 450.0, 2);
    expect(erpStore.getState().expenses.some((e) => e.id === exp.id)).toBe(true);

    const deleted = erpStore.deleteExpense(exp.id);
    expect(deleted).toBe(true);
    expect(getCashBal()).toBeCloseTo(initialBal, 2);
    expect(erpStore.getState().expenses.some((e) => e.id === exp.id)).toBe(false);
  });

  it('atomically deletes payment receipt and reverts customer and cash balances in store', () => {
    const custId = erpStore.getState().customers[0].id;
    const custName = erpStore.getState().customers[0].name;
    const getCustBal = () => erpStore.getState().customers.find((c) => c.id === custId)?.current_outstanding || 0;
    const getCashBal = () => erpStore.getState().bankAccounts.find((a) => a.type === 'CASH')?.balance || 0;

    const initialOutstanding = getCustBal();
    const initialCash = getCashBal();

    const rcp = erpStore.recordPaymentReceipt({
      customer_name: custName,
      amount: 5000.0,
      payment_mode: 'CASH',
    });

    expect(getCustBal()).toBeCloseTo(initialOutstanding - 5000.0, 2);
    expect(getCashBal()).toBeCloseTo(initialCash + 5000.0, 2);

    const deleted = erpStore.deletePaymentReceipt(rcp.id);
    expect(deleted).toBe(true);
    expect(getCustBal()).toBeCloseTo(initialOutstanding, 2);
    expect(getCashBal()).toBeCloseTo(initialCash, 2);
  });

  it('atomically deletes credit bill and reverts customer outstanding balance in store', () => {
    const cust = erpStore.getState().customers[0];
    const getCustBal = () => erpStore.getState().customers.find((c) => c.id === cust.id)?.current_outstanding || 0;
    const initialOutstanding = getCustBal();

    const bill = erpStore.recordCreditBill({
      customer_id: cust.id,
      vehicle_no: 'GJ05AB1234',
      product_name: 'High Speed Diesel',
      qty: 100,
      rate: 94.5,
      slip_no: 'SLIP-DEL-TEST',
      manager_override_pin: '1234',
    });

    expect(getCustBal()).toBeCloseTo(initialOutstanding + 9450.0, 2);

    const deleted = erpStore.deleteCreditBill(bill.bill_no);
    expect(deleted).toBe(true);
    expect(getCustBal()).toBeCloseTo(initialOutstanding, 2);
    expect(erpStore.getState().creditBills.some((b) => b.bill_no === bill.bill_no)).toBe(false);
  });

  it('atomically deletes purchase decanting and rolls back tank stock in store', () => {
    const tankId = erpStore.getState().tanks[0].id;
    const getTankStock = () => erpStore.getState().tanks.find((t) => t.id === tankId)?.current_stock || 0;
    const initialStock = getTankStock();

    const purchase = erpStore.recordPurchaseDecantation({
      invoice_no: 'INV-TEST-ROLLBACK',
      dealer_name: 'IOCL',
      tanker_vehicle_no: 'MH04AB1234',
      tank_id: tankId,
      product_id: 1,
      qty_kl: 2.0,
      rate_per_kl: 75000,
      sample_density: 745.0,
      observed_density: 745.0,
      observed_temp: 15.0,
      manager_override_pin: '1234',
    });

    expect(getTankStock()).toBeCloseTo(initialStock + 2000.0, 2);

    const deleted = erpStore.deletePurchase(purchase.invoice_no);
    expect(deleted).toBe(true);
    expect(getTankStock()).toBeCloseTo(initialStock, 2);
    expect(erpStore.getState().purchases.some((p) => p.invoice_no === 'INV-TEST-ROLLBACK')).toBe(false);
  });

  it('atomically deletes contra transfer and reverts both bank account balances', () => {
    const fromAcc = erpStore.getState().bankAccounts[0];
    const toAcc = erpStore.getState().bankAccounts[1];
    const initialFromBal = fromAcc.balance;
    const initialToBal = toAcc.balance;

    const trf = erpStore.recordTransfer({
      from_account_id: fromAcc.id,
      to_account_id: toAcc.id,
      amount: 1500.0,
      remarks: 'Test Contra Deposit',
    });

    expect(erpStore.getState().bankAccounts.find((a) => a.id === fromAcc.id)?.balance).toBeCloseTo(initialFromBal - 1500.0, 2);
    expect(erpStore.getState().bankAccounts.find((a) => a.id === toAcc.id)?.balance).toBeCloseTo(initialToBal + 1500.0, 2);

    const reverted = erpStore.deleteTransfer(trf.id);
    expect(reverted).toBe(true);
    expect(erpStore.getState().bankAccounts.find((a) => a.id === fromAcc.id)?.balance).toBeCloseTo(initialFromBal, 2);
    expect(erpStore.getState().bankAccounts.find((a) => a.id === toAcc.id)?.balance).toBeCloseTo(initialToBal, 2);
    expect(erpStore.getState().transfers.some((t) => t.id === trf.id)).toBe(false);
  });

  it('saves, tracks, and deletes estimates and quotations', () => {
    const quote = erpStore.saveQuotation({
      customer_name: 'GUJARAT LOGISTICS CORP',
      customer_mobile: '9898011223',
      items: [
        { product_name: 'Diesel (HSD)', qty: 1000, rate: 92.5, amount: 92500, tax_percent: 13.7 },
      ],
    });

    expect(quote.quotation_no).toBeDefined();
    expect(quote.total_amount).toBe(92500);
    expect(erpStore.getState().quotations.some((q) => q.id === quote.id)).toBe(true);

    const deleted = erpStore.deleteQuotation(quote.id);
    expect(deleted).toBe(true);
    expect(erpStore.getState().quotations.some((q) => q.id === quote.id)).toBe(false);
  });

  it('removes vehicle from customer fleet list in store', () => {
    const cust = erpStore.saveCustomer({
      name: 'AMBICA TRANSPORT',
      mobile: '9825123456',
      vehicles: ['GJ05AB9999', 'GJ05CD8888'],
    });

    erpStore.removeCustomerVehicle(cust.id, 'GJ05AB9999');
    expect(erpStore.getState().customers.find((c) => c.id === cust.id)?.vehicles).not.toContain('GJ05AB9999');
    expect(erpStore.getState().customers.find((c) => c.id === cust.id)?.vehicles).toContain('GJ05CD8888');
  });

  it('records retail cash bills and reverses cash balance and tank stock on void/delete', () => {
    const cashAcc = erpStore.getState().bankAccounts.find((a) => a.type === 'CASH')!;
    const msTank = erpStore.getState().tanks.find((t) => t.code === 'MS')!;
    const initialCash = cashAcc.balance;
    const initialStock = msTank.current_stock;

    const bill = erpStore.recordCashBill({
      bill_no: 'POS-TEST-101',
      vehicle_no: 'GJ05ZZ1234',
      product_name: 'Motor Spirit (Petrol)',
      product_code: 'MS',
      qty: 25.0,
      rate: 102.65,
      amount: 2566.25,
      payment_mode: 'CASH',
    });

    expect(erpStore.getState().cashBills.some((b) => b.id === bill.id)).toBe(true);
    expect(erpStore.getState().bankAccounts.find((a) => a.id === cashAcc.id)?.balance).toBeCloseTo(initialCash + 2566.25, 2);
    expect(erpStore.getState().tanks.find((t) => t.id === msTank.id)?.current_stock).toBeCloseTo(initialStock - 25.0, 2);

    const voided = erpStore.deleteCashBill(bill.id);
    expect(voided).toBe(true);
    expect(erpStore.getState().cashBills.some((b) => b.id === bill.id)).toBe(false);
    expect(erpStore.getState().bankAccounts.find((a) => a.id === cashAcc.id)?.balance).toBeCloseTo(initialCash, 2);
    expect(erpStore.getState().tanks.find((t) => t.id === msTank.id)?.current_stock).toBeCloseTo(initialStock, 2);
  });
});


