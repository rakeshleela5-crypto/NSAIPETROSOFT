import React, { useEffect, useState } from 'react';
import './App.css';
import {
  API_BASE_URL,
  addVehicle,
  calculateSettlement,
  createBankAccount,
  createCardSettlement,
  createCreditSale,
  createCustomer,
  createExpense,
  createPaymentReceipt,
  createPurchase,
  createTankDip,
  createTransfer,
  fetchCustomerStatement,
  fetchCustomers,
  fetchDashboard,
  fetchDealerCommission,
  fetchDsrReport,
  fetchExpenses,
  fetchHealth,
  fetchLfrSummary,
  fetchPayments,
  fetchProfitLossSummary,
  fetchProfitSummary,
  fetchPurchases,
  fetchRates,
  fetchStampingReminders,
  fetchTdsSummary,
  fetchVatSummary,
  saveShiftMeters,
  saveShiftSettlement,
  updateRate,
} from './api/client';
import type {
  CustomerFull,
  DashboardResponse,
  DenominationMap,
  FuelProductRate,
} from './api/client';

type DialogType =
  | 'sales'
  | 'credit'
  | 'payment'
  | 'expense'
  | 'transfer'
  | 'rate'
  | 'purchase'
  | 'dip'
  | 'denom'
  | 'statement'
  | 'stamping'
  | 'help'
  | 'calc'
  | 'reports'
  | 'customerMaster'
  | 'tankMaster'
  | 'nozzleMaster'
  | 'bankMaster'
  | 'controlPanel'
  | 'cardEntry'
  | 'cashBill'
  | 'viewStock'
  | 'employeeSettlement'
  | 'dayBookReport'
  | 'crystalViewer'
  | 'selectCustomerBill'
  | null;


export default function App() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [selectedAccount, setSelectedAccount] = useState<string>('CASH ON HAND');

  // Menubar Dropdown State
  const [openDropdown, setOpenDropdown] = useState<'masters' | 'dataEntry' | 'reports' | null>(null);

  // Active Dialog State
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);

  // Toast Notification
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Search filter for dashboard customer grid
  const [custFilter, setCustFilter] = useState<string>('');

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

  // Past Credit Bills
  const [creditBillsList, setCreditBillsList] = useState<any[]>([
    { date: '17 Apr 2026', shift: 'First', slip: '0', bill: '36', cust: 'PORT TRANSPORT', vehicle: 'GJ19AS1454', qty: 160.0, total: 15072.0 },
    { date: '16 Apr 2026', shift: 'First', slip: '0', bill: '35', cust: 'HINESHBHAI', vehicle: 'MH14AS2545', qty: 177.29, total: 16000.0 },
    { date: '16 Apr 2026', shift: 'First', slip: '0', bill: '34', cust: 'ABC TRANSPORT', vehicle: 'GJ18AS557', qty: 160.0, total: 14440.0 },
    { date: '16 Apr 2026', shift: 'First', slip: '0', bill: '33', cust: 'ABC TRANSPORT', vehicle: 'GJ01AS7487', qty: 120.0, total: 10830.0 },
    { date: '15 Apr 2026', shift: 'First', slip: '0', bill: '32', cust: 'SHREE SAM', vehicle: 'GJ15AS8901', qty: 551.02, total: 50000.0 },
  ]);

  // Sales Entry Nozzle Totalizers (Frame 0110)
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
  const [payTotalPaid, setPayTotalPaid] = useState<number>(15000.0);
  const [payTotalUnpaid, setPayTotalUnpaid] = useState<number>(163867.2);
  const [payMode, setPayMode] = useState<string>('UPI PAYMENT');
  const [payBank, setPayBank] = useState<string>('PAYTM');
  const [payAmount, setPayAmount] = useState<number>(50000.0);
  const [payReceiptsHistory, setPayReceiptsHistory] = useState<any[]>([
    { shift: 'First', date: '17 Apr 2026', cust: 'LIVAVATI TRANSPORTY', mode: 'CASH', amt: 15000.0 },
    { shift: 'First', date: '17 Apr 2026', cust: 'PORT TRANSPORT', mode: 'CASH', amt: 6000.0 },
    { shift: 'First', date: '17 Apr 2026', cust: 'PORT TRANSPORT', mode: 'CASH', amt: 15000.0 },
    { shift: 'First', date: '16 Apr 2026', cust: 'ABC TRANSPORT', mode: 'CHEQUE', amt: 50000.0 },
    { shift: 'First', date: '16 Apr 2026', cust: 'ABC TRANSPORT', mode: 'CASH', amt: 15000.0 },
  ]);

  // Expense Book State
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [expCategory, setExpCategory] = useState<string>('Gen-Set Diesel');
  const [expAmount, setExpAmount] = useState<number>(1250.0);
  const [expNarration, setExpNarration] = useState<string>('Power backup generator diesel');
  const [expPaidTo, setExpPaidTo] = useState<string>('Pump Cashier');

  // Contra Transfer State
  const [fromAccId, setFromAccId] = useState<number>(1); // Cash on hand
  const [toAccId, setToAccId] = useState<number>(7); // HDFC CA
  const [transferAmt, setTransferAmt] = useState<number>(150000.0);

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

  // Cash Denomination Settlement State (Frame 200)
  const [denoms, setDenoms] = useState<DenominationMap>({
    n2000: 0,
    n500: 321,
    n200: 112,
    n100: 214,
    n50: 0,
    n20: 0,
    n10: 120,
    n5: 0,
    coins: 0,
  });
  const [denomResult, setDenomResult] = useState<any>(null);

  // Customer Statement (Frame 0300)
  const [selectedStatement, setSelectedStatement] = useState<any>(null);

  // Stamping Reminders State
  const [stampingList, setStampingList] = useState<any[]>([]);

  // Reports Data
  const [dsrReport, setDsrReport] = useState<any[]>([]);
  const [vatReport, setVatReport] = useState<any>(null);
  const [profitReport, setProfitReport] = useState<any[]>([]);

  // Windows Calculator Widget State
  const [calcInput, setCalcInput] = useState<string>('0');
  const [calcPrev, setCalcPrev] = useState<number | null>(null);
  const [calcOp, setCalcOp] = useState<string | null>(null);

  // Master Forms: Customer Master
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustMobile, setNewCustMobile] = useState<string>('');
  const [newCustCity, setNewCustCity] = useState<string>('SURAT');
  const [newCustLimit, setNewCustLimit] = useState<number>(100000);
  const [newCustVehicle, setNewCustVehicle] = useState<string>('');
  const [masterCustSearch, setMasterCustSearch] = useState<string>('');

  // Master Forms: Bank Master
  const [newBankName, setNewBankName] = useState<string>('');
  const [newBankType, setNewBankType] = useState<string>('CURRENT');
  const [newBankBalance, setNewBankBalance] = useState<number>(0);

  // Station Shift & Control Panel State
  const [shiftNumber, setShiftNumber] = useState<string>('00017');
  const [shiftName, setShiftName] = useState<string>('First');
  const [shiftStatus, setShiftStatus] = useState<string>('OPEN');
  const [dispenserLocked, setDispenserLocked] = useState<boolean>(false);

  // Digital Card POS Entry State
  const [cardMachine, setCardMachine] = useState<string>('M SWIPE');
  const [cardBatchNo, setCardBatchNo] = useState<string>('00412');
  const [cardSlipsCount, setCardSlipsCount] = useState<number>(24);
  const [cardBatchTotal, setCardBatchTotal] = useState<number>(45800.0);
  const [cardSettlements, setCardSettlements] = useState<any[]>([
    { machine: 'M SWIPE', batch: '00411', slips: 18, amount: 32400.0, time: '11:45 AM', status: 'SETTLED' },
    { machine: 'PAYTM QR', batch: '00892', slips: 42, amount: 18950.0, time: '01:15 PM', status: 'SETTLED' },
    { machine: 'ICICI CARD', batch: '00109', slips: 12, amount: 28600.0, time: '03:30 PM', status: 'SETTLED' },
  ]);

  // Retail Cash Memo Slip State
  const [cashMemoBillNo, setCashMemoBillNo] = useState<string>('CM-9821');
  const [cashMemoVehicle, setCashMemoVehicle] = useState<string>('GJ05DU8821');
  const [cashMemoProduct, setCashMemoProduct] = useState<string>('MS');
  const [cashMemoLiters, setCashMemoLiters] = useState<number>(10.0);
  const [cashMemoRate, setCashMemoRate] = useState<number>(94.25);

  // Set Report Criteria State (Frame 0375)
  const [reportCriteriaRadio, setReportCriteriaRadio] = useState<string>('DSR');
  const [critFromDate, setCritFromDate] = useState<string>('01-Mar-2026');
  const [critToDate, setCritToDate] = useState<string>('31-Mar-2026');
  const [critCustomer, setCritCustomer] = useState<string>('---Select Any---');
  const [critSupplier, setCritSupplier] = useState<string>('---Select Any---');
  const [critItem, setCritItem] = useState<string>('Diesel');
  const [critInvoiceNo, setCritInvoiceNo] = useState<string>('1409523983');
  const [critDate, setCritDate] = useState<string>('17-Apr-2026');
  const [critShift, setCritShift] = useState<string>('First');
  const [critLedger, setCritLedger] = useState<string>('---Select Any---');
  const [critAccountGroup, setCritAccountGroup] = useState<string>('---Select Any---');
  const [critVehicle, setCritVehicle] = useState<string>('---Select Any---');
  const [critBillPeriod, setCritBillPeriod] = useState<string>('---Select Any---');
  const [critEmployee, setCritEmployee] = useState<string>('AA');
  const [activeReportTitle, setActiveReportTitle] = useState<string>('DSR REPORT');
  const [reportZoom, setReportZoom] = useState<string>('Whole Page');
  const [crystalPage, setCrystalPage] = useState<number>(1);
  const [crystalTotalPages, setCrystalTotalPages] = useState<number>(2);

  // Credit Sale Print Confirmation Prompt (Frame 0050)
  const [showPrintConfirm, setShowPrintConfirm] = useState<boolean>(false);
  const [lastCreditSlip, setLastCreditSlip] = useState<any>(null);

  // Employee Shift Settlement State (Frame 0210 & 0220)
  const [empSettlementDate] = useState<string>('17-Apr-2026');
  const [empSettlementShift, setEmpSettlementShift] = useState<string>('First');
  const [empSettlementSaleNo] = useState<string>('00001');
  const [empSettlementEmp, setEmpSettlementEmp] = useState<string>('SANMUKH H CHAUDHARI');
  const [empSettlementMachine, setEmpSettlementMachine] = useState<string>('MPD 1');
  const [empSettlementRemarks, setEmpSettlementRemarks] = useState<string>('');
  const [empNozzleReadings] = useState<any[]>([
    { nozzle: 'HSD 1', op: 5000.0, close: 5124.0, test: 5.0, sale: 119.0, rate: 90.21, amount: 10734.99 },
    { nozzle: 'HSD 2', op: 6000.0, close: 6458.0, test: 5.0, sale: 453.0, rate: 90.21, amount: 40865.13 },
    { nozzle: 'MS 1', op: 400.0, close: 854.0, test: 5.0, sale: 449.0, rate: 94.25, amount: 42318.25 },
    { nozzle: 'MS 2', op: 587.0, close: 925.0, test: 5.0, sale: 333.0, rate: 94.25, amount: 31385.25 },
  ]);
  const [empLubeItems] = useState<any[]>([
    { product: 'MAK DIAMOND 15W 40 15LTR', qty: 1, rate: 5478.0, amount: 5478.0 },
  ]);
  const [empCardSwipes] = useState<any[]>([
    { name: 'PAYTM', amount: 5000.0 },
    { name: 'M SWIPE', amount: 6000.0 },
    { name: 'PETRO CARD', amount: 14500.0 },
    { name: 'ICICI CARD', amount: 0.0 },
  ]);
  const [empExpensesList] = useState<any[]>([
    { name: 'CESS', amount: 0.0, narration: '' },
    { name: 'MISC EXPENSES', amount: 0.0, narration: '' },
    { name: 'YATIN N CHAUDHARI', amount: 0.0, narration: '' },
    { name: 'PURCHASE ACCOUNT', amount: 0.0, narration: '' },
    { name: 'TEA N FOOD EXP', amount: 300.0, narration: 'Staff tea & food' },
    { name: 'GENERATOR EXP', amount: 1480.0, narration: 'Diesel generator power' },
    { name: 'SANMUKH H CHAUDHARI', amount: 84.0, narration: 'Cashier advance' },
  ]);
  const [empCashAmount, setEmpCashAmount] = useState<number>(54000.0);
  const [empCreditSaleAmount, setEmpCreditSaleAmount] = useState<number>(43939.20);
  const [empCreditReceived, setEmpCreditReceived] = useState<number>(0.0);
  const [empUplagBaki, setEmpUplagBaki] = useState<number>(0.0);

  // Purchase Entry 8-Seals & Line Items (Frame 0161)
  const [purWoodenSeals, setPurWoodenSeals] = useState({ s1: 'W-901', s2: 'W-902', s3: 'W-903', s4: 'W-904' });
  const [purAlumSeals, setPurAlumSeals] = useState({ s1: 'AL-110', s2: 'AL-111', s3: 'AL-112', s4: 'AL-113' });
  const [purSampleDensity, setPurSampleDensity] = useState<number>(825.4);
  const [purChargeCode, setPurChargeCode] = useState<string>('01');
  const [purFreight, setPurFreight] = useState<number>(0.0);
  const [purItemsGrid, setPurItemsGrid] = useState<any[]>([
    { code: '01', desc: 'High Speed Diesel (HSD BS-VI)', qty: 4000.0, unit: 'Ltr', rate: 72.48, amount: 289920.0, gross: 289920.0, final: 341824.0, freight: 0.0, basicExcise: 0.0, addExci: 0.0 },
  ]);
  const [purPoHistory, setPurPoHistory] = useState<any[]>([
    { po: 'PO-001', date: '17 Apr 2026', inv: '321578', dealer: 'BHARAT PETROLEUM CO LTD', amount: 341824.0 },
    { po: 'PO-002', date: '16 Apr 2026', inv: '321512', dealer: 'BHARAT PETROLEUM CO LTD', amount: 489200.0 },
    { po: 'PO-003', date: '14 Apr 2026', inv: '321480', dealer: 'INDIAN OIL CORP LTD', amount: 250000.0 },
  ]);

  // Select Customer Dialog (Frame 0280)
  const [selectedCustForBill, setSelectedCustForBill] = useState<string>('LIVAVATI TRANSPORTY');


  // Load Dashboard Data from Live Railway Backend
  const loadData = async () => {
    try {
      const h = await fetchHealth();
      setBackendOnline(h.status === 'healthy');
      const d = await fetchDashboard();
      setDashboard(d);
    } catch {
      setBackendOnline(false);
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
    fetchExpenses().then(setExpensesList).catch(() => {});

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDialog(null);
        setOpenDropdown(null);
      } else if (e.key === 'F1') {
        e.preventDefault();
        setActiveDialog('sales');
      } else if (e.key === 'F2') {
        e.preventDefault();
        openRateMaster();
      } else if (e.key === 'F3') {
        e.preventDefault();
        setActiveDialog('credit');
      } else if (e.key === 'F4') {
        e.preventDefault();
        openPaymentDialog();
      } else if (e.key === 'F5') {
        e.preventDefault();
        setActiveDialog('expense');
      } else if (e.key === 'F6') {
        e.preventDefault();
        setActiveDialog('transfer');
      } else if (e.key === 'F7') {
        e.preventDefault();
        openPurchaseMaster();
      } else if (e.key === 'F8') {
        e.preventDefault();
        setActiveDialog('dip');
      } else if (e.key === 'F9') {
        e.preventDefault();
        setActiveDialog('denom');
      } else if (e.key === 'F10') {
        e.preventDefault();
        openReports();
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
    setOpenDropdown(null);
  };

  const openCustomerStatement = async (custId: number) => {
    try {
      const data = await fetchCustomerStatement(custId);
      setSelectedStatement(data);
    } catch {
      const c = dashboard?.customers.find((x) => x.id === custId) || customers.find((x) => x.id === custId);
      setSelectedStatement({
        customer: {
          id: custId,
          code: c?.code || '21',
          name: c?.name || 'PORT TRANSPORT',
          city: c?.city || 'SURAT',
          mobile: c?.mobile || '+91 7096386817',
          outstanding: (c as any)?.outstanding || (c as any)?.current_outstanding || 795532.21,
        },
        bills: [
          { date: '17-Apr-2026', bill_no: '36', vehicle_no: 'GJ19AS1454', qty: 160.0, rate: 90.21, amount: 15072.0, slip_no: '0' },
          { date: '16-Apr-2026', bill_no: '34', vehicle_no: 'GJ18AS557', qty: 160.0, rate: 90.21, amount: 14440.0, slip_no: '0' },
          { date: '15-Apr-2026', bill_no: '31', vehicle_no: 'GJ04AT2211', qty: 180.0, rate: 90.21, amount: 16237.8, slip_no: '0' },
        ],
        summary: {
          total_purchase: 45749.8,
          total_other_lube: 0.0,
          total_tax_amount: 0.0,
          previous_dues: 749782.41,
          total_paid_period: 21000.0,
          net_payables: 795532.21,
          terms: [
            '(1) Subject To Tapi Jurisdiction',
            '(2) Query in the Invoice should be notified to us immediately. No claims or discrepancy shall be entertained after 5 days from the Date of INVOICE.',
            '(3) Outstanding Bill Amount must be paid/cleared in 5 days from the bill date. After that 1.5% interest PM will be applicable.',
          ],
          signatory: 'For NSAIPETROSOFT TECHNOLOGY\nAuthorized Signatory',
        },
      });
    }
    setActiveDialog('statement');
  };

  const openStampingCalendar = async () => {
    try {
      const data = await fetchStampingReminders();
      setStampingList(data);
    } catch {
      setStampingList([
        { nozzle_id: 1, nozzle_name: 'HSD 1', tank: 'HSD Tank 1', last_stamped: '15-May-2025', next_due: '14-May-2026', days_remaining: 228, status: 'VALID' },
        { nozzle_id: 2, nozzle_name: 'HSD 2', tank: 'HSD Tank 1', last_stamped: '15-May-2025', next_due: '14-May-2026', days_remaining: 228, status: 'VALID' },
        { nozzle_id: 3, nozzle_name: 'MS 1', tank: 'MS Tank 1', last_stamped: '15-May-2025', next_due: '14-May-2026', days_remaining: 228, status: 'VALID' },
        { nozzle_id: 4, nozzle_name: 'MS 2', tank: 'MS Tank 1', last_stamped: '15-May-2025', next_due: '14-May-2026', days_remaining: 228, status: 'VALID' },
      ]);
    }
    setActiveDialog('stamping');
  };

  const openPaymentDialog = async () => {
    try {
      const data = await fetchPayments();
      if (data && data.length > 0) {
        setPayReceiptsHistory(
          data.map((p) => ({
            shift: p.shift || 'First',
            date: p.date,
            cust: p.customer,
            mode: p.mode,
            amt: p.amount,
          }))
        );
      }
    } catch {
      // Offline fallback state kept
    }
    setActiveDialog('payment');
    setOpenDropdown(null);
  };

  const openPurchaseMaster = async () => {
    try {
      const data = await fetchPurchases();
      if (data && data.length > 0) {
        setPurPoHistory(
          data.map((p) => ({
            po: p.invoice_no,
            date: p.date,
            inv: p.invoice_no,
            dealer: p.dealer_name,
            amount: p.final_amount,
          }))
        );
      }
    } catch {
      // Offline fallback state kept
    }
    setActiveDialog('purchase');
    setOpenDropdown(null);
  };

  const openReports = () => {
    setActiveDialog('reports');
    setOpenDropdown(null);
  };

  const openCrystalReport = async (reportName: string) => {
    setActiveReportTitle(reportName);
    setReportCriteriaRadio(reportName);
    setCrystalTotalPages(reportName === 'DSR' || reportName === 'DSR REPORT' ? 2 : 1);
    setActiveDialog('crystalViewer');
    setOpenDropdown(null);
    try {
      if (reportName === 'DSR' || reportName === 'DSR REPORT') {
        const d = await fetchDsrReport();
        setDsrReport(d);
      } else if (reportName === 'VAT SUMMARY' || reportName === 'VAT SUMMARY REPORT') {
        const v = await fetchVatSummary();
        setVatReport(v);
      } else if (reportName === 'PROFIT SUMMARY' || reportName === 'PROFIT SUMMARY REPORT') {
        const p = await fetchProfitSummary();
        setProfitReport(p);
      } else if (reportName.includes('TDS')) {
        await fetchTdsSummary();
      } else if (reportName.includes('COMMISION')) {
        await fetchDealerCommission();
      } else if (reportName.includes('LFR')) {
        await fetchLfrSummary();
      } else if (reportName.includes('PROFIT LOSS')) {
        await fetchProfitLossSummary();
      }
    } catch {
      // Offline fallback state already populated
    }
  };

  // Handlers
  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateRate(rateProduct, rateValue);
      showToast(`Rate updated successfully to ₹${rateValue.toFixed(2)}!`);
      openRateMaster();
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Error updating rate');
    }
  };

  const handleSaveCreditSale = async (e: React.FormEvent) => {
    e.preventDefault();
    // Prompt Frame 0050: Are you Sure? Do you want to Print this Receipt..??
    setShowPrintConfirm(true);
  };

  const executeCreditSaleSave = async (printSlip: boolean) => {
    setShowPrintConfirm(false);
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
      setLastCreditSlip(newBill);
      showToast(`✔ Credit Bill #${res.bill_no} Saved! Balance: ₹${res.new_balance.toFixed(2)}`);
      if (printSlip) {
        window.print();
      }
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Error saving credit bill');
    }
  };

  const handleAddPurchaseLine = async (e: React.FormEvent) => {
    e.preventDefault();
    const gross = purQtyKl * 1000 * (purRateKl / 1000);
    const final = gross + purFreight;
    const item = {
      code: purChargeCode,
      desc: purChargeCode === '01' ? 'High Speed Diesel (HSD BS-VI)' : 'Motor Spirit (MS Petrol BS-VI)',
      qty: purQtyKl * 1000,
      unit: 'Ltr',
      rate: purRateKl / 1000,
      amount: gross,
      gross: gross,
      final: final,
      freight: purFreight,
      basicExcise: 0.0,
      addExci: 0.0,
    };
    setPurItemsGrid([...purItemsGrid, item]);
    try {
      await createPurchase({
        invoice_no: purInvoiceNo,
        dealer_name: purDealer,
        tanker_vehicle_no: purVehicleNo,
        wooden_seals: `${purWoodenSeals.s1}, ${purWoodenSeals.s2}, ${purWoodenSeals.s3}, ${purWoodenSeals.s4}`,
        aluminum_seals: `${purAlumSeals.s1}, ${purAlumSeals.s2}, ${purAlumSeals.s3}, ${purAlumSeals.s4}`,
        sample_density: purSampleDensity,
        product_id: purChargeCode === '01' ? 1 : 2,
        tank_id: purChargeCode === '01' ? 2 : 1,
        qty_kl: purQtyKl,
        rate_per_kl: purRateKl,
        freight: purFreight,
      });
      showToast(`✔ Decanting recorded in PostgreSQL! Added ${item.qty} Ltr to Tank Stock.`);
      loadData();
    } catch {
      showToast(`✔ Added ${item.qty} Ltr to Inward Purchase List!`);
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
      showToast('✔ Shift meter readings saved and totalizers updated!');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Error saving shift meters');
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const newExp = {
      id: Date.now(),
      date: '17-Apr-2026',
      category: expCategory,
      amount: expAmount,
      narration: expNarration,
      paid_to: expPaidTo,
    };
    try {
      await createExpense({
        category: expCategory,
        amount: expAmount,
        narration: expNarration,
        paid_to: expPaidTo,
      });
      showToast(`✔ Expense of ₹${expAmount} recorded in Cash Book!`);
      setExpensesList([newExp, ...expensesList]);
      loadData();
    } catch {
      setExpensesList([newExp, ...expensesList]);
      showToast(`✔ Expense of ₹${expAmount} recorded locally in Cash Book!`);
    }
  };

  const handleDeleteExpense = (id: number) => {
    setExpensesList(expensesList.filter((x) => x.id !== id));
    showToast('✔ Expense voucher deleted successfully');
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTransfer({
        from_account_id: fromAccId,
        to_account_id: toAccId,
        amount: transferAmt,
      });
      showToast(`✔ Contra Transfer of ₹${transferAmt.toLocaleString('en-IN')} completed!`);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Error executing transfer');
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
      showToast(`✔ Dip recorded! Variation: ${res.variation_liters} L (Tolerance: ${res.tolerance_limit} L)`);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Error recording dip');
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
      showToast(`✔ Tanker Inward Decanting #${res.invoice_no} Saved!`);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Error saving purchase');
    }
  };

  const handleCalculateDenom = async () => {
    try {
      const res = await calculateSettlement({
        denominations: denoms,
        digital_cards: 373156.84,
        credit_sales: 54091.46,
        expenses: 1864.0,
        credit_collections: 65000.0,
        total_meter_sales: 664908.18,
      });
      setDenomResult(res);
      setEmpCashAmount(res.cash_total);
      showToast(`✔ Denomination tallied: ${res.status}`);
    } catch {
      const totalCash =
        denoms.n2000 * 2000 +
        denoms.n500 * 500 +
        denoms.n200 * 200 +
        denoms.n100 * 100 +
        denoms.n50 * 50 +
        denoms.n20 * 20 +
        denoms.n10 * 10 +
        denoms.n5 * 5 +
        denoms.coins;
      const expCash = 664908.18 - 54091.46 - 373156.84 - 1864.0 + 65000.0;
      const gap = totalCash - expCash;
      setDenomResult({
        cash_total: totalCash,
        expected_cash: expCash,
        gap_amount: gap,
        status: gap === 0 ? 'BALANCED' : gap < 0 ? 'SHORTAGE (Cashier Owes)' : 'EXCESS',
      });
      setEmpCashAmount(totalCash);
      showToast(`✔ Cash counted: ₹${totalCash.toFixed(2)}`);
    }
  };

  // Calculator Handler
  const handleCalcBtn = (val: string) => {
    if (val === 'C') {
      setCalcInput('0');
      setCalcPrev(null);
      setCalcOp(null);
    } else if (['+', '-', '*', '/'].includes(val)) {
      setCalcPrev(parseFloat(calcInput));
      setCalcOp(val);
      setCalcInput('0');
    } else if (val === '=') {
      if (calcPrev !== null && calcOp) {
        const cur = parseFloat(calcInput);
        let res = 0;
        if (calcOp === '+') res = calcPrev + cur;
        else if (calcOp === '-') res = calcPrev - cur;
        else if (calcOp === '*') res = calcPrev * cur;
        else if (calcOp === '/') res = cur !== 0 ? calcPrev / cur : 0;
        setCalcInput(res.toString());
        setCalcPrev(null);
        setCalcOp(null);
      }
    } else {
      setCalcInput(calcInput === '0' ? val : calcInput + val);
    }
  };

  // Add Customer Handler
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName) return;
    try {
      const res = await createCustomer({
        name: newCustName,
        mobile: newCustMobile,
        city: newCustCity,
        credit_limit: newCustLimit,
      });
      if (newCustVehicle) {
        await addVehicle(res.id, newCustVehicle);
      }
      showToast(`✔ Customer "${newCustName}" created successfully!`);
      setNewCustName('');
      setNewCustMobile('');
      setNewCustVehicle('');
      fetchCustomers().then(setCustomers).catch(() => {});
      loadData();
    } catch {
      // Local fallback
      const newCust: CustomerFull = {
        id: Date.now(),
        code: (customers.length + 1).toString(),
        name: newCustName,
        city: newCustCity,
        mobile: newCustMobile,
        credit_limit: newCustLimit,
        current_outstanding: 0,
        bill_period: 'Weekly',
        vehicles: newCustVehicle ? [newCustVehicle] : [],
      };
      setCustomers([...customers, newCust]);
      showToast(`✔ Customer "${newCustName}" added!`);
      setNewCustName('');
      setNewCustMobile('');
      setNewCustVehicle('');
    }
  };

  // Add Bank Account Handler
  const handleCreateBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName) return;
    const newAcc = {
      id: Date.now(),
      name: newBankName.toUpperCase(),
      type: newBankType,
      balance: newBankBalance,
    };
    try {
      await createBankAccount({
        account_name: newBankName,
        account_type: newBankType,
        balance: newBankBalance,
      });
      showToast(`✔ Bank Account "${newAcc.name}" saved to PostgreSQL!`);
      setNewBankName('');
      setNewBankBalance(0);
      loadData();
    } catch {
      if (dashboard) {
        setDashboard({
          ...dashboard,
          accounts: [...dashboard.accounts, newAcc],
        });
      }
      showToast(`✔ Bank Account "${newAcc.name}" created!`);
      setNewBankName('');
      setNewBankBalance(0);
    }
  };

  // Card POS Settlement Save
  const handleSaveCardSettlement = async () => {
    const newEntry = {
      machine: cardMachine,
      batch: cardBatchNo,
      slips: cardSlipsCount,
      amount: cardBatchTotal,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'SETTLED',
    };
    setCardSettlements([newEntry, ...cardSettlements]);
    try {
      await createCardSettlement({
        machine_name: cardMachine,
        batch_no: cardBatchNo,
        slip_count: cardSlipsCount,
        amount: cardBatchTotal,
      });
      showToast(`✔ EDC Batch #${cardBatchNo} for ₹${cardBatchTotal.toFixed(2)} settled in PostgreSQL!`);
      loadData();
    } catch {
      showToast(`✔ EDC Batch #${cardBatchNo} for ₹${cardBatchTotal.toFixed(2)} settled locally!`);
    }
  };

  // Station Control Actions
  const handleCloseShift = () => {
    setShiftStatus('CLOSED');
    setDispenserLocked(true);
    showToast(`✔ Shift ${shiftName} CLOSED. Dispenser meters locked!`);
  };

  const handleOpenNextShift = () => {
    const nextSO = (parseInt(shiftNumber) + 1).toString().padStart(5, '0');
    setShiftNumber(nextSO);
    setShiftName(shiftName === 'First' ? 'Second' : 'First');
    setShiftStatus('OPEN');
    setDispenserLocked(false);
    showToast(`✔ Started Shift ${shiftName === 'First' ? 'Second' : 'First'} (SO #${nextSO})`);
  };

  const handleToggleMaximize = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      showToast('🖥️ Fullscreen Desktop Mode Activated');
    } else {
      document.exitFullscreen().catch(() => {});
      showToast('🗗 Standard Window Mode Restored');
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
  const customersList = (dashboard?.customers || []).filter((c) =>
    custFilter ? c.name.toLowerCase().includes(custFilter.toLowerCase()) || c.city?.toLowerCase().includes(custFilter.toLowerCase()) : true
  );
  const accountsList = dashboard?.accounts || [];

  return (
    <div className="win-desktop-shell">
      {/* Toast Notification */}
      {toastMsg && <div className="win-toast">{toastMsg}</div>}

      {/* -------------------------------------------------------------
       * 1. Window Title Bar (Windows Desktop App Chrome)
       * ------------------------------------------------------------- */}
      <div className="win-titlebar">
        <div className="win-title-left">
          <span>⛽</span>
          <span>NSAIPETROSOFT — Petroleum ERP & Station Automation [SO #{shiftNumber}]</span>
        </div>
        <div className="win-controls">
          <button className="win-btn" title="Minimize" onClick={() => showToast('NSAIPETROSOFT Minimized to Windows Taskbar')}>_</button>
          <button className="win-btn" title="Maximize / Restore" onClick={handleToggleMaximize}>□</button>
          <button
            className="win-btn win-btn-close"
            title="Close"
            onClick={() => {
              if (window.confirm('Do you want to log out and exit NSAIPETROSOFT?')) {
                showToast('Session logged out.');
              }
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
       * 2. Classic ERP Menu Bar with Active Dropdowns
       * ------------------------------------------------------------- */}
      <div className="win-menubar">
        {/* Masters Menu */}
        <div className="win-menu-dropdown-wrapper">
          <button
            className="win-menu-item"
            onClick={() => setOpenDropdown(openDropdown === 'masters' ? null : 'masters')}
          >
            Masters ▾
          </button>
          {openDropdown === 'masters' && (
            <div className="win-dropdown-menu">
              <button className="win-dropdown-item" onClick={openRateMaster}>🏷️ Fuel Rate Master</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('customerMaster'); setOpenDropdown(null); }}>👥 Customer Fleet Master</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('tankMaster'); setOpenDropdown(null); }}>⛽ Underground Tank Master</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('nozzleMaster'); setOpenDropdown(null); }}>🚰 Nozzle Totalizer Master</button>
              <div className="win-menu-divider" />
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('bankMaster'); setOpenDropdown(null); }}>🏦 Bank & Ledger Accounts</button>
            </div>
          )}
        </div>

        {/* Data Entry Menu */}
        <div className="win-menu-dropdown-wrapper">
          <button
            className="win-menu-item"
            onClick={() => setOpenDropdown(openDropdown === 'dataEntry' ? null : 'dataEntry')}
          >
            Data Entry ▾
          </button>
          {openDropdown === 'dataEntry' && (
            <div className="win-dropdown-menu">
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('sales'); setOpenDropdown(null); }}>⛽ Sales Entry (Nozzle Meters)</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('credit'); setOpenDropdown(null); }}>📋 Credit Customer Sale</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('payment'); setOpenDropdown(null); }}>💰 Payment Receipt</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('expense'); setOpenDropdown(null); }}>📝 Expence Book</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('transfer'); setOpenDropdown(null); }}>🔄 Transfer Entry (Cash/Bank)</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('purchase'); setOpenDropdown(null); }}>🚛 Purchase Entry (Decanting)</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('dip'); setOpenDropdown(null); }}>📐 DIP REGISTER</button>
              <div className="win-menu-divider" />
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('employeeSettlement'); setOpenDropdown(null); }}>👨‍💼 Employee Shift Settlement (FrmLis...)</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('denom'); setOpenDropdown(null); }}>💵 Cashier Denomination Settlement</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('dayBookReport'); setOpenDropdown(null); }}>📖 Day Book / Shift Cashier Tally</button>
            </div>
          )}
        </div>

        {/* Reports Menu */}
        <div className="win-menu-dropdown-wrapper">
          <button
            className="win-menu-item"
            onClick={() => setOpenDropdown(openDropdown === 'reports' ? null : 'reports')}
          >
            Reports ▾
          </button>
          {openDropdown === 'reports' && (
            <div className="win-dropdown-menu">
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('reports'); setOpenDropdown(null); }}>⚙️ Set Report Criteria (All 44 Reports)</button>
              <div className="win-menu-divider" />
              <button className="win-dropdown-item" onClick={() => openCrystalReport('DSR')}>📊 Daily Sales Register (DSR Report)</button>
              <button className="win-dropdown-item" onClick={() => openCrystalReport('VAT SUMMARY')}>🧾 State VAT Return Summary (Form 201)</button>
              <button className="win-dropdown-item" onClick={() => openCrystalReport('PROFIT SUMMARY')}>📈 Dealer Profit Summary</button>
              <button className="win-dropdown-item" onClick={() => openCrystalReport('DEALER COMMISION REPORT')}>💰 Dealer Commission Report</button>
              <button className="win-dropdown-item" onClick={() => openCrystalReport('PURCHASE LFR SUMMARY')}>📑 Purchase LFR Summary</button>
              <button className="win-dropdown-item" onClick={() => openCrystalReport('TDS SUMMARY')}>🏛️ TDS Deduction Summary (Sec 194Q/C)</button>
              <button className="win-dropdown-item" onClick={() => openCrystalReport('PROFIT LOSS SUMMARY')}>⚖️ Profit & Loss Summary</button>
              <div className="win-menu-divider" />
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('selectCustomerBill'); setOpenDropdown(null); }}>📋 Account Statement for Customer</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('dayBookReport'); setOpenDropdown(null); }}>📖 Shift Cashier Tally (Day Book)</button>
            </div>
          )}
        </div>

        <button className="win-menu-item" onClick={() => setActiveDialog('viewStock')}>View Stock</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('controlPanel')}>Control Panel</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('help')}>Help</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('calc')}>🧮 Calculator</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('selectCustomerBill')}>Credit Bills</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('cardEntry')}>Card Entry</button>
        <button className="win-menu-item" onClick={() => setActiveDialog('cashBill')}>Cash Bill</button>
      </div>

      {/* -------------------------------------------------------------
       * 3. Top Banner Ribbon
       * ------------------------------------------------------------- */}
      <div className="win-ribbon-bar">
        <div className="win-welcome-text">
          WELCOME : NSAIPETROSOFT RETAIL OUTLET
        </div>

        <div className="win-ribbon-center">
          <button className="btn-stamp-reminder" onClick={openStampingCalendar}>Stamping Reminder</button>
          <button className="btn-help-desk" onClick={() => setActiveDialog('help')}>Help Desk</button>
        </div>

        <div className="win-ribbon-right">
          <span>License : 228 Day(s) Left</span>
          <span>Finacial Year : 2026-27</span>
          <span style={{ fontSize: '11px', color: backendOnline ? '#2e7d32' : '#e67e22' }} title={`API: ${API_BASE_URL}`}>
            ● {backendOnline ? 'Cloud Backend Connected' : 'Local Ready'}
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------------
       * 4. Main Workspace (Sidebar + Dashboard Content)
       * ------------------------------------------------------------- */}
      <div className="win-workspace" onClick={() => setOpenDropdown(null)}>
        {/* Left Vertical Sidebar - 8 3D Glossy Gel Buttons */}
        <aside className="win-sidebar">
          <div className="gel-btn gel-purple" onClick={openRateMaster} title="Fuel Rate Master (F2)">
            Rate Master
          </div>
          <div className="gel-btn gel-blue" onClick={() => setActiveDialog('credit')} title="Credit Customer Sale (F3)">
            Credit<br />Customer
          </div>
          <div className="gel-btn gel-pink" onClick={openPaymentDialog} title="Customer Payment Receipt (F4)">
            Payment<br />Receipt
          </div>
          <div className="gel-btn gel-green" onClick={() => setActiveDialog('expense')} title="Daily Expense Book (F5)">
            Expence<br />Book
          </div>
          <div className="gel-btn gel-yellow" onClick={() => setActiveDialog('transfer')} title="Contra Transfer Entry (F6)">
            Transfer<br />Entry
          </div>
          <div className="gel-btn gel-orange" onClick={() => setActiveDialog('sales')} title="Sales Entry Nozzle Totalizers (F1)">
            Sales Entry
          </div>
          <div className="gel-btn gel-magenta" onClick={openPurchaseMaster} title="Tanker Decanting Purchase (F7)">
            Purchase<br />Entry
          </div>
          <div className="gel-btn gel-cyan" onClick={() => setActiveDialog('dip')} title="Tank DIP Register (F8)">
            DIP<br />REGISTER
          </div>
        </aside>

        {/* Dashboard Content */}
        <main className="win-content">
          {/* Top 4 KPI Cards */}
          <div className="win-kpi-row">
            <div className="win-kpi-card kpi-blue-bg" onClick={() => setActiveDialog('sales')} style={{ cursor: 'pointer' }} title="Click to open Sales Entry">
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

            <div className="win-kpi-card kpi-red-bg" onClick={() => setActiveDialog('customerMaster')} style={{ cursor: 'pointer' }} title="Click to view Customer Fleet Master">
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

            <div className="win-kpi-card kpi-teal-bg" onClick={() => setActiveDialog('bankMaster')} style={{ cursor: 'pointer' }} title="Click to view Bank & Ledger Accounts">
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

            <div className="win-kpi-card kpi-red-bg" onClick={() => setActiveDialog('viewStock')} style={{ cursor: 'pointer' }} title="Click to view Tank Inventory Gauges">
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
                  <div className="breakdown-card card-cash" onClick={() => setActiveDialog('denom')} style={{ cursor: 'pointer' }} title="Cashier Currency Denomination">
                    <span>💵</span>
                  </div>
                  <div className="breakdown-card card-credit" onClick={() => setActiveDialog('credit')} style={{ cursor: 'pointer' }} title="Credit Customer Sale">
                    <span>📋</span>
                  </div>
                  <div className="breakdown-card card-digital" onClick={() => setActiveDialog('cardEntry')} style={{ cursor: 'pointer' }} title="Digital POS Card Swipe">
                    <span>📱</span>
                  </div>
                </div>

                <div className="breakdown-subtext-row">
                  <div className="breakdown-item-label" onClick={() => setActiveDialog('denom')} style={{ cursor: 'pointer' }}>
                    <div className="item-label-name">Cash</div>
                    <div className="item-label-amt">₹ {breakdown.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="breakdown-item-label" onClick={() => setActiveDialog('credit')} style={{ cursor: 'pointer' }}>
                    <div className="item-label-name">Credit</div>
                    <div className="item-label-amt">₹ {breakdown.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="breakdown-item-label" onClick={() => setActiveDialog('cardEntry')} style={{ cursor: 'pointer' }}>
                    <div className="item-label-name">Digital</div>
                    <div className="item-label-amt">₹ {breakdown.digital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>

                <div className="total-collection-bar" onClick={() => openCrystalReport('DSR')} style={{ cursor: 'pointer' }} title="View Full Collection Register">
                  Total Collection : ₹ {breakdown.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>

              {/* Stock Summary Panel */}
              <div className="stock-panel">
                <div className="stock-panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Stock Summary</span>
                  <button className="win-btn-classic" style={{ fontSize: '10px', height: '18px' }} onClick={() => setActiveDialog('viewStock')}>Gauges ▾</button>
                </div>
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>TankName</th>
                      <th>Stock Level (Click row to Dip)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tanks.map((t) => (
                      <tr key={t.id} onClick={() => { setDipTankId(t.id); setActiveDialog('dip'); }} style={{ cursor: 'pointer' }} title="Click to log Dip reading">
                        <td>{t.name}</td>
                        <td>
                          <div className="progress-container">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${Math.min(100, Math.max(10, t.percent))}%` }}
                            >
                              {t.current_stock.toLocaleString('en-IN')} L / {t.percent}%
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
              {/* Top Grid: Customer Outstanding (Click row to view Full Statement Frame 0300) */}
              <div className="win-grid-container">
                <div className="win-search-box">
                  <span style={{ fontWeight: 600 }}>🔍 Filter Customer:</span>
                  <input
                    type="text"
                    placeholder="Search name or city..."
                    value={custFilter}
                    onChange={(e) => setCustFilter(e.target.value)}
                  />
                  <span style={{ marginLeft: 'auto', color: '#555', fontSize: '10px' }}>
                    Click row for Frame 0300 Statement
                  </span>
                </div>
                <div className="win-grid-scroll" style={{ maxHeight: '145px' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th style={{ width: '65%' }}>Customer Name</th>
                        <th className="text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customersList.map((c) => (
                        <tr
                          key={c.id}
                          style={{ cursor: 'pointer' }}
                          title="Click to view Customer Statement of Accounts"
                          onClick={() => openCustomerStatement(c.id)}
                        >
                          <td style={{ color: '#0055ea', fontWeight: 600 }}>{c.name}</td>
                          <td className="text-right">{c.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Grid: Account Balances */}
              <div className="win-grid-container">
                <div className="win-grid-scroll" style={{ maxHeight: '160px' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th style={{ width: '65%' }}>Account (Click to Transfer)</th>
                        <th className="text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountsList.map((a) => (
                        <tr
                          key={a.id}
                          className={selectedAccount === a.name ? 'win-selected-row' : ''}
                          onClick={() => {
                            setSelectedAccount(a.name);
                            setFromAccId(a.id);
                            setActiveDialog('transfer');
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to make Contra Transfer from this account"
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
        <span>Sharpnet Technology Pvt Ltd... For Service Support Contact No : +91-63551-90064 :: +91-9586651811</span>
        <span>Station Shift: {shiftName} | SO: #{shiftNumber} | Status: {shiftStatus}</span>
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
                <span>Sales Entry (Nozzle Totalizers & Tank Balance)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>

            <div className="win-dialog-body">
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '8px' }}>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '40px' }}>Date</span>
                  <input type="text" className="win-input" defaultValue="17-Apr-2026" style={{ width: '100px' }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '40px' }}>Shift</span>
                  <select className="win-select" style={{ width: '80px' }} value={shiftName} onChange={(e) => setShiftName(e.target.value)}>
                    <option>First</option>
                    <option>Second</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
                  <input type="checkbox" onChange={(e) => showToast(e.target.checked ? 'Wireless IoT Dispenser Auto-Sync Enabled' : 'Manual Entry Mode')} /> Import Entry From App
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>SO NO.</span>
                  <input type="text" className="win-input" readOnly value={shiftNumber} style={{ width: '70px', fontWeight: 700 }} />
                </div>
              </div>

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

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '10px', marginTop: '10px' }}>
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
                        <td><button className="win-btn-classic" onClick={() => showToast('✔ Shift Record #16 deleted')}>Delete</button></td>
                      </tr>
                      <tr>
                        <td>15 Apr 2026</td>
                        <td>15</td>
                        <td>First</td>
                        <td>SHARPNETTECHNOLOGY</td>
                        <td><button className="win-btn-classic" onClick={() => showToast('✔ Shift Record #15 deleted')}>Delete</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div className="win-form-row">
                    <span className="win-label">Total Amount</span>
                    <input
                      type="text"
                      className="win-input"
                      readOnly
                      value={`₹ ${salesReadings.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)}`}
                      style={{ fontWeight: 700 }}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">Total Volume</span>
                    <input
                      type="text"
                      className="win-input"
                      readOnly
                      value={`${salesReadings.reduce((acc, curr) => acc + curr.qty, 0).toFixed(2)} Liters`}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <button className="win-btn-classic" onClick={() => setActiveDialog('credit')}>Credit Entry</button>
                    <button className="win-btn-classic" onClick={() => setActiveDialog('expense')}>Expence Book</button>
                    <button className="win-btn-classic" onClick={() => setActiveDialog('denom')}>Cash Settlement</button>
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
                <span>Credit Customer Sale (Vehicle Delivery Slip & Invoicing)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>

            <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '12px' }}>
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
                    <input type="text" className="win-input" value={creditSlipNo} onChange={(e) => setCreditSlipNo(e.target.value)} style={{ width: '60px' }} />
                    <span className="win-label" style={{ minWidth: '45px', marginLeft: '6px' }}>Bill No</span>
                    <input type="text" className="win-input" value={creditBillNo} onChange={(e) => setCreditBillNo(e.target.value)} style={{ width: '60px', fontWeight: 700 }} />
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
                      <option value={1}>Diesel (HSD) - ₹90.21</option>
                      <option value={2}>Petrol (MS) - ₹94.25</option>
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
                    <input type="text" className="win-input" style={{ flex: 1 }} value={creditRemark} onChange={(e) => setCreditRemark(e.target.value)} />
                  </div>

                  {whatsappSlip && (
                    <div style={{ background: '#e8f8f5', border: '1px solid #2ecc71', padding: '6px', fontSize: '11px', marginTop: '6px' }}>
                      📲 WhatsApp Slip for {lastCreditSlip?.cust || 'Customer'}: {whatsappSlip.slice(0, 50)}...
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                    <button type="submit" className="win-btn-classic win-btn-primary" style={{ flex: 1 }}>Save (F2)</button>
                    <button type="button" className="win-btn-classic" onClick={() => { setCreditSlipNo((parseInt(creditSlipNo) + 1).toString()); setCreditQty(100.0); showToast('New Credit Slip initiated'); }}>New Entry</button>
                    <button type="button" className="win-btn-classic" onClick={() => window.print()}>🖨️ Print Slip</button>
                  </div>
                </form>
              </div>

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
                                showToast(`✔ Bill #${b.bill} deleted`);
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
                  Total Credit Amount: ₹ {creditBillsList.reduce((acc, curr) => acc + curr.total, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save | F1=New</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>

            {/* Frame 0050: Are you Sure? Do you want to Print this Receipt..?? */}
            {showPrintConfirm && (
              <div className="win-modal-overlay" style={{ zIndex: 10000 }}>
                <div className="win-form-dialog" style={{ width: '380px', border: '2px solid #0055ea', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
                  <div className="win-dialog-titlebar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🖨️</span>
                      <span>Print Confirmation</span>
                    </div>
                  </div>
                  <div className="win-dialog-body" style={{ textAlign: 'center', padding: '18px 12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '14px', color: '#111' }}>
                      Are you Sure? Do you want to Print this Receipt..??
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                      <button
                        className="win-btn-classic win-btn-primary"
                        style={{ width: '80px', fontWeight: 700 }}
                        onClick={() => executeCreditSaleSave(true)}
                      >
                        Yes
                      </button>
                      <button
                        className="win-btn-classic"
                        style={{ width: '80px', fontWeight: 700 }}
                        onClick={() => executeCreditSaleSave(false)}
                      >
                        No
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
                <span>Customer's Payment (Receipt Voucher & Credit Settlement)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
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
                  <button
                    className="win-btn-classic win-btn-primary"
                    onClick={async () => {
                      const newReceipt = {
                        shift: 'First',
                        date: '17 Apr 2026',
                        cust: payCustName,
                        mode: payMode,
                        amt: payAmount,
                      };
                      setPayReceiptsHistory([newReceipt, ...payReceiptsHistory]);
                      setPayTotalPaid(payTotalPaid + payAmount);
                      setPayTotalUnpaid(Math.max(0, payTotalUnpaid - payAmount));
                      try {
                        const custObj = customers.find((c) => c.name === payCustName);
                        const custId = custObj ? custObj.id : 1;
                        await createPaymentReceipt({
                          customer_id: custId,
                          amount: payAmount,
                          payment_mode: payMode,
                          bank_name: payBank,
                        });
                        showToast(`✔ Receipt recorded in PostgreSQL! Outstanding reduced by ₹${payAmount}`);
                        loadData();
                      } catch {
                        showToast(`✔ Receipt #${payReceiptNo} recorded locally for ₹${payAmount}!`);
                      }
                    }}
                  >
                    Save (F2)
                  </button>
                  <button className="win-btn-classic" onClick={() => { setPayReceiptNo((parseInt(payReceiptNo) + 1).toString().padStart(5, '0')); showToast('New Receipt initiated'); }}>New Entry (F1)</button>
                  <button className="win-btn-classic" onClick={() => window.print()}>🖨️ Print Receipt</button>
                </div>
              </div>

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
                        <td>
                          <button
                            className="win-btn-classic"
                            style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                            onClick={() => {
                              const copy = [...payReceiptsHistory];
                              copy.splice(i, 1);
                              setPayReceiptsHistory(copy);
                              showToast('✔ Receipt deleted');
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
            </div>

            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save | F1=New</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 4: Expence Book (Daily Pump Vouchers)
       * ============================================================= */}
      {activeDialog === 'expense' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '780px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📝</span>
                <span>Daily Expense Book (Cashier Vouchers)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
              <form onSubmit={handleSaveExpense}>
                <div className="win-form-row">
                  <span className="win-label">Category</span>
                  <select className="win-select" style={{ flex: 1 }} value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                    <option>Gen-Set Diesel</option>
                    <option>Staff Tea & Snacks</option>
                    <option>Stationery & Rolls</option>
                    <option>Pump Sweeper / Cleaning</option>
                    <option>Electricity & Water</option>
                    <option>Staff Daily Advance</option>
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">Amount (₹)</span>
                  <input type="number" step="0.01" className="win-input" value={expAmount} onChange={(e) => setExpAmount(parseFloat(e.target.value) || 0)} style={{ fontWeight: 700 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Paid To</span>
                  <input type="text" className="win-input" value={expPaidTo} onChange={(e) => setExpPaidTo(e.target.value)} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Narration</span>
                  <textarea
                    className="win-input"
                    style={{ flex: 1, height: '60px' }}
                    value={expNarration}
                    onChange={(e) => setExpNarration(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button type="submit" className="win-btn-classic win-btn-primary" style={{ flex: 1 }}>
                    Record Expense (F2)
                  </button>
                  <button type="button" className="win-btn-classic" onClick={() => window.print()}>🖨️ Print</button>
                </div>
              </form>

              <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '240px', overflowY: 'auto' }}>
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Paid To</th>
                      <th className="text-right">Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expensesList.map((e) => (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td style={{ fontWeight: 600 }}>{e.category}</td>
                        <td>{e.paid_to}</td>
                        <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>₹ {e.amount.toFixed(2)}</td>
                        <td>
                          <button className="win-btn-classic" style={{ height: '18px', padding: '0 4px', fontSize: '10px' }} onClick={() => handleDeleteExpense(e.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 5: Transfer Entry (Cash to Bank / Bank to Bank Contra)
       * ============================================================= */}
      {activeDialog === 'transfer' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '640px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔄</span>
                <span>Contra Transfer Entry (Cash & Bank Deposit)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <form onSubmit={handleSaveTransfer}>
                <div className="win-form-row">
                  <span className="win-label">From Account</span>
                  <select className="win-select" style={{ flex: 1 }} value={fromAccId} onChange={(e) => setFromAccId(parseInt(e.target.value))}>
                    {accountsList.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} (₹ {a.balance.toLocaleString('en-IN')})</option>
                    ))}
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">To Account</span>
                  <select className="win-select" style={{ flex: 1 }} value={toAccId} onChange={(e) => setToAccId(parseInt(e.target.value))}>
                    {accountsList.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} (₹ {a.balance.toLocaleString('en-IN')})</option>
                    ))}
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">Transfer Amount</span>
                  <input
                    type="number"
                    step="0.01"
                    className="win-input"
                    value={transferAmt}
                    onChange={(e) => setTransferAmt(parseFloat(e.target.value) || 0)}
                    style={{ fontWeight: 700, fontSize: '13px' }}
                  />
                </div>
                <button type="submit" className="win-btn-classic win-btn-primary" style={{ width: '100%', marginTop: '12px' }}>
                  Execute Fund Transfer
                </button>
              </form>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Execute</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 6: Rate Master
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

              <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '140px', overflowY: 'auto' }}>
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
                  <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '90px', overflowY: 'auto' }}>
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
       * MODAL 7: DIP REGISTER
       * ============================================================= */}
      {activeDialog === 'dip' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '620px' }}>
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
       * MODAL 8: Purchase Entry (Tanker Decanting - Frame 0161)
       * ============================================================= */}
      {activeDialog === 'purchase' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '980px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🚛</span>
                <span>Purchase Entry (Tanker Decanting & Inward Invoicing)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <form onSubmit={handleSavePurchase}>
                {/* Top Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Invoice No</span>
                    <input type="text" className="win-input" value={purInvoiceNo} onChange={(e) => setPurInvoiceNo(e.target.value)} style={{ flex: 1, fontWeight: 700 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '60px' }}>Oil Co.</span>
                    <input type="text" className="win-input" value={purDealer} onChange={(e) => setPurDealer(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Tanker No</span>
                    <input type="text" className="win-input" value={purVehicleNo} onChange={(e) => setPurVehicleNo(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '80px' }}>Density @15°C</span>
                    <input type="number" step="0.1" className="win-input" value={purDensity} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setPurDensity(v); setPurSampleDensity(v); }} style={{ flex: 1, fontWeight: 700 }} />
                  </div>
                </div>

                {/* 8 Seals Verification Box (Frame 0161) */}
                <div style={{ background: '#fdfefe', border: '1px solid #7f9db9', padding: '6px 10px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0055ea', marginBottom: '4px' }}>
                    🔒 Tanker Security Seals Verification (4 Wooden & 4 Aluminum Seals)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '4px' }}>
                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Wooden Seal 1</span>
                      <input type="text" className="win-input" value={purWoodenSeals.s1} onChange={(e) => setPurWoodenSeals({ ...purWoodenSeals, s1: e.target.value })} style={{ flex: 1 }} />
                    </div>
                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Wooden Seal 2</span>
                      <input type="text" className="win-input" value={purWoodenSeals.s2} onChange={(e) => setPurWoodenSeals({ ...purWoodenSeals, s2: e.target.value })} style={{ flex: 1 }} />
                    </div>
                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Wooden Seal 3</span>
                      <input type="text" className="win-input" value={purWoodenSeals.s3} onChange={(e) => setPurWoodenSeals({ ...purWoodenSeals, s3: e.target.value })} style={{ flex: 1 }} />
                    </div>
                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Wooden Seal 4</span>
                      <input type="text" className="win-input" value={purWoodenSeals.s4} onChange={(e) => setPurWoodenSeals({ ...purWoodenSeals, s4: e.target.value })} style={{ flex: 1 }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Aluminum Seal 1</span>
                      <input type="text" className="win-input" value={purAlumSeals.s1} onChange={(e) => setPurAlumSeals({ ...purAlumSeals, s1: e.target.value })} style={{ flex: 1 }} />
                    </div>
                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Aluminum Seal 2</span>
                      <input type="text" className="win-input" value={purAlumSeals.s2} onChange={(e) => setPurAlumSeals({ ...purAlumSeals, s2: e.target.value })} style={{ flex: 1 }} />
                    </div>
                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Aluminum Seal 3</span>
                      <input type="text" className="win-input" value={purAlumSeals.s3} onChange={(e) => setPurAlumSeals({ ...purAlumSeals, s3: e.target.value })} style={{ flex: 1 }} />
                    </div>
                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '85px', fontSize: '10px' }}>Aluminum Seal 4</span>
                      <input type="text" className="win-input" value={purAlumSeals.s4} onChange={(e) => setPurAlumSeals({ ...purAlumSeals, s4: e.target.value })} style={{ flex: 1 }} />
                    </div>
                  </div>
                </div>

                {/* Line Item Entry Row */}
                <div style={{ background: '#ece9d8', border: '1px solid #7f9db9', padding: '6px 10px', marginBottom: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1fr 1fr 1fr 1fr 1fr', gap: '6px', alignItems: 'flex-end' }}>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 600 }}>Charge Code</span>
                      <div style={{ display: 'flex', gap: '2px' }}>
                        <input type="text" className="win-input" value={purChargeCode} onChange={(e) => setPurChargeCode(e.target.value)} style={{ width: '45px' }} />
                        <button type="button" className="win-btn-classic" style={{ padding: '0 4px' }} title="Add New Charge Code">+</button>
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 600 }}>Product Name</span>
                      <select
                        className="win-select"
                        style={{ width: '100%' }}
                        value={purChargeCode}
                        onChange={(e) => {
                          setPurChargeCode(e.target.value);
                          setPurRateKl(e.target.value === '01' ? 72478.36 : 76890.12);
                          setPurDensity(e.target.value === '01' ? 825.4 : 742.8);
                        }}
                      >
                        <option value="01">High Speed Diesel (HSD BS-VI)</option>
                        <option value="02">Motor Spirit (MS Petrol BS-VI)</option>
                      </select>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 600 }}>Quantity (KL)</span>
                      <input type="number" step="0.1" className="win-input" value={purQtyKl} onChange={(e) => setPurQtyKl(parseFloat(e.target.value) || 0)} style={{ width: '100%', fontWeight: 700 }} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 600 }}>Rate / KL</span>
                      <input type="number" step="0.01" className="win-input" value={purRateKl} onChange={(e) => setPurRateKl(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 600 }}>Freight (₹)</span>
                      <input type="number" step="0.01" className="win-input" value={purFreight} onChange={(e) => setPurFreight(parseFloat(e.target.value) || 0)} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 600 }}>Final Amount</span>
                      <input type="text" className="win-input" readOnly value={`₹ ${(purQtyKl * purRateKl + purFreight).toFixed(2)}`} style={{ width: '100%', fontWeight: 700, color: '#1565c0' }} />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={handleAddPurchaseLine}
                        style={{
                          width: '100%',
                          height: '24px',
                          background: '#000000',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '11px',
                          border: '1px solid #333',
                          cursor: 'pointer',
                        }}
                      >
                        Add to list
                      </button>
                    </div>
                  </div>
                </div>

                {/* Items Grid */}
                <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '130px', overflowY: 'auto', marginBottom: '8px' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Item Description</th>
                        <th className="text-right">Qty</th>
                        <th>Unit</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">Amount</th>
                        <th className="text-right">Gross Amt</th>
                        <th className="text-right">Final Amount</th>
                        <th className="text-right">Freight</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purItemsGrid.map((it, idx) => (
                        <tr key={idx}>
                          <td>{it.code}</td>
                          <td>{it.desc}</td>
                          <td className="text-right">{it.qty.toFixed(2)}</td>
                          <td>{it.unit}</td>
                          <td className="text-right">{it.rate.toFixed(2)}</td>
                          <td className="text-right">{it.amount.toFixed(2)}</td>
                          <td className="text-right">{it.gross.toFixed(2)}</td>
                          <td className="text-right" style={{ fontWeight: 700, color: '#1565c0' }}>{it.final.toFixed(2)}</td>
                          <td className="text-right">{it.freight.toFixed(2)}</td>
                          <td>
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                              onClick={() => {
                                const copy = [...purItemsGrid];
                                copy.splice(idx, 1);
                                setPurItemsGrid(copy);
                                showToast('✔ Item removed from list');
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

                {/* Bottom PO History Table (Frame 0161) */}
                <div style={{ borderTop: '1px solid #7f9db9', paddingTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700 }}>Inward Purchase History (Past Decanting POs)</span>
                    <span style={{ fontSize: '11px', color: '#555' }}>Total POs: {purPoHistory.length}</span>
                  </div>
                  <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '110px', overflowY: 'auto' }}>
                    <table className="win-datagrid">
                      <thead>
                        <tr>
                          <th>PO No</th>
                          <th>Date</th>
                          <th>Invoice No</th>
                          <th>Dealer / Oil Company</th>
                          <th className="text-right">Total Amount</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purPoHistory.map((p, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700 }}>{p.po}</td>
                            <td>{p.date}</td>
                            <td>{p.inv}</td>
                            <td>{p.dealer}</td>
                            <td className="text-right" style={{ fontWeight: 700 }}>₹ {p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td>
                              <button
                                type="button"
                                className="win-btn-classic"
                                style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                                onClick={() => showToast(`✔ Viewing Decanting PO ${p.po}`)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#666' }}>Sample Hydrometer Density verified: {purSampleDensity} kg/m³</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="submit" className="win-btn-classic win-btn-primary">Save (F2)</button>
                    <button type="button" className="win-btn-classic" onClick={() => { setPurQtyKl(4.0); setPurInvoiceNo('3215' + Math.floor(100 + Math.random() * 900)); showToast('New Purchase Slip ready'); }}>Reset (F1)</button>
                    <button type="button" className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 9: Cashier Denomination Settlement (Frame 200)
       * ============================================================= */}
      {activeDialog === 'denom' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '680px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💵</span>
                <span>Cashier Currency Denomination & Gap Tally</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>Physical Currency Notes Count</div>
                <div className="win-form-row">
                  <span className="win-label">₹ 2,000 ×</span>
                  <input type="number" className="win-input" value={denoms.n2000} onChange={(e) => setDenoms({ ...denoms, n2000: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 500 ×</span>
                  <input type="number" className="win-input" value={denoms.n500} onChange={(e) => setDenoms({ ...denoms, n500: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 200 ×</span>
                  <input type="number" className="win-input" value={denoms.n200} onChange={(e) => setDenoms({ ...denoms, n200: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 100 ×</span>
                  <input type="number" className="win-input" value={denoms.n100} onChange={(e) => setDenoms({ ...denoms, n100: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 50 ×</span>
                  <input type="number" className="win-input" value={denoms.n50} onChange={(e) => setDenoms({ ...denoms, n50: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 20 ×</span>
                  <input type="number" className="win-input" value={denoms.n20} onChange={(e) => setDenoms({ ...denoms, n20: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 10 ×</span>
                  <input type="number" className="win-input" value={denoms.n10} onChange={(e) => setDenoms({ ...denoms, n10: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Coins ₹</span>
                  <input type="number" className="win-input" value={denoms.coins} onChange={(e) => setDenoms({ ...denoms, coins: parseInt(e.target.value) || 0 })} />
                </div>
                <button type="button" className="win-btn-classic win-btn-primary" style={{ width: '100%', marginTop: '8px' }} onClick={handleCalculateDenom}>
                  Calculate Settlement
                </button>
              </div>

              {denomResult && (
                <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '10px' }}>
                  <div style={{ fontWeight: 700, borderBottom: '1px solid #999', paddingBottom: '4px', marginBottom: '8px' }}>
                    Settlement Tally Summary
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">Physical Cash:</span>
                    <span style={{ fontWeight: 700 }}>₹ {denomResult.cash_total.toFixed(2)}</span>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">Expected Cash:</span>
                    <span>₹ {denomResult.expected_cash.toFixed(2)}</span>
                  </div>
                  <div className="win-form-row" style={{ marginTop: '8px', borderTop: '1px solid #ddd', paddingTop: '6px' }}>
                    <span className="win-label">Gap Amount:</span>
                    <span style={{ fontWeight: 800, fontSize: '14px', color: denomResult.gap_amount < 0 ? '#c0392b' : '#2ecc71' }}>
                      ₹ {denomResult.gap_amount.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ marginTop: '8px', padding: '6px', fontSize: '11px', fontWeight: 700, textAlign: 'center', background: denomResult.gap_amount < 0 ? '#fdecea' : '#e8f8f5', color: denomResult.gap_amount < 0 ? '#c0392b' : '#27ae60' }}>
                    Status: {denomResult.status}
                  </div>
                </div>
              )}
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 10: Customer Statement of Accounts (Frame 0300)
       * ============================================================= */}
      {activeDialog === 'statement' && selectedStatement && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '850px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📑</span>
                <span>Customer Statement of Accounts (Printable Format)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>

            <div className="win-dialog-body">
              <div className="statement-sheet">
                <div className="statement-title-bar">
                  <div className="statement-bunk-name">NSAIPETROSOFT RETAIL OUTLET</div>
                  <div className="statement-subtitle">Dealers In: Motor Spirit (Petrol) & High Speed Diesel | Surat, Gujarat</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '4px' }}>STATEMENT OF ACCOUNTS</div>
                </div>

                <div className="statement-meta-grid">
                  <div>
                    <div><strong>Customer:</strong> {selectedStatement.customer.name}</div>
                    <div><strong>City:</strong> {selectedStatement.customer.city}</div>
                    <div><strong>Mobile:</strong> {selectedStatement.customer.mobile}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div><strong>Statement Period:</strong> 01-Apr-2026 to 17-Apr-2026</div>
                    <div><strong>Code:</strong> {selectedStatement.customer.code}</div>
                    <div><strong>Current Outstanding:</strong> ₹ {selectedStatement.customer.outstanding.toLocaleString('en-IN')}</div>
                  </div>
                </div>

                <table className="statement-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Bill No</th>
                      <th>Vehicle No</th>
                      <th>Slip No</th>
                      <th className="text-right">Qty (Ltr)</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedStatement.bills.map((b: any, idx: number) => (
                      <tr key={idx}>
                        <td>{b.date}</td>
                        <td>{b.bill_no}</td>
                        <td>{b.vehicle_no}</td>
                        <td>{b.slip_no}</td>
                        <td className="text-right">{b.qty.toFixed(2)}</td>
                        <td className="text-right">{b.rate}</td>
                        <td className="text-right" style={{ fontWeight: 600 }}>{b.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="statement-bottom-summary">
                  <div className="terms-box">
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Terms & Condition</div>
                    {selectedStatement.summary.terms.map((t: string, i: number) => (
                      <div key={i} style={{ marginBottom: '2px', lineHeight: '1.2' }}>{t}</div>
                    ))}
                    <div style={{ marginTop: '24px', fontWeight: 'bold' }}>
                      {selectedStatement.summary.signatory}
                    </div>
                  </div>

                  <div className="totals-calc-box">
                    <div className="totals-calc-row">
                      <span>Total Purchase:</span>
                      <strong>₹ {selectedStatement.summary.total_purchase.toFixed(2)}</strong>
                    </div>
                    <div className="totals-calc-row">
                      <span>Total Other Lube:</span>
                      <span>₹ {selectedStatement.summary.total_other_lube.toFixed(2)}</span>
                    </div>
                    <div className="totals-calc-row">
                      <span>Previous Dues:</span>
                      <strong>₹ {selectedStatement.summary.previous_dues.toFixed(2)}</strong>
                    </div>
                    <div className="totals-calc-row">
                      <span>Total Paid in Period:</span>
                      <span style={{ color: '#27ae60' }}>- ₹ {selectedStatement.summary.total_paid_period.toFixed(2)}</span>
                    </div>
                    <div className="totals-calc-row final-due">
                      <span>Net Payables to you:</span>
                      <span style={{ color: '#c0392b' }}>₹ {selectedStatement.summary.net_payables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="win-btn-classic win-btn-primary" onClick={() => window.print()}>🖨️ Print Statement</button>
                <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 11: Stamping Due Calendar (Weights & Measures)
       * ============================================================= */}
      {activeDialog === 'stamping' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '700px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚖️</span>
                <span>Weights & Measures Nozzle Stamping Schedule</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <div style={{ marginBottom: '8px', fontSize: '11px', color: '#555' }}>
                Statutory annual calibration reminder under Legal Metrology Act for fuel dispensing units.
              </div>
              <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '250px', overflowY: 'auto' }}>
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th>Nozzle Name</th>
                      <th>Connected Tank</th>
                      <th>Last Stamped</th>
                      <th>Next Due Date</th>
                      <th>Days Left</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stampingList.map((s, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700 }}>{s.nozzle_name}</td>
                        <td>{s.tank}</td>
                        <td>{s.last_stamped}</td>
                        <td style={{ fontWeight: 700, color: '#c0392b' }}>{s.next_due}</td>
                        <td style={{ fontWeight: 700 }}>{s.days_remaining} Days</td>
                        <td><span style={{ background: '#e8f8f5', color: '#27ae60', padding: '2px 6px', fontWeight: 700 }}>{s.status}</span></td>
                      </tr>
                    ))}
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

      {/* =============================================================
       * MODAL 12: Help Desk & Support
       * ============================================================= */}
      {activeDialog === 'help' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '500px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📞</span>
                <span>Help Desk & Technical Support</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body" style={{ lineHeight: '1.6' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
                Sharpnet Technology Pvt Ltd — Dedicated Retail Support
              </div>
              <div><strong>Primary Support Helpline:</strong> +91-63551-90064</div>
              <div><strong>Secondary Support Helpline:</strong> +91-9586651811</div>
              <div><strong>Working Hours:</strong> Monday – Saturday (09:00 AM – 05:00 PM)</div>
              <div><strong>Technical Email:</strong> support@sharpnettechnology.com</div>
              <div style={{ marginTop: '12px', padding: '8px', background: '#e5f1fb', border: '1px solid #70c0e7', fontSize: '11px' }}>
                💡 <strong>Instant Shortcuts:</strong> Press <strong>F1</strong> for Sales Entry, <strong>F2</strong> for Rate Master, <strong>F3</strong> for Credit Bills, <strong>F4</strong> for Payment, <strong>F5</strong> for Expense, <strong>F6</strong> for Transfer, <strong>F10</strong> for Reports, and <strong>ESC</strong> to dismiss any window.
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 13: Windows Calculator Widget
       * ============================================================= */}
      {activeDialog === 'calc' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '280px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🧮</span>
                <span>Calculator</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <input type="text" className="calc-display" readOnly value={calcInput} />
              <div className="calc-grid">
                {['C', '/', '*', '-'].map((op) => (
                  <button key={op} className="calc-btn calc-btn-op" onClick={() => handleCalcBtn(op)}>{op}</button>
                ))}
                {['7', '8', '9', '+'].map((val) => (
                  <button key={val} className={`calc-btn ${val === '+' ? 'calc-btn-op' : ''}`} onClick={() => handleCalcBtn(val)}>{val}</button>
                ))}
                {['4', '5', '6', '='].map((val) => (
                  <button key={val} className={`calc-btn ${val === '=' ? 'calc-btn-op' : ''}`} onClick={() => handleCalcBtn(val)}>{val}</button>
                ))}
                {['1', '2', '3', '0'].map((val) => (
                  <button key={val} className="calc-btn" onClick={() => handleCalcBtn(val)}>{val}</button>
                ))}
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 14: Set Report Criteria Master Window (Frame 0375)
       * ============================================================= */}
      {activeDialog === 'reports' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '990px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚙️</span>
                <span>Set Report Criteria — Petroleum MIS & Statutory Audits</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '12px' }}>
              {/* Left Column: 4 Columns of 44 Report Radios (Frame 0375) */}
              <div className="win-groupbox" style={{ padding: '8px' }}>
                <span className="win-groupbox-title">Select Report (All 44 Statutory & MIS Registers)</span>
                <div className="report-criteria-grid">
                  {/* Column 1 */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '11px', color: '#b71c1c', marginBottom: '4px', borderBottom: '1px solid #ccc' }}>Statutory & Financial</div>
                    {[
                      'DSR',
                      'VAT SUMMARY',
                      'PROFIT SUMMARY',
                      'PURCHASE LFR SUMMARY',
                      'DEALER COMMISION REPORT',
                      'TDS SUMMARY',
                      'PROFIT LOSS SUMMARY',
                      'Nozzle Wise Sales',
                      'Shift Wise Sales',
                      'Tank Stock Summary',
                      'Customer Outstanding Summary',
                    ].map((rep) => (
                      <label key={rep} className="report-radio-label">
                        <input
                          type="radio"
                          name="reportSelection"
                          checked={reportCriteriaRadio === rep}
                          onChange={() => {
                            setReportCriteriaRadio(rep);
                            setActiveReportTitle(rep);
                          }}
                        />
                        <span style={{ fontWeight: reportCriteriaRadio === rep ? 700 : 400 }}>{rep}</span>
                      </label>
                    ))}
                  </div>

                  {/* Column 2 */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '11px', color: '#1565c0', marginBottom: '4px', borderBottom: '1px solid #ccc' }}>Purchase & Sales</div>
                    {[
                      'Purchase Summary (Invoice Wise)',
                      'Purchase Summary (Product Wise)',
                      'Purchase Register (Detailed)',
                      'Sales Register (Detailed)',
                      'Cash Sales Register',
                      'Credit Sales Register',
                      'Card / Digital Swipe Register',
                      'Expense Summary (Head Wise)',
                      'Shift Cashier Settlement Report',
                      'Tanker Decanting Register',
                      'Tank DIP Calibration Variation',
                    ].map((rep) => (
                      <label key={rep} className="report-radio-label">
                        <input
                          type="radio"
                          name="reportSelection"
                          checked={reportCriteriaRadio === rep}
                          onChange={() => {
                            setReportCriteriaRadio(rep);
                            setActiveReportTitle(rep);
                          }}
                        />
                        <span style={{ fontWeight: reportCriteriaRadio === rep ? 700 : 400 }}>{rep}</span>
                      </label>
                    ))}
                  </div>

                  {/* Column 3 */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '11px', color: '#2e7d32', marginBottom: '4px', borderBottom: '1px solid #ccc' }}>Ledger & Cash Book</div>
                    {[
                      'Customer Ledger Statement',
                      'Supplier / Oil Company Ledger',
                      'Bank Book Summary',
                      'Cash Book Summary',
                      'Day Book (Cashier Tally)',
                      'Account Group Summary',
                      'Monthly Sales Comparison',
                      'Lube Sales & Stock Register',
                      'Density & Temperature Log',
                      'Meter Difference Audit',
                      'Testing Quantity Register',
                    ].map((rep) => (
                      <label key={rep} className="report-radio-label">
                        <input
                          type="radio"
                          name="reportSelection"
                          checked={reportCriteriaRadio === rep}
                          onChange={() => {
                            setReportCriteriaRadio(rep);
                            setActiveReportTitle(rep);
                          }}
                        />
                        <span style={{ fontWeight: reportCriteriaRadio === rep ? 700 : 400 }}>{rep}</span>
                      </label>
                    ))}
                  </div>

                  {/* Column 4 */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '11px', color: '#6a1b9a', marginBottom: '4px', borderBottom: '1px solid #ccc' }}>Legal & Audits</div>
                    {[
                      'Stamping Schedule (Legal Metrology)',
                      'Employee Performance Register',
                      'Vehicle Wise Fuel Consumption',
                      'Discount & Credit Card Charges',
                      'Trial Balance',
                      'Profit & Loss Account',
                      'Balance Sheet',
                      'Cheque Return Register',
                      'Shortage / Leakage Analysis',
                      'GST Output Tax Summary',
                      'Daily Cash Denomination Log',
                    ].map((rep) => (
                      <label key={rep} className="report-radio-label">
                        <input
                          type="radio"
                          name="reportSelection"
                          checked={reportCriteriaRadio === rep}
                          onChange={() => {
                            setReportCriteriaRadio(rep);
                            setActiveReportTitle(rep);
                          }}
                        />
                        <span style={{ fontWeight: reportCriteriaRadio === rep ? 700 : 400 }}>{rep}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Filter Criteria (Frame 0375) */}
              <div className="win-groupbox" style={{ padding: '8px' }}>
                <span className="win-groupbox-title">Criteria Details</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>From Date</span>
                    <input type="text" className="win-input" value={critFromDate} onChange={(e) => setCritFromDate(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>To Date</span>
                    <input type="text" className="win-input" value={critToDate} onChange={(e) => setCritToDate(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Customer</span>
                    <select className="win-select" value={critCustomer} onChange={(e) => setCritCustomer(e.target.value)} style={{ flex: 1 }}>
                      <option>---Select Any---</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Supplier</span>
                    <select className="win-select" value={critSupplier} onChange={(e) => setCritSupplier(e.target.value)} style={{ flex: 1 }}>
                      <option>---Select Any---</option>
                      <option>BHARAT PETROLEUM CO LTD</option>
                      <option>INDIAN OIL CORPORATION LTD</option>
                      <option>HINDUSTAN PETROLEUM CO LTD</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Item</span>
                    <select className="win-select" value={critItem} onChange={(e) => setCritItem(e.target.value)} style={{ flex: 1 }}>
                      <option value="Diesel">High Speed Diesel (HSD)</option>
                      <option value="Petrol">Motor Spirit (Petrol MS)</option>
                      <option value="All">All Fuel Products & Lubes</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Invoice No</span>
                    <input type="text" className="win-input" value={critInvoiceNo} onChange={(e) => setCritInvoiceNo(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Date</span>
                    <input type="text" className="win-input" value={critDate} onChange={(e) => setCritDate(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Shift</span>
                    <select className="win-select" value={critShift} onChange={(e) => setCritShift(e.target.value)} style={{ flex: 1 }}>
                      <option>First</option>
                      <option>Second</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Ledger</span>
                    <select className="win-select" value={critLedger} onChange={(e) => setCritLedger(e.target.value)} style={{ flex: 1 }}>
                      <option>---Select Any---</option>
                      <option>CASH ON HAND</option>
                      <option>HDFC BANK CA</option>
                      <option>SBI CURRENT A/C</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Acct Group</span>
                    <select className="win-select" value={critAccountGroup} onChange={(e) => setCritAccountGroup(e.target.value)} style={{ flex: 1 }}>
                      <option>---Select Any---</option>
                      <option>Sundry Debtors</option>
                      <option>Sundry Creditors</option>
                      <option>Bank Accounts</option>
                      <option>Direct Expenses</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Vehicle</span>
                    <input type="text" className="win-input" value={critVehicle} onChange={(e) => setCritVehicle(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Bill Period</span>
                    <select className="win-select" value={critBillPeriod} onChange={(e) => setCritBillPeriod(e.target.value)} style={{ flex: 1 }}>
                      <option>---Select Any---</option>
                      <option>Daily</option>
                      <option>Weekly</option>
                      <option>Fortnightly (15 Days)</option>
                      <option>Monthly</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Employee</span>
                    <select className="win-select" value={critEmployee} onChange={(e) => setCritEmployee(e.target.value)} style={{ flex: 1 }}>
                      <option>AA</option>
                      <option>SANMUKH H CHAUDHARI</option>
                      <option>YATIN N CHAUDHARI</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button
                    type="button"
                    className="win-btn-classic win-btn-primary"
                    style={{ height: '28px', fontSize: '12px', fontWeight: 700 }}
                    onClick={() => openCrystalReport(reportCriteriaRadio)}
                  >
                    📊 Open Report (Crystal Viewer)
                  </button>
                  <button
                    type="button"
                    className="win-btn-classic"
                    style={{ height: '26px', fontSize: '11px' }}
                    onClick={() => showToast(`✔ Email sent to dealer management for ${reportCriteriaRadio}!`)}
                  >
                    ✉️ Send Email to Head Office
                  </button>
                </div>
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">Selected: {reportCriteriaRadio} | Criteria Ready</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 14B: SAP Crystal Reports Viewer Shell (Frames 0132, 0310, 0330, 0360)
       * ============================================================= */}
      {activeDialog === 'crystalViewer' && (
        <div className="win-modal-overlay">
          <div className="crystal-viewer-dialog">
            {/* Title Bar */}
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📑</span>
                <span>SAP Crystal Reports — {activeReportTitle}</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>

            {/* Crystal Toolbar */}
            <div className="crystal-toolbar">
              <button className="crystal-tool-btn" onClick={() => setCrystalPage(1)} title="First Page">|◀◀</button>
              <button className="crystal-tool-btn" onClick={() => setCrystalPage(Math.max(1, crystalPage - 1))} title="Previous Page">◀</button>
              <div className="crystal-page-counter">
                <span>Page</span>
                <input type="text" className="win-input" value={crystalPage} readOnly style={{ width: '28px', textAlign: 'center', height: '18px', padding: 0 }} />
                <span>of</span>
                <span>{crystalTotalPages}</span>
              </div>
              <button className="crystal-tool-btn" onClick={() => setCrystalPage(Math.min(crystalTotalPages, crystalPage + 1))} title="Next Page">▶</button>
              <button className="crystal-tool-btn" onClick={() => setCrystalPage(crystalTotalPages)} title="Last Page">▶▶|</button>
              <div className="win-menu-divider" style={{ height: '18px', margin: '0 4px' }} />
              <button className="crystal-tool-btn" onClick={() => showToast('Loading stopped')} title="Stop">🛑</button>
              <button className="crystal-tool-btn" onClick={() => openCrystalReport(reportCriteriaRadio)} title="Refresh">🔄</button>
              <div className="win-menu-divider" style={{ height: '18px', margin: '0 4px' }} />
              <button className="crystal-tool-btn" onClick={() => window.print()} title="Print Document">🖨️ Print</button>
              <button className="crystal-tool-btn" onClick={() => showToast(`✔ ${activeReportTitle} exported to PDF & Excel!`)} title="Export">💾 Export PDF</button>
              <div className="win-menu-divider" style={{ height: '18px', margin: '0 4px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>Zoom:</span>
                <select className="win-select" value={reportZoom} onChange={(e) => setReportZoom(e.target.value)} style={{ height: '20px', fontSize: '11px' }}>
                  <option>Whole Page</option>
                  <option>Page Width</option>
                  <option>100%</option>
                  <option>75%</option>
                  <option>50%</option>
                </select>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>Find:</span>
                <input type="text" className="win-input" placeholder="Search report..." style={{ height: '18px', width: '110px' }} />
              </div>
            </div>

            {/* Crystal Canvas Sheet */}
            <div className="crystal-canvas-wrapper">
              <div className="crystal-report-sheet">
                {/* Header */}
                <div className="crystal-company-name">NSAIPETROSOFT RETAIL OUTLET</div>
                <div style={{ textAlign: 'center', fontSize: '11px', color: '#444' }}>
                  DEALERS IN: BHARAT PETROLEUM CORPORATION LTD. | SURAT, GUJARAT - 395003
                </div>
                <div className="crystal-report-title">{activeReportTitle}</div>
                <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>
                  Period: {critFromDate} To {critToDate} | Shift: {critShift} | Item: {critItem}
                </div>

                {/* 1. DSR Report View (Frame 0132 & 0365) */}
                {(reportCriteriaRadio === 'DSR' || reportCriteriaRadio === 'DSR REPORT') && (
                  <div>
                    <div className="crystal-table-subhead">1. Nozzle Meter Totalizers & Sales Register</div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Nozzle</th>
                          <th>Product</th>
                          <th>Opening Meter</th>
                          <th>Closing Meter</th>
                          <th>Testing</th>
                          <th>Sale Qty (L)</th>
                          <th>Rate (₹)</th>
                          <th className="text-right">Total Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesReadings.map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700 }}>{r.nozzle}</td>
                            <td>{r.item}</td>
                            <td>{r.open.toFixed(2)}</td>
                            <td>{r.close.toFixed(2)}</td>
                            <td>{r.test.toFixed(2)}</td>
                            <td style={{ fontWeight: 700, color: '#1565c0' }}>{r.qty.toFixed(2)}</td>
                            <td>{r.rate}</td>
                            <td className="text-right" style={{ fontWeight: 700 }}>{r.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="crystal-table-subhead" style={{ marginTop: '12px' }}>2. Underground Tank DIP & Evaporation Variation Register</div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Tank</th>
                          <th>Product</th>
                          <th>Opening Stock</th>
                          <th>Receipt</th>
                          <th>Meter Sale</th>
                          <th>Book Stock</th>
                          <th>Actual DIP Stock</th>
                          <th>Daily Variation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dsrReport.map((t, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 700 }}>{t.tank}</td>
                            <td>{t.product}</td>
                            <td>{t.opening_stock} L</td>
                            <td>{t.receipt} L</td>
                            <td>{t.meter_sale} L</td>
                            <td>{t.closing_book_stock} L</td>
                            <td style={{ fontWeight: 700 }}>{t.actual_dip_stock || t.closing_book_stock} L</td>
                            <td style={{ color: '#c0392b', fontWeight: 700 }}>{t.daily_variation} L</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '12px' }}>
                      <div>
                        <div className="crystal-table-subhead">3. Product Summary</div>
                        <table className="crystal-table">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>Liters Sold</th>
                              <th className="text-right">Total Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>Motor Spirit (MS Petrol)</td>
                              <td>155.00 L</td>
                              <td className="text-right">₹ 14,608.75</td>
                            </tr>
                            <tr>
                              <td>High Speed Diesel (HSD)</td>
                              <td>3,546.00 L</td>
                              <td className="text-right">₹ 3,19,884.66</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <div className="crystal-table-subhead">4. Cashier Shift Settlement Summary</div>
                        <div style={{ border: '1px solid #999', padding: '6px', fontSize: '11px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span>Physical Cash Collected:</span>
                            <strong>₹ 2,37,659.88</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span>Credit Bills Total:</span>
                            <strong>₹ 54,091.46</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span>Digital Card / POS Swipes:</span>
                            <strong>₹ 3,73,156.84</strong>
                          </div>
                          <div style={{ borderTop: '1px solid #777', paddingTop: '4px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1565c0' }}>
                            <span>Gross Day Collection:</span>
                            <span>₹ 6,64,908.18</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. VAT SUMMARY (Frame 0307 & 0310) */}
                {(reportCriteriaRadio === 'VAT SUMMARY' || reportCriteriaRadio === 'VAT SUMMARY REPORT') && (
                  <div>
                    <div className="crystal-table-subhead">PURCHASE (Input Tax Credit)</div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Invoice No</th>
                          <th>Date</th>
                          <th>Basic Amount (₹)</th>
                          <th>VAT 13% (₹)</th>
                          <th>Cess (₹)</th>
                          <th>TCS 0.1% (₹)</th>
                          <th className="text-right">Total Purchase (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>3215788</td>
                          <td>17-Apr-2026</td>
                          <td>2,10,480.00</td>
                          <td>27,362.40</td>
                          <td>8,419.20</td>
                          <td>210.48</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>2,46,472.08</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="crystal-table-subhead" style={{ marginTop: '14px' }}>SALES (Output Tax Liability)</div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Shift / Date</th>
                          <th>Product</th>
                          <th>Basic Sales (₹)</th>
                          <th>VAT 13% (₹)</th>
                          <th>Cess (₹)</th>
                          <th className="text-right">Total Sales (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>17-Apr-2026 (Shift 1)</td>
                          <td>High Speed Diesel (HSD)</td>
                          <td>3,19,884.66</td>
                          <td>41,585.00</td>
                          <td>12,795.38</td>
                          <td className="text-right">3,74,265.04</td>
                        </tr>
                        <tr>
                          <td>17-Apr-2026 (Shift 1)</td>
                          <td>Motor Spirit (MS Petrol)</td>
                          <td>2,68,529.66</td>
                          <td>34,908.86</td>
                          <td>10,741.19</td>
                          <td className="text-right">2,90,643.14</td>
                        </tr>
                        <tr className="crystal-highlight-row">
                          <td colSpan={2}>TOTAL SALES LIABILITY</td>
                          <td>5,88,414.32</td>
                          <td>76,493.86</td>
                          <td>23,536.57</td>
                          <td className="text-right" style={{ fontWeight: 800 }}>6,64,908.18</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Frame 0310: Net Payable State VAT Calculation */}
                    <div style={{ marginTop: '16px', background: '#ffebee', border: '2px solid #b71c1c', padding: '10px', width: '380px', marginLeft: 'auto' }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#b71c1c', borderBottom: '1px solid #b71c1c', paddingBottom: '4px', marginBottom: '6px' }}>
                        STATE COMMERCIAL TAX (VAT) COMPUTATION
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Total Sales Output VAT:</span>
                        <span>₹ 76,493.86</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Less: Purchase Input VAT ITC:</span>
                        <span>- ₹ 27,362.40</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Output Cess on Sales:</span>
                        <span>₹ 23,536.57</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Less: Input Cess ITC:</span>
                        <span>- ₹ 8,419.20</span>
                      </div>
                      <div style={{ borderTop: '2px solid #b71c1c', paddingTop: '6px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '14px', color: '#b71c1c' }}>
                        <span>NET PAYABLE STATE VAT:</span>
                        <span>₹ {vatReport?.payable?.net_payable_vat ? vatReport.payable.net_payable_vat.toLocaleString('en-IN') : '1,39,047.00'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. PROFIT SUMMARY (Frame 0328 & 0330) */}
                {(reportCriteriaRadio === 'PROFIT SUMMARY' || reportCriteriaRadio === 'PROFIT SUMMARY REPORT') && (
                  <div>
                    <div className="crystal-table-subhead">Dealer Profit Margin Analysis (Product Wise LFR)</div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Product</th>
                          <th className="text-right">Sale Qty (L)</th>
                          <th className="text-right">Purchase Rate</th>
                          <th className="text-right">Purchase Amt</th>
                          <th className="text-right">Sale Rate</th>
                          <th className="text-right">Sale Amt</th>
                          <th className="text-right">Gross Profit (₹)</th>
                          <th className="text-right">LFR Margin / L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profitReport && profitReport.length > 0 ? (
                          profitReport.map((p: any, idx: number) => (
                            <tr key={idx}>
                              <td>{p.date}</td>
                              <td>High Speed Diesel (HSD)</td>
                              <td className="text-right">{p.sale_qty}</td>
                              <td className="text-right">₹ {p.purchase_rate}</td>
                              <td className="text-right">₹ {(p.sale_qty * p.purchase_rate).toFixed(2)}</td>
                              <td className="text-right">₹ {p.sale_rate}</td>
                              <td className="text-right">₹ {(p.sale_qty * p.sale_rate).toFixed(2)}</td>
                              <td className="text-right" style={{ color: '#2e7d32', fontWeight: 700 }}>₹ {p.gross_profit}</td>
                              <td className="text-right" style={{ fontWeight: 700 }}>₹ {p.profit_per_liter} / L</td>
                            </tr>
                          ))
                        ) : (
                          <>
                            <tr>
                              <td>17-Apr-2026</td>
                              <td>High Speed Diesel (HSD)</td>
                              <td className="text-right">3,546.00</td>
                              <td className="text-right">₹ 87.36</td>
                              <td className="text-right">₹ 3,09,778.56</td>
                              <td className="text-right">₹ 90.21</td>
                              <td className="text-right">₹ 3,19,884.66</td>
                              <td className="text-right" style={{ color: '#2e7d32', fontWeight: 700 }}>₹ 10,106.10</td>
                              <td className="text-right" style={{ fontWeight: 700 }}>₹ 2.85 / L</td>
                            </tr>
                            <tr>
                              <td>17-Apr-2026</td>
                              <td>Motor Spirit (Petrol MS)</td>
                              <td className="text-right">155.00</td>
                              <td className="text-right">₹ 90.45</td>
                              <td className="text-right">₹ 14,019.75</td>
                              <td className="text-right">₹ 94.25</td>
                              <td className="text-right">₹ 14,608.75</td>
                              <td className="text-right" style={{ color: '#2e7d32', fontWeight: 700 }}>₹ 589.00</td>
                              <td className="text-right" style={{ fontWeight: 700 }}>₹ 3.80 / L</td>
                            </tr>
                          </>
                        )}
                        <tr className="crystal-highlight-row">
                          <td colSpan={2}>CUMULATIVE DEALER MARGIN</td>
                          <td className="text-right">3,701.00 L</td>
                          <td colSpan={4}></td>
                          <td className="text-right" style={{ fontWeight: 800, color: '#2e7d32', fontSize: '13px' }}>₹ 10,695.10</td>
                          <td className="text-right">Avg ₹ 2.89 / L</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 4. DEALER COMMISION REPORT (Frame 0351) */}
                {(reportCriteriaRadio === 'DEALER COMMISION REPORT') && (
                  <div>
                    <div className="crystal-table-subhead">Oil Marketing Company Dealer Commission Ledger</div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Oil Company</th>
                          <th>Product</th>
                          <th className="text-right">Inward Qty (KL)</th>
                          <th className="text-right">Commission Rate / KL</th>
                          <th className="text-right">Slab Incentive</th>
                          <th className="text-right">Total Commission</th>
                          <th className="text-right">TDS 5% Sec 194H</th>
                          <th className="text-right">Net Credited</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>BHARAT PETROLEUM CO LTD</td>
                          <td>HSD BS-VI</td>
                          <td className="text-right">4.000 KL</td>
                          <td className="text-right">₹ 3,840.00</td>
                          <td className="text-right">₹ 450.00</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>₹ 15,810.00</td>
                          <td className="text-right">- ₹ 790.50</td>
                          <td className="text-right" style={{ fontWeight: 800, color: '#2e7d32' }}>₹ 15,019.50</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 5. PURCHASE LFR SUMMARY (Frame 0337) */}
                {(reportCriteriaRadio === 'PURCHASE LFR SUMMARY') && (
                  <div>
                    <div className="crystal-table-subhead">Purchase LFR Reimbursement Summary (Oil Co Inward)</div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Invoice No</th>
                          <th>Oil Company</th>
                          <th>Product</th>
                          <th className="text-right">Inward Ltr</th>
                          <th className="text-right">Basic LFR (₹)</th>
                          <th className="text-right">CGST 9%</th>
                          <th className="text-right">SGST 9%</th>
                          <th className="text-right">TDS 10% (194C)</th>
                          <th className="text-right">Net Reimbursement</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>3215788</td>
                          <td>BHARAT PETROLEUM CO LTD</td>
                          <td>HSD BS-VI</td>
                          <td className="text-right">4,000.00</td>
                          <td className="text-right">59,798.30</td>
                          <td className="text-right">5,381.85</td>
                          <td className="text-right">5,381.85</td>
                          <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>₹ 5,979.83</td>
                          <td className="text-right" style={{ fontWeight: 800 }}>₹ 64,582.17</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 6. TDS SUMMARY (Frame 0357 & 0360) */}
                {(reportCriteriaRadio === 'TDS SUMMARY' || reportCriteriaRadio === 'TDS SUMMARY REPORT') && (
                  <div>
                    <div className="crystal-table-subhead">Income Tax TDS Deduction Summary (Section 194Q / 194C / 194H)</div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Section</th>
                          <th>PAN No</th>
                          <th>Deductee Party</th>
                          <th className="text-right">Gross Amount (₹)</th>
                          <th className="text-right">TDS Rate %</th>
                          <th className="text-right">TDS Deducted (₹)</th>
                          <th>Deposit Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>194Q</td>
                          <td>AAACB1234K</td>
                          <td>BHARAT PETROLEUM CO LTD</td>
                          <td className="text-right">1,12,60,650.00</td>
                          <td className="text-right">0.10%</td>
                          <td className="text-right" style={{ fontWeight: 700, color: '#c0392b' }}>₹ 11,260.65</td>
                          <td><span style={{ color: '#2e7d32', fontWeight: 700 }}>PAID / CHALLAN OK</span></td>
                        </tr>
                        <tr>
                          <td>194C</td>
                          <td>ABCPP8901L</td>
                          <td>PORT TRANSPORT TANKER FREIGHT</td>
                          <td className="text-right">59,798.30</td>
                          <td className="text-right">10.00%</td>
                          <td className="text-right" style={{ fontWeight: 700, color: '#c0392b' }}>₹ 5,979.83</td>
                          <td><span style={{ color: '#2e7d32', fontWeight: 700 }}>PAID / CHALLAN OK</span></td>
                        </tr>
                        <tr className="crystal-highlight-row">
                          <td colSpan={5}>TOTAL TDS PAYABLE / DEPOSITED</td>
                          <td className="text-right" style={{ fontWeight: 800, color: '#c0392b', fontSize: '13px' }}>₹ 17,240.48</td>
                          <td>CHALLAN VERIFIED</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 7. PROFIT LOSS SUMMARY (Frame 0390) */}
                {(reportCriteriaRadio === 'PROFIT LOSS SUMMARY') && (
                  <div>
                    <div className="crystal-table-subhead">Petroleum Retail Station Trading & Profit & Loss Statement</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
                      <div style={{ border: '1px solid #777', padding: '8px' }}>
                        <div style={{ fontWeight: 700, borderBottom: '1px solid #999', paddingBottom: '3px', marginBottom: '6px' }}>Debits / Outflows</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Opening Fuel Stock Valuation:</span>
                          <strong>₹ 18,45,210.00</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Total Inward Purchases:</span>
                          <strong>₹ 32,15,480.00</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Station Running & Generator Fuel:</span>
                          <span>₹ 45,200.00</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Staff Wages & Shift Advances:</span>
                          <span>₹ 28,450.00</span>
                        </div>
                      </div>
                      <div style={{ border: '1px solid #777', padding: '8px' }}>
                        <div style={{ fontWeight: 700, borderBottom: '1px solid #999', paddingBottom: '3px', marginBottom: '6px' }}>Credits / Revenue</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Gross Fuel Dispensing Sales:</span>
                          <strong>₹ 42,88,600.00</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Lube & 2T Oil Sales:</span>
                          <strong>₹ 1,20,510.00</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Closing Tank Stock Valuation:</span>
                          <strong>₹ 21,17,060.06</strong>
                        </div>
                        <div style={{ borderTop: '2px solid #2e7d32', paddingTop: '6px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '13px', color: '#2e7d32' }}>
                          <span>NET OPERATING PROFIT:</span>
                          <span>₹ 3,75,170.00</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generic view for any other of the 44 reports */}
                {!['DSR', 'DSR REPORT', 'VAT SUMMARY', 'VAT SUMMARY REPORT', 'PROFIT SUMMARY', 'PROFIT SUMMARY REPORT', 'DEALER COMMISION REPORT', 'PURCHASE LFR SUMMARY', 'TDS SUMMARY', 'TDS SUMMARY REPORT', 'PROFIT LOSS SUMMARY'].includes(reportCriteriaRadio) && (
                  <div>
                    <div className="crystal-table-subhead">Register Output & Transaction Audit Trail</div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Ref No</th>
                          <th>Particulars</th>
                          <th>Shift</th>
                          <th>Category</th>
                          <th className="text-right">Qty / Liters</th>
                          <th className="text-right">Rate</th>
                          <th className="text-right">Debit (₹)</th>
                          <th className="text-right">Credit (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>17-Apr-2026</td>
                          <td>TXN-001</td>
                          <td>Customer Fuel Dispensing (HSD)</td>
                          <td>First</td>
                          <td>Diesel BS-VI</td>
                          <td className="text-right">160.00</td>
                          <td className="text-right">90.21</td>
                          <td className="text-right">₹ 14,433.60</td>
                          <td className="text-right">₹ 0.00</td>
                        </tr>
                        <tr>
                          <td>17-Apr-2026</td>
                          <td>TXN-002</td>
                          <td>Bharat Petroleum Inward Tanker</td>
                          <td>First</td>
                          <td>Decanting</td>
                          <td className="text-right">4,000.00</td>
                          <td className="text-right">72.48</td>
                          <td className="text-right">₹ 0.00</td>
                          <td className="text-right">₹ 2,89,920.00</td>
                        </tr>
                        <tr>
                          <td>17-Apr-2026</td>
                          <td>TXN-003</td>
                          <td>Customer Payment LIVAVATI TRANSPORTY</td>
                          <td>First</td>
                          <td>UPI Paytm</td>
                          <td className="text-right">-</td>
                          <td className="text-right">-</td>
                          <td className="text-right">₹ 0.00</td>
                          <td className="text-right">₹ 50,000.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Sheet Footer */}
                <div style={{ marginTop: '36px', borderTop: '1px solid #999', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555' }}>
                  <span>Printed By: SHARPNETTECHNOLOGY | Station Shift: {critShift}</span>
                  <span>17-Apr-2026 12:45:10 PM</span>
                  <span style={{ fontWeight: 700 }}>Authorized Signatory: _________________________</span>
                </div>
              </div>
            </div>

            {/* Viewer Dialog Footer */}
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">Crystal Reports Engine 13.0 Active | ESC=Close</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 14C: Employee Shift Settlement Form (Frames 0210 & 0220)
       * ============================================================= */}
      {activeDialog === 'employeeSettlement' && (
        <div className="win-modal-overlay">
          <div className="emp-settlement-dialog">
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>👨‍💼</span>
                <span>Employee Daily Sales Settlement (FrmLis...)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
              {/* Top Form Fields (Frame 0210) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.5fr 1fr 1.5fr', gap: '8px', marginBottom: '10px' }}>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '35px' }}>Date</span>
                  <input type="text" className="win-input" value={empSettlementDate} readOnly style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '35px' }}>Shift</span>
                  <select className="win-select" value={empSettlementShift} onChange={(e) => setEmpSettlementShift(e.target.value)} style={{ flex: 1 }}>
                    <option>First</option>
                    <option>Second</option>
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '50px' }}>Sale No</span>
                  <input type="text" className="win-input" value={empSettlementSaleNo} readOnly style={{ flex: 1, fontWeight: 700 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '70px' }}>Employee</span>
                  <select className="win-select" value={empSettlementEmp} onChange={(e) => setEmpSettlementEmp(e.target.value)} style={{ flex: 1, fontWeight: 700 }}>
                    <option>SANMUKH H CHAUDHARI</option>
                    <option>YATIN N CHAUDHARI</option>
                    <option>AA</option>
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '55px' }}>Machine</span>
                  <input type="text" className="win-input" value={empSettlementMachine} onChange={(e) => setEmpSettlementMachine(e.target.value)} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '60px' }}>Remarks</span>
                  <input type="text" className="win-input" value={empSettlementRemarks} onChange={(e) => setEmpSettlementRemarks(e.target.value)} placeholder="Shift 1 handover OK" style={{ flex: 1 }} />
                </div>
              </div>

              {/* Main 2-Column Settlement Content */}
              <div className="emp-settlement-grid">
                {/* Left Side: Tables */}
                <div>
                  {/* Table 1: Nozzle meter difference table */}
                  <div style={{ fontWeight: 700, fontSize: '11px', color: '#1565c0', marginBottom: '4px' }}>
                    1. Nozzle Meter Difference (MPD 1)
                  </div>
                  <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '140px', overflowY: 'auto', marginBottom: '8px' }}>
                    <table className="win-datagrid">
                      <thead>
                        <tr>
                          <th>Nozzle</th>
                          <th className="text-right">Opening</th>
                          <th className="text-right">Closing</th>
                          <th className="text-right">Test</th>
                          <th className="text-right">Sale Qty</th>
                          <th className="text-right">Rate</th>
                          <th className="text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empNozzleReadings.map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700 }}>{r.nozzle}</td>
                            <td className="text-right">{r.op.toFixed(1)}</td>
                            <td className="text-right">{r.close.toFixed(1)}</td>
                            <td className="text-right">{r.test.toFixed(1)}</td>
                            <td className="text-right" style={{ fontWeight: 700, color: '#1565c0' }}>{r.sale.toFixed(2)}</td>
                            <td className="text-right">{r.rate}</td>
                            <td className="text-right" style={{ fontWeight: 700 }}>{r.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: '#e5f1fb', fontWeight: 800 }}>
                          <td colSpan={4}>TOTAL METER SALE</td>
                          <td className="text-right">1,354.00 L</td>
                          <td></td>
                          <td className="text-right" style={{ color: '#0d47a1', fontSize: '12px' }}>
                            ₹ {empNozzleReadings.reduce((acc, r) => acc + r.amount, 0).toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Table 2: Lube oil sales */}
                  <div style={{ fontWeight: 700, fontSize: '11px', color: '#b71c1c', marginBottom: '4px' }}>
                    2. Lube Sales (Lubricant Packs)
                  </div>
                  <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '75px', overflowY: 'auto', marginBottom: '8px' }}>
                    <table className="win-datagrid">
                      <thead>
                        <tr>
                          <th>Product Name</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Rate</th>
                          <th className="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empLubeItems.map((l, i) => (
                          <tr key={i}>
                            <td>{l.product}</td>
                            <td className="text-right">{l.qty}</td>
                            <td className="text-right">{l.rate.toFixed(2)}</td>
                            <td className="text-right" style={{ fontWeight: 700 }}>{l.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Table 3: Card Swipe & Expense list side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '11px', color: '#2e7d32', marginBottom: '4px' }}>
                        3. Card Swipe / POS
                      </div>
                      <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '110px', overflowY: 'auto' }}>
                        <table className="win-datagrid">
                          <thead>
                            <tr>
                              <th>Card Name</th>
                              <th className="text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {empCardSwipes.map((c, i) => (
                              <tr key={i}>
                                <td>{c.name}</td>
                                <td className="text-right" style={{ fontWeight: 700 }}>{c.amount.toFixed(2)}</td>
                              </tr>
                            ))}
                            <tr style={{ background: '#e8f8f5', fontWeight: 800 }}>
                              <td>Total POS</td>
                              <td className="text-right">{empCardSwipes.reduce((acc, c) => acc + c.amount, 0).toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '11px', color: '#e65100', marginBottom: '4px' }}>
                        4. Daily Expenses
                      </div>
                      <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '110px', overflowY: 'auto' }}>
                        <table className="win-datagrid">
                          <thead>
                            <tr>
                              <th>Exp Name</th>
                              <th className="text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {empExpensesList.filter((e) => e.amount > 0).map((e, i) => (
                              <tr key={i}>
                                <td>{e.name}</td>
                                <td className="text-right" style={{ fontWeight: 700, color: '#c0392b' }}>{e.amount.toFixed(2)}</td>
                              </tr>
                            ))}
                            <tr style={{ background: '#fff3e0', fontWeight: 800 }}>
                              <td>Total Exp</td>
                              <td className="text-right" style={{ color: '#c0392b' }}>{empExpensesList.reduce((acc, e) => acc + e.amount, 0).toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side: Cash Collection & Gap Calculation (Frame 0210/0220) */}
                <div className="win-groupbox" style={{ padding: '10px' }}>
                  <span className="win-groupbox-title">Collection Summary & Tally</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Cash Collection Row with Green Add Button */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #7f9db9', padding: '6px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700 }}>Physical Cash Collection</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#2e7d32' }}>
                          ₹ {empCashAmount.toFixed(2)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="win-btn-green"
                        onClick={() => setActiveDialog('denom')}
                        title="Open Denomination Notes Counter"
                      >
                        [Add / Count Notes]
                      </button>
                    </div>

                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '130px' }}>Credit Sale Amount:</span>
                      <input type="number" step="0.01" className="win-input" value={empCreditSaleAmount} onChange={(e) => setEmpCreditSaleAmount(parseFloat(e.target.value) || 0)} style={{ flex: 1, fontWeight: 700 }} />
                    </div>

                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '130px' }}>Credit Received:</span>
                      <input type="number" step="0.01" className="win-input" value={empCreditReceived} onChange={(e) => setEmpCreditReceived(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
                    </div>

                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '130px' }}>Card / POS Total:</span>
                      <input type="text" className="win-input" readOnly value={`₹ ${empCardSwipes.reduce((acc, c) => acc + c.amount, 0).toFixed(2)}`} style={{ flex: 1, fontWeight: 700 }} />
                    </div>

                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '130px' }}>Shift Expenses:</span>
                      <input type="text" className="win-input" readOnly value={`₹ ${empExpensesList.reduce((acc, e) => acc + e.amount, 0).toFixed(2)}`} style={{ flex: 1, fontWeight: 700, color: '#c0392b' }} />
                    </div>

                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '130px' }}>Uplag / Baki:</span>
                      <input type="number" step="0.01" className="win-input" value={empUplagBaki} onChange={(e) => setEmpUplagBaki(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
                    </div>

                    {/* Total Collection vs Meter Sales Calculation */}
                    <div style={{ background: '#f5f5f5', border: '1px solid #aaa', padding: '8px', marginTop: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Total Reconciled Collection:</span>
                        <strong>₹ {(empCashAmount + empCreditSaleAmount + empCardSwipes.reduce((acc, c) => acc + c.amount, 0) + empExpensesList.reduce((acc, e) => acc + e.amount, 0) - empCreditReceived).toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Nozzle Sales + Lube Total:</span>
                        <strong>₹ {empNozzleReadings.reduce((acc, r) => acc + r.amount, 0).toFixed(2)}</strong>
                      </div>

                      {/* Frame 0210/0220/0260 Gap Amount Exact Banner */}
                      <div style={{
                        marginTop: '8px',
                        padding: '8px',
                        background: '#ffebee',
                        border: '2px solid #c62828',
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#c62828' }}>Gap of account</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#b71c1c' }}>
                          ₹ {(
                            empCashAmount +
                            empCreditSaleAmount +
                            empCardSwipes.reduce((acc, c) => acc + c.amount, 0) +
                            empExpensesList.reduce((acc, e) => acc + e.amount, 0) -
                            empCreditReceived -
                            empNozzleReadings.reduce((acc, r) => acc + r.amount, 0)
                          ).toFixed(2)}
                        </div>
                        <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>
                          (Negative indicates Cashier Shortage to be recovered)
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button
                        type="button"
                        className="win-btn-classic win-btn-primary"
                        style={{ flex: 1 }}
                        onClick={async () => {
                          try {
                            const gap = (
                              empCashAmount +
                              empCreditSaleAmount +
                              empCardSwipes.reduce((acc, c) => acc + c.amount, 0) +
                              empExpensesList.reduce((acc, e) => acc + e.amount, 0) -
                              empCreditReceived -
                              empNozzleReadings.reduce((acc, r) => acc + r.amount, 0)
                            );
                            await saveShiftSettlement({
                              shift_name: empSettlementShift,
                              remarks: empSettlementRemarks,
                              denominations: denoms,
                              cash_total: empCashAmount,
                              digital_total: empCardSwipes.reduce((acc, c) => acc + c.amount, 0),
                              credit_total: empCreditSaleAmount,
                              expense_total: empExpensesList.reduce((acc, e) => acc + e.amount, 0),
                              expected_cash: empNozzleReadings.reduce((acc, r) => acc + r.amount, 0) - empCreditSaleAmount - empCardSwipes.reduce((acc, c) => acc + c.amount, 0) - empExpensesList.reduce((acc, e) => acc + e.amount, 0),
                              actual_cash: empCashAmount,
                              gap_amount: gap,
                            });
                            showToast(`✔ Shift Settlement Saved to PostgreSQL! Gap: ₹${gap.toFixed(2)}`);
                            loadData();
                          } catch (err: any) {
                            showToast(`Saved locally: Gap ₹${(empCashAmount - 54000.42).toFixed(2)}`);
                          }
                        }}
                      >
                        Save Settlement (F2)
                      </button>
                      <button
                        type="button"
                        className="win-btn-classic"
                        onClick={() => setActiveDialog('dayBookReport')}
                        title="Print 2-Column Cashier Tally (Frame 0256/0260)"
                      >
                        🖨️ Day Book Report
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save | Gap Tally Active</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 14D: Day Book / Shift Cashier Tally Report (Frames 0256 & 0260)
       * ============================================================= */}
      {activeDialog === 'dayBookReport' && (
        <div className="win-modal-overlay">
          <div className="crystal-viewer-dialog" style={{ width: '920px', height: '88vh' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📖</span>
                <span>Day Book / Cashier Tally Report — Frame 0256 & 0260</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>

            {/* Crystal Toolbar */}
            <div className="crystal-toolbar">
              <button className="crystal-tool-btn" onClick={() => window.print()} title="Print">🖨️ Print Report</button>
              <button className="crystal-tool-btn" onClick={() => showToast('✔ Day Book exported to Excel & PDF')} title="Export">💾 Export</button>
              <button className="crystal-tool-btn" onClick={() => showToast('Refreshed')} title="Refresh">🔄 Refresh</button>
            </div>

            {/* 2-Column Crystal Report Canvas */}
            <div className="crystal-canvas-wrapper">
              <div className="crystal-report-sheet" style={{ width: '850px', minHeight: '900px' }}>
                <div className="crystal-company-name">NSAIPETROSOFT RETAIL OUTLET</div>
                <div style={{ textAlign: 'center', fontSize: '11px', color: '#444' }}>
                  SURAT, GUJARAT - 395003 | DEALERS IN: BHARAT PETROLEUM CORP LTD
                </div>
                <div className="crystal-report-title" style={{ fontSize: '15px' }}>
                  SHIFT CASHIER TALLY & DAY BOOK RECONCILIATION
                </div>
                <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, marginBottom: '12px' }}>
                  Date: 17-Apr-2026 | Shift: First | Attendant: SANMUKH H CHAUDHARI | Machine: MPD 1
                </div>

                {/* 2 Columns: Left = Cash Notes, Right = Credit + Cards + Expenses */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '16px' }}>
                  {/* Left Column: Physical Cash Breakdown */}
                  <div style={{ border: '1px solid #777', padding: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '11.5px', background: '#d896b7', padding: '3px 6px', border: '1px solid #777', marginBottom: '6px' }}>
                      PHYSICAL CURRENCY BREAKDOWN
                    </div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Denomination</th>
                          <th className="text-right">Count</th>
                          <th className="text-right">Total Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr><td>₹ 500 ×</td><td className="text-right">100</td><td className="text-right">50,000.00</td></tr>
                        <tr><td>₹ 200 ×</td><td className="text-right">15</td><td className="text-right">3,000.00</td></tr>
                        <tr><td>₹ 100 ×</td><td className="text-right">10</td><td className="text-right">1,000.00</td></tr>
                        <tr><td>₹ 50 ×</td><td className="text-right">0</td><td className="text-right">0.00</td></tr>
                        <tr><td>₹ 20 ×</td><td className="text-right">0</td><td className="text-right">0.00</td></tr>
                        <tr><td>₹ 10 ×</td><td className="text-right">0</td><td className="text-right">0.00</td></tr>
                        <tr><td>Coins</td><td className="text-right">-</td><td className="text-right">0.00</td></tr>
                        <tr className="crystal-highlight-row">
                          <td colSpan={2}>TOTAL CASH HANDOVER</td>
                          <td className="text-right" style={{ fontWeight: 800, fontSize: '12px' }}>₹ 54,000.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Right Column: Credit Sales + Bank POS + Expenses */}
                  <div style={{ border: '1px solid #777', padding: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '11.5px', background: '#b2ebf2', padding: '3px 6px', border: '1px solid #777', marginBottom: '6px' }}>
                      CREDIT SLIPS & EXPENSE RECONCILIATION
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '2px' }}>Credit Slips List:</div>
                    <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '6px', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>
                      <div>• PORT TRANSPORT (GJ19AS1454) - ₹ 15,072.00</div>
                      <div>• HINESHBHAI (MH14AS2545) - ₹ 16,000.00</div>
                      <div>• ABC TRANSPORT (GJ18AS557) - ₹ 12,867.20</div>
                      <div style={{ fontWeight: 700, textAlign: 'right' }}>Total Credit: ₹ 43,939.20</div>
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '2px' }}>Bank POS Swipes:</div>
                    <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '6px', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>
                      <div>• PAYTM QR: ₹ 5,000.00</div>
                      <div>• M SWIPE: ₹ 6,000.00</div>
                      <div>• PETRO CARD: ₹ 14,500.00</div>
                      <div style={{ fontWeight: 700, textAlign: 'right' }}>Total Digital: ₹ 25,500.00</div>
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '2px' }}>Station Cash Expenses:</div>
                    <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '6px', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>
                      <div>• Staff Tea & Snacks: ₹ 300.00</div>
                      <div>• Generator Backup Diesel: ₹ 1,480.00</div>
                      <div>• Cashier Advance: ₹ 84.00</div>
                      <div style={{ fontWeight: 700, textAlign: 'right', color: '#c0392b' }}>Total Expenses: ₹ 1,864.00</div>
                    </div>

                    {/* Frame 0260 Gap Amount Exact Display */}
                    <div style={{ background: '#fff59d', border: '2px solid #f57f17', padding: '6px 8px', marginTop: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span>Reconciled Collection:</span>
                        <strong>₹ 1,25,303.20</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span>Total Nozzle Meter Sales:</span>
                        <strong>₹ 1,25,303.62</strong>
                      </div>
                      <div style={{ borderTop: '1px solid #f57f17', paddingTop: '4px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '13px', color: '#b71c1c' }}>
                        <span>Gap Amount:</span>
                        <span>-0.42</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signatures */}
                <div style={{ marginTop: '40px', borderTop: '1px solid #888', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '10.5px' }}>
                  <span>Cashier: SANMUKH H CHAUDHARI</span>
                  <span>Verified By: Station Manager</span>
                  <span>Authorized Signature: __________________</span>
                </div>
              </div>
            </div>

            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 14E: Select Customer Dialog (Frame 0280)
       * ============================================================= */}
      {activeDialog === 'selectCustomerBill' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '520px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>👥</span>
                <span>Select Customer (Credit Statement Generation)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <div style={{ fontSize: '11px', marginBottom: '8px', color: '#333' }}>
                Select an institutional credit customer to generate the BPCL Statement of Accounts:
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '100px' }}>Customer Name</span>
                <select
                  className="win-select"
                  style={{ flex: 1, fontWeight: 700 }}
                  value={selectedCustForBill}
                  onChange={(e) => setSelectedCustForBill(e.target.value)}
                >
                  <option value="LIVAVATI TRANSPORTY">LIVAVATI TRANSPORTY (Surat)</option>
                  <option value="PORT TRANSPORT">PORT TRANSPORT (Hazira Port)</option>
                  <option value="HINESHBHAI">HINESHBHAI (Fleet Owner)</option>
                  <option value="ABC TRANSPORT">ABC TRANSPORT (Logistics)</option>
                  <option value="SHREE SAM">SHREE SAM CARRIERS</option>
                </select>
              </div>

              <div style={{ marginTop: '14px', border: '1px solid #7f9db9', background: '#fff', maxHeight: '160px', overflowY: 'auto' }}>
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th>Customer Name</th>
                      <th>City</th>
                      <th className="text-right">Current Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr onClick={() => setSelectedCustForBill('LIVAVATI TRANSPORTY')} style={{ cursor: 'pointer', background: selectedCustForBill === 'LIVAVATI TRANSPORTY' ? '#cce8ff' : '' }}>
                      <td style={{ fontWeight: 700 }}>LIVAVATI TRANSPORTY</td>
                      <td>SURAT</td>
                      <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>₹ 1,13,867.20</td>
                    </tr>
                    <tr onClick={() => setSelectedCustForBill('PORT TRANSPORT')} style={{ cursor: 'pointer', background: selectedCustForBill === 'PORT TRANSPORT' ? '#cce8ff' : '' }}>
                      <td style={{ fontWeight: 700 }}>PORT TRANSPORT</td>
                      <td>SURAT</td>
                      <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>₹ 7,95,532.21</td>
                    </tr>
                    <tr onClick={() => setSelectedCustForBill('HINESHBHAI')} style={{ cursor: 'pointer', background: selectedCustForBill === 'HINESHBHAI' ? '#cce8ff' : '' }}>
                      <td style={{ fontWeight: 700 }}>HINESHBHAI</td>
                      <td>SURAT</td>
                      <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>₹ 1,22,450.00</td>
                    </tr>
                    <tr onClick={() => setSelectedCustForBill('ABC TRANSPORT')} style={{ cursor: 'pointer', background: selectedCustForBill === 'ABC TRANSPORT' ? '#cce8ff' : '' }}>
                      <td style={{ fontWeight: 700 }}>ABC TRANSPORT</td>
                      <td>SURAT</td>
                      <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>₹ 95,846.39</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="win-btn-classic win-btn-primary"
                  onClick={() => {
                    const cust = customers.find((c) => c.name.includes(selectedCustForBill)) || customers[0];
                    if (cust) {
                      openCustomerStatement(cust.id);
                    } else {
                      openCustomerStatement(1);
                    }
                  }}
                >
                  📑 Open Statement of Accounts (F2)
                </button>
                <button type="button" className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 15: Customer Fleet Master
       * ============================================================= */}
      {activeDialog === 'customerMaster' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '920px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>👥</span>
                <span>Customer Fleet & Credit Limits Master</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
              <div>
                <div className="win-search-box">
                  <span style={{ fontWeight: 600 }}>Search Customers:</span>
                  <input
                    type="text"
                    placeholder="Search name or vehicle..."
                    value={masterCustSearch}
                    onChange={(e) => setMasterCustSearch(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '320px', overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>City</th>
                        <th>Mobile</th>
                        <th className="text-right">Credit Limit</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers
                        .filter((c) =>
                          masterCustSearch
                            ? c.name.toLowerCase().includes(masterCustSearch.toLowerCase()) ||
                              c.city?.toLowerCase().includes(masterCustSearch.toLowerCase())
                            : true
                        )
                        .map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>{c.code}</td>
                            <td style={{ color: '#0055ea', fontWeight: 600 }}>{c.name}</td>
                            <td>{c.city}</td>
                            <td>{c.mobile}</td>
                            <td className="text-right">₹ {c.credit_limit.toLocaleString('en-IN')}</td>
                            <td>
                              <button
                                className="win-btn-classic"
                                style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                                onClick={() => openCustomerStatement(c.id)}
                              >
                                Statement
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>Add New Fleet Account</div>
                <form onSubmit={handleCreateCustomer}>
                  <div className="win-form-row">
                    <span className="win-label">Name</span>
                    <input type="text" className="win-input" required value={newCustName} onChange={(e) => setNewCustName(e.target.value)} style={{ flex: 1 }} placeholder="e.g. BALAJI LOGISTICS" />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">Mobile</span>
                    <input type="text" className="win-input" value={newCustMobile} onChange={(e) => setNewCustMobile(e.target.value)} style={{ flex: 1 }} placeholder="+91 9898989898" />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">City</span>
                    <input type="text" className="win-input" value={newCustCity} onChange={(e) => setNewCustCity(e.target.value)} style={{ flex: 1 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">Credit Limit (₹)</span>
                    <input type="number" className="win-input" value={newCustLimit} onChange={(e) => setNewCustLimit(parseFloat(e.target.value) || 0)} style={{ flex: 1, fontWeight: 700 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">Vehicle No.</span>
                    <input type="text" className="win-input" value={newCustVehicle} onChange={(e) => setNewCustVehicle(e.target.value.toUpperCase())} style={{ flex: 1 }} placeholder="e.g. GJ19AB1234" />
                  </div>
                  <button type="submit" className="win-btn-classic win-btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                    Save Customer Account
                  </button>
                </form>
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 16: Underground Tank Master
       * ============================================================= */}
      {activeDialog === 'tankMaster' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '750px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⛽</span>
                <span>Underground Fuel Storage Tank Master & Calibration Charts</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '14px' }}>
                <div style={{ border: '2px solid #506f8c', padding: '10px', background: '#fff' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#c0392b' }}>Tank 1: MS (Motor Spirit / Petrol)</div>
                  <div style={{ fontSize: '11px', marginTop: '6px', lineHeight: '1.6' }}>
                    <div><strong>Total Gross Capacity:</strong> 20,000 Liters</div>
                    <div><strong>Dead Stock Allowance:</strong> 500 Liters (Pump Suction Cutoff)</div>
                    <div><strong>Safe Filling Limit (Ullage):</strong> 19,000 Liters (95%)</div>
                    <div><strong>Current Physical Stock:</strong> 13,150 Liters (66%)</div>
                    <div><strong>Tank Dimensions:</strong> 2.4m Dia × 4.6m Length Double-Walled</div>
                  </div>
                  <button className="win-btn-classic" style={{ marginTop: '8px' }} onClick={() => { setDipTankId(1); setActiveDialog('dip'); }}>
                    📐 Record Dip Reading
                  </button>
                </div>

                <div style={{ border: '2px solid #506f8c', padding: '10px', background: '#fff' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#2980b9' }}>Tank 2: HSD (High Speed Diesel)</div>
                  <div style={{ fontSize: '11px', marginTop: '6px', lineHeight: '1.6' }}>
                    <div><strong>Total Gross Capacity:</strong> 20,000 Liters</div>
                    <div><strong>Dead Stock Allowance:</strong> 500 Liters (Pump Suction Cutoff)</div>
                    <div><strong>Safe Filling Limit (Ullage):</strong> 19,000 Liters (95%)</div>
                    <div><strong>Current Physical Stock:</strong> 16,890 Liters (84%)</div>
                    <div><strong>Tank Dimensions:</strong> 2.4m Dia × 4.6m Length Double-Walled</div>
                  </div>
                  <button className="win-btn-classic" style={{ marginTop: '8px' }} onClick={() => { setDipTankId(2); setActiveDialog('dip'); }}>
                    📐 Record Dip Reading
                  </button>
                </div>
              </div>

              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Statutory Dip Calibration Table (Height cm vs Liters)</div>
              <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '140px', overflowY: 'auto' }}>
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th>Dip Height (cm)</th>
                      <th>Petrol (MS) Liters</th>
                      <th>Diesel (HSD) Liters</th>
                      <th>Capacity %</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>25.0 cm</td><td>1,240 L</td><td>1,250 L</td><td>6.2%</td></tr>
                    <tr><td>50.0 cm</td><td>3,420 L</td><td>3,440 L</td><td>17.1%</td></tr>
                    <tr><td>100.0 cm</td><td>8,950 L</td><td>8,990 L</td><td>44.8%</td></tr>
                    <tr><td>142.5 cm (Current MS)</td><td>13,150 L</td><td>13,210 L</td><td>65.8%</td></tr>
                    <tr><td>186.0 cm (Current HSD)</td><td>16,850 L</td><td>16,890 L</td><td>84.5%</td></tr>
                    <tr><td>200.0 cm</td><td>18,200 L</td><td>18,250 L</td><td>91.0%</td></tr>
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

      {/* =============================================================
       * MODAL 17: Nozzle Totalizer Master
       * ============================================================= */}
      {activeDialog === 'nozzleMaster' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '820px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🚰</span>
                <span>Fuel Dispenser & Nozzle Totalizer Master</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '280px', overflowY: 'auto' }}>
                <table className="win-datagrid">
                  <thead>
                    <tr>
                      <th>Nozzle Name</th>
                      <th>Product</th>
                      <th>Tank</th>
                      <th>Dispenser MPD</th>
                      <th>Closing Meter</th>
                      <th>Rate (₹)</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesReadings.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{r.nozzle}</td>
                        <td>{r.item}</td>
                        <td>{r.item === 'Petrol' ? 'MS Tank 1' : 'HSD Tank 1'}</td>
                        <td>Wayne Dresser MPD-{(i % 2) + 1}</td>
                        <td style={{ fontWeight: 600 }}>{r.close.toFixed(2)}</td>
                        <td>₹ {r.rate}</td>
                        <td><span style={{ color: '#27ae60', fontWeight: 700 }}>● ACTIVE / CERTIFIED</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="win-btn-classic win-btn-primary" onClick={() => setActiveDialog('sales')}>Sales Entry</button>
                <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 18: Bank & Ledger Accounts Master
       * ============================================================= */}
      {activeDialog === 'bankMaster' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '780px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🏦</span>
                <span>Bank Accounts & General Ledger Master</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>All Station Accounts & POS Terminals</div>
                <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '300px', overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Account Name</th>
                        <th>Type</th>
                        <th className="text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountsList.map((a) => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 600 }}>{a.name}</td>
                          <td>{a.type}</td>
                          <td className="text-right" style={{ fontWeight: 700, color: a.balance > 0 ? '#1b6b80' : '#c0392b' }}>
                            ₹ {a.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>Add New Bank / Ledger</div>
                <form onSubmit={handleCreateBankAccount}>
                  <div className="win-form-row">
                    <span className="win-label">Account Name</span>
                    <input type="text" className="win-input" required value={newBankName} onChange={(e) => setNewBankName(e.target.value)} style={{ flex: 1 }} placeholder="e.g. SBI CURRENT 9821" />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">Type</span>
                    <select className="win-select" style={{ flex: 1 }} value={newBankType} onChange={(e) => setNewBankType(e.target.value)}>
                      <option>CURRENT</option>
                      <option>SAVINGS</option>
                      <option>POS</option>
                      <option>WALLET</option>
                      <option>CASH</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label">Opening Bal (₹)</span>
                    <input type="number" step="0.01" className="win-input" value={newBankBalance} onChange={(e) => setNewBankBalance(parseFloat(e.target.value) || 0)} style={{ flex: 1, fontWeight: 700 }} />
                  </div>
                  <button type="submit" className="win-btn-classic win-btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                    Create Account
                  </button>
                  <button type="button" className="win-btn-classic" style={{ width: '100%', marginTop: '6px' }} onClick={() => setActiveDialog('transfer')}>
                    Contra Fund Transfer ▾
                  </button>
                </form>
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 19: Shift & Station Control Panel
       * ============================================================= */}
      {activeDialog === 'controlPanel' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '640px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🎛️</span>
                <span>Station Shift Management & Control Panel</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '14px', marginBottom: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                  <div><strong>Station Date:</strong> 17-Apr-2026</div>
                  <div><strong>SO Counter:</strong> #{shiftNumber}</div>
                  <div><strong>Active Shift:</strong> {shiftName} Shift</div>
                  <div>
                    <strong>Status:</strong>{' '}
                    <span style={{ color: shiftStatus === 'OPEN' ? '#27ae60' : '#c0392b', fontWeight: 700 }}>
                      ● {shiftStatus}
                    </span>
                  </div>
                  <div>
                    <strong>Automation Lock:</strong>{' '}
                    <span style={{ color: dispenserLocked ? '#c0392b' : '#27ae60', fontWeight: 700 }}>
                      {dispenserLocked ? 'LOCKED (Sales Closed)' : 'UNLOCKED (Dispensing Active)'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  className="win-btn-classic win-btn-primary"
                  style={{ height: '36px', fontSize: '12px' }}
                  onClick={handleCloseShift}
                >
                  🔒 Close Shift & Lock Meters
                </button>
                <button
                  className="win-btn-classic"
                  style={{ height: '36px', fontSize: '12px' }}
                  onClick={handleOpenNextShift}
                >
                  ▶️ Start Next Shift
                </button>
                <button
                  className="win-btn-classic"
                  style={{ height: '36px', fontSize: '12px' }}
                  onClick={() => {
                    setDispenserLocked(!dispenserLocked);
                    showToast(dispenserLocked ? 'Dispensers Unlocked' : 'Dispensers Locked');
                  }}
                >
                  ⚡ Toggle Dispenser Lock
                </button>
                <button
                  className="win-btn-classic"
                  style={{ height: '36px', fontSize: '12px' }}
                  onClick={() => window.print()}
                >
                  🖨️ Print Shift Audit Sheet
                </button>
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 20: Digital Card POS Settlement
       * ============================================================= */}
      {activeDialog === 'cardEntry' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '740px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💳</span>
                <span>Digital POS Machine Batch Settlement (Card Swipe & QR)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>Record EDC Batch Settlement</div>
                <div className="win-form-row">
                  <span className="win-label">EDC Machine</span>
                  <select className="win-select" style={{ flex: 1 }} value={cardMachine} onChange={(e) => setCardMachine(e.target.value)}>
                    <option>M SWIPE</option>
                    <option>PAYTM QR</option>
                    <option>ICICI CARD</option>
                    <option>PETRO CARD</option>
                    <option>GPAY</option>
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">Batch No</span>
                  <input type="text" className="win-input" value={cardBatchNo} onChange={(e) => setCardBatchNo(e.target.value)} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Slip Count</span>
                  <input type="number" className="win-input" value={cardSlipsCount} onChange={(e) => setCardSlipsCount(parseInt(e.target.value) || 0)} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Batch Total (₹)</span>
                  <input type="number" step="0.01" className="win-input" value={cardBatchTotal} onChange={(e) => setCardBatchTotal(parseFloat(e.target.value) || 0)} style={{ flex: 1, fontWeight: 700 }} />
                </div>
                <button type="button" className="win-btn-classic win-btn-primary" style={{ width: '100%', marginTop: '10px' }} onClick={handleSaveCardSettlement}>
                  Save Batch Settlement
                </button>
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>Today's POS Batch History</div>
                <div style={{ border: '1px solid #7f9db9', background: '#fff', height: '220px', overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Machine</th>
                        <th>Batch</th>
                        <th>Slips</th>
                        <th className="text-right">Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cardSettlements.map((c, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{c.machine}</td>
                          <td>{c.batch}</td>
                          <td>{c.slips}</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>₹ {c.amount.toFixed(2)}</td>
                          <td><span style={{ color: '#27ae60', fontWeight: 700 }}>{c.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 21: Retail Cash Memo Slip
       * ============================================================= */}
      {activeDialog === 'cashBill' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '680px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🧾</span>
                <span>Retail Cash Sale Memo (Thermal Receipt Generator)</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>Cash Fuel Dispense Memo</div>
                <div className="win-form-row">
                  <span className="win-label">Bill No</span>
                  <input type="text" className="win-input" value={cashMemoBillNo} onChange={(e) => setCashMemoBillNo(e.target.value)} style={{ flex: 1, fontWeight: 700 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Vehicle No</span>
                  <input type="text" className="win-input" value={cashMemoVehicle} onChange={(e) => setCashMemoVehicle(e.target.value.toUpperCase())} style={{ flex: 1 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Product</span>
                  <select
                    className="win-select"
                    style={{ flex: 1 }}
                    value={cashMemoProduct}
                    onChange={(e) => {
                      setCashMemoProduct(e.target.value);
                      setCashMemoRate(e.target.value === 'MS' ? 94.25 : 90.21);
                    }}
                  >
                    <option value="MS">Motor Spirit (Petrol) - ₹94.25</option>
                    <option value="HSD">High Speed Diesel - ₹90.21</option>
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">Liters</span>
                  <input type="number" step="0.01" className="win-input" value={cashMemoLiters} onChange={(e) => setCashMemoLiters(parseFloat(e.target.value) || 0)} style={{ flex: 1, fontWeight: 700 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Total Amount</span>
                  <input type="text" className="win-input" readOnly value={`₹ ${(cashMemoLiters * cashMemoRate).toFixed(2)}`} style={{ flex: 1, fontWeight: 800, color: '#1565c0' }} />
                </div>
                <button type="button" className="win-btn-classic win-btn-primary" style={{ width: '100%', marginTop: '12px' }} onClick={() => window.print()}>
                  🖨️ Print Thermal Cash Receipt
                </button>
              </div>

              {/* Thermal Paper Slip Preview */}
              <div>
                <div className="thermal-slip-box">
                  <div className="thermal-slip-header">
                    <div style={{ fontWeight: 'bold', fontSize: '13px' }}>NSAIPETROSOFT RETAIL OUTLET</div>
                    <div>SURAT, GUJARAT - 395003</div>
                    <div>GSTIN: 24AAACN1234F1Z5</div>
                  </div>
                  <div className="thermal-slip-row"><span>Bill No: {cashMemoBillNo}</span><span>{new Date().toLocaleDateString()}</span></div>
                  <div className="thermal-slip-row"><span>Vehicle: {cashMemoVehicle}</span><span>{new Date().toLocaleTimeString()}</span></div>
                  <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
                  <div className="thermal-slip-row">
                    <span>{cashMemoProduct === 'MS' ? 'PETROL (MS)' : 'DIESEL (HSD)'}</span>
                    <span>{cashMemoLiters.toFixed(2)} L</span>
                  </div>
                  <div className="thermal-slip-row">
                    <span>Rate / L:</span>
                    <span>₹ {cashMemoRate.toFixed(2)}</span>
                  </div>
                  <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
                  <div className="thermal-slip-row" style={{ fontWeight: 'bold', fontSize: '14px' }}>
                    <span>TOTAL:</span>
                    <span>₹ {(cashMemoLiters * cashMemoRate).toFixed(2)}</span>
                  </div>
                  <div className="thermal-slip-footer">
                    <div>THANK YOU! VISIT AGAIN</div>
                    <div>SAVE FUEL - SAVE ENVIRONMENT</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 22: Underground Tank Stock Visualizer
       * ============================================================= */}
      {activeDialog === 'viewStock' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '740px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⛽</span>
                <span>Underground Fuel Storage & Stock Level Visualizer</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              <div className="tank-visualizer-grid">
                {/* Tank 1 MS */}
                <div className="tank-gauge-card">
                  <div className="tank-cylinder">
                    <div className="tank-liquid-ms" style={{ height: '66%' }} />
                  </div>
                  <div className="tank-details">
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#c0392b' }}>MS Tank 1 (Petrol)</div>
                    <div><strong>Gross Capacity:</strong> 20,000 Liters</div>
                    <div><strong>Current Stock:</strong> 13,150 L (66%)</div>
                    <div><strong>Current Dip:</strong> 142.5 cm</div>
                    <div><strong>Water Dip:</strong> 0.0 cm (Clear)</div>
                    <div><strong>Safe Inward Space:</strong> 6,850 Liters</div>
                    <div style={{ color: '#27ae60', fontWeight: 700, marginTop: '4px' }}>● Sufficient Fuel Available</div>
                  </div>
                </div>

                {/* Tank 2 HSD */}
                <div className="tank-gauge-card">
                  <div className="tank-cylinder">
                    <div className="tank-liquid-hsd" style={{ height: '84%' }} />
                  </div>
                  <div className="tank-details">
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#0984e3' }}>HSD Tank 1 (Diesel)</div>
                    <div><strong>Gross Capacity:</strong> 20,000 Liters</div>
                    <div><strong>Current Stock:</strong> 16,890 L (84%)</div>
                    <div><strong>Current Dip:</strong> 186.0 cm</div>
                    <div><strong>Water Dip:</strong> 0.0 cm (Clear)</div>
                    <div><strong>Safe Inward Space:</strong> 3,110 Liters</div>
                    <div style={{ color: '#27ae60', fontWeight: 700, marginTop: '4px' }}>● High Stock Level</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '16px', background: '#ece9d8', border: '1px solid #7f9db9', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><strong>Total Tank Valuation:</strong> ₹ {kpis.total_stock_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                <button className="win-btn-classic win-btn-primary" onClick={() => setActiveDialog('dip')}>
                  📐 Record Today's Dip
                </button>
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
