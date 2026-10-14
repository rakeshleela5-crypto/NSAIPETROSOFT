import React, { useEffect, useState } from 'react';
import './App.css';
import {
  API_BASE_URL,
  createCreditSale,
  createPurchase,
  createTankDip,
  fetchCustomers,
  fetchDashboard,
  fetchHealth,
  fetchRates,
  saveShiftMeters,
  updateRate,
} from './api/client';
import type {
  CustomerFull,
  DashboardResponse,
  FuelProductRate,
} from './api/client';

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [selectedAccount, setSelectedAccount] = useState<string>('CASH ON HAND');

  // Active Windows Dialog State
  const [activeDialog, setActiveDialog] = useState<
    'sales' | 'credit' | 'payment' | 'expense' | 'transfer' | 'rate' | 'purchase' | 'dip' | 'reports' | null
  >(null);

  // Rate Master State
  const [ratesList, setRatesList] = useState<FuelProductRate[]>([]);
  const [rateHist, setRateHist] = useState<any[]>([]);
  const [rateProduct, setRateProduct] = useState<number>(1);
  const [rateValue, setRateValue] = useState<number>(90.21);

  // Credit Customer Sale State (Frame 0021)
  const [customers, setCustomers] = useState<CustomerFull[]>([]);
  const [creditCustId, setCreditCustId] = useState<number>(1);
  const [creditVehicle, setCreditVehicle] = useState<string>('GJ19AS1454');
  const [creditProductId, setCreditProductId] = useState<number>(1);
  const [creditQty, setCreditQty] = useState<number>(160.0);
  const [creditRate, setCreditRate] = useState<number>(90.21);
  const [creditSlipNo, setCreditSlipNo] = useState<string>('0');
  const [creditBillNo, setCreditBillNo] = useState<string>('37');
  const [creditCashPaid, setCreditCashPaid] = useState<number>(0.0);
  const [creditRemark, setCreditRemark] = useState<string>('');
  const [whatsappSlip, setWhatsappSlip] = useState<string | null>(null);

  // Past Credit Bills in Grid (Frame 0021)
  const [creditBillsList, setCreditBillsList] = useState<any[]>([
    { date: '17 Apr 2026', shift: 'First', slip: '0', bill: '36', cust: 'PORT TRANSPORT', vehicle: 'GJ19AS1454', qty: 160.0, total: 15072.0 },
    { date: '16 Apr 2026', shift: 'First', slip: '0', bill: '35', cust: 'HINESHBHAI', vehicle: 'MH14AS2545', qty: 177.29, total: 16000.0 },
    { date: '16 Apr 2026', shift: 'First', slip: '0', bill: '34', cust: 'ABC TRANSPORT', vehicle: 'GJ18AS557', qty: 160.0, total: 14440.0 },
    { date: '16 Apr 2026', shift: 'First', slip: '0', bill: '33', cust: 'ABC TRANSPORT', vehicle: 'GJ01AS7487', qty: 120.0, total: 10830.0 },
    { date: '15 Apr 2026', shift: 'First', slip: '0', bill: '32', cust: 'SHREE SAM', vehicle: 'GJ15AS8901', qty: 551.02, total: 50000.0 },
    { date: '14 Apr 2026', shift: 'First', slip: '0', bill: '31', cust: 'CJI CONTRCUTION', vehicle: 'GJ04AT2211', qty: 30.0, total: 2722.2 },
    { date: '13 Apr 2026', shift: 'First', slip: '0', bill: '30', cust: 'SHREE SAM', vehicle: 'GJ15AS8901', qty: 220.41, total: 20000.0 },
    { date: '13 Apr 2026', shift: 'First', slip: '0', bill: '29', cust: 'SHREE SAM', vehicle: 'GJ15AS8901', qty: 330.61, total: 30000.0 },
    { date: '12 Apr 2026', shift: 'First', slip: '0', bill: '28', cust: 'SHREE SAM', vehicle: 'GJ15AS8901', qty: 551.02, total: 50000.0 },
    { date: '11 Apr 2026', shift: 'First', slip: '0', bill: '00027', cust: 'SHREE SAM', vehicle: 'GJ15AS8901', qty: 551.02, total: 50000.0 },
    { date: '10 Apr 2026', shift: 'First', slip: '0', bill: '26', cust: 'DUDH MANDLI', vehicle: 'GJ02BB3344', qty: 165.31, total: 15000.0 },
  ]);

  // Sales Entry Nozzle Totalizer Readings (Frame 0110)
  const [salesReadings, setSalesReadings] = useState<any[]>([
    { emp: 'AA', nozzle: 'HSD 1', item: 'Diesel', open: 5268.0, close: 6254.0, test: 0, qty: 986.0, rate: 90.21, amount: 88947.06, vat: 11534.48, lube: 0 },
    { emp: 'AA', nozzle: 'HSD 2', item: 'Diesel', open: 10254.0, close: 11254.0, test: 0, qty: 1000.0, rate: 90.21, amount: 90210.0, vat: 11698.25, lube: 0 },
    { emp: 'AA', nozzle: 'HSD 3', item: 'Diesel', open: 10474.0, close: 11256.0, test: 0, qty: 782.0, rate: 90.21, amount: 70544.22, vat: 9148.03, lube: 0 },
    { emp: 'AA', nozzle: 'HSD 4', item: 'Diesel', open: 12478.0, close: 13256.0, test: 0, qty: 778.0, rate: 90.21, amount: 70183.38, vat: 9101.24, lube: 0 },
    { emp: 'AA', nozzle: 'MS 1', item: 'Petrol', open: 1859.0, close: 2014.0, test: 0, qty: 155.0, rate: 94.25, amount: 14608.75, vat: 1760.25, lube: 0 },
    { emp: 'AA', nozzle: 'MS 2', item: 'Petrol', open: 10254.0, close: 11247.0, test: 0, qty: 0.0, rate: 94.25, amount: 0.0, vat: 0.0, lube: 0 },
    { emp: 'AA', nozzle: 'MS 3', item: 'Petrol', open: 8547.0, close: 0.0, test: 0, qty: 0.0, rate: 94.25, amount: 0.0, vat: 0.0, lube: 0 },
    { emp: 'AA', nozzle: 'MS 4', item: 'Petrol', open: 9258.0, close: 0.0, test: 0, qty: 0.0, rate: 94.25, amount: 0.0, vat: 0.0, lube: 0 },
  ]);

  // Payment Receipt State (Frame 0085)
  const [payReceiptNo, setPayReceiptNo] = useState<string>('00006');
  const [payCustName, setPayCustName] = useState<string>('LIVAVATI TRANSPORTY');
  const [payDate] = useState<string>('17-Apr-2026');
  const [payTotalPurch] = useState<number>(178867.2);
  const [payTotalPaid] = useState<number>(15000.0);
  const [payTotalUnpaid] = useState<number>(163867.2);
  const [payMode, setPayMode] = useState<string>('UPI PAYMENT');
  const [payBank, setPayBank] = useState<string>('PAYTM');
  const [payAmount, setPayAmount] = useState<number>(50000.0);
  const [payReceiptsHistory] = useState<any[]>([
    { shift: 'First', date: '17 Apr 2026', cust: 'LIVAVATI TRANSPORTY', mode: 'CASH', amt: 15000.0 },
    { shift: 'First', date: '17 Apr 2026', cust: 'PORT TRANSPORT', mode: 'CASH', amt: 6000.0 },
    { shift: 'First', date: '17 Apr 2026', cust: 'PORT TRANSPORT', mode: 'CASH', amt: 15000.0 },
    { shift: 'First', date: '16 Apr 2026', cust: 'ABC TRANSPORT', mode: 'CHEQUE', amt: 50000.0 },
    { shift: 'First', date: '16 Apr 2026', cust: 'ABC TRANSPORT', mode: 'CASH', amt: 15000.0 },
  ]);

  // Tank Dip State
  const [dipTankId, setDipTankId] = useState<number>(1);
  const [dipOpenCm, setDipOpenCm] = useState<number>(142.5);
  const [dipOpenStock, setDipOpenStock] = useState<number>(13150.0);
  const [dipReceipt, setDipReceipt] = useState<number>(4000.0);
  const [dipCloseCm, setDipCloseCm] = useState<number>(186.0);
  const [dipCloseStock, setDipCloseStock] = useState<number>(16890.0);

  // Purchase Decanting State
  const [purInvoiceNo, setPurInvoiceNo] = useState<string>('3215788');
  const [purDealer, setPurDealer] = useState<string>('BHARAT PETROLEUM CO LTD');
  const [purVehicleNo, setPurVehicleNo] = useState<string>('GJ01DU6553');
  const [purDensity, setPurDensity] = useState<number>(825.4);
  const [purQtyKl, setPurQtyKl] = useState<number>(4.0);
  const [purRateKl, setPurRateKl] = useState<number>(72478.36);

  // Load Dashboard Data from Live Railway Backend
  const loadData = async () => {
    try {
      const h = await fetchHealth();
      setBackendOnline(h.status === 'healthy');
      const d = await fetchDashboard();
      setDashboard(d);
    } catch {
      setBackendOnline(false);
      // High-fidelity fallback pixel-matched to Frame 0010
      setDashboard({
        kpis: {
          today_sale: 664908.18,
          total_outstanding: 1127695.8,
          total_balance: 22374520.21,
          total_stock_cost: 2117060.06,
        },
        breakdown: {
          cash: 237659.88,
          credit: 54091.46,
          digital: 373156.84,
          total: 664908.18,
        },
        tanks: [
          { id: 1, name: 'MS', product: 'Petrol', code: 'MS', capacity: 20000, current_stock: 13150, percent: 66, dip_cm: 142.5, is_low: false },
          { id: 2, name: 'HSD', product: 'Diesel', code: 'HSD', capacity: 20000, current_stock: 16890, percent: 84, dip_cm: 186.0, is_low: false },
        ],
        customers: [
          { id: 1, code: '21', name: 'PORT TRANSPORT', city: 'SURAT', mobile: '+91 7096386817', outstanding: 795532.21, credit_limit: 1000000 },
          { id: 2, code: '19', name: 'JITU OD', city: 'AHMEDABAD', mobile: '+91 9999999999', outstanding: 632120.0, credit_limit: 800000 },
          { id: 3, code: '11', name: 'KEL INFRAS', city: 'VADODARA', mobile: '+91 9999999998', outstanding: 93765.27, credit_limit: 300000 },
          { id: 4, code: '20', name: 'ABC TRANSPORT', city: 'VAPI', mobile: '+91 9727181188', outstanding: 50270.0, credit_limit: 200000 },
          { id: 5, code: '05', name: 'HINESHBHAI', city: 'SURAT', mobile: '+91 9898989898', outstanding: 34760.0, credit_limit: 100000 },
          { id: 6, code: '06', name: 'DUDH MANDLI', city: 'VYARA', mobile: '+91 9898989897', outstanding: 30000.0, credit_limit: 100000 },
          { id: 7, code: '07', name: 'DOODH MANDLI UM', city: 'UMARPADA', mobile: '+91 9898989896', outstanding: 19968.0, credit_limit: 50000 },
          { id: 8, code: '08', name: 'TOL MAP', city: 'SONGADH', mobile: '+91 9898989895', outstanding: 8926.8, credit_limit: 50000 },
          { id: 9, code: '09', name: 'RAJ', city: 'SURAT', mobile: '+91 9898989894', outstanding: 8907.4, credit_limit: 50000 },
          { id: 10, code: '10', name: 'ABCD TRANSPORT', city: 'NAVSARI', mobile: '+91 9898989893', outstanding: 5000.0, credit_limit: 50000 },
          { id: 11, code: '12', name: 'NILMANI TRANS', city: 'VALSAD', mobile: '+91 9898989892', outstanding: 4531.55, credit_limit: 50000 },
          { id: 12, code: '13', name: 'YAKESH BHAI', city: 'SURAT', mobile: '+91 9898989891', outstanding: 3500.0, credit_limit: 20000 },
          { id: 13, code: '14', name: 'SHAILESHBHAI', city: 'SURAT', mobile: '+91 9898989890', outstanding: 0.0, credit_limit: 50000 },
          { id: 14, code: '15', name: 'SHREE FORAM', city: 'SURAT', mobile: '+91 9898989889', outstanding: 0.0, credit_limit: 50000 },
        ],
        accounts: [
          { id: 1, name: 'CASH ON HAND', type: 'CASH', balance: 450448.86 },
          { id: 2, name: 'PAYTM', type: 'WALLET', balance: 92683.82 },
          { id: 3, name: 'M SWIPE', type: 'POS', balance: 799801.26 },
          { id: 4, name: 'PETRO CARD', type: 'CARD', balance: 3388191.24 },
          { id: 5, name: 'BOB CA 115', type: 'CURRENT', balance: 9999.81 },
          { id: 6, name: 'PRIME CA 00236', type: 'CURRENT', balance: 159823.09 },
          { id: 7, name: 'HDFC CA 0459', type: 'CURRENT', balance: 26000943.17 },
          { id: 8, name: 'CASH JAMAA', type: 'CASH', balance: 0.0 },
          { id: 9, name: 'BOB SB 6189', type: 'SAVINGS', balance: 536949.77 },
          { id: 10, name: 'GPAY', type: 'WALLET', balance: 18015.0 },
          { id: 11, name: 'ICICI CARD', type: 'POS', balance: 2348016.71 },
          { id: 12, name: 'YES BANK', type: 'CURRENT', balance: 10373611.98 },
          { id: 13, name: 'POST OFFICE SB AC.439', type: 'SAVINGS', balance: 17159.0 },
        ],
        active_shift: {
          so_number: '00017',
          date: '2026-04-17',
          shift_name: 'First',
          status: 'Closed',
        },
      });
    }
  };

  useEffect(() => {
    loadData();
    fetchCustomers().then(setCustomers).catch(() => {});

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveDialog(null);
      else if (e.key === 'F1') {
        e.preventDefault();
        setActiveDialog('sales');
      } else if (e.key === 'F2') {
        e.preventDefault();
        openRateMaster();
      } else if (e.key === 'F3') {
        e.preventDefault();
        setActiveDialog('credit');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openRateMaster = async () => {
    try {
      const data = await fetchRates();
      setRatesList(data.products);
      setRateHist(data.history);
      if (data.products.length > 0) {
        setRateProduct(data.products[0].id);
        setRateValue(data.products[0].rate);
      }
    } catch {
      setRatesList([
        { id: 1, code: 'HSD', name: 'Diesel (HSD)', rate: 90.21, vat_percent: 14.9, cess_percent: 4.0 },
        { id: 2, code: 'MS', name: 'Petrol (MS)', rate: 94.25, vat_percent: 13.7, cess_percent: 4.0 },
      ]);
    }
    setActiveDialog('rate');
  };

  // Handlers
  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateRate(rateProduct, rateValue);
      alert('Rate updated successfully!');
      openRateMaster();
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error updating rate');
    }
  };

  const handleSaveCreditSale = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createCreditSale({
        customer_id: creditCustId,
        vehicle_no: creditVehicle,
        product_id: creditProductId,
        slip_no: creditSlipNo,
        qty: creditQty,
        rate: creditRate,
        cash_paid: creditCashPaid,
        remarks: creditRemark,
      });
      setWhatsappSlip(res.whatsapp_preview);
      const newBill = {
        date: '17 Apr 2026',
        shift: 'First',
        slip: creditSlipNo,
        bill: res.bill_no,
        cust: customers.find((c) => c.id === creditCustId)?.name || 'CUSTOMER',
        vehicle: creditVehicle,
        qty: creditQty,
        total: creditQty * creditRate - creditCashPaid,
      };
      setCreditBillsList([newBill, ...creditBillsList]);
      alert(`Credit Bill #${res.bill_no} Saved! Balance: ₹${res.new_balance.toFixed(2)}`);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error saving credit bill');
    }
  };

  const handleSaveShiftMeters = async () => {
    try {
      await saveShiftMeters({
        shift_name: 'First',
        readings: salesReadings.map((r, i) => ({
          nozzle_id: i + 1,
          opening_meter: r.open,
          closing_meter: r.close,
          testing_qty: r.test,
        })),
      });
      alert('Shift meter readings saved and totalizers updated!');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error saving shift meters');
    }
  };

  const handleSaveDip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createTankDip({
        tank_id: dipTankId,
        opening_dip: dipOpenCm,
        opening_stock: dipOpenStock,
        receipt_liters: dipReceipt,
        closing_dip: dipCloseCm,
        closing_stock: dipCloseStock,
      });
      alert(`Dip recorded! Variation: ${res.variation_liters} L (Tolerance: ${res.tolerance_limit} L)`);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error recording dip');
    }
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createPurchase({
        invoice_no: purInvoiceNo,
        dealer_name: purDealer,
        tanker_vehicle_no: purVehicleNo,
        sample_density: purDensity,
        product_id: 1,
        qty_kl: purQtyKl,
        rate_per_kl: purRateKl,
      });
      alert(`Tanker Inward #${res.invoice_no} Saved!`);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Error saving purchase');
    }
  };

  const kpis = dashboard?.kpis || {
    today_sale: 664908.18,
    total_outstanding: 1127695.8,
    total_balance: 22374520.21,
    total_stock_cost: 2117060.06,
  };
  const breakdown = dashboard?.breakdown || {
    cash: 237659.88,
    credit: 54091.46,
    digital: 373156.84,
    total: 664908.18,
  };
  const tanks = dashboard?.tanks || [
    { id: 1, name: 'MS', product: 'Petrol', code: 'MS', capacity: 20000, current_stock: 13150, percent: 66, dip_cm: 142.5, is_low: false },
    { id: 2, name: 'HSD', product: 'Diesel', code: 'HSD', capacity: 20000, current_stock: 16890, percent: 84, dip_cm: 186.0, is_low: false },
  ];
  const customersList = dashboard?.customers || [];
  const accountsList = dashboard?.accounts || [];

  return (
    <div className="win-desktop-shell">
      {/* -------------------------------------------------------------
       * 1. Window Title Bar (Windows Desktop App Chrome)
       * ------------------------------------------------------------- */}
      <div className="win-titlebar">
        <div className="win-title-left">
          <span>⛽</span>
          <span>Dashboard</span>
        </div>
        <div className="win-controls">
          <button className="win-btn" title="Minimize">_</button>
          <button className="win-btn" title="Maximize">□</button>
          <button className="win-btn win-btn-close" title="Close">✕</button>
        </div>
      </div>

      {/* -------------------------------------------------------------
       * 2. Classic ERP Menu Bar
       * ------------------------------------------------------------- */}
      <div className="win-menubar">
        <button className="win-menu-item" onClick={() => openRateMaster()}>Masters</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('sales')}>Data Entry</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('reports')}>Reports</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('dip')}>View Stock</button>
        <button className="win-menu-item">Control Panel</button>
        <button className="win-menu-item">Help</button>
        <button className="win-menu-item">Calculator</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('credit')}>Credit Bills</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('payment')}>Card Entry</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('sales')}>Cash Bill</button>
      </div>

      {/* -------------------------------------------------------------
       * 3. Top Banner Ribbon
       * ------------------------------------------------------------- */}
      <div className="win-ribbon-bar">
        <div className="win-welcome-text">
          WELCOME : NSAIPETROSOFT
        </div>

        <div className="win-ribbon-center">
          <button className="btn-stamp-reminder">Stamping Reminder</button>
          <button className="btn-help-desk">Help Desk</button>
        </div>

        <div className="win-ribbon-right">
          <span>License : 228 Day(s) Left</span>
          <span>Finacial Year : 2026-27</span>
          <span style={{ fontSize: '11px', color: backendOnline ? '#2e7d32' : '#e67e22' }} title={`API Base URL: ${API_BASE_URL}`}>
            ● {backendOnline ? 'Cloud Backend Connected' : 'Demo State'}
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------------
       * 4. Main Workspace (Sidebar + Dashboard Content)
       * ------------------------------------------------------------- */}
      <div className="win-workspace">
        {/* Left Vertical Sidebar - 8 3D Glossy Gel Buttons */}
        <aside className="win-sidebar">
          <div className="gel-btn gel-purple" onClick={openRateMaster}>
            Rate Master
          </div>
          <div className="gel-btn gel-blue" onClick={() => setActiveDialog('credit')}>
            Credit<br />Customer
          </div>
          <div className="gel-btn gel-pink" onClick={() => setActiveDialog('payment')}>
            Payment<br />Receipt
          </div>
          <div className="gel-btn gel-green" onClick={() => setActiveDialog('expense')}>
            Expence<br />Book
          </div>
          <div className="gel-btn gel-yellow" onClick={() => setActiveDialog('transfer')}>
            Transfer<br />Entry
          </div>
          <div className="gel-btn gel-orange" onClick={() => setActiveDialog('sales')}>
            Sales Entry
          </div>
          <div className="gel-btn gel-magenta" onClick={() => setActiveDialog('purchase')}>
            Purchase<br />Entry
          </div>
          <div className="gel-btn gel-cyan" onClick={() => setActiveDialog('dip')}>
            DIP<br />REGISTER
          </div>
        </aside>

        {/* Dashboard Area */}
        <main className="win-content">
          {/* Top 4 KPI Tiles */}
          <div className="win-kpi-row">
            {/* Card 1: Today's Sale */}
            <div className="win-kpi-card kpi-blue-bg">
              <div className="kpi-icon-box">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 17l6-6 4 4 8-8" />
                  <circle cx="21" cy="7" r="2" fill="currentColor" />
                </svg>
              </div>
              <div className="kpi-text-box">
                <div className="kpi-title">Today's Sale</div>
                <div className="kpi-value">₹ {kpis.today_sale.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            {/* Card 2: Total Outstanding */}
            <div className="win-kpi-card kpi-red-bg">
              <div className="kpi-icon-box">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="12" width="4" height="9" fill="currentColor" />
                  <rect x="10" y="7" width="4" height="14" fill="currentColor" />
                  <rect x="17" y="3" width="4" height="18" fill="currentColor" />
                </svg>
              </div>
              <div className="kpi-text-box">
                <div className="kpi-title">Total Outstanding</div>
                <div className="kpi-value">₹ {kpis.total_outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            {/* Card 3: Total Balance */}
            <div className="win-kpi-card kpi-teal-bg">
              <div className="kpi-icon-box">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <div className="kpi-text-box">
                <div className="kpi-title">Total Balance</div>
                <div className="kpi-value">₹ {kpis.total_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            {/* Card 4: Total Stock Cost */}
            <div className="win-kpi-card kpi-red-bg">
              <div className="kpi-icon-box">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="14" width="4" height="7" fill="currentColor" />
                  <rect x="10" y="9" width="4" height="12" fill="currentColor" />
                  <rect x="17" y="4" width="4" height="17" fill="currentColor" />
                </svg>
              </div>
              <div className="kpi-text-box">
                <div className="kpi-title">Total Stock Cost</div>
                <div className="kpi-value">₹ {kpis.total_stock_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
          </div>

          {/* Main 2-Column Split */}
          <div className="win-main-grid">
            {/* Left Column: Payment Breakdown + Stock Summary */}
            <div className="win-left-column">
              {/* Payment Breakdown Panel */}
              <div className="win-panel-box">
                <div className="win-panel-heading">Payment Breakdown</div>
                <div className="breakdown-row">
                  <div className="breakdown-card card-cash">
                    <span>💵</span>
                  </div>
                  <div className="breakdown-card card-credit">
                    <span>📋</span>
                  </div>
                  <div className="breakdown-card card-digital">
                    <span>📱</span>
                  </div>
                </div>

                <div className="breakdown-subtext-row">
                  <div className="breakdown-item-label">
                    <div className="item-label-name">Cash</div>
                    <div className="item-label-amt">₹ {breakdown.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="breakdown-item-label">
                    <div className="item-label-name">Credit</div>
                    <div className="item-label-amt">₹ {breakdown.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="breakdown-item-label">
                    <div className="item-label-name">Digital</div>
                    <div className="item-label-amt">₹ {breakdown.digital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>

                <div className="total-collection-bar">
                  Total Collection : ₹ {breakdown.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>

              {/* Stock Summary Panel */}
              <div className="stock-panel">
                <div className="stock-panel-title">Stock Summary</div>
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>TankName</th>
                      <th>Stock Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tanks.map((t) => (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td>
                          <div className="progress-container">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${Math.min(100, Math.max(10, t.percent))}%` }}
                            >
                              {t.current_stock.toLocaleString('en-IN')} / {t.percent}%
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: Customer Outstanding & Bank Accounts */}
            <div className="win-right-column">
              {/* Top Grid: Customer Outstanding */}
              <div className="win-grid-container">
                <div className="win-grid-scroll">
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th style={{ width: '65%' }}>Customer Name</th>
                        <th className="text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customersList.map((c) => (
                        <tr key={c.id}>
                          <td>{c.name}</td>
                          <td className="text-right">{c.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Grid: Account Balances */}
              <div className="win-grid-container">
                <div className="win-grid-scroll">
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th style={{ width: '65%' }}>Account</th>
                        <th className="text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountsList.map((a) => (
                        <tr
                          key={a.id}
                          className={selectedAccount === a.name ? 'win-selected-row' : ''}
                          onClick={() => setSelectedAccount(a.name)}
                        >
                          <td>{a.name}</td>
                          <td className="text-right">{a.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* -------------------------------------------------------------
       * 5. Bottom Status Footer Bar
       * ------------------------------------------------------------- */}
      <footer className="win-footer-bar">
        <span>Sharpnet Technology Pvt Ltd... For Service Support Contact No : +91-63551-90064  ::  +91-9586651811</span>
        <span>Time : 09:00 AM - 05:00 PM</span>
      </footer>

      {/* =============================================================
       * MODAL 1: Sales Entry & Nozzle Meter Totalizers (Frame 0110)
       * ============================================================= */}
      {activeDialog === 'sales' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '920px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⛽</span>
                <span>Sales Entry</span>
              </div>
              <div className="win-controls">
                <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
              </div>
            </div>

            <div className="win-dialog-body">
              {/* Header Info Bar */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '8px' }}>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '40px' }}>Date</span>
                  <input type="text" className="win-input" defaultValue="17-Apr-2026" style={{ width: '100px' }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '40px' }}>Shift</span>
                  <select className="win-select" style={{ width: '80px' }}>
                    <option>First</option>
                    <option>Second</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
                  <input type="checkbox" /> Import Entry From App
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>SO NO.</span>
                  <input type="text" className="win-input" readOnly value="00017" style={{ width: '70px', fontWeight: 700 }} />
                </div>
              </div>

              {/* Meter Totalizer DataGrid */}
              <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '230px', overflowY: 'auto' }}>
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Nozzle Name</th>
                      <th>Item Name</th>
                      <th>Opening Meter</th>
                      <th>Closing Meter</th>
                      <th>Testing</th>
                      <th>Sale Qty</th>
                      <th>Rate</th>
                      <th>Total Amount</th>
                      <th>Vat</th>
                      <th>Lube</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesReadings.map((r, i) => (
                      <tr key={i}>
                        <td>{r.emp}</td>
                        <td>{r.nozzle}</td>
                        <td>{r.item}</td>
                        <td>{r.open.toFixed(3)}</td>
                        <td>
                          <input
                            type="number"
                            className="win-input"
                            style={{ width: '75px' }}
                            value={r.close}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const copy = [...salesReadings];
                              copy[i].close = val;
                              copy[i].qty = Math.max(0, val - copy[i].open - copy[i].test);
                              copy[i].amount = copy[i].qty * copy[i].rate;
                              copy[i].vat = (copy[i].amount * 0.13).toFixed(2);
                              setSalesReadings(copy);
                            }}
                          />
                        </td>
                        <td>{r.test}</td>
                        <td style={{ fontWeight: 700, color: '#1565c0' }}>{r.qty.toFixed(2)}</td>
                        <td>{r.rate}</td>
                        <td style={{ fontWeight: 700 }}>₹ {r.amount.toFixed(2)}</td>
                        <td>{r.vat}</td>
                        <td>{r.lube}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bottom Summary Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '10px', marginTop: '10px' }}>
                {/* Past Shifts Table */}
                <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '110px', overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>SONo</th>
                        <th>ShiftName</th>
                        <th>PersonName</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>16 Apr 2026</td>
                        <td>16</td>
                        <td>First</td>
                        <td>SHARPNETTECHNOLOGY</td>
                        <td><button className="win-btn-classic">Delete</button></td>
                      </tr>
                      <tr>
                        <td>15 Apr 2026</td>
                        <td>15</td>
                        <td>First</td>
                        <td>SHARPNETTECHNOLOGY</td>
                        <td><button className="win-btn-classic">Delete</button></td>
                      </tr>
                      <tr>
                        <td>14 Apr 2026</td>
                        <td>14</td>
                        <td>First</td>
                        <td>SHARPNETTECHNOLOGY</td>
                        <td><button className="win-btn-classic">Delete</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Totals & Nav Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div className="win-form-row">
                    <span className="win-label">Total Amount</span>
                    <input type="text" className="win-input" readOnly value="334493.41" style={{ fontWeight: 700 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">VAT Amount</span>
                    <input type="text" className="win-input" readOnly value="43242.24" />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">Basic Amount</span>
                    <input type="text" className="win-input" readOnly value="248008.93" />
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <button className="win-btn-classic" onClick={() => setActiveDialog('credit')}>Credit Entry</button>
                    <button className="win-btn-classic" onClick={() => setActiveDialog('expense')}>Expence Book</button>
                    <button className="win-btn-classic" onClick={() => setActiveDialog('payment')}>Payment Reciept</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save | F1=New | CTRL+A=Add To List</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="win-btn-classic win-btn-primary" onClick={handleSaveShiftMeters}>Save (F2)</button>
                <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 2: Credit Customer Sale & Vehicle Slip (Frame 0021)
       * ============================================================= */}
      {activeDialog === 'credit' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '960px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📋</span>
                <span>Credit Customer Sale</span>
              </div>
              <div className="win-controls">
                <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
              </div>
            </div>

            <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '12px' }}>
              {/* Left Column: Form Fields */}
              <div>
                <form onSubmit={handleSaveCreditSale}>
                  <div className="win-form-row">
                    <span className="win-label">Date</span>
                    <input type="text" className="win-input" defaultValue="17-Apr-2026" style={{ width: '90px' }} />
                    <span className="win-label" style={{ minWidth: '35px', marginLeft: '6px' }}>Shift</span>
                    <select className="win-select" style={{ width: '70px' }}>
                      <option>First</option>
                      <option>Second</option>
                    </select>
                  </div>

                  <div className="win-form-row">
                    <span className="win-label">Slip No</span>
                    <input
                      type="text"
                      className="win-input"
                      value={creditSlipNo}
                      onChange={(e) => setCreditSlipNo(e.target.value)}
                      style={{ width: '60px' }}
                    />
                    <span className="win-label" style={{ minWidth: '45px', marginLeft: '6px' }}>Bill No</span>
                    <input
                      type="text"
                      className="win-input"
                      value={creditBillNo}
                      onChange={(e) => setCreditBillNo(e.target.value)}
                      style={{ width: '60px', fontWeight: 700 }}
                    />
                  </div>

                  <div className="win-form-row">
                    <span className="win-label">Nozzle</span>
                    <select className="win-select" style={{ width: '120px' }}>
                      <option>MS 1</option>
                      <option>HSD 1</option>
                      <option>HSD 2</option>
                    </select>
                  </div>

                  <div className="win-form-row">
                    <span className="win-label">Customer</span>
                    <select
                      className="win-select"
                      style={{ flex: 1 }}
                      value={creditCustId}
                      onChange={(e) => {
                        const id = parseInt(e.target.value);
                        setCreditCustId(id);
                        const c = customers.find((x) => x.id === id);
                        if (c && c.vehicles && c.vehicles.length > 0) {
                          setCreditVehicle(c.vehicles[0]);
                        }
                      }}
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="win-form-row">
                    <span className="win-label">Vehicle</span>
                    <input
                      type="text"
                      className="win-input"
                      style={{ flex: 1 }}
                      value={creditVehicle}
                      onChange={(e) => setCreditVehicle(e.target.value.toUpperCase())}
                      placeholder="e.g. GJ19AS1454"
                    />
                  </div>

                  <div className="win-form-row">
                    <span className="win-label">Item Name</span>
                    <select
                      className="win-select"
                      style={{ flex: 1 }}
                      value={creditProductId}
                      onChange={(e) => {
                        const pid = parseInt(e.target.value);
                        setCreditProductId(pid);
                        setCreditRate(pid === 1 ? 90.21 : 94.25);
                      }}
                    >
                      <option value={1}>Diesel (HSD)</option>
                      <option value={2}>Petrol (MS)</option>
                    </select>
                  </div>

                  <div className="win-form-row">
                    <span className="win-label">Rate</span>
                    <input type="text" className="win-input" readOnly value={`₹ ${creditRate}`} style={{ width: '80px' }} />
                    <span className="win-label" style={{ minWidth: '35px', marginLeft: '6px' }}>Qty</span>
                    <input
                      type="number"
                      step="0.01"
                      className="win-input"
                      value={creditQty}
                      onChange={(e) => setCreditQty(parseFloat(e.target.value) || 0)}
                      style={{ width: '80px', fontWeight: 700 }}
                    />
                  </div>

                  <div className="win-form-row">
                    <span className="win-label">Amount</span>
                    <input
                      type="text"
                      className="win-input"
                      readOnly
                      value={`₹ ${(creditQty * creditRate).toFixed(2)}`}
                      style={{ fontWeight: 700, color: '#1565c0' }}
                    />
                  </div>

                  <div className="win-form-row">
                    <span className="win-label">Advance Cash</span>
                    <input
                      type="number"
                      className="win-input"
                      value={creditCashPaid}
                      onChange={(e) => setCreditCashPaid(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="win-form-row">
                    <span className="win-label">Remark</span>
                    <input
                      type="text"
                      className="win-input"
                      style={{ flex: 1 }}
                      value={creditRemark}
                      onChange={(e) => setCreditRemark(e.target.value)}
                    />
                  </div>

                  {whatsappSlip && (
                    <div style={{ background: '#e8f8f5', border: '1px solid #2ecc71', padding: '6px', fontSize: '11px', marginTop: '6px' }}>
                      📲 WhatsApp Slip Generated!
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                    <button type="submit" className="win-btn-classic win-btn-primary" style={{ flex: 1 }}>
                      Save (F2)
                    </button>
                    <button type="button" className="win-btn-classic" onClick={() => {
                      setCreditSlipNo('0');
                      setCreditQty(100.0);
                    }}>
                      New Entry
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: Existing Credit Invoices DataGrid */}
              <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #7f9db9', background: '#fff', height: '360px' }}>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>BillNo</th>
                        <th>CustomerName</th>
                        <th>VehicleNo</th>
                        <th className="text-right">QTY</th>
                        <th className="text-right">TotalAmount</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditBillsList.map((b, i) => (
                        <tr key={i}>
                          <td>{b.date}</td>
                          <td>{b.bill}</td>
                          <td>{b.cust}</td>
                          <td>{b.vehicle}</td>
                          <td className="text-right">{b.qty.toFixed(2)}</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>{b.total.toFixed(2)}</td>
                          <td>
                            <button
                              className="win-btn-classic"
                              style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                              onClick={() => {
                                const copy = [...creditBillsList];
                                copy.splice(i, 1);
                                setCreditBillsList(copy);
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ background: '#ece9d8', borderTop: '1px solid #7f9db9', padding: '4px 8px', display: 'flex', justifyContent: 'flex-end', fontWeight: 700 }}>
                  Total Amount: ₹ {creditBillsList.reduce((acc, curr) => acc + curr.total, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save | F1=New</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 3: Payment Receipt (Frame 0085)
       * ============================================================= */}
      {activeDialog === 'payment' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '920px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💰</span>
                <span>Customer's Payment</span>
              </div>
              <div className="win-controls">
                <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
              </div>
            </div>

            <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
              <div>
                <div className="win-form-row">
                  <span className="win-label">Shift</span>
                  <select className="win-select" style={{ width: '75px' }}><option>First</option></select>
                  <span className="win-label" style={{ minWidth: '70px', marginLeft: '6px' }}>Receipt No.</span>
                  <input type="text" className="win-input" readOnly value={payReceiptNo} style={{ width: '65px', fontWeight: 700 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Customer</span>
                  <input type="text" className="win-input" style={{ flex: 1 }} value={payCustName} onChange={(e) => setPayCustName(e.target.value)} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Receipt Date</span>
                  <input type="text" className="win-input" readOnly value={payDate} style={{ width: '100px' }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Total Purchase</span>
                  <input type="text" className="win-input" readOnly value={payTotalPurch.toFixed(2)} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Total Paid</span>
                  <input type="text" className="win-input" readOnly value={payTotalPaid.toFixed(2)} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Total Unpaid</span>
                  <input type="text" className="win-input" readOnly value={payTotalUnpaid.toFixed(2)} style={{ color: '#c0392b', fontWeight: 700 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Payment Mode</span>
                  <select className="win-select" style={{ flex: 1 }} value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                    <option>CASH</option>
                    <option>UPI PAYMENT</option>
                    <option>CHEQUE</option>
                    <option>NEFT / RTGS</option>
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">Receiving Bank</span>
                  <select className="win-select" style={{ flex: 1 }} value={payBank} onChange={(e) => setPayBank(e.target.value)}>
                    <option>PAYTM</option>
                    <option>HDFC CA 0459</option>
                    <option>CASH ON HAND</option>
                    <option>ICICI CARD</option>
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">Amount</span>
                  <input
                    type="number"
                    className="win-input"
                    value={payAmount}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                    style={{ fontWeight: 700, fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                  <button className="win-btn-classic win-btn-primary" onClick={() => {
                    alert(`Receipt #${payReceiptNo} Saved for ₹${payAmount}!`);
                    setActiveDialog(null);
                  }}>Save (F2)</button>
                  <button className="win-btn-classic" onClick={() => setPayReceiptNo('00007')}>New Entry (F1)</button>
                </div>
              </div>

              {/* Payment History Table */}
              <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '320px', overflowY: 'auto' }}>
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th>Shift</th>
                      <th>Receipt Date</th>
                      <th>CustomerName</th>
                      <th>Mode</th>
                      <th className="text-right">Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payReceiptsHistory.map((h, i) => (
                      <tr key={i}>
                        <td>{h.shift}</td>
                        <td>{h.date}</td>
                        <td>{h.cust}</td>
                        <td>{h.mode}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>{h.amt.toFixed(2)}</td>
                        <td><button className="win-btn-classic" style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save | F1=New</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 4: Rate Master
       * ============================================================= */}
      {activeDialog === 'rate' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '560px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🏷️</span>
                <span>Fuel Rate Master</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <form onSubmit={handleSaveRate} style={{ marginBottom: '12px' }}>
                <div className="win-form-row">
                  <span className="win-label">Product</span>
                  <select
                    className="win-select"
                    style={{ flex: 1 }}
                    value={rateProduct}
                    onChange={(e) => setRateProduct(parseInt(e.target.value))}
                  >
                    <option value={1}>Diesel (HSD) - ₹90.21</option>
                    <option value={2}>Petrol (MS) - ₹94.25</option>
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">New Rate (₹)</span>
                  <input
                    type="number"
                    step="0.01"
                    className="win-input"
                    value={rateValue}
                    onChange={(e) => setRateValue(parseFloat(e.target.value) || 0)}
                    style={{ fontWeight: 700 }}
                  />
                  <button type="submit" className="win-btn-classic win-btn-primary" style={{ marginLeft: '6px' }}>
                    Update Rate
                  </button>
                </div>
              </form>

              <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '180px', overflowY: 'auto' }}>
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Rate</th>
                      <th>VAT %</th>
                      <th>Cess %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratesList.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td style={{ fontWeight: 700 }}>₹ {r.rate}</td>
                        <td>{r.vat_percent}%</td>
                        <td>{r.cess_percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rateHist && rateHist.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '11px' }}>Revision History</div>
                  <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '100px', overflowY: 'auto' }}>
                    <table className="win-datagrid">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Old Rate</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rateHist.map((h, idx) => (
                          <tr key={idx}>
                            <td>{h.product_name}</td>
                            <td>₹ {h.rate}</td>
                            <td>{h.effective_date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 5: DIP REGISTER
       * ============================================================= */}
      {activeDialog === 'dip' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '600px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📐</span>
                <span>Tank Dip Register & Evaporation Loss Audit</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <form onSubmit={handleSaveDip}>
                <div className="win-form-row">
                  <span className="win-label">Tank</span>
                  <select className="win-select" style={{ flex: 1 }} value={dipTankId} onChange={(e) => setDipTankId(parseInt(e.target.value))}>
                    <option value={1}>MS Tank 1 (Petrol) - Cap: 20000L</option>
                    <option value={2}>HSD Tank 1 (Diesel) - Cap: 20000L</option>
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">Opening Dip (cm)</span>
                  <input type="number" step="0.1" className="win-input" value={dipOpenCm} onChange={(e) => setDipOpenCm(parseFloat(e.target.value) || 0)} />
                  <span className="win-label" style={{ minWidth: '70px', marginLeft: '6px' }}>Stock (L)</span>
                  <input type="number" className="win-input" value={dipOpenStock} onChange={(e) => setDipOpenStock(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Inward Receipt (L)</span>
                  <input type="number" className="win-input" value={dipReceipt} onChange={(e) => setDipReceipt(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Closing Dip (cm)</span>
                  <input type="number" step="0.1" className="win-input" value={dipCloseCm} onChange={(e) => setDipCloseCm(parseFloat(e.target.value) || 0)} />
                  <span className="win-label" style={{ minWidth: '70px', marginLeft: '6px' }}>Stock (L)</span>
                  <input type="number" className="win-input" value={dipCloseStock} onChange={(e) => setDipCloseStock(parseFloat(e.target.value) || 0)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="submit" className="win-btn-classic win-btn-primary">Record Dip (F2)</button>
                </div>
              </form>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 6: Purchase Entry (Tanker Decanting)
       * ============================================================= */}
      {activeDialog === 'purchase' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '640px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🚛</span>
                <span>Tanker Decanting Inward Purchase</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <form onSubmit={handleSavePurchase}>
                <div className="win-form-row">
                  <span className="win-label">Invoice No</span>
                  <input type="text" className="win-input" value={purInvoiceNo} onChange={(e) => setPurInvoiceNo(e.target.value)} />
                  <span className="win-label" style={{ minWidth: '70px', marginLeft: '6px' }}>Oil Co.</span>
                  <input type="text" className="win-input" value={purDealer} onChange={(e) => setPurDealer(e.target.value)} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Tanker No</span>
                  <input type="text" className="win-input" value={purVehicleNo} onChange={(e) => setPurVehicleNo(e.target.value)} />
                  <span className="win-label" style={{ minWidth: '70px', marginLeft: '6px' }}>Density @15°C</span>
                  <input type="number" step="0.1" className="win-input" value={purDensity} onChange={(e) => setPurDensity(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Quantity (KL)</span>
                  <input type="number" step="0.1" className="win-input" value={purQtyKl} onChange={(e) => setPurQtyKl(parseFloat(e.target.value) || 0)} />
                  <span className="win-label" style={{ minWidth: '70px', marginLeft: '6px' }}>Rate / KL</span>
                  <input type="number" step="0.01" className="win-input" value={purRateKl} onChange={(e) => setPurRateKl(parseFloat(e.target.value) || 0)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="submit" className="win-btn-classic win-btn-primary">Save Inward Purchase</button>
                </div>
              </form>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 7: Reports (DSR & Statutory Return)
       * ============================================================= */}
      {activeDialog === 'reports' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '800px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📑</span>
                <span>Daily Sales Register (DSR) & Statutory Return</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '300px', overflowY: 'auto' }}>
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th>Tank</th>
                      <th>Product</th>
                      <th>Opening Stock</th>
                      <th>Receipt</th>
                      <th>Meter Sale</th>
                      <th>Closing Stock</th>
                      <th>Daily Variation</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>MS Tank 1</td>
                      <td>Petrol</td>
                      <td>12108.0 L</td>
                      <td>5000.0 L</td>
                      <td>1533.19 L</td>
                      <td>10565.0 L</td>
                      <td style={{ color: '#c0392b', fontWeight: 700 }}>-9.81 L</td>
                    </tr>
                    <tr>
                      <td>HSD Tank 1</td>
                      <td>Diesel</td>
                      <td>17345.0 L</td>
                      <td>4000.0 L</td>
                      <td>3526.00 L</td>
                      <td>16890.0 L</td>
                      <td style={{ color: '#c0392b', fontWeight: 700 }}>-210.0 L</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
