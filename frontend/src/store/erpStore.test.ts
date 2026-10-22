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
});

