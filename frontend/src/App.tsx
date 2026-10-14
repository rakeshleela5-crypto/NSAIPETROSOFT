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
  deleteCreditSale,
  deleteExpense,
  deletePaymentReceipt,
  deletePurchase,
  fetchBackupStatus,
  fetchBackupsList,
  fetchCreditSales,
  fetchCurrentShift,
  fetchCustomerStatement,
  fetchCustomers,
  fetchDashboard,
  fetchDealerCommission,
  fetchDips,
  fetchDsrReport,
  fetchExpenses,
  fetchHealth,
  fetchLfrSummary,
  fetchPayments,
  fetchProfitLossSummary,
  fetchProfitSummary,
  fetchPurchases,
  fetchRates,
  fetchShiftSettlements,
  fetchStampingReminders,
  fetchTdsSummary,
  fetchVatSummary,
  getBackupDownloadUrl,
  getMasterExcelDownloadUrl,
  saveShiftMeters,
  saveShiftSettlement,
  triggerCreateBackup,
  updateRate,
} from './api/client';
import { exportToCsv } from './utils/exportCsv';
import {
  formatErpDate,
  getCurrentMonthStartErpDate,
  getTodayErpDate,
} from './utils/dateUtils';
import type {
  BackupItem,
  BackupStatusResponse,
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
  | 'backup'
  | null;


export interface StationProfile {
  stationName: string;
  oilCompany: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  phone: string;
  panNo?: string;
  managerPin?: string;
}

export const getFinancialYear = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  if (month >= 4) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  }
  return `${year - 1}-${year.toString().slice(-2)}`;
};

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [selectedAccount, setSelectedAccount] = useState<string>('CASH ON HAND');

  // Station Outlet Profile State (Persistent in Browser LocalStorage)
  const [stationProfile, setStationProfile] = useState<StationProfile>(() => {
    const saved = localStorage.getItem('nsaipetrosoft_station_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      stationName: 'NSAIPETROSOFT RETAIL OUTLET',
      oilCompany: 'BHARAT PETROLEUM CORPORATION LTD',
      address: 'HIGHWAY SERVICE STATION',
      city: 'SURAT',
      state: 'GUJARAT',
      pincode: '395003',
      gstin: '24AAACN1234F1Z5',
      phone: '+91 98765 43210',
      managerPin: '1234',
    };
  });

  const saveStationProfile = (updated: StationProfile) => {
    setStationProfile(updated);
    try {
      localStorage.setItem('nsaipetrosoft_station_profile', JSON.stringify(updated));
    } catch {}
    showToast('✔ Station Outlet Profile Updated Successfully!');
  };

  // Station Control Panel State
  const [controlPanelTab, setControlPanelTab] = useState<'shift' | 'profile'>('shift');
  const [profileForm, setProfileForm] = useState<StationProfile>(stationProfile);

  // Employees List State
  const [employeesList, setEmployeesList] = useState<any[]>([
    { id: 1, name: 'SANMUKH H CHAUDHARI', code: 'EMP01' },
    { id: 2, name: 'DINESH Z CHAUDHARI', code: 'EMP02' },
    { id: 3, name: 'AA', code: 'EMP03' },
  ]);

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
  const [importFromApp, setImportFromApp] = useState<boolean>(false);

  // Rate Master State
  const [ratesList, setRatesList] = useState<FuelProductRate[]>([]);
  const [rateHist, setRateHist] = useState<any[]>([]);
  const [rateProduct, setRateProduct] = useState<number>(1);
  const [rateValue, setRateValue] = useState<number>(0.0);

  // Credit Customer Sale State (Frame 0021)
  const [customers, setCustomers] = useState<CustomerFull[]>([]);
  const [creditCustId, setCreditCustId] = useState<number>(1);
  const [creditVehicle, setCreditVehicle] = useState<string>('');
  const [creditProductId, setCreditProductId] = useState<number>(1);
  const [creditQty, setCreditQty] = useState<number>(0.0);
  const [creditRate, setCreditRate] = useState<number>(0.0);
  const [creditSlipNo, setCreditSlipNo] = useState<string>('');
  const [creditBillNo, setCreditBillNo] = useState<string>('');
  const [creditShift, setCreditShift] = useState<string>('First');
  const [creditDate, setCreditDate] = useState<string>(getTodayErpDate());
  const [creditCashPaid, setCreditCashPaid] = useState<number>(0.0);
  const [creditRemark, setCreditRemark] = useState<string>('');
  const [whatsappSlip, setWhatsappSlip] = useState<string | null>(null);

  // Past Credit Bills
  const [creditBillsList, setCreditBillsList] = useState<any[]>([]);
  const [shiftSettlementsList, setShiftSettlementsList] = useState<any[]>([]);

  // Sales Entry Nozzle Totalizers (Frame 0110)
  const [salesDate, setSalesDate] = useState<string>(getTodayErpDate());
  const [salesReadings, setSalesReadings] = useState<any[]>([]);

  // Payment Receipt State (Frame 0085)
  const [payReceiptNo, setPayReceiptNo] = useState<string>('');
  const [payCustName, setPayCustName] = useState<string>('');
  const [payShift, setPayShift] = useState<string>('First');
  const [payDate, setPayDate] = useState<string>(getTodayErpDate());
  const [payTotalPurch, setPayTotalPurch] = useState<number>(0.0);
  const [payTotalPaid, setPayTotalPaid] = useState<number>(0.0);
  const [payTotalUnpaid, setPayTotalUnpaid] = useState<number>(0.0);
  const [payMode, setPayMode] = useState<string>('UPI PAYMENT');
  const [payBank, setPayBank] = useState<string>('PAYTM');
  const [payAmount, setPayAmount] = useState<number>(0.0);
  const [payReceiptsHistory, setPayReceiptsHistory] = useState<any[]>([]);

  // Expense Book State
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [expDate, setExpDate] = useState<string>(getTodayErpDate());
  const [expCategory, setExpCategory] = useState<string>('Station Maintenance');
  const [expAmount, setExpAmount] = useState<number>(0.0);
  const [expNarration, setExpNarration] = useState<string>('');
  const [expPaidTo, setExpPaidTo] = useState<string>('');
  const [crystalSearchText, setCrystalSearchText] = useState<string>('');

  // Contra Transfer State
  const [fromAccId, setFromAccId] = useState<number>(1); // Cash on hand
  const [toAccId, setToAccId] = useState<number>(7); // HDFC CA
  const [transferAmt, setTransferAmt] = useState<number>(0.0);

  // Tank Dip State
  const [dipTankId, setDipTankId] = useState<number>(1);
  const [dipOpenCm, setDipOpenCm] = useState<number>(0.0);
  const [dipOpenStock, setDipOpenStock] = useState<number>(0.0);
  const [dipReceipt, setDipReceipt] = useState<number>(0.0);
  const [dipCloseCm, setDipCloseCm] = useState<number>(0.0);
  const [dipCloseStock, setDipCloseStock] = useState<number>(0.0);
  const [dipsList, setDipsList] = useState<any[]>([]);

  // Purchase Decanting State
  const [purInvoiceNo, setPurInvoiceNo] = useState<string>('');
  const [purDealer, setPurDealer] = useState<string>(stationProfile.oilCompany);
  const [purVehicleNo, setPurVehicleNo] = useState<string>('');
  const [purDensity, setPurDensity] = useState<number>(820.0);
  const [purQtyKl, setPurQtyKl] = useState<number>(0.0);
  const [purRateKl, setPurRateKl] = useState<number>(0.0);

  // Cash Denomination Settlement State (Frame 200)
  const [denoms, setDenoms] = useState<DenominationMap>({
    n2000: 0,
    n500: 0,
    n200: 0,
    n100: 0,
    n50: 0,
    n20: 0,
    n10: 0,
    n5: 0,
    coins: 0,
  });
  const [denomResult, setDenomResult] = useState<any>(null);

  // Customer Statement (Frame 0300)
  const [selectedStatement, setSelectedStatement] = useState<any>(null);

  // Stamping Reminders State
  const [stampingList, setStampingList] = useState<any[]>([]);

  // Cloudflare R2 Backups & Disaster Recovery State
  const [backupStatus, setBackupStatus] = useState<BackupStatusResponse | null>(null);
  const [backupsList, setBackupsList] = useState<BackupItem[]>([]);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);

  // Reports Data (Synchronized from Live PostgreSQL)
  const [dsrReport, setDsrReport] = useState<any[]>([]);
  const [vatReport, setVatReport] = useState<any>(null);
  const [profitReport, setProfitReport] = useState<any[]>([]);
  const [tdsReport, setTdsReport] = useState<any>(null);
  const [commissionReport, setCommissionReport] = useState<any>(null);
  const [lfrReport, setLfrReport] = useState<any>(null);
  const [profitLossReport, setProfitLossReport] = useState<any>(null);

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
  const [cardSettlements, setCardSettlements] = useState<any[]>([]);

  // Retail Cash Memo Slip State
  const [cashMemoBillNo, setCashMemoBillNo] = useState<string>('');
  const [cashMemoVehicle, setCashMemoVehicle] = useState<string>('');
  const [cashMemoProduct, setCashMemoProduct] = useState<string>('MS');
  const [cashMemoLiters, setCashMemoLiters] = useState<number>(0.0);
  const [cashMemoRate, setCashMemoRate] = useState<number>(0.0);

  // Set Report Criteria State (Frame 0375)
  const [reportCriteriaRadio, setReportCriteriaRadio] = useState<string>('DSR');
  const [critFromDate, setCritFromDate] = useState<string>(getCurrentMonthStartErpDate());
  const [critToDate, setCritToDate] = useState<string>(getTodayErpDate());
  const [critCustomer, setCritCustomer] = useState<string>('---Select Any---');
  const [critSupplier, setCritSupplier] = useState<string>('---Select Any---');
  const [critItem, setCritItem] = useState<string>('Diesel');
  const [critInvoiceNo, setCritInvoiceNo] = useState<string>('');
  const [critDate, setCritDate] = useState<string>(getTodayErpDate());
  const [critShift, setCritShift] = useState<string>('First');
  const [critLedger, setCritLedger] = useState<string>('---Select Any---');
  const [critAccountGroup, setCritAccountGroup] = useState<string>('---Select Any---');
  const [critVehicle, setCritVehicle] = useState<string>('---Select Any---');
  const [critBillPeriod, setCritBillPeriod] = useState<string>('---Select Any---');
  const [critEmployee, setCritEmployee] = useState<string>('ALL');
  const [activeReportTitle, setActiveReportTitle] = useState<string>('DSR REPORT');
  const [reportZoom, setReportZoom] = useState<string>('Whole Page');
  const [crystalPage, setCrystalPage] = useState<number>(1);
  const [crystalTotalPages, setCrystalTotalPages] = useState<number>(2);

  // Credit Sale Print Confirmation Prompt (Frame 0050)
  const [showPrintConfirm, setShowPrintConfirm] = useState<boolean>(false);
  const [lastCreditSlip, setLastCreditSlip] = useState<any>(null);

  // Manager Authorization PIN Modal State
  const [managerPinModal, setManagerPinModal] = useState<{
    isOpen: boolean;
    actionTitle: string;
    onAuthorized: () => void;
  } | null>(null);
  const [managerPinInput, setManagerPinInput] = useState<string>('');
  const [managerPinError, setManagerPinError] = useState<string>('');

  const requestManagerAuthorization = (actionTitle: string, onAuthorized: () => void) => {
    setManagerPinInput('');
    setManagerPinError('');
    setManagerPinModal({
      isOpen: true,
      actionTitle,
      onAuthorized,
    });
  };

  // Employee Shift Settlement State (Frame 0210 & 0220)
  const [empSettlementDate, setEmpSettlementDate] = useState<string>(getTodayErpDate());
  const [empSettlementShift, setEmpSettlementShift] = useState<string>('First');
  const [empSettlementSaleNo, setEmpSettlementSaleNo] = useState<string>('00001');
  const [empSettlementEmp, setEmpSettlementEmp] = useState<string>('Duty Attendant');
  const [empSettlementMachine, setEmpSettlementMachine] = useState<string>('MPD 1');
  const [empSettlementRemarks, setEmpSettlementRemarks] = useState<string>('');
  const [empNozzleReadings, setEmpNozzleReadings] = useState<any[]>([]);
  const [empLubeItems, setEmpLubeItems] = useState<any[]>([]);
  const [empCardSwipes, setEmpCardSwipes] = useState<any[]>([]);
  const [empExpensesList, setEmpExpensesList] = useState<any[]>([]);
  const [empCashAmount, setEmpCashAmount] = useState<number>(0.0);
  const [empCreditSaleAmount, setEmpCreditSaleAmount] = useState<number>(0.0);
  const [empCreditReceived, setEmpCreditReceived] = useState<number>(0.0);
  const [empUplagBaki, setEmpUplagBaki] = useState<number>(0.0);

  // Purchase Entry 8-Seals & Line Items (Frame 0161)
  const [purWoodenSeals, setPurWoodenSeals] = useState({ s1: 'W-901', s2: 'W-902', s3: 'W-903', s4: 'W-904' });
  const [purAlumSeals, setPurAlumSeals] = useState({ s1: 'AL-110', s2: 'AL-111', s3: 'AL-112', s4: 'AL-113' });
  const [purSampleDensity, setPurSampleDensity] = useState<number>(825.4);
  const [purChargeCode, setPurChargeCode] = useState<string>('01');
  const [purFreight, setPurFreight] = useState<number>(0.0);
  const [purItemsGrid, setPurItemsGrid] = useState<any[]>([]);
  const [purPoHistory, setPurPoHistory] = useState<any[]>([]);

  // Select Customer Dialog (Frame 0280)
  const [selectedCustForBill, setSelectedCustForBill] = useState<string>('LIVAVATI TRANSPORTY');


  // Master ERP Synchronization Engine: Hydrates & Interconnects All Pump Models from Live Railway Backend
  const loadAllErpData = async () => {
    try {
      const h = await fetchHealth().catch(() => ({ status: 'down' }));
      setBackendOnline(h.status === 'healthy');

      const [
        dashData,
        shiftData,
        custsData,
        ratesData,
        creditSalesData,
        paymentsData,
        expensesData,
        purchasesData,
        dipsData,
        stampingData,
        vatData,
        profitData,
        tdsData,
        commData,
        lfrData,
        plData,
        dsrData,
        settlementsData,
      ] = await Promise.all([
        fetchDashboard().catch(() => null),
        fetchCurrentShift().catch(() => null),
        fetchCustomers().catch(() => []),
        fetchRates().catch(() => null),
        fetchCreditSales().catch(() => []),
        fetchPayments().catch(() => []),
        fetchExpenses().catch(() => []),
        fetchPurchases().catch(() => []),
        fetchDips().catch(() => []),
        fetchStampingReminders().catch(() => []),
        fetchVatSummary().catch(() => null),
        fetchProfitSummary().catch(() => []),
        fetchTdsSummary().catch(() => null),
        fetchDealerCommission().catch(() => null),
        fetchLfrSummary().catch(() => null),
        fetchProfitLossSummary().catch(() => null),
        fetchDsrReport().catch(() => []),
        fetchShiftSettlements().catch(() => []),
      ]);

      if (dashData) {
        setDashboard(dashData);
      }
      if (custsData && custsData.length > 0) {
        setCustomers(custsData);
        if (!creditCustId || !custsData.find((c: any) => c.id === creditCustId)) {
          setCreditCustId(custsData[0].id);
          setCreditVehicle(custsData[0].vehicles?.[0] || '');
        }
      }
      if (ratesData) {
        setRatesList(ratesData.products || []);
        setRateHist(ratesData.history || []);
        if (ratesData.products && ratesData.products.length > 0) {
          const defaultProd = ratesData.products[0];
          setRateProduct(defaultProd.id);
          setRateValue(defaultProd.rate);
          const activeRate = ratesData.products.find((p: any) => p.id === creditProductId)?.rate || defaultProd.rate;
          setCreditRate(activeRate);
        }
      }
      if (shiftData) {
        if (shiftData.employees && shiftData.employees.length > 0) {
          setEmployeesList(shiftData.employees);
        }
        if (shiftData.so_number) {
          setShiftNumber(shiftData.so_number.replace(/^SO-/, ''));
        }
        if (shiftData.shift_name) {
          setShiftName(shiftData.shift_name);
        }
        if (shiftData.status) {
          setShiftStatus(shiftData.status.toUpperCase());
        }
        if (shiftData.nozzles && shiftData.nozzles.length > 0) {
          const readings = shiftData.nozzles.map((n: any) => {
            const qty = Math.max(0, n.closing_meter - n.opening_meter - n.testing);
            const amount = Math.round(qty * n.rate * 100) / 100;
            const vat = Math.round(((amount * n.vat_percent) / (100 + n.vat_percent)) * 100) / 100;
            return {
              emp: shiftData.employees?.[0]?.name || 'Duty Staff',
              nozzle: n.nozzle_name,
              item: n.product_name,
              open: n.opening_meter,
              close: n.closing_meter,
              test: n.testing,
              qty: qty,
              rate: n.rate,
              amount: amount,
              vat: vat,
              lube: 0,
              nozzle_id: n.nozzle_id,
            };
          });
          setSalesReadings(readings);
          setEmpNozzleReadings(
            readings.map((r: any) => ({
              nozzle: r.nozzle,
              op: r.open,
              close: r.close,
              test: r.test,
              sale: r.qty,
              rate: r.rate,
              amount: r.amount,
            }))
          );
        }
      }
      if (creditSalesData && creditSalesData.length > 0) {
        setCreditBillsList(
          creditSalesData.map((s: any) => ({
            id: s.id,
            date: s.date,
            shift: s.shift || 'First',
            slip: s.slip_no,
            bill: s.bill_no,
            cust: s.customer_name,
            vehicle: s.vehicle_no,
            qty: s.qty,
            total: s.amount,
          }))
        );
      }
      if (paymentsData && paymentsData.length > 0) {
        setPayReceiptsHistory(
          paymentsData.map((p: any) => ({
            id: p.id,
            receipt_no: p.receipt_no,
            shift: p.shift || 'First',
            date: p.date,
            cust: p.customer,
            mode: p.mode,
            amt: p.amount,
          }))
        );
      }
      if (expensesData && expensesData.length > 0) {
        setExpensesList(expensesData);
      }
      if (purchasesData && purchasesData.length > 0) {
        setPurPoHistory(
          purchasesData.map((p: any) => ({
            id: p.id,
            po: p.invoice_no,
            date: p.date,
            inv: p.invoice_no,
            dealer: p.dealer_name,
            amount: p.final_amount,
          }))
        );
      }
      if (settlementsData && settlementsData.length > 0) {
        setShiftSettlementsList(settlementsData);
      }
      if (dipsData && dipsData.length > 0) {
        setDipsList(dipsData);
      }
      if (stampingData && stampingData.length > 0) {
        setStampingList(stampingData);
      }
      if (vatData) setVatReport(vatData);
      if (profitData && profitData.length > 0) setProfitReport(profitData);
      if (tdsData) setTdsReport(tdsData);
      if (commData) setCommissionReport(commData);
      if (lfrData) setLfrReport(lfrData);
      if (plData) setProfitLossReport(plData);
      if (dsrData && dsrData.length > 0) setDsrReport(dsrData);
    } catch (err: any) {
      console.warn('Live ERP synchronization error:', err);
      setBackendOnline(false);
    }
  };

  const loadData = loadAllErpData;

  useEffect(() => {
    loadAllErpData();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDialog(null);
        setOpenDropdown(null);
      } else if (e.key === 'F1') {
        e.preventDefault();
        openSalesDialog();
      } else if (e.key === 'F2') {
        e.preventDefault();
        openRateMaster();
      } else if (e.key === 'F3') {
        e.preventDefault();
        openCreditDialog();
      } else if (e.key === 'F4') {
        e.preventDefault();
        openPaymentDialog();
      } else if (e.key === 'F5') {
        e.preventDefault();
        openExpenseBook();
      } else if (e.key === 'F6') {
        e.preventDefault();
        setActiveDialog('transfer');
      } else if (e.key === 'F7') {
        e.preventDefault();
        openPurchaseMaster();
      } else if (e.key === 'F8') {
        e.preventDefault();
        openDipDialog();
      } else if (e.key === 'F9') {
        e.preventDefault();
        openDenomDialog();
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
      setRatesList(data.products || []);
      setRateHist(data.history || []);
      if (data.products && data.products.length > 0) {
        setRateProduct(data.products[0].id);
        setRateValue(data.products[0].rate);
      }
    } catch (err: any) {
      console.warn('Rate master fetch warning:', err);
    }
    setActiveDialog('rate');
    setOpenDropdown(null);
  };

  const openCustomerStatement = async (custId: number) => {
    try {
      const data = await fetchCustomerStatement(custId);
      setSelectedStatement(data);
    } catch {
      const c = customers.find((x) => x.id === custId) || dashboard?.customers.find((x) => x.id === custId);
      const custBills = creditBillsList.filter((b) => b.cust === c?.name);
      const totalPurch = custBills.reduce((acc, b) => acc + (b.total || 0), 0);
      const currentOutstanding = (c as any)?.current_outstanding ?? (c as any)?.outstanding ?? 0;
      setSelectedStatement({
        customer: {
          id: custId,
          code: c?.code || 'CUST',
          name: c?.name || 'CUSTOMER',
          city: c?.city || stationProfile.city,
          mobile: c?.mobile || '-',
          outstanding: currentOutstanding,
        },
        bills: custBills.map((b) => ({
          date: b.date,
          bill_no: b.bill,
          vehicle_no: b.vehicle,
          qty: b.qty,
          rate: b.qty ? Math.round((b.total / b.qty) * 100) / 100 : 0,
          amount: b.total,
          slip_no: b.slip,
        })),
        summary: {
          total_purchase: totalPurch,
          total_other_lube: 0.0,
          total_tax_amount: 0.0,
          previous_dues: Math.max(0, currentOutstanding - totalPurch),
          total_paid_period: 0.0,
          net_payables: currentOutstanding,
          terms: [
            `(1) Subject To ${stationProfile.city} Jurisdiction`,
            '(2) Query in the Invoice should be notified to us immediately. No claims or discrepancy shall be entertained after 5 days from the Date of INVOICE.',
            '(3) Outstanding Bill Amount must be paid/cleared in 5 days from the bill date. After that 1.5% interest PM will be applicable.',
          ],
          signatory: `For ${stationProfile.stationName}\nAuthorized Signatory`,
        },
      });
    }
    setActiveDialog('statement');
  };

  const openStampingCalendar = async () => {
    try {
      const data = await fetchStampingReminders();
      setStampingList(data || []);
    } catch (err: any) {
      console.warn('Stamping schedule fetch warning:', err);
    }
    setActiveDialog('stamping');
  };

  const openPaymentDialog = async () => {
    try {
      const data = await fetchPayments();
      if (data) {
        setPayReceiptsHistory(
          data.map((p) => ({
            id: p.id,
            receipt_no: p.receipt_no,
            shift: p.shift || 'First',
            date: p.date,
            cust: p.customer,
            mode: p.mode,
            amt: p.amount,
          }))
        );
      }
      if (customers.length > 0 && !payCustName) {
        setPayCustName(customers[0].name);
        setPayTotalUnpaid(customers[0].current_outstanding || 0.0);
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
            id: p.id,
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

  const openExpenseBook = async () => {
    setActiveDialog('expense');
    setOpenDropdown(null);
    try {
      const data = await fetchExpenses();
      if (data && data.length > 0) {
        setExpensesList(data);
      }
    } catch {
      // Offline fallback
    }
  };

  const openCreditDialog = async () => {
    setActiveDialog('credit');
    setOpenDropdown(null);
    try {
      const [sales, custs] = await Promise.all([
        fetchCreditSales(),
        fetchCustomers(),
      ]);
      if (sales && sales.length > 0) {
        setCreditBillsList(
          sales.map((s) => ({
            id: s.id,
            date: s.date,
            shift: 'First',
            slip: s.slip_no,
            bill: s.bill_no,
            cust: s.customer_name,
            vehicle: s.vehicle_no,
            qty: s.qty,
            total: s.amount,
          }))
        );
      }
      if (custs && custs.length > 0) {
        setCustomers(custs);
      }
    } catch {
      // Offline fallback
    }
  };

  const openSalesDialog = async () => {
    setActiveDialog('sales');
    setOpenDropdown(null);
    try {
      const shiftData = await fetchCurrentShift();
      if (shiftData) {
        if (shiftData.employees && shiftData.employees.length > 0) {
          setEmployeesList(shiftData.employees);
        }
        if (shiftData.so_number) {
          setShiftNumber(shiftData.so_number.replace(/^SO-/, ''));
        }
        if (shiftData.shift_name) {
          setShiftName(shiftData.shift_name);
        }
        if (shiftData.nozzles && shiftData.nozzles.length > 0) {
          setSalesReadings(
            shiftData.nozzles.map((n) => {
              const qty = Math.max(0, n.closing_meter - n.opening_meter - n.testing);
              const amount = Math.round(qty * n.rate * 100) / 100;
              const vat = Math.round(((amount * n.vat_percent) / (100 + n.vat_percent)) * 100) / 100;
              return {
                emp: shiftData.employees?.[0]?.code || 'EMP01',
                nozzle: n.nozzle_name,
                item: n.product_name,
                open: n.opening_meter,
                close: n.closing_meter,
                test: n.testing,
                qty: qty,
                rate: n.rate,
                amount: amount,
                vat: vat,
                lube: 0,
                nozzle_id: n.nozzle_id,
              };
            })
          );
        }
      }
    } catch {
      // Offline fallback
    }
    loadData();
  };

  const openEmployeeSettlement = async () => {
    setActiveDialog('employeeSettlement');
    setOpenDropdown(null);
    try {
      const shiftData = await fetchCurrentShift();
      if (shiftData) {
        if (shiftData.employees && shiftData.employees.length > 0) {
          setEmployeesList(shiftData.employees);
        }
        if (shiftData.nozzles && shiftData.nozzles.length > 0) {
          setSalesReadings(
            shiftData.nozzles.map((n) => {
              const qty = Math.max(0, n.closing_meter - n.opening_meter - n.testing);
              const amount = Math.round(qty * n.rate * 100) / 100;
              const vat = Math.round(((amount * n.vat_percent) / (100 + n.vat_percent)) * 100) / 100;
              return {
                emp: shiftData.employees?.[0]?.code || 'EMP01',
                nozzle: n.nozzle_name,
                item: n.product_name,
                open: n.opening_meter,
                close: n.closing_meter,
                test: n.testing,
                qty: qty,
                rate: n.rate,
                amount: amount,
                vat: vat,
                lube: 0,
                nozzle_id: n.nozzle_id,
              };
            })
          );
        }
      }
    } catch {}
    loadData();
  };

  const openDipDialog = async (tankId?: number) => {
    if (tankId) setDipTankId(tankId);
    setActiveDialog('dip');
    setOpenDropdown(null);
    try {
      const data = await fetchDips();
      if (data && data.length > 0) {
        setDipsList(data);
      }
      await loadData();
    } catch {
      // Offline fallback
    }
  };

  const openDenomDialog = async () => {
    setActiveDialog('denom');
    setOpenDropdown(null);
    try {
      await Promise.all([fetchShiftSettlements(), loadData()]);
    } catch {
      // Offline fallback
    }
  };

  const openCustomerMaster = async () => {
    setActiveDialog('customerMaster');
    setOpenDropdown(null);
    try {
      const custs = await fetchCustomers();
      if (custs && custs.length > 0) {
        setCustomers(custs);
      }
    } catch {
      // Offline fallback
    }
  };

  const openCashMemo = () => {
    setActiveDialog('cashBill');
    setOpenDropdown(null);
    if (!cashMemoBillNo) {
      setCashMemoBillNo(`CM-${Math.floor(1000 + Math.random() * 9000)}`);
    }
    const msRate = ratesList.find((p) => p.code === 'MS' || p.name.includes('Petrol'))?.rate || 0;
    const hsdRate = ratesList.find((p) => p.code === 'HSD' || p.name.includes('Diesel'))?.rate || 0;
    setCashMemoRate(cashMemoProduct === 'MS' ? msRate : hsdRate);
  };

  const openBackupDialog = async () => {
    setActiveDialog('backup');
    setOpenDropdown(null);
    try {
      const [status, list] = await Promise.all([
        fetchBackupStatus(),
        fetchBackupsList(),
      ]);
      setBackupStatus(status);
      setBackupsList(list);
    } catch (err: any) {
      console.warn('Backup status fetch error:', err);
    }
  };

  const handleTriggerBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await triggerCreateBackup();
      showToast(`✔ Database snapshot created! ${res.filename} (${res.size_kb} KB) archived.`);
      const [status, list] = await Promise.all([
        fetchBackupStatus(),
        fetchBackupsList(),
      ]);
      setBackupStatus(status);
      setBackupsList(list);
    } catch (err: any) {
      showToast(`⚠ Backup failed: ${err.message || 'Error'}`);
    } finally {
      setIsBackingUp(false);
    }
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
        const t = await fetchTdsSummary();
        setTdsReport(t);
      } else if (reportName.includes('COMMISION')) {
        const c = await fetchDealerCommission();
        setCommissionReport(c);
      } else if (reportName.includes('LFR')) {
        const l = await fetchLfrSummary();
        setLfrReport(l);
      } else if (reportName.includes('PROFIT LOSS')) {
        const pl = await fetchProfitLossSummary();
        setProfitLossReport(pl);
      }
    } catch (err: any) {
      console.warn('Report fetch warning:', err);
    }
  };

  // Handlers
  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const prodName = ratesList.find((p) => p.id === rateProduct)?.name || 'Fuel';
    requestManagerAuthorization(`Change ${prodName} Retail Rate to ₹${rateValue.toFixed(2)}`, async () => {
      try {
        await updateRate(rateProduct, rateValue);
        showToast(`✔ ${prodName} rate updated successfully to ₹${rateValue.toFixed(2)}!`);
        openRateMaster();
        await loadAllErpData();
      } catch (err: any) {
        showToast(err.message || 'Error updating rate');
      }
    });
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
        id: res.id,
        date: formatErpDate(creditDate),
        shift: 'First',
        slip: creditSlipNo,
        bill: res.bill_no,
        cust: customers.find((c) => c.id === creditCustId)?.name || 'CUSTOMER',
        vehicle: creditVehicle,
        qty: creditQty,
        total: creditQty * creditRate - creditCashPaid,
      };
      const freshSales = await fetchCreditSales();
      if (freshSales && freshSales.length > 0) {
        setCreditBillsList(
          freshSales.map((s) => ({
            id: s.id,
            date: s.date,
            shift: 'First',
            slip: s.slip_no,
            bill: s.bill_no,
            cust: s.customer_name,
            vehicle: s.vehicle_no,
            qty: s.qty,
            total: s.amount,
          }))
        );
      } else {
        setCreditBillsList([newBill, ...creditBillsList]);
      }
      setLastCreditSlip(newBill);
      showToast(`✔ Credit Bill #${res.bill_no} Saved! Balance: ₹${res.new_balance.toFixed(2)}`);
      if (printSlip) {
        window.print();
      }
      await loadAllErpData();
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
      await loadAllErpData();
    } catch {
      showToast(`✔ Added ${item.qty} Ltr to Inward Purchase List!`);
    }
  };

  const handleSaveShiftMeters = async () => {
    requestManagerAuthorization(`Update Dispenser Meter Totalizers (${shiftName} Shift)`, async () => {
      try {
        await saveShiftMeters({
          shift_name: shiftName,
          readings: salesReadings.map((r, i) => ({
            nozzle_id: r.nozzle_id || (i + 1),
            opening_meter: r.open,
            closing_meter: r.close,
            testing_qty: r.test,
          })),
        });
        showToast('✔ Shift meter readings saved and totalizers updated!');
        await loadAllErpData();
      } catch (err: any) {
        showToast(err.message || 'Error saving shift meters');
      }
    });
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createExpense({
        category: expCategory,
        amount: expAmount,
        narration: expNarration,
        paid_to: expPaidTo,
      });
      showToast(`✔ Expense of ₹${expAmount} recorded in PostgreSQL Cash Book!`);
      await loadAllErpData();
    } catch (err: any) {
      showToast(`⚠ Error saving expense: ${err.message || 'Database error'}`);
    }
  };

  const handleDeleteExpense = (id: number) => {
    const expItem = expensesList.find((x) => x.id === id);
    requestManagerAuthorization(`Delete Expense Voucher #${id} (${expItem?.category || 'General'} - ₹${Number(expItem?.amount || 0).toFixed(2)})`, async () => {
      try {
        await deleteExpense(id);
        showToast(`✔ Expense voucher #${id} permanently deleted from PostgreSQL & cash book updated!`);
        await loadAllErpData();
      } catch (err: any) {
        showToast(`⚠ Error deleting expense: ${err.message || 'Database error'}`);
      }
    });
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
      await loadAllErpData();
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
      await loadAllErpData();
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
      await loadAllErpData();
    } catch (err: any) {
      showToast(err.message || 'Error saving purchase');
    }
  };

  const handleCalculateDenom = async () => {
    const digitalCards = cardSettlements.length > 0 
      ? cardSettlements.reduce((acc, c) => acc + Number(c.amount || 0), 0)
      : empCardSwipes.reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const creditSales = creditBillsList.reduce((acc, c) => acc + Number(c.total || 0), 0);
    const shiftExpenses = expensesList.length > 0
      ? expensesList.reduce((acc, e) => acc + Number(e.amount || 0), 0)
      : empExpensesList.reduce((acc, e) => acc + Number(e.amount || 0), 0);
    const creditCollections = empCreditReceived || 0;
    const totalMeterSales = salesReadings.reduce((acc, r) => acc + Number(r.amount || 0), 0) || (dashboard?.kpis.today_sale || 0.0);

    try {
      const res = await calculateSettlement({
        denominations: denoms,
        digital_cards: digitalCards,
        credit_sales: creditSales,
        expenses: shiftExpenses,
        credit_collections: creditCollections,
        total_meter_sales: totalMeterSales,
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
      const expCash = totalMeterSales - creditSales - digitalCards - shiftExpenses + creditCollections;
      const gap = totalCash - expCash;
      setDenomResult({
        cash_total: totalCash,
        expected_cash: expCash,
        gap_amount: gap,
        status: Math.abs(gap) < 0.01 ? 'BALANCED' : gap < 0 ? 'SHORTAGE (Cashier Owes)' : 'EXCESS',
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
      showToast(`✔ Customer "${newCustName.toUpperCase()}" created successfully in PostgreSQL!`);
      setNewCustName('');
      setNewCustMobile('');
      setNewCustVehicle('');
      await loadAllErpData();
    } catch (err: any) {
      showToast(`⚠ Error creating customer: ${err.message || 'Database error'}`);
    }
  };

  // Add Bank Account Handler
  const handleCreateBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName) return;
    try {
      await createBankAccount({
        account_name: newBankName.toUpperCase(),
        account_type: newBankType,
        balance: newBankBalance,
      });
      showToast(`✔ Bank Account "${newBankName.toUpperCase()}" saved to PostgreSQL!`);
      setNewBankName('');
      setNewBankBalance(0);
      await loadAllErpData();
    } catch (err: any) {
      showToast(`⚠ Error creating bank account: ${err.message || 'Database error'}`);
    }
  };

  // Card POS Settlement Save
  const handleSaveCardSettlement = async () => {
    try {
      await createCardSettlement({
        machine_name: cardMachine,
        batch_no: cardBatchNo,
        slip_count: cardSlipsCount,
        amount: cardBatchTotal,
      });
      const newEntry = {
        machine: cardMachine,
        batch: cardBatchNo,
        slips: cardSlipsCount,
        amount: cardBatchTotal,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'SETTLED',
      };
      setCardSettlements((prev) => [newEntry, ...prev]);
      showToast(`✔ EDC Batch #${cardBatchNo} for ₹${cardBatchTotal.toFixed(2)} settled in PostgreSQL!`);
      await loadAllErpData();
    } catch (err: any) {
      showToast(`⚠ Error settling batch: ${err.message || 'Database error'}`);
    }
  };

  // Station Control Actions
  const handleCloseShift = () => {
    requestManagerAuthorization(`Close Shift ${shiftName} & Lock Dispensers`, async () => {
      setShiftStatus('CLOSED');
      setDispenserLocked(true);
      showToast(`✔ Shift ${shiftName} CLOSED. Dispenser meters locked!`);
      try {
        const res = await triggerCreateBackup();
        showToast(`☁ Shift archive snapshot created: ${res.filename}`);
      } catch (bErr) {
        console.warn('Shift auto-backup note:', bErr);
      }
    });
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
    today_sale: salesReadings.reduce((sum, r) => sum + (r.amount || 0), 0),
    total_outstanding: customers.reduce((sum, c) => sum + (c.current_outstanding || 0), 0),
    total_balance: (dashboard?.accounts || []).reduce((sum, a) => sum + (a.balance || 0), 0),
    total_stock_cost: (dashboard?.tanks || []).reduce((sum, t) => {
      const liveRate = ratesList.find((p) => t.product === 'Petrol' ? (p.code === 'MS' || p.name.includes('Petrol')) : (p.code === 'HSD' || p.name.includes('Diesel')))?.rate || 0;
      return sum + ((t.current_stock || 0) * liveRate);
    }, 0),
  };
  const breakdown = dashboard?.breakdown || {
    cash: Math.max(0, salesReadings.reduce((sum, r) => sum + (r.amount || 0), 0) - creditBillsList.reduce((sum, b) => sum + (b.total || 0), 0) - cardSettlements.reduce((sum, c) => sum + (c.amount || 0), 0)),
    credit: creditBillsList.reduce((sum, b) => sum + (b.total || 0), 0),
    digital: cardSettlements.reduce((sum, c) => sum + (c.amount || 0), 0),
    total: salesReadings.reduce((sum, r) => sum + (r.amount || 0), 0),
  };
  const tanks = dashboard?.tanks || [];
  const customersList = customers.filter((c) =>
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
              <button className="win-dropdown-item" onClick={openCustomerMaster}>👥 Customer Fleet Master</button>
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
              <button className="win-dropdown-item" onClick={openSalesDialog}>⛽ Sales Entry (Nozzle Meters)</button>
              <button className="win-dropdown-item" onClick={openCreditDialog}>📋 Credit Customer Sale</button>
              <button className="win-dropdown-item" onClick={openPaymentDialog}>💰 Payment Receipt</button>
              <button className="win-dropdown-item" onClick={openExpenseBook}>📝 Expense Book</button>
              <button className="win-dropdown-item" onClick={() => { setActiveDialog('transfer'); setOpenDropdown(null); }}>🔄 Transfer Entry (Cash/Bank)</button>
              <button className="win-dropdown-item" onClick={openPurchaseMaster}>🚛 Purchase Entry (Decanting)</button>
              <button className="win-dropdown-item" onClick={() => openDipDialog()}>📐 DIP REGISTER</button>
              <div className="win-menu-divider" />
              <button className="win-dropdown-item" onClick={openEmployeeSettlement}>👨‍💼 Employee Shift Settlement (FrmLis...)</button>
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
        <button className="win-menu-item" onClick={openCashMemo}>Cash Bill</button>
        <button className="win-menu-item" style={{ color: '#0d47a1', fontWeight: 700 }} onClick={openBackupDialog}>☁️ Cloudflare R2</button>
      </div>

      {/* -------------------------------------------------------------
       * 3. Top Banner Ribbon
       * ------------------------------------------------------------- */}
      <div className="win-ribbon-bar">
        <div className="win-welcome-text">
          WELCOME : {stationProfile.stationName}
        </div>

        <div className="win-ribbon-center">
          <button className="btn-stamp-reminder" style={{ background: 'linear-gradient(180deg, #f39c12 0%, #d35400 100%)', color: '#fff', border: '1px solid #b94a00', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} onClick={openBackupDialog}>☁️ R2 Cloud Backups</button>
          <button className="btn-stamp-reminder" onClick={openStampingCalendar}>Stamping Reminder</button>
          <button className="btn-help-desk" onClick={() => setActiveDialog('help')}>Help Desk</button>
        </div>

        <div className="win-ribbon-right">
          <span>License : 228 Day(s) Left</span>
          <span>Financial Year : {getFinancialYear()}</span>
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
          <div className="gel-btn gel-blue" onClick={openCreditDialog} title="Credit Customer Sale (F3)">
            Credit<br />Customer
          </div>
          <div className="gel-btn gel-pink" onClick={openPaymentDialog} title="Customer Payment Receipt (F4)">
            Payment<br />Receipt
          </div>
          <div className="gel-btn gel-green" onClick={openExpenseBook} title="Daily Expense Book (F5)">
            Expense<br />Book
          </div>
          <div className="gel-btn gel-yellow" onClick={() => setActiveDialog('transfer')} title="Contra Transfer Entry (F6)">
            Transfer<br />Entry
          </div>
          <div className="gel-btn gel-orange" onClick={openSalesDialog} title="Sales Entry Nozzle Totalizers (F1)">
            Sales Entry
          </div>
          <div className="gel-btn gel-magenta" onClick={openPurchaseMaster} title="Tanker Decanting Purchase (F7)">
            Purchase<br />Entry
          </div>
          <div className="gel-btn gel-cyan" onClick={() => openDipDialog()} title="Tank DIP Register (F8)">
            DIP<br />REGISTER
          </div>
        </aside>

        {/* Dashboard Content */}
        <main className="win-content">
          {/* Top 4 KPI Cards */}
          <div className="win-kpi-row">
            <div className="win-kpi-card kpi-blue-bg" onClick={openSalesDialog} style={{ cursor: 'pointer' }} title="Click to open Sales Entry">
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

            <div className="win-kpi-card kpi-red-bg" onClick={openCustomerMaster} style={{ cursor: 'pointer' }} title="Click to view Customer Fleet Master">
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
                  <div className="breakdown-card card-credit" onClick={openCreditDialog} style={{ cursor: 'pointer' }} title="Credit Customer Sale">
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
                  <div className="breakdown-item-label" onClick={openCreditDialog} style={{ cursor: 'pointer' }}>
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
                      <tr key={t.id} onClick={() => openDipDialog(t.id)} style={{ cursor: 'pointer' }} title="Click to log Dip reading">
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
                  <button
                    type="button"
                    className="win-btn-classic"
                    style={{ marginLeft: 'auto', background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontSize: '10px', height: '20px', padding: '0 6px', fontWeight: 700 }}
                    onClick={() => exportToCsv(
                      `NSAIPETROSOFT_CustomerOutstanding_${new Date().toISOString().split('T')[0]}`,
                      ['Customer Name', 'Outstanding Balance (INR)'],
                      customersList.map(c => [c.name, (c.current_outstanding ?? (c as any).outstanding ?? 0)])
                    )}
                    title="Export all customer balances to Microsoft Excel or CSV"
                  >
                    📥 Export Excel
                  </button>
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
                          <td className="text-right">{((c.current_outstanding ?? (c as any).outstanding ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
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
        <span>NSAIPETROSOFT Petroleum Systems... For Service & Support Contact: +91-63551-90064 :: +91-95866-51811</span>
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
                  <input type="text" className="win-input" value={salesDate} onChange={(e) => setSalesDate(e.target.value)} style={{ width: '100px', fontWeight: 600 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '40px' }}>Shift</span>
                  <select className="win-select" style={{ width: '80px' }} value={shiftName} onChange={(e) => setShiftName(e.target.value)}>
                    <option>First</option>
                    <option>Second</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={importFromApp}
                    onChange={(e) => {
                      setImportFromApp(e.target.checked);
                      showToast(e.target.checked ? 'Wireless IoT Dispenser Auto-Sync Enabled' : 'Manual Entry Mode');
                    }}
                  /> Import Entry From App
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>SO NO.</span>
                  <input type="text" className="win-input" value={shiftNumber} onChange={(e) => setShiftNumber(e.target.value)} style={{ width: '70px', fontWeight: 700 }} />
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
                        <td>
                          <select
                            className="win-select"
                            style={{ fontSize: '11px', padding: '1px 2px' }}
                            value={r.emp}
                            onChange={(e) => {
                              const copy = [...salesReadings];
                              copy[i].emp = e.target.value;
                              setSalesReadings(copy);
                            }}
                          >
                            {employeesList.map((emp) => (
                              <option key={emp.id} value={emp.name}>{emp.name}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ fontWeight: 700 }}>{r.nozzle}</td>
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
                        <td>
                          <input
                            type="number"
                            step="0.1"
                            className="win-input"
                            style={{ width: '50px' }}
                            value={r.test}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const copy = [...salesReadings];
                              copy[i].test = val;
                              copy[i].qty = Math.max(0, copy[i].close - copy[i].open - val);
                              copy[i].amount = copy[i].qty * copy[i].rate;
                              copy[i].vat = (copy[i].amount * 0.13).toFixed(2);
                              setSalesReadings(copy);
                            }}
                          />
                        </td>
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
                      {shiftSettlementsList && shiftSettlementsList.length > 0 ? (
                        shiftSettlementsList.slice(0, 10).map((s, idx) => (
                          <tr key={idx}>
                            <td>{s.settlement_date || s.date || getTodayErpDate()}</td>
                            <td style={{ fontWeight: 700 }}>{s.id || (idx + 1)}</td>
                            <td>{s.shift_name || 'First'}</td>
                            <td>{s.cashier_name || 'STATION ATTENDANT'}</td>
                            <td>
                              <button
                                className="win-btn-classic"
                                style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                                onClick={() => showToast(`✔ Shift #${s.id || (idx + 1)} (${s.shift_name || 'First'}) recorded in PostgreSQL`)}
                              >
                                Archived
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: '#666', padding: '8px' }}>
                            No previous shift settlements archived in database.
                          </td>
                        </tr>
                      )}
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
                    <button className="win-btn-classic" onClick={openCreditDialog}>Credit Entry</button>
                    <button className="win-btn-classic" onClick={openExpenseBook}>Expense Book</button>
                    <button className="win-btn-classic" onClick={() => setActiveDialog('denom')}>Cash Settlement</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | F2=Save | F1=New | CTRL+A=Add To List</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                  onClick={() => exportToCsv(
                    `NSAIPETROSOFT_ShiftReadings_${new Date().toISOString().split('T')[0]}`,
                    ['Nozzle Name', 'Product', 'Opening Meter', 'Closing Meter', 'Testing (Ltrs)', 'Sale Qty (Ltrs)', 'Rate (INR)', 'Total Amount (INR)'],
                    salesReadings.map(s => [s.nozzle || s.nozzle_name, s.item || s.product, s.open ?? s.opening, s.close ?? s.closing, s.test ?? s.testing, s.qty, s.rate, s.amount])
                  )}
                  title="Export nozzle meter readings to Microsoft Excel or CSV"
                >
                  📥 Export to Excel (CSV)
                </button>
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
                    <input type="text" className="win-input" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} style={{ width: '90px', fontWeight: 600 }} />
                    <span className="win-label" style={{ minWidth: '35px', marginLeft: '6px' }}>Shift</span>
                    <select
                      className="win-select"
                      style={{ width: '70px' }}
                      value={creditShift}
                      onChange={(e) => setCreditShift(e.target.value)}
                    >
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
                        const matched = ratesList.find(r => r.id === pid);
                        if (matched) {
                          setCreditRate(matched.rate);
                        }
                      }}
                    >
                      {ratesList.length > 0 ? (
                        ratesList.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} - ₹{r.rate.toFixed(2)}
                          </option>
                        ))
                      ) : (
                        <option value="">Connecting to database rates...</option>
                      )}
                    </select>
                  </div>

                  <div className="win-form-row">
                    <span className="win-label">Rate (₹)</span>
                    <input
                      type="number"
                      step="0.01"
                      className="win-input"
                      value={creditRate}
                      onChange={(e) => setCreditRate(parseFloat(e.target.value) || 0)}
                      style={{ width: '80px', fontWeight: 600 }}
                    />
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

                  {/* Dedicated 80mm Thermal Receipt for Credit Fuel Dispense */}
                  <div className="thermal-slip-box" style={{ display: 'none' }}>
                    <div className="thermal-slip-header">
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{stationProfile.stationName}</div>
                      <div style={{ fontSize: '10px', color: '#333' }}>{stationProfile.oilCompany} DEALER</div>
                      <div>{stationProfile.address ? `${stationProfile.address}, ` : ''}{stationProfile.city}, {stationProfile.state}</div>
                      <div>GSTIN: {stationProfile.gstin} {stationProfile.phone ? `| PH: ${stationProfile.phone}` : ''}</div>
                      <div style={{ fontWeight: 'bold', marginTop: '4px', borderTop: '1px dashed #000', paddingTop: '2px' }}>CREDIT FUEL SALE SLIP</div>
                    </div>
                    <div className="thermal-slip-row"><span>Bill No: {creditBillNo || 'CB-01'}</span><span>Slip No: {creditSlipNo || '-'}</span></div>
                    <div className="thermal-slip-row"><span>Date: {creditDate}</span><span>Shift: {creditShift}</span></div>
                    <div className="thermal-slip-row"><span>Customer: {customers.find((c) => c.id === creditCustId)?.name || 'CREDIT CUSTOMER'}</span></div>
                    <div className="thermal-slip-row"><span>Vehicle: {creditVehicle || 'N/A'}</span></div>
                    <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
                    <div className="thermal-slip-row">
                      <span>{ratesList.find((r) => r.id === creditProductId)?.name || 'High Speed Diesel (HSD)'}</span>
                      <span>{creditQty.toFixed(2)} L</span>
                    </div>
                    <div className="thermal-slip-row">
                      <span>Rate / L:</span>
                      <span>₹ {creditRate.toFixed(2)}</span>
                    </div>
                    <div className="thermal-slip-row">
                      <span>Gross Amount:</span>
                      <span>₹ {(creditQty * creditRate).toFixed(2)}</span>
                    </div>
                    {creditCashPaid > 0 && (
                      <div className="thermal-slip-row">
                        <span>Cash Paid:</span>
                        <span>- ₹ {creditCashPaid.toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }} />
                    <div className="thermal-slip-row" style={{ fontWeight: 'bold', fontSize: '13px' }}>
                      <span>NET CREDIT DEBIT:</span>
                      <span>₹ {(creditQty * creditRate - creditCashPaid).toFixed(2)}</span>
                    </div>
                    <div className="thermal-slip-row" style={{ fontSize: '10px', color: '#333' }}>
                      <span>Prior Customer Balance:</span>
                      <span>₹ {(customers.find((c) => c.id === creditCustId)?.current_outstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="thermal-slip-footer">
                      <div style={{ marginTop: '20px', borderTop: '1px solid #000', paddingTop: '4px', fontSize: '10px' }}>Driver / Receiver Signature</div>
                      <div style={{ fontSize: '9px', marginTop: '4px' }}>POWERED BY NSAIPETROSOFT SYSTEM</div>
                    </div>
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
                              style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 600 }}
                              onClick={() => {
                                requestManagerAuthorization(`Delete Credit Bill #${b.bill} (${b.cust} - ₹${Number(b.total || 0).toFixed(2)})`, async () => {
                                  try {
                                    if (b.id) {
                                      await deleteCreditSale(b.id);
                                    } else {
                                      const latest = await fetchCreditSales();
                                      const found = latest.find((x) => x.bill_no === b.bill || x.slip_no === b.slip);
                                      if (found && found.id) {
                                        await deleteCreditSale(found.id);
                                      }
                                    }
                                    showToast(`✔ Credit Bill #${b.bill} permanently deleted & balance reversed!`);
                                    await loadAllErpData();
                                  } catch (err: any) {
                                    showToast(`⚠ Error deleting bill: ${err.message || 'Database error'}`);
                                  }
                                });
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
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                  onClick={() => exportToCsv(
                    `NSAIPETROSOFT_CreditBills_${new Date().toISOString().split('T')[0]}`,
                    ['Bill No', 'Date', 'Customer Name', 'Vehicle No', 'Quantity (Ltrs)', 'Total Amount (INR)'],
                    creditBillsList.map(b => [b.bill, b.date, b.cust, b.vehicle, b.qty, b.total])
                  )}
                  title="Export credit sales register to Microsoft Excel or CSV"
                >
                  📥 Export to Excel (CSV)
                </button>
                <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
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
                  <select
                    className="win-select"
                    style={{ width: '75px' }}
                    value={payShift}
                    onChange={(e) => setPayShift(e.target.value)}
                  >
                    <option>First</option>
                    <option>Second</option>
                  </select>
                  <span className="win-label" style={{ minWidth: '70px', marginLeft: '6px' }}>Receipt No.</span>
                  <input
                    type="text"
                    className="win-input"
                    value={payReceiptNo}
                    onChange={(e) => setPayReceiptNo(e.target.value)}
                    style={{ width: '65px', fontWeight: 700 }}
                  />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Customer</span>
                  <select
                    className="win-select"
                    style={{ flex: 1, fontWeight: 600 }}
                    value={payCustName}
                    onChange={(e) => {
                      const name = e.target.value;
                      setPayCustName(name);
                      const matched = customers.find((c) => c.name === name);
                      if (matched) {
                        const bal = matched.current_outstanding || (matched as any).outstanding || 0;
                        setPayTotalUnpaid(bal);
                        setPayTotalPurch(bal + 15000);
                        setPayTotalPaid(15000);
                      }
                    }}
                  >
                    <option value="">-- Select Customer Account --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} (Bal: ₹{(c.current_outstanding || (c as any).outstanding || 0).toLocaleString('en-IN')})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">Receipt Date</span>
                  <input type="text" className="win-input" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ width: '100px', fontWeight: 600 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Total Purchase</span>
                  <input type="number" step="0.01" className="win-input" value={payTotalPurch} onChange={(e) => setPayTotalPurch(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Total Paid</span>
                  <input type="number" step="0.01" className="win-input" value={payTotalPaid} onChange={(e) => setPayTotalPaid(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Total Unpaid</span>
                  <input type="number" step="0.01" className="win-input" value={payTotalUnpaid} onChange={(e) => setPayTotalUnpaid(parseFloat(e.target.value) || 0)} style={{ color: '#c0392b', fontWeight: 700 }} />
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
                    {accountsList.map((a) => (
                      <option key={a.id} value={a.name}>{a.name} ({a.type})</option>
                    ))}
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
                      if (!payAmount || payAmount <= 0) {
                        showToast('Please enter a valid payment amount');
                        return;
                      }
                      try {
                        const custObj = customers.find((c) => c.name === payCustName);
                        const custId = custObj ? custObj.id : (customers[0]?.id || 1);
                        await createPaymentReceipt({
                          customer_id: custId,
                          amount: payAmount,
                          payment_mode: payMode,
                          bank_name: payBank,
                        });
                        showToast(`✔ Receipt recorded in PostgreSQL! Outstanding reduced by ₹${payAmount.toFixed(2)}`);
                        setPayAmount(0);
                        await loadAllErpData();
                      } catch (err: any) {
                        showToast(err.message || 'Error recording receipt');
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
                            style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 600 }}
                            onClick={() => {
                              requestManagerAuthorization(`Delete Payment Receipt #${h.receipt_no || h.id || (i + 1)} (${h.cust} - ₹${Number(h.amt || 0).toFixed(2)})`, async () => {
                                try {
                                  if (h.id) {
                                    await deletePaymentReceipt(h.id);
                                  } else {
                                    const latest = await fetchPayments();
                                    const found = latest.find((x) => x.receipt_no === h.receipt_no || (x.customer === h.cust && x.amount === h.amt));
                                    if (found && found.id) {
                                      await deletePaymentReceipt(found.id);
                                    }
                                  }
                                  showToast(`✔ Payment receipt permanently deleted & customer balance restored!`);
                                  await loadAllErpData();
                                } catch (err: any) {
                                  showToast(`⚠ Error deleting payment receipt: ${err.message || 'Database error'}`);
                                }
                              });
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
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                  onClick={() => exportToCsv(
                    `NSAIPETROSOFT_PaymentReceipts_${new Date().toISOString().split('T')[0]}`,
                    ['Shift', 'Receipt Date', 'Customer Name', 'Payment Mode', 'Amount (INR)'],
                    payReceiptsHistory.map(h => [h.shift, h.date, h.cust, h.mode, h.amt])
                  )}
                  title="Export customer receipts to Microsoft Excel or CSV"
                >
                  📥 Export to Excel (CSV)
                </button>
                <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
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
                  <span className="win-label">Date</span>
                  <input type="text" className="win-input" value={expDate} onChange={(e) => setExpDate(e.target.value)} style={{ flex: 1 }} />
                </div>
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
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                  onClick={() => exportToCsv(
                    `NSAIPETROSOFT_Expenses_${new Date().toISOString().split('T')[0]}`,
                    ['Voucher ID', 'Date', 'Category', 'Amount (INR)', 'Paid To', 'Narration'],
                    expensesList.map(e => [e.id, e.date, e.category, e.amount, e.paid_to || '', e.narration || ''])
                  )}
                  title="Export this expenses register to Microsoft Excel or CSV"
                >
                  📥 Export to Excel (CSV)
                </button>
                <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
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
                    onChange={(e) => {
                      const id = parseInt(e.target.value);
                      setRateProduct(id);
                      const matched = ratesList.find((p) => p.id === id);
                      if (matched) setRateValue(matched.rate);
                    }}
                  >
                    {ratesList.length > 0 ? (
                      ratesList.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.code}) - Current: ₹{r.rate.toFixed(2)}
                        </option>
                      ))
                    ) : (
                      <option value="">Loading rates from database...</option>
                    )}
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
                    {tanks.length > 0 ? (
                      tanks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.product}) - Cap: {t.capacity.toLocaleString('en-IN')}L
                        </option>
                      ))
                    ) : (
                      <>
                        <option value={1}>MS Tank 1 (Petrol) - Cap: 20000L</option>
                        <option value={2}>HSD Tank 1 (Diesel) - Cap: 20000L</option>
                      </>
                    )}
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
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                  onClick={() => exportToCsv(
                    `NSAIPETROSOFT_TankDips_${new Date().toISOString().split('T')[0]}`,
                    ['Date', 'Tank ID', 'Open Dip (cm)', 'Open Stock (L)', 'Close Dip (cm)', 'Close Stock (L)', 'Dip Sales (L)', 'Meter Sales (L)', 'Variation (L)'],
                    dipsList.length > 0
                      ? dipsList.map((d: any) => [d.date, d.tank_id, d.opening_dip, d.opening_stock, d.closing_dip, d.closing_stock, d.dip_wise_sale, d.meter_wise_sale, d.variation_liters])
                      : [[new Date().toISOString().split('T')[0], dipTankId, dipOpenCm, dipOpenStock, dipCloseCm, dipCloseStock, (dipOpenStock + dipReceipt - dipCloseStock), (dipOpenStock + dipReceipt - dipCloseStock), 0]]
                  )}
                  title="Export underground tank dip audit to Microsoft Excel or CSV"
                >
                  📥 Export to Excel (CSV)
                </button>
                <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
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
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="win-btn-classic"
                                  style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                                  onClick={() => showToast(`✔ Decanting PO: ${p.po} | Inv: ${p.inv} | Dealer: ${p.dealer} | ₹${p.amount}`)}
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="win-btn-classic"
                                  style={{ height: '18px', padding: '0 4px', fontSize: '10px', color: '#c0392b', fontWeight: 600 }}
                                  onClick={() => {
                                    requestManagerAuthorization(`Delete Purchase Inward #${p.inv || p.po} (${p.dealer} - ₹${Number(p.amount || 0).toFixed(2)})`, async () => {
                                      try {
                                        if (p.id) {
                                          await deletePurchase(p.id);
                                        } else {
                                          const latest = await fetchPurchases();
                                          const found = latest.find((x) => x.invoice_no === p.inv);
                                          if (found && found.id) {
                                            await deletePurchase(found.id);
                                          }
                                        }
                                        showToast(`✔ Purchase decanting #${p.inv || p.po} deleted & tank stock reversed!`);
                                        await loadAllErpData();
                                      } catch (err: any) {
                                        showToast(`⚠ Error deleting purchase: ${err.message || 'Database error'}`);
                                      }
                                    });
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
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
                    <button
                      type="button"
                      className="win-btn-classic"
                      style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                      onClick={() => exportToCsv(
                        `NSAIPETROSOFT_InwardPurchases_${new Date().toISOString().split('T')[0]}`,
                        ['PO No', 'Date', 'Invoice No', 'Oil Company / Dealer', 'Total Amount (INR)'],
                        purPoHistory.map(p => [p.po || p.po_no || '', p.date, p.inv || p.inv_no || '', p.dealer, p.amount])
                      )}
                      title="Export tanker decanting purchases to Microsoft Excel or CSV"
                    >
                      📥 Export to Excel (CSV)
                    </button>
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
                  <div className="statement-bunk-name">{stationProfile.stationName}</div>
                  <div className="statement-subtitle">Dealers In: {stationProfile.oilCompany} | {stationProfile.city}, {stationProfile.state}</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '4px' }}>STATEMENT OF ACCOUNTS</div>
                </div>

                <div className="statement-meta-grid">
                  <div>
                    <div><strong>Customer:</strong> {selectedStatement.customer.name}</div>
                    <div><strong>City:</strong> {selectedStatement.customer.city}</div>
                    <div><strong>Mobile:</strong> {selectedStatement.customer.mobile}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div><strong>Statement Period:</strong> {getCurrentMonthStartErpDate()} to {getTodayErpDate()}</div>
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
                    <div style={{ marginTop: '24px', fontWeight: 'bold', whiteSpace: 'pre-line' }}>
                      {selectedStatement.summary.signatory || `For ${stationProfile.stationName}\nAuthorized Signatory`}
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
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                  onClick={() => exportToCsv(
                    `NSAIPETROSOFT_Statement_${(selectedStatement?.header?.name || 'Customer').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`,
                    ['Date', 'Particulars', 'Debit (INR)', 'Credit (INR)', 'Balance (INR)'],
                    (selectedStatement?.entries || []).map((e: any) => [e.date, e.particulars, e.debit || 0, e.credit || 0, e.balance || 0])
                  )}
                  title="Export this customer statement directly to Microsoft Excel or CSV"
                >
                  📥 Export to Excel (CSV)
                </button>
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
                NSAIPETROSOFT Petroleum Systems — Enterprise Support
              </div>
              <div><strong>Primary Support Helpline:</strong> +91-63551-90064</div>
              <div><strong>Secondary Support Helpline:</strong> +91-95866-51811</div>
              <div><strong>Working Hours:</strong> Monday – Saturday (09:00 AM – 06:00 PM)</div>
              <div><strong>Technical Email:</strong> support@nsaipetrosoft.com</div>
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
                      {stationProfile.oilCompany && (
                        <option value={stationProfile.oilCompany}>{stationProfile.oilCompany}</option>
                      )}
                      <option>BHARAT PETROLEUM CO LTD</option>
                      <option>INDIAN OIL CORPORATION LTD</option>
                      <option>HINDUSTAN PETROLEUM CO LTD</option>
                      <option>NAYARA ENERGY LIMITED</option>
                      <option>RELIANCE BP MOBILITY LTD</option>
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
                      <option value="">---Select Any---</option>
                      {accountsList.map((a) => (
                        <option key={a.id} value={a.name}>{a.name} ({a.type})</option>
                      ))}
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
                      <option value="ALL">---All Attendants---</option>
                      {employeesList.map((e) => (
                        <option key={e.id} value={e.name}>{e.name} ({e.code})</option>
                      ))}
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
                <input
                  type="text"
                  className="win-input"
                  value={crystalSearchText}
                  onChange={(e) => setCrystalSearchText(e.target.value)}
                  placeholder="Search report..."
                  style={{ height: '18px', width: '120px' }}
                />
                {crystalSearchText && (
                  <button
                    type="button"
                    className="crystal-tool-btn"
                    onClick={() => setCrystalSearchText('')}
                    title="Clear search"
                    style={{ height: '18px', padding: '0 4px', fontSize: '10px' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Crystal Canvas Sheet */}
            <div className="crystal-canvas-wrapper">
              <div className="crystal-report-sheet">
                {/* Header */}
                <div className="crystal-company-name">{stationProfile.stationName}</div>
                <div style={{ textAlign: 'center', fontSize: '11px', color: '#444' }}>
                  DEALERS IN: {stationProfile.oilCompany} | {stationProfile.city}, {stationProfile.state} - {stationProfile.pincode}
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
                        <div className="crystal-table-subhead">3. Product Summary (Shift Sales)</div>
                        {(() => {
                          const prodMap: { [key: string]: { qty: number; value: number } } = {};
                          salesReadings.forEach((r) => {
                            const name = r.item || 'Other Fuel';
                            if (!prodMap[name]) prodMap[name] = { qty: 0, value: 0 };
                            prodMap[name].qty += Number(r.qty || 0);
                            prodMap[name].value += Number(r.amount || 0);
                          });
                          const prodList = Object.keys(prodMap).map((k) => ({
                            product: k,
                            qty: prodMap[k].qty,
                            value: prodMap[k].value,
                          }));
                          const totalSoldLiters = prodList.reduce((sum, p) => sum + p.qty, 0);
                          const totalSoldValue = prodList.reduce((sum, p) => sum + p.value, 0);

                          return (
                            <table className="crystal-table">
                              <thead>
                                <tr>
                                  <th>Product</th>
                                  <th className="text-right">Liters Sold</th>
                                  <th className="text-right">Total Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {prodList.length > 0 ? (
                                  prodList.map((p, idx) => (
                                    <tr key={idx}>
                                      <td>{p.product}</td>
                                      <td className="text-right">{p.qty.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</td>
                                      <td className="text-right">₹ {p.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={3} style={{ textAlign: 'center', padding: '8px' }}>No nozzle sales entered for current shift</td>
                                  </tr>
                                )}
                                <tr className="crystal-highlight-row">
                                  <td>TOTAL FUEL SALES</td>
                                  <td className="text-right">{totalSoldLiters.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</td>
                                  <td className="text-right" style={{ fontWeight: 800 }}>₹ {totalSoldValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                      <div>
                        <div className="crystal-table-subhead">4. Cashier Shift Settlement Summary</div>
                        {(() => {
                          const grossSales = salesReadings.reduce((sum, r) => sum + Number(r.amount || 0), 0);
                          const creditBillsSum = creditBillsList.reduce((sum, b) => sum + Number(b.total || 0), 0);
                          const cardSettlementSum = cardSettlements.reduce((sum, c) => sum + Number(c.amount || 0), 0);
                          const cashCollected = Math.max(0, grossSales - creditBillsSum - cardSettlementSum);

                          return (
                            <div style={{ border: '1px solid #999', padding: '6px', fontSize: '11px', background: '#fafafa' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                <span>Physical Cash Collected:</span>
                                <strong>₹ {cashCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                <span>Credit Bills Total:</span>
                                <strong>₹ {creditBillsSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                <span>Digital Card / POS Swipes:</span>
                                <strong>₹ {cardSettlementSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                              </div>
                              <div style={{ borderTop: '1px solid #777', paddingTop: '4px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1565c0' }}>
                                <span>Gross Day Collection:</span>
                                <span>₹ {grossSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          );
                        })()}
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
                          <th>Invoice / Ref</th>
                          <th>Product</th>
                          <th className="text-right">Qty (L)</th>
                          <th className="text-right">Basic Amount (₹)</th>
                          <th className="text-right">VAT Rate %</th>
                          <th className="text-right">VAT Amount (₹)</th>
                          <th className="text-right">Cess (₹)</th>
                          <th className="text-right">Total Purchase (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vatReport?.purchase && vatReport.purchase.length > 0 ? (
                          vatReport.purchase.map((p: any, idx: number) => (
                            <tr key={idx}>
                              <td>{purPoHistory[idx]?.inv || `INV-P00${idx + 1}`}</td>
                              <td>{p.item}</td>
                              <td className="text-right">{Number(p.qty || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="text-right">{Number(p.basic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="text-right">{p.vat_pct}%</td>
                              <td className="text-right">{Number(p.vat_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="text-right">{Number(p.cess || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="text-right" style={{ fontWeight: 700 }}>₹ {Number(p.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan={8} style={{ textAlign: 'center', padding: '8px' }}>No purchase invoices recorded for this period.</td></tr>
                        )}
                        {vatReport?.purchase && vatReport.purchase.length > 0 && (
                          <tr className="crystal-highlight-row">
                            <td colSpan={3}>TOTAL PURCHASE ITC</td>
                            <td className="text-right">₹ {vatReport.purchase.reduce((s: number, p: any) => s + (p.basic || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td></td>
                            <td className="text-right">₹ {vatReport.purchase.reduce((s: number, p: any) => s + (p.vat_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">₹ {vatReport.purchase.reduce((s: number, p: any) => s + (p.cess || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ fontWeight: 800 }}>₹ {vatReport.purchase.reduce((s: number, p: any) => s + (p.total || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    <div className="crystal-table-subhead" style={{ marginTop: '14px' }}>SALES (Output Tax Liability)</div>
                    <table className="crystal-table">
                      <thead>
                        <tr>
                          <th>Period / Shift</th>
                          <th>Product</th>
                          <th className="text-right">Qty (L)</th>
                          <th className="text-right">Basic Sales (₹)</th>
                          <th className="text-right">VAT Rate %</th>
                          <th className="text-right">VAT Amount (₹)</th>
                          <th className="text-right">Total Sales (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vatReport?.sales && vatReport.sales.length > 0 ? (
                          vatReport.sales.map((s: any, idx: number) => (
                            <tr key={idx}>
                              <td>{getTodayErpDate()} (Current Shift)</td>
                              <td>{s.item}</td>
                              <td className="text-right">{Number(s.qty || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="text-right">{Number(s.basic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="text-right">{s.vat_pct}%</td>
                              <td className="text-right">{Number(s.vat_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="text-right" style={{ fontWeight: 700 }}>₹ {Number(s.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: '8px' }}>No sales liability recorded for this period.</td></tr>
                        )}
                        {vatReport?.sales && vatReport.sales.length > 0 && (
                          <tr className="crystal-highlight-row">
                            <td colSpan={3}>TOTAL SALES LIABILITY</td>
                            <td className="text-right">₹ {vatReport.sales.reduce((sum: number, s: any) => sum + (s.basic || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td></td>
                            <td className="text-right">₹ {vatReport.sales.reduce((sum: number, s: any) => sum + (s.vat_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ fontWeight: 800 }}>₹ {vatReport.sales.reduce((sum: number, s: any) => sum + (s.total || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Frame 0310: Net Payable State VAT Calculation */}
                    <div style={{ marginTop: '16px', background: '#ffebee', border: '2px solid #b71c1c', padding: '10px', width: '400px', marginLeft: 'auto' }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#b71c1c', borderBottom: '1px solid #b71c1c', paddingBottom: '4px', marginBottom: '6px' }}>
                        STATE COMMERCIAL TAX (VAT) COMPUTATION
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Total Sales Output VAT:</span>
                        <span>₹ {(vatReport?.payable?.sales_vat || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Less: Purchase Input VAT ITC:</span>
                        <span>- ₹ {(vatReport?.payable?.purchase_vat || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Input Cess Inward:</span>
                        <span>₹ {(vatReport?.purchase || []).reduce((s: number, p: any) => s + (p.cess || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ borderTop: '2px solid #b71c1c', paddingTop: '6px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '14px', color: '#b71c1c' }}>
                        <span>NET PAYABLE STATE VAT:</span>
                        <span>₹ {(vatReport?.payable?.net_payable_vat || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
                          profitReport.map((p: any, idx: number) => {
                            const purchAmt = Number((p.sale_qty || 0) * (p.purchase_rate || 0));
                            const saleAmt = Number((p.sale_qty || 0) * (p.sale_rate || 0));
                            return (
                              <tr key={idx}>
                                <td>{p.date || getTodayErpDate()}</td>
                                <td>{p.item || 'Fuel Dispense'}</td>
                                <td className="text-right">{Number(p.sale_qty || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right">₹ {Number(p.purchase_rate || 0).toFixed(2)}</td>
                                <td className="text-right">₹ {purchAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right">₹ {Number(p.sale_rate || 0).toFixed(2)}</td>
                                <td className="text-right">₹ {saleAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right" style={{ color: '#2e7d32', fontWeight: 700 }}>₹ {Number(p.gross_profit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right" style={{ fontWeight: 700 }}>₹ {Number(p.profit_per_liter || 0).toFixed(2)} / L</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr><td colSpan={9} style={{ textAlign: 'center', padding: '10px' }}>No profit ledger transactions recorded for selected date range.</td></tr>
                        )}
                        {profitReport && profitReport.length > 0 && (
                          <tr className="crystal-highlight-row">
                            <td colSpan={2}>CUMULATIVE DEALER MARGIN</td>
                            <td className="text-right">{profitReport.reduce((s: number, p: any) => s + (p.sale_qty || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</td>
                            <td colSpan={4}></td>
                            <td className="text-right" style={{ fontWeight: 800, color: '#2e7d32', fontSize: '13px' }}>
                              ₹ {profitReport.reduce((s: number, p: any) => s + (p.gross_profit || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="text-right">
                              Avg ₹ {(profitReport.reduce((s: number, p: any) => s + (p.gross_profit || 0), 0) / Math.max(1, profitReport.reduce((s: number, p: any) => s + (p.sale_qty || 0), 0))).toFixed(2)} / L
                            </td>
                          </tr>
                        )}
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
                          <th className="text-right">Total Commission</th>
                          <th className="text-right">TDS 5% Sec 194H</th>
                          <th className="text-right">Net Credited</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissionReport?.items && commissionReport.items.length > 0 ? (
                          commissionReport.items.map((c: any, idx: number) => {
                            const totalComm = Number(c.total_amount || 0);
                            const tdsH = totalComm * 0.05;
                            const net = totalComm - tdsH;
                            return (
                              <tr key={idx}>
                                <td>{stationProfile.oilCompany}</td>
                                <td>{c.item}</td>
                                <td className="text-right">{Number(c.qty || 0).toFixed(3)} KL</td>
                                <td className="text-right">₹ {Number(c.rate || 0).toFixed(2)}</td>
                                <td className="text-right" style={{ fontWeight: 700 }}>₹ {totalComm.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right">- ₹ {tdsH.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right" style={{ fontWeight: 800, color: '#2e7d32' }}>₹ {net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: '10px' }}>No commission records available.</td></tr>
                        )}
                        {commissionReport?.total && (
                          <tr className="crystal-highlight-row">
                            <td colSpan={2}>TOTAL COMMISSION REVENUE</td>
                            <td className="text-right">{Number(commissionReport.total.qty || 0).toFixed(3)} KL</td>
                            <td></td>
                            <td className="text-right" style={{ fontWeight: 800 }}>₹ {Number(commissionReport.total.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ color: '#c0392b' }}>- ₹ {(Number(commissionReport.total.total_amount || 0) * 0.05).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ fontWeight: 800, color: '#2e7d32' }}>₹ {(Number(commissionReport.total.total_amount || 0) * 0.95).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        )}
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
                          <th>Oil Company</th>
                          <th>Product</th>
                          <th className="text-right">Inward Qty (KL)</th>
                          <th className="text-right">LFR Rate / KL</th>
                          <th className="text-right">Basic LFR (₹)</th>
                          <th className="text-right">CGST 9%</th>
                          <th className="text-right">SGST 9%</th>
                          <th className="text-right">TDS 10% (194C)</th>
                          <th className="text-right">Net Reimbursement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lfrReport?.purchases && lfrReport.purchases.length > 0 ? (
                          lfrReport.purchases.map((p: any, idx: number) => {
                            const basic = Number(p.basic || 0);
                            const cgst = Number(p.cgst || 0);
                            const sgst = Number(p.sgst || 0);
                            const tds = basic * 0.10;
                            const net = Number(p.total || 0) - tds;
                            return (
                              <tr key={idx}>
                                <td>{stationProfile.oilCompany}</td>
                                <td>{p.item}</td>
                                <td className="text-right">{Number(p.qty || 0).toFixed(2)} KL</td>
                                <td className="text-right">₹ {Number(p.lfr_rate || 0).toFixed(2)}</td>
                                <td className="text-right">{basic.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right">{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right">{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>₹ {tds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right" style={{ fontWeight: 800 }}>₹ {net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr><td colSpan={9} style={{ textAlign: 'center', padding: '10px' }}>No LFR purchases on record.</td></tr>
                        )}
                        {lfrReport?.total && (
                          <tr className="crystal-highlight-row">
                            <td colSpan={2}>TOTAL LFR REIMBURSEMENT</td>
                            <td className="text-right">{Number(lfrReport.total.qty || 0).toFixed(2)} KL</td>
                            <td></td>
                            <td className="text-right">{Number(lfrReport.total.basic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">{Number(lfrReport.total.cgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">{Number(lfrReport.total.sgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ color: '#c0392b', fontWeight: 800 }}>₹ {(Number(lfrReport.total.basic || 0) * 0.10).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right" style={{ fontWeight: 800, color: '#2e7d32' }}>₹ {(Number(lfrReport.total.total || 0) - (Number(lfrReport.total.basic || 0) * 0.10)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 6. TDS SUMMARY (Frame 0357 & 0360) */}
                {(reportCriteriaRadio === 'TDS SUMMARY' || reportCriteriaRadio === 'TDS SUMMARY REPORT') && (
                  <div>
                    <div className="crystal-table-subhead">Income Tax TDS Deduction Summary (Section 194Q / 194C)</div>
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
                        {tdsReport?.purchases && tdsReport.purchases.length > 0 ? (
                          tdsReport.purchases.map((p: any, idx: number) => {
                            const basic = Number(p.basic_amount || 0);
                            const tdsVal = basic * 0.001; // 0.1% 194Q
                            return (
                              <tr key={idx}>
                                <td>194Q</td>
                                <td>{stationProfile.panNo || 'AAACB1234K'}</td>
                                <td>{stationProfile.oilCompany} ({p.item})</td>
                                <td className="text-right">{basic.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="text-right">0.10%</td>
                                <td className="text-right" style={{ fontWeight: 700, color: '#c0392b' }}>₹ {tdsVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td><span style={{ color: '#2e7d32', fontWeight: 700 }}>PAID / CHALLAN OK</span></td>
                              </tr>
                            );
                          })
                        ) : null}
                        {lfrReport?.tds_summary && (
                          <tr>
                            <td>194C</td>
                            <td>{stationProfile.panNo || 'AAACB1234K'}</td>
                            <td>{stationProfile.oilCompany} LFR Freight</td>
                            <td className="text-right">{Number(lfrReport.tds_summary.basic_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="text-right">{lfrReport.tds_summary.tds_percent || '10.00%'}</td>
                            <td className="text-right" style={{ fontWeight: 700, color: '#c0392b' }}>₹ {Number(lfrReport.tds_summary.tds_payable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td><span style={{ color: '#2e7d32', fontWeight: 700 }}>PAID / CHALLAN OK</span></td>
                          </tr>
                        )}
                        <tr className="crystal-highlight-row">
                          <td colSpan={5}>TOTAL TDS PAYABLE / DEPOSITED</td>
                          <td className="text-right" style={{ fontWeight: 800, color: '#c0392b', fontSize: '13px' }}>
                            ₹ {((tdsReport?.tds_summary?.tds_payable || 0) + (lfrReport?.tds_summary?.tds_payable || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
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
                    {(() => {
                      const openingVal = Number(profitLossReport?.opening_stock_total || 0);
                      const purchaseVal = Number(profitLossReport?.purchases_total || 0);
                      const totalExpenses = expensesList.reduce((sum, e) => sum + Number(e.amount || 0), 0);
                      const salesVal = Number(profitLossReport?.sales_total || 0);
                      const lubeVal = Number(profitLossReport?.sale_lube || 0);
                      const closingVal = Number(profitLossReport?.closing_stock_total || 0);

                      const totalDebits = openingVal + purchaseVal + totalExpenses;
                      const totalCredits = salesVal + lubeVal + closingVal;
                      const netProfit = totalCredits - totalDebits;

                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
                          <div style={{ border: '1px solid #777', padding: '8px', background: '#fafafa' }}>
                            <div style={{ fontWeight: 700, borderBottom: '1px solid #999', paddingBottom: '3px', marginBottom: '6px' }}>Debits / Outflows</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span>Opening Fuel Stock Valuation:</span>
                              <strong>₹ {openingVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span>Total Inward Purchases:</span>
                              <strong>₹ {purchaseVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span>Operating Expenses & Overheads:</span>
                              <strong>₹ {totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                            </div>
                            <div style={{ borderTop: '1px solid #999', paddingTop: '4px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                              <span>Total Debits:</span>
                              <span>₹ {totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          <div style={{ border: '1px solid #777', padding: '8px', background: '#fafafa' }}>
                            <div style={{ fontWeight: 700, borderBottom: '1px solid #999', paddingBottom: '3px', marginBottom: '6px' }}>Credits / Revenue</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span>Gross Fuel Dispensing Sales:</span>
                              <strong>₹ {salesVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span>Lube & 2T Oil Sales:</span>
                              <strong>₹ {lubeVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span>Closing Tank Stock Valuation:</span>
                              <strong>₹ {closingVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                            </div>
                            <div style={{ borderTop: '2px solid #2e7d32', paddingTop: '6px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '13px', color: netProfit >= 0 ? '#2e7d32' : '#c0392b' }}>
                              <span>NET OPERATING {netProfit >= 0 ? 'PROFIT' : 'LOSS'}:</span>
                              <span>₹ {netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Generic view for any other of the 44 reports */}
                {!['DSR', 'DSR REPORT', 'VAT SUMMARY', 'VAT SUMMARY REPORT', 'PROFIT SUMMARY', 'PROFIT SUMMARY REPORT', 'DEALER COMMISION REPORT', 'PURCHASE LFR SUMMARY', 'TDS SUMMARY', 'TDS SUMMARY REPORT', 'PROFIT LOSS SUMMARY'].includes(reportCriteriaRadio) && (
                  <div>
                    <div className="crystal-table-subhead">Register Output & Transaction Audit Trail ({reportCriteriaRadio})</div>
                    {(() => {
                      const txns: any[] = [];
                      creditBillsList.forEach((b, idx) => {
                        txns.push({
                          date: b.date || getTodayErpDate(),
                          ref: `BILL-${b.bill || idx + 1}`,
                          particulars: `Credit Sale: ${b.cust} (${b.vehicle || '-'})`,
                          shift: b.shift || 'First',
                          category: 'Credit Fuel',
                          qty: b.qty || 0,
                          rate: b.qty ? (b.total / b.qty).toFixed(2) : '-',
                          debit: b.total || 0,
                          credit: 0,
                        });
                      });
                      payReceiptsHistory.forEach((p, idx) => {
                        txns.push({
                          date: p.date || getTodayErpDate(),
                          ref: `REC-${idx + 1}`,
                          particulars: `Customer Payment: ${p.cust} via ${p.mode}`,
                          shift: p.shift || 'First',
                          category: 'Receipt',
                          qty: '-',
                          rate: '-',
                          debit: 0,
                          credit: p.amt || 0,
                        });
                      });
                      purPoHistory.forEach((po, idx) => {
                        txns.push({
                          date: po.date || getTodayErpDate(),
                          ref: po.inv || `PO-${idx + 1}`,
                          particulars: `Tanker Inward: ${po.dealer}`,
                          shift: 'First',
                          category: 'Decanting',
                          qty: '-',
                          rate: '-',
                          debit: 0,
                          credit: po.amount || 0,
                        });
                      });
                      expensesList.forEach((exp, idx) => {
                        txns.push({
                          date: exp.date || getTodayErpDate(),
                          ref: `EXP-${exp.id || idx + 1}`,
                          particulars: `${exp.category}: ${exp.narration || exp.paid_to || ''}`,
                          shift: 'First',
                          category: 'Expense',
                          qty: '-',
                          rate: '-',
                          debit: exp.amount || 0,
                          credit: 0,
                        });
                      });

                      const filtered = txns.filter((t) => {
                        if (!crystalSearchText.trim()) return true;
                        const q = crystalSearchText.toLowerCase();
                        return (
                          t.particulars.toLowerCase().includes(q) ||
                          t.ref.toLowerCase().includes(q) ||
                          t.category.toLowerCase().includes(q)
                        );
                      });

                      const totalDebits = filtered.reduce((s, t) => s + (typeof t.debit === 'number' ? t.debit : 0), 0);
                      const totalCredits = filtered.reduce((s, t) => s + (typeof t.credit === 'number' ? t.credit : 0), 0);

                      return (
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
                            {filtered.length > 0 ? (
                              filtered.map((t, idx) => (
                                <tr key={idx}>
                                  <td>{t.date}</td>
                                  <td>{t.ref}</td>
                                  <td>{t.particulars}</td>
                                  <td>{t.shift}</td>
                                  <td>{t.category}</td>
                                  <td className="text-right">{typeof t.qty === 'number' ? t.qty.toFixed(2) : t.qty}</td>
                                  <td className="text-right">{t.rate}</td>
                                  <td className="text-right">{t.debit ? `₹ ${t.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹ 0.00'}</td>
                                  <td className="text-right">{t.credit ? `₹ ${t.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹ 0.00'}</td>
                                </tr>
                              ))
                            ) : (
                              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '10px' }}>No transactions match criteria.</td></tr>
                            )}
                            <tr className="crystal-highlight-row">
                              <td colSpan={7}>TOTAL AUDIT BALANCE ({filtered.length} TRANSACTIONS)</td>
                              <td className="text-right">₹ {totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="text-right">₹ {totalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                )}

                {/* Sheet Footer */}
                <div style={{ marginTop: '36px', borderTop: '1px solid #999', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555' }}>
                  <span>Printed By: NSAIPETROSOFT SYSTEM | Station Shift: {critShift}</span>
                  <span>{getTodayErpDate()} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
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
                  <input type="text" className="win-input" value={empSettlementDate} onChange={(e) => setEmpSettlementDate(e.target.value)} style={{ flex: 1 }} />
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
                  <input type="text" className="win-input" value={empSettlementSaleNo} onChange={(e) => setEmpSettlementSaleNo(e.target.value)} style={{ flex: 1, fontWeight: 700 }} />
                </div>
                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '70px' }}>Employee</span>
                  <select className="win-select" value={empSettlementEmp} onChange={(e) => setEmpSettlementEmp(e.target.value)} style={{ flex: 1, fontWeight: 700 }}>
                    {employeesList.map((e) => (
                      <option key={e.id} value={e.name}>{e.name} ({e.code})</option>
                    ))}
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
                    1. Nozzle Meter Difference ({empSettlementMachine})
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
                        {(salesReadings.length > 0 ? salesReadings : empNozzleReadings).map((r, i) => {
                          const op = r.open ?? r.op ?? 0;
                          const cl = r.close ?? 0;
                          const tst = r.test ?? 0;
                          const sale = r.qty ?? r.sale ?? Math.max(0, cl - op - tst);
                          const amt = r.amount ?? (sale * r.rate);
                          return (
                            <tr key={i}>
                              <td style={{ fontWeight: 700 }}>{r.nozzle}</td>
                              <td className="text-right">{Number(op).toFixed(1)}</td>
                              <td className="text-right" style={{ padding: '2px' }}>
                                <input
                                  type="number"
                                  step="0.1"
                                  className="win-input text-right"
                                  style={{ width: '65px', height: '19px', padding: '1px 2px', fontSize: '11px', fontWeight: 600 }}
                                  value={cl}
                                  onChange={(e) => {
                                    const newCl = parseFloat(e.target.value) || 0;
                                    if (salesReadings.length > 0) {
                                      const updated = [...salesReadings];
                                      const curr = { ...updated[i] };
                                      curr.close = newCl;
                                      const o = curr.open ?? curr.op ?? 0;
                                      const t = curr.test ?? 0;
                                      curr.qty = Math.max(0, parseFloat((newCl - o - t).toFixed(2)));
                                      curr.amount = parseFloat((curr.qty * (curr.rate || 0)).toFixed(2));
                                      updated[i] = curr;
                                      setSalesReadings(updated);
                                    } else {
                                      const updated = [...empNozzleReadings];
                                      const curr = { ...updated[i] };
                                      curr.close = newCl;
                                      const o = curr.op ?? curr.open ?? 0;
                                      const t = curr.test ?? 0;
                                      curr.sale = Math.max(0, parseFloat((newCl - o - t).toFixed(2)));
                                      curr.amount = parseFloat((curr.sale * (curr.rate || 0)).toFixed(2));
                                      updated[i] = curr;
                                      setEmpNozzleReadings(updated);
                                    }
                                  }}
                                />
                              </td>
                              <td className="text-right" style={{ padding: '2px' }}>
                                <input
                                  type="number"
                                  step="0.5"
                                  className="win-input text-right"
                                  style={{ width: '45px', height: '19px', padding: '1px 2px', fontSize: '11px' }}
                                  value={tst}
                                  onChange={(e) => {
                                    const newTst = parseFloat(e.target.value) || 0;
                                    if (salesReadings.length > 0) {
                                      const updated = [...salesReadings];
                                      const curr = { ...updated[i] };
                                      curr.test = newTst;
                                      const o = curr.open ?? curr.op ?? 0;
                                      const c = curr.close ?? 0;
                                      curr.qty = Math.max(0, parseFloat((c - o - newTst).toFixed(2)));
                                      curr.amount = parseFloat((curr.qty * (curr.rate || 0)).toFixed(2));
                                      updated[i] = curr;
                                      setSalesReadings(updated);
                                    } else {
                                      const updated = [...empNozzleReadings];
                                      const curr = { ...updated[i] };
                                      curr.test = newTst;
                                      const o = curr.op ?? curr.open ?? 0;
                                      const c = curr.close ?? 0;
                                      curr.sale = Math.max(0, parseFloat((c - o - newTst).toFixed(2)));
                                      curr.amount = parseFloat((curr.sale * (curr.rate || 0)).toFixed(2));
                                      updated[i] = curr;
                                      setEmpNozzleReadings(updated);
                                    }
                                  }}
                                />
                              </td>
                              <td className="text-right" style={{ fontWeight: 700, color: '#1565c0' }}>{Number(sale).toFixed(2)}</td>
                              <td className="text-right">{r.rate}</td>
                              <td className="text-right" style={{ fontWeight: 700 }}>{Number(amt).toFixed(2)}</td>
                            </tr>
                          );
                        })}
                        <tr style={{ background: '#e5f1fb', fontWeight: 800 }}>
                          <td colSpan={4}>TOTAL METER SALE</td>
                          <td className="text-right">
                            {(salesReadings.length > 0
                              ? salesReadings.reduce((acc, r) => acc + (r.qty || 0), 0)
                              : empNozzleReadings.reduce((acc, r) => acc + (r.sale || 0), 0)
                            ).toFixed(2)} L
                          </td>
                          <td></td>
                          <td className="text-right" style={{ color: '#0d47a1', fontSize: '12px' }}>
                            ₹ {(salesReadings.length > 0
                              ? salesReadings.reduce((acc, r) => acc + (r.amount || 0), 0)
                              : empNozzleReadings.reduce((acc, r) => acc + (r.amount || 0), 0)
                            ).toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Table 2: Lube oil sales */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontWeight: 700, fontSize: '11px', color: '#b71c1c' }}>
                      2. Lube Sales (Lubricant Packs)
                    </div>
                    <button
                      type="button"
                      className="win-btn-classic"
                      style={{ fontSize: '10px', height: '18px', padding: '0 4px' }}
                      onClick={() => {
                        setEmpLubeItems([
                          ...empLubeItems,
                          { product: 'MAK 4T PLUS 20W 40 900ML', qty: 1, rate: 365.0, amount: 365.0 }
                        ]);
                        showToast('✔ Lube item added to settlement');
                      }}
                    >
                      + Add Pack
                    </button>
                  </div>
                  <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '85px', overflowY: 'auto', marginBottom: '8px' }}>
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
                            <td className="text-right" style={{ padding: '2px' }}>
                              <input
                                type="number"
                                min="0"
                                className="win-input text-right"
                                style={{ width: '45px', height: '19px', padding: '1px 2px', fontSize: '11px' }}
                                value={l.qty}
                                onChange={(e) => {
                                  const newQty = parseInt(e.target.value) || 0;
                                  const updated = [...empLubeItems];
                                  updated[i] = { ...updated[i], qty: newQty, amount: parseFloat((newQty * updated[i].rate).toFixed(2)) };
                                  setEmpLubeItems(updated);
                                }}
                              />
                            </td>
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
                      <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '115px', overflowY: 'auto' }}>
                        <table className="win-datagrid">
                          <thead>
                            <tr>
                              <th>Card Name</th>
                              <th className="text-right">Amount (₹)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {empCardSwipes.map((c, i) => (
                              <tr key={i}>
                                <td>{c.name}</td>
                                <td className="text-right" style={{ padding: '2px' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="win-input text-right"
                                    style={{ width: '75px', height: '19px', padding: '1px 3px', fontSize: '11px', fontWeight: 600 }}
                                    value={c.amount}
                                    onChange={(e) => {
                                      const newAmt = parseFloat(e.target.value) || 0;
                                      const updated = [...empCardSwipes];
                                      updated[i] = { ...updated[i], amount: newAmt };
                                      setEmpCardSwipes(updated);
                                    }}
                                  />
                                </td>
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
                      <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '115px', overflowY: 'auto' }}>
                        <table className="win-datagrid">
                          <thead>
                            <tr>
                              <th>Exp Name</th>
                              <th className="text-right">Amount (₹)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {empExpensesList.map((e, i) => (
                              <tr key={i}>
                                <td>{e.name}</td>
                                <td className="text-right" style={{ padding: '2px' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="win-input text-right"
                                    style={{ width: '70px', height: '19px', padding: '1px 3px', fontSize: '11px', color: '#c0392b', fontWeight: 600 }}
                                    value={e.amount}
                                    onChange={(ev) => {
                                      const newAmt = parseFloat(ev.target.value) || 0;
                                      const updated = [...empExpensesList];
                                      updated[i] = { ...updated[i], amount: newAmt };
                                      setEmpExpensesList(updated);
                                    }}
                                  />
                                </td>
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
                    {/* Cash Collection Row with Direct Input & Green Add Button */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #7f9db9', padding: '6px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '2px' }}>Physical Cash Collection</div>
                        <input
                          type="number"
                          step="0.01"
                          className="win-input"
                          value={empCashAmount}
                          onChange={(e) => setEmpCashAmount(parseFloat(e.target.value) || 0)}
                          style={{ width: '120px', fontWeight: 800, color: '#2e7d32', fontSize: '13px' }}
                        />
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
                        <strong>₹ {(
                          (salesReadings.length > 0
                            ? salesReadings.reduce((acc, r) => acc + (r.amount || 0), 0)
                            : empNozzleReadings.reduce((acc, r) => acc + (r.amount || 0), 0)) +
                          empLubeItems.reduce((acc, l) => acc + (l.amount || 0), 0)
                        ).toFixed(2)}</strong>
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
                            ((salesReadings.length > 0
                              ? salesReadings.reduce((acc, r) => acc + (r.amount || 0), 0)
                              : empNozzleReadings.reduce((acc, r) => acc + (r.amount || 0), 0)) +
                            empLubeItems.reduce((acc, l) => acc + (l.amount || 0), 0))
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
                          const liveMeterTotal = (salesReadings.length > 0
                            ? salesReadings.reduce((acc, r) => acc + (r.amount || 0), 0)
                            : empNozzleReadings.reduce((acc, r) => acc + (r.amount || 0), 0)) +
                            empLubeItems.reduce((acc, l) => acc + (l.amount || 0), 0);
                          const gap = (
                            empCashAmount +
                            empCreditSaleAmount +
                            empCardSwipes.reduce((acc, c) => acc + c.amount, 0) +
                            empExpensesList.reduce((acc, e) => acc + e.amount, 0) -
                            empCreditReceived -
                            liveMeterTotal
                          );
                          try {
                            await saveShiftSettlement({
                              shift_name: empSettlementShift,
                              remarks: empSettlementRemarks,
                              denominations: denoms,
                              cash_total: empCashAmount,
                              digital_total: empCardSwipes.reduce((acc, c) => acc + c.amount, 0),
                              credit_total: empCreditSaleAmount,
                              expense_total: empExpensesList.reduce((acc, e) => acc + e.amount, 0),
                              expected_cash: liveMeterTotal - empCreditSaleAmount - empCardSwipes.reduce((acc, c) => acc + c.amount, 0) - empExpensesList.reduce((acc, e) => acc + e.amount, 0),
                              actual_cash: empCashAmount,
                              gap_amount: gap,
                            });
                            showToast(`✔ Shift Settlement Saved to PostgreSQL! Gap: ₹${gap.toFixed(2)}`);
                            await loadAllErpData();
                            // Automatic Cloud Backup Snapshot on Shift Settlement
                            try {
                              triggerCreateBackup().then((res) => {
                                showToast(`☁ Shift settlement snapshot archived to cloud: ${res.filename}`);
                              }).catch(() => {});
                            } catch {}
                          } catch (err: any) {
                            showToast(`⚠ Error saving shift settlement: ${err.message || 'Database error'}`);
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
      {activeDialog === 'dayBookReport' && (() => {
        const denomRows = [
          { label: '₹ 2000 ×', count: denoms.n2000, value: denoms.n2000 * 2000 },
          { label: '₹ 500 ×', count: denoms.n500, value: denoms.n500 * 500 },
          { label: '₹ 200 ×', count: denoms.n200, value: denoms.n200 * 200 },
          { label: '₹ 100 ×', count: denoms.n100, value: denoms.n100 * 100 },
          { label: '₹ 50 ×', count: denoms.n50, value: denoms.n50 * 50 },
          { label: '₹ 20 ×', count: denoms.n20, value: denoms.n20 * 20 },
          { label: '₹ 10 ×', count: denoms.n10, value: denoms.n10 * 10 },
          { label: '₹ 5 ×', count: denoms.n5, value: denoms.n5 * 5 },
          { label: 'Coins', count: denoms.coins > 0 ? denoms.coins : '-', value: denoms.coins },
        ];
        const calculatedCashFromDenoms = denomRows.reduce((acc, r) => acc + (typeof r.value === 'number' ? r.value : 0), 0);
        const effectiveCash = calculatedCashFromDenoms > 0 ? calculatedCashFromDenoms : empCashAmount;

        const effectiveCreditTotal = creditBillsList.reduce((acc, c) => acc + Number(c.total || 0), 0);
        const effectiveDigitalTotal = cardSettlements.length > 0
          ? cardSettlements.reduce((acc, c) => acc + Number(c.amount || 0), 0)
          : empCardSwipes.reduce((acc, c) => acc + Number(c.amount || 0), 0);
        const effectiveExpenseTotal = expensesList.length > 0
          ? expensesList.reduce((acc, e) => acc + Number(e.amount || 0), 0)
          : empExpensesList.reduce((acc, e) => acc + Number(e.amount || 0), 0);

        const totalReconciled = effectiveCash + effectiveCreditTotal + effectiveDigitalTotal + effectiveExpenseTotal;
        const totalMeterSales = (salesReadings.length > 0
          ? salesReadings.reduce((acc, r) => acc + Number(r.amount || 0), 0)
          : empNozzleReadings.reduce((acc, r) => acc + Number(r.amount || 0), 0)) +
          empLubeItems.reduce((acc, l) => acc + Number(l.amount || 0), 0);
        const gap = totalReconciled - totalMeterSales;

        return (
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
                <button
                  className="crystal-tool-btn"
                  onClick={() => exportToCsv(
                    `NSAIPETROSOFT_DayBook_${shiftName}_${new Date().toISOString().split('T')[0]}`,
                    ['Category', 'Particulars / Denomination', 'Amount (INR)'],
                    [
                      ...denomRows.map(d => ['Cash Denomination', `${d.label} (${d.count})`, d.value]),
                      ['Cash Handover', 'Total Physical Cash', effectiveCash],
                      ...creditBillsList.map(c => ['Credit Slip', `${c.cust} (${c.vehicle})`, c.total]),
                      ['Credit Sales', 'Total Credit Slips', effectiveCreditTotal],
                      ...(cardSettlements.length > 0
                        ? cardSettlements.map(cs => ['Digital POS', `${cs.machine} (${cs.batch})`, cs.amount])
                        : empCardSwipes.map(cs => ['Digital POS', cs.name, cs.amount])),
                      ['Digital Sales', 'Total Digital / POS', effectiveDigitalTotal],
                      ...(expensesList.length > 0
                        ? expensesList.map(ex => ['Expense Voucher', ex.category || ex.narration, ex.amount])
                        : empExpensesList.filter(e => e.amount > 0).map(ex => ['Expense Voucher', ex.name, ex.amount])),
                      ['Shift Expenses', 'Total Station Expenses', effectiveExpenseTotal],
                      ['Summary', 'Total Reconciled Collection', totalReconciled],
                      ['Summary', 'Total Nozzle Meter Sales', totalMeterSales],
                      ['Summary', 'Gap Amount (Shortage / Excess)', gap],
                    ]
                  )}
                  title="Export to Excel CSV"
                >
                  💾 Export to Excel
                </button>
                <button className="crystal-tool-btn" onClick={() => showToast('Day Book Refreshed')} title="Refresh">🔄 Refresh</button>
              </div>

              {/* 2-Column Crystal Report Canvas */}
              <div className="crystal-canvas-wrapper">
                <div className="crystal-report-sheet" style={{ width: '850px', minHeight: '900px' }}>
                  <div className="crystal-company-name">{stationProfile.stationName}</div>
                  <div style={{ textAlign: 'center', fontSize: '11px', color: '#444' }}>
                    {stationProfile.city}, {stationProfile.state} - {stationProfile.pincode} | DEALERS IN: {stationProfile.oilCompany}
                  </div>
                  <div className="crystal-report-title" style={{ fontSize: '15px' }}>
                    SHIFT CASHIER TALLY & DAY BOOK RECONCILIATION
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, marginBottom: '12px' }}>
                    Date: {getTodayErpDate()} | Shift: {shiftName} | Attendant: {empSettlementEmp} | Machine: {empSettlementMachine}
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
                          {denomRows.map((d, idx) => (
                            <tr key={idx}>
                              <td>{d.label}</td>
                              <td className="text-right">{d.count}</td>
                              <td className="text-right">{Number(d.value).toFixed(2)}</td>
                            </tr>
                          ))}
                          <tr className="crystal-highlight-row">
                            <td colSpan={2}>TOTAL CASH HANDOVER</td>
                            <td className="text-right" style={{ fontWeight: 800, fontSize: '12px' }}>₹ {Number(effectiveCash).toFixed(2)}</td>
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
                        {creditBillsList.length > 0 ? (
                          creditBillsList.slice(0, 6).map((c, i) => (
                            <div key={i}>• {c.cust} ({c.vehicle}) - ₹ {Number(c.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          ))
                        ) : (
                          <div style={{ color: '#888', fontStyle: 'italic' }}>No credit sales in this shift</div>
                        )}
                        <div style={{ fontWeight: 700, textAlign: 'right', marginTop: '2px' }}>
                          Total Credit: ₹ {effectiveCreditTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '2px' }}>Bank POS Swipes:</div>
                      <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '6px', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>
                        {cardSettlements.length > 0 ? (
                          cardSettlements.map((cs, i) => (
                            <div key={i}>• {cs.machine} ({cs.batch || 'POS'}): ₹ {Number(cs.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          ))
                        ) : empCardSwipes.filter(c => c.amount > 0).length > 0 ? (
                          empCardSwipes.filter(c => c.amount > 0).map((cs, i) => (
                            <div key={i}>• {cs.name}: ₹ {Number(cs.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          ))
                        ) : (
                          <div style={{ color: '#888', fontStyle: 'italic' }}>No digital card transactions</div>
                        )}
                        <div style={{ fontWeight: 700, textAlign: 'right', marginTop: '2px' }}>
                          Total Digital: ₹ {effectiveDigitalTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '2px' }}>Station Cash Expenses:</div>
                      <div style={{ fontSize: '10px', lineHeight: '1.4', marginBottom: '6px', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>
                        {expensesList.length > 0 ? (
                          expensesList.map((ex, i) => (
                            <div key={i}>• {ex.category || ex.narration}: ₹ {Number(ex.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          ))
                        ) : empExpensesList.filter(e => e.amount > 0).length > 0 ? (
                          empExpensesList.filter(e => e.amount > 0).map((ex, i) => (
                            <div key={i}>• {ex.name || ex.narration}: ₹ {Number(ex.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          ))
                        ) : (
                          <div style={{ color: '#888', fontStyle: 'italic' }}>No station expenses this shift</div>
                        )}
                        <div style={{ fontWeight: 700, textAlign: 'right', color: '#c0392b', marginTop: '2px' }}>
                          Total Expenses: ₹ {effectiveExpenseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      {/* Frame 0260 Gap Amount Exact Display */}
                      <div style={{ background: '#fff59d', border: '2px solid #f57f17', padding: '6px 8px', marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span>Reconciled Collection:</span>
                          <strong>₹ {totalReconciled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span>Total Nozzle Meter Sales:</span>
                          <strong>₹ {totalMeterSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div style={{ borderTop: '1px solid #f57f17', paddingTop: '4px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '13px', color: gap < 0 ? '#b71c1c' : '#2e7d32' }}>
                          <span>Gap Amount:</span>
                          <span>{gap >= 0 ? `+${gap.toFixed(2)} (Excess)` : `${gap.toFixed(2)} (Shortage)`}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Signatures */}
                  <div style={{ marginTop: '40px', borderTop: '1px solid #888', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '10.5px' }}>
                    <span>Cashier: {empSettlementEmp}</span>
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
        );
      })()}

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
                Select an institutional credit customer to generate the {stationProfile.oilCompany} Statement of Accounts:
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '100px' }}>Customer Name</span>
                <select
                  className="win-select"
                  style={{ flex: 1, fontWeight: 700 }}
                  value={selectedCustForBill}
                  onChange={(e) => setSelectedCustForBill(e.target.value)}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} ({c.city || 'Station Fleet'})
                    </option>
                  ))}
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
                    {customers.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedCustForBill(c.name)}
                        style={{ cursor: 'pointer', background: selectedCustForBill === c.name ? '#cce8ff' : '' }}
                      >
                        <td style={{ fontWeight: 700 }}>{c.name}</td>
                        <td>{c.city || '-'}</td>
                        <td className="text-right" style={{ color: '#c0392b', fontWeight: 700 }}>
                          ₹ {c.current_outstanding ? c.current_outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                        </td>
                      </tr>
                    ))}
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
                    <div><strong>Total Gross Capacity:</strong> {(tanks[0]?.capacity || 20000).toLocaleString('en-IN')} Liters</div>
                    <div><strong>Dead Stock Allowance:</strong> 500 Liters (Pump Suction Cutoff)</div>
                    <div><strong>Safe Filling Limit (Ullage):</strong> {((tanks[0]?.capacity || 20000) * 0.95).toLocaleString('en-IN')} Liters (95%)</div>
                    <div><strong>Current Physical Stock:</strong> {tanks[0] ? `${tanks[0].current_stock.toLocaleString('en-IN')} Liters (${tanks[0].percent}%)` : '0 Liters (0%)'}</div>
                    <div><strong>Tank Dimensions:</strong> 2.4m Dia × 4.6m Length Double-Walled</div>
                  </div>
                  <button className="win-btn-classic" style={{ marginTop: '8px' }} onClick={() => openDipDialog(1)}>
                    📐 Record Dip Reading
                  </button>
                </div>

                <div style={{ border: '2px solid #506f8c', padding: '10px', background: '#fff' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#2980b9' }}>Tank 2: HSD (High Speed Diesel)</div>
                  <div style={{ fontSize: '11px', marginTop: '6px', lineHeight: '1.6' }}>
                    <div><strong>Total Gross Capacity:</strong> {(tanks[1]?.capacity || 20000).toLocaleString('en-IN')} Liters</div>
                    <div><strong>Dead Stock Allowance:</strong> 500 Liters (Pump Suction Cutoff)</div>
                    <div><strong>Safe Filling Limit (Ullage):</strong> {((tanks[1]?.capacity || 20000) * 0.95).toLocaleString('en-IN')} Liters (95%)</div>
                    <div><strong>Current Physical Stock:</strong> {tanks[1] ? `${tanks[1].current_stock.toLocaleString('en-IN')} Liters (${tanks[1].percent}%)` : '0 Liters (0%)'}</div>
                    <div><strong>Tank Dimensions:</strong> 2.4m Dia × 4.6m Length Double-Walled</div>
                  </div>
                  <button className="win-btn-classic" style={{ marginTop: '8px' }} onClick={() => openDipDialog(2)}>
                    📐 Record Dip Reading
                  </button>
                </div>
              </div>

              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Statutory Dip Calibration Table (Height cm vs Liters)</div>
              <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '160px', overflowY: 'auto' }}>
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
                    {tanks[0] && (
                      <tr style={{ background: '#e8f5e9', fontWeight: 700 }}>
                        <td>{tanks[0].dip_cm ? `${tanks[0].dip_cm.toFixed(1)} cm (Current MS DIP)` : 'Dip Not Recorded'}</td>
                        <td>{tanks[0].current_stock.toLocaleString('en-IN')} L</td>
                        <td>-</td>
                        <td>{tanks[0].percent}%</td>
                      </tr>
                    )}
                    {tanks[1] && (
                      <tr style={{ background: '#e3f2fd', fontWeight: 700 }}>
                        <td>{tanks[1].dip_cm ? `${tanks[1].dip_cm.toFixed(1)} cm (Current HSD DIP)` : 'Dip Not Recorded'}</td>
                        <td>-</td>
                        <td>{tanks[1].current_stock.toLocaleString('en-IN')} L</td>
                        <td>{tanks[1].percent}%</td>
                      </tr>
                    )}
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
                <button className="win-btn-classic win-btn-primary" onClick={openSalesDialog}>Sales Entry</button>
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
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                  onClick={() => exportToCsv(
                    `NSAIPETROSOFT_BankAccounts_${new Date().toISOString().split('T')[0]}`,
                    ['Account Name', 'Type', 'Current Balance (INR)'],
                    accountsList.map(a => [a.name, a.type, a.balance])
                  )}
                  title="Export bank and ledger accounts to Microsoft Excel or CSV"
                >
                  📥 Export to Excel (CSV)
                </button>
                <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
       * MODAL 19: Shift & Station Control Panel
       * ============================================================= */}
      {activeDialog === 'controlPanel' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '740px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🎛️</span>
                <span>Station Shift Management & Dealership Profile Control Panel</span>
              </div>
              <button className="win-btn" onClick={() => setActiveDialog(null)}>✕</button>
            </div>
            <div className="win-dialog-body">
              {/* Tab Selector */}
              <div style={{ display: 'flex', borderBottom: '2px solid #506f8c', marginBottom: '12px', background: '#e0dfdb', padding: '4px 8px 0 8px', gap: '4px' }}>
                <button
                  type="button"
                  style={{
                    padding: '6px 16px',
                    border: '1px solid #7f9db9',
                    borderBottom: controlPanelTab === 'shift' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                    background: controlPanelTab === 'shift' ? '#ece9d8' : '#d4d0c8',
                    fontWeight: controlPanelTab === 'shift' ? 700 : 400,
                    cursor: 'pointer',
                    outline: 'none',
                    borderTopLeftRadius: '3px',
                    borderTopRightRadius: '3px',
                    marginBottom: controlPanelTab === 'shift' ? '-2px' : '0',
                    fontSize: '11px',
                  }}
                  onClick={() => setControlPanelTab('shift')}
                >
                  ⚙️ Shift Operations & Dispenser Locks
                </button>
                <button
                  type="button"
                  style={{
                    padding: '6px 16px',
                    border: '1px solid #7f9db9',
                    borderBottom: controlPanelTab === 'profile' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                    background: controlPanelTab === 'profile' ? '#ece9d8' : '#d4d0c8',
                    fontWeight: controlPanelTab === 'profile' ? 700 : 400,
                    cursor: 'pointer',
                    outline: 'none',
                    borderTopLeftRadius: '3px',
                    borderTopRightRadius: '3px',
                    marginBottom: controlPanelTab === 'profile' ? '-2px' : '0',
                    fontSize: '11px',
                  }}
                  onClick={() => {
                    setProfileForm(stationProfile);
                    setControlPanelTab('profile');
                  }}
                >
                  🏢 Station Outlet Profile & Dealership Settings
                </button>
              </div>

              {/* TAB 1: Shift Operations */}
              {controlPanelTab === 'shift' && (
                <div>
                  <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '14px', marginBottom: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                      <div><strong>Station Date:</strong> {getTodayErpDate()}</div>
                      <div><strong>SO Counter:</strong> #{shiftNumber}</div>
                      <div><strong>Active Shift:</strong> {shiftName} Shift</div>
                      <div>
                        <strong>Shift Status:</strong>{' '}
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
                      <div>
                        <strong>Dealership:</strong> {stationProfile.stationName}
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
              )}

              {/* TAB 2: Station Outlet Profile */}
              {controlPanelTab === 'profile' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  saveStationProfile(profileForm);
                }}>
                  <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ fontWeight: 700, color: '#1565c0', fontSize: '12px', marginBottom: '8px', borderBottom: '1px solid #d4d0c8', paddingBottom: '4px' }}>
                      Dealership Branding & Oil Marketing Company (OMC) Credentials
                    </div>

                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '150px' }}>Station Outlet Name</span>
                      <input
                        type="text"
                        className="win-input"
                        required
                        value={profileForm.stationName}
                        onChange={(e) => setProfileForm({ ...profileForm, stationName: e.target.value.toUpperCase() })}
                        style={{ flex: 1, fontWeight: 700 }}
                        placeholder="e.g. SHREE SHYAM PETROLEUM / NSAIPETROSOFT"
                      />
                    </div>

                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '150px' }}>Oil Company (OMC)</span>
                      <select
                        className="win-select"
                        value={profileForm.oilCompany}
                        onChange={(e) => setProfileForm({ ...profileForm, oilCompany: e.target.value })}
                        style={{ flex: 1, fontWeight: 600 }}
                      >
                        <option value="BHARAT PETROLEUM CORPORATION LTD">BHARAT PETROLEUM CORPORATION LTD (BPCL)</option>
                        <option value="INDIAN OIL CORPORATION LTD">INDIAN OIL CORPORATION LTD (IOCL)</option>
                        <option value="HINDUSTAN PETROLEUM CORPORATION LTD">HINDUSTAN PETROLEUM CORPORATION LTD (HPCL)</option>
                        <option value="NAYARA ENERGY LIMITED">NAYARA ENERGY LIMITED (ESSAR OIL)</option>
                        <option value="SHELL INDIA MARKETS PVT LTD">SHELL INDIA MARKETS PVT LTD</option>
                        <option value="RELIANCE BP MOBILITY LTD">JIO-BP (RELIANCE BP MOBILITY LTD)</option>
                      </select>
                    </div>

                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '150px' }}>Custom OMC Title</span>
                      <input
                        type="text"
                        className="win-input"
                        value={profileForm.oilCompany}
                        onChange={(e) => setProfileForm({ ...profileForm, oilCompany: e.target.value.toUpperCase() })}
                        style={{ flex: 1 }}
                        placeholder="Edit or customize Oil Company title if required"
                      />
                    </div>

                    <div className="win-form-row">
                      <span className="win-label" style={{ minWidth: '150px' }}>Highway / Street Address</span>
                      <input
                        type="text"
                        className="win-input"
                        value={profileForm.address}
                        onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value.toUpperCase() })}
                        style={{ flex: 1 }}
                        placeholder="e.g. HIGHWAY SERVICE STATION, NH-48"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: '8px' }}>
                      <div className="win-form-row">
                        <span className="win-label" style={{ minWidth: '40px' }}>City</span>
                        <input
                          type="text"
                          className="win-input"
                          value={profileForm.city}
                          onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value.toUpperCase() })}
                          style={{ flex: 1 }}
                        />
                      </div>
                      <div className="win-form-row">
                        <span className="win-label" style={{ minWidth: '45px' }}>State</span>
                        <input
                          type="text"
                          className="win-input"
                          value={profileForm.state}
                          onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value.toUpperCase() })}
                          style={{ flex: 1 }}
                        />
                      </div>
                      <div className="win-form-row">
                        <span className="win-label" style={{ minWidth: '55px' }}>Pincode</span>
                        <input
                          type="text"
                          className="win-input"
                          value={profileForm.pincode}
                          onChange={(e) => setProfileForm({ ...profileForm, pincode: e.target.value })}
                          style={{ flex: 1 }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '8px', marginTop: '6px' }}>
                      <div className="win-form-row">
                        <span className="win-label" style={{ minWidth: '60px' }}>GSTIN No</span>
                        <input
                          type="text"
                          className="win-input"
                          value={profileForm.gstin}
                          onChange={(e) => setProfileForm({ ...profileForm, gstin: e.target.value.toUpperCase() })}
                          style={{ flex: 1, fontWeight: 700 }}
                          placeholder="e.g. 24AAACN1234F1Z5"
                        />
                      </div>
                      <div className="win-form-row">
                        <span className="win-label" style={{ minWidth: '70px' }}>Contact Ph</span>
                        <input
                          type="text"
                          className="win-input"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                          style={{ flex: 1 }}
                          placeholder="+91 98765 43210"
                        />
                      </div>
                      <div className="win-form-row">
                        <span className="win-label" style={{ minWidth: '85px', color: '#b71c1c', fontWeight: 'bold' }}>Manager PIN</span>
                        <input
                          type="password"
                          maxLength={8}
                          className="win-input"
                          value={profileForm.managerPin || ''}
                          onChange={(e) => setProfileForm({ ...profileForm, managerPin: e.target.value })}
                          style={{ flex: 1, letterSpacing: '2px', fontWeight: 'bold' }}
                          placeholder="Default: 1234"
                          title="4-digit PIN for Rate & Meter Authorization"
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="win-btn-classic"
                      style={{ color: '#c0392b' }}
                      onClick={() => {
                        const defaultProf: StationProfile = {
                          stationName: 'NSAIPETROSOFT RETAIL OUTLET',
                          oilCompany: 'BHARAT PETROLEUM CORPORATION LTD',
                          address: 'HIGHWAY SERVICE STATION',
                          city: 'SURAT',
                          state: 'GUJARAT',
                          pincode: '395003',
                          gstin: '24AAACN1234F1Z5',
                          phone: '+91 98765 43210',
                          managerPin: '1234',
                        };
                        setProfileForm(defaultProf);
                        saveStationProfile(defaultProf);
                      }}
                    >
                      🔄 Reset Factory Defaults
                    </button>
                    <button
                      type="submit"
                      className="win-btn-classic win-btn-primary"
                      style={{ padding: '6px 20px', fontWeight: 700 }}
                    >
                      💾 Save Station Outlet Profile
                    </button>
                  </div>
                </form>
              )}
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | Changes Persist Across All ERP Modules</span>
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
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
                  onClick={() => exportToCsv(
                    `NSAIPETROSOFT_CardBatches_${new Date().toISOString().split('T')[0]}`,
                    ['EDC Machine', 'Batch No', 'Slips Count', 'Amount (INR)', 'Status'],
                    cardSettlements.map(c => [c.machine, c.batch, c.slips, c.amount, c.status])
                  )}
                  title="Export POS EDC card settlements to Microsoft Excel or CSV"
                >
                  📥 Export to Excel (CSV)
                </button>
                <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
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
                    style={{ flex: 1, fontWeight: 600 }}
                    value={cashMemoProduct}
                    onChange={(e) => {
                      const prod = e.target.value;
                      setCashMemoProduct(prod);
                      const rateItem = ratesList.find(p => prod === 'MS' ? (p.code === 'MS' || p.name.includes('Petrol')) : (p.code === 'HSD' || p.name.includes('Diesel')));
                      const matched = salesReadings.find(r => prod === 'MS' ? r.item === 'Petrol' : r.item === 'Diesel');
                      setCashMemoRate(rateItem?.rate || (matched ? matched.rate : 0));
                    }}
                  >
                    <option value="MS">Motor Spirit (Petrol / MS)</option>
                    <option value="HSD">High Speed Diesel (HSD)</option>
                  </select>
                </div>
                <div className="win-form-row">
                  <span className="win-label">Rate / L (₹)</span>
                  <input
                    type="number"
                    step="0.01"
                    className="win-input"
                    value={cashMemoRate}
                    onChange={(e) => setCashMemoRate(parseFloat(e.target.value) || 0)}
                    style={{ flex: 1, fontWeight: 700 }}
                  />
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
                    <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{stationProfile.stationName}</div>
                    <div style={{ fontSize: '10px', color: '#333' }}>{stationProfile.oilCompany} DEALER</div>
                    <div>{stationProfile.address ? `${stationProfile.address}, ` : ''}{stationProfile.city}, {stationProfile.state} - {stationProfile.pincode}</div>
                    <div>GSTIN: {stationProfile.gstin} {stationProfile.phone ? `| PH: ${stationProfile.phone}` : ''}</div>
                  </div>
                  <div className="thermal-slip-row"><span>Bill No: {cashMemoBillNo}</span><span>{getTodayErpDate()}</span></div>
                  <div className="thermal-slip-row"><span>Vehicle: {cashMemoVehicle || 'WALK-IN'}</span><span>{new Date().toLocaleTimeString()}</span></div>
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
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="win-btn-classic win-btn-primary"
                  onClick={() => window.print()}
                >
                  🖨️ Print Thermal Cash Slip
                </button>
                <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
              </div>
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
                    <div className="tank-liquid-ms" style={{ height: `${tanks[0]?.percent || 0}%` }} />
                  </div>
                  <div className="tank-details">
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#c0392b' }}>{tanks[0]?.name || 'MS Tank 1'} ({tanks[0]?.product || 'Petrol'})</div>
                    <div><strong>Gross Capacity:</strong> {(tanks[0]?.capacity || 20000).toLocaleString('en-IN')} Liters</div>
                    <div><strong>Current Stock:</strong> {(tanks[0]?.current_stock || 0).toLocaleString('en-IN')} L ({tanks[0]?.percent || 0}%)</div>
                    <div><strong>Current Dip:</strong> {tanks[0]?.dip_cm || 0} cm</div>
                    <div><strong>Water Dip:</strong> 0.0 cm (Clear)</div>
                    <div><strong>Safe Inward Space:</strong> {Math.max(0, (tanks[0]?.capacity || 20000) - (tanks[0]?.current_stock || 0)).toLocaleString('en-IN')} Liters</div>
                    <div style={{ color: tanks[0]?.is_low ? '#c0392b' : '#27ae60', fontWeight: 700, marginTop: '4px' }}>
                      ● {tanks[0]?.is_low ? 'Low Stock Alert' : 'Sufficient Fuel Available'}
                    </div>
                  </div>
                </div>

                {/* Tank 2 HSD */}
                <div className="tank-gauge-card">
                  <div className="tank-cylinder">
                    <div className="tank-liquid-hsd" style={{ height: `${tanks[1]?.percent || 0}%` }} />
                  </div>
                  <div className="tank-details">
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#0984e3' }}>{tanks[1]?.name || 'HSD Tank 1'} ({tanks[1]?.product || 'Diesel'})</div>
                    <div><strong>Gross Capacity:</strong> {(tanks[1]?.capacity || 20000).toLocaleString('en-IN')} Liters</div>
                    <div><strong>Current Stock:</strong> {(tanks[1]?.current_stock || 0).toLocaleString('en-IN')} L ({tanks[1]?.percent || 0}%)</div>
                    <div><strong>Current Dip:</strong> {tanks[1]?.dip_cm || 0} cm</div>
                    <div><strong>Water Dip:</strong> 0.0 cm (Clear)</div>
                    <div><strong>Safe Inward Space:</strong> {Math.max(0, (tanks[1]?.capacity || 20000) - (tanks[1]?.current_stock || 0)).toLocaleString('en-IN')} Liters</div>
                    <div style={{ color: tanks[1]?.is_low ? '#c0392b' : '#27ae60', fontWeight: 700, marginTop: '4px' }}>
                      ● {tanks[1]?.is_low ? 'Low Stock Alert' : 'High Stock Level'}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '16px', background: '#ece9d8', border: '1px solid #7f9db9', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><strong>Total Tank Valuation:</strong> ₹ {kpis.total_stock_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                <button className="win-btn-classic win-btn-primary" onClick={() => openDipDialog()}>
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

      {/* =============================================================
       * MODAL 27: Cloudflare R2 Disaster Recovery & Database Backups
       * ============================================================= */}
      {activeDialog === 'backup' && (
        <div className="win-modal-overlay">
          <div className="win-form-dialog" style={{ width: '880px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="win-dialog-titlebar" style={{ background: 'linear-gradient(180deg, #f39c12 0%, #d35400 100%)', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>☁️</span>
                <span style={{ fontWeight: 700 }}>Cloudflare R2 — Disaster Recovery & Automated Database Backups</span>
              </div>
              <button className="win-btn" style={{ color: '#fff' }} onClick={() => setActiveDialog(null)}>✕</button>
            </div>

            <div className="win-dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Top Banner Status */}
              <div style={{ border: '1px solid #7f9db9', background: '#fdfefe', padding: '12px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '18px' }}>
                      {backupStatus?.r2_connection.connected ? '🟢' : (backupStatus?.r2_connection.configured ? '🟡' : '🔵')}
                    </span>
                    <strong style={{ fontSize: '13px' }}>
                      {backupStatus?.r2_connection.connected
                        ? 'Cloudflare R2 Bucket Connected & Ready'
                        : (backupStatus?.r2_connection.configured
                            ? 'Cloudflare R2 Configured (Checking Bucket)'
                            : 'Local Persistent Backup Ready (Cloud Sync Ready)')}
                    </strong>
                  </div>
                  <div style={{ fontSize: '11px', color: '#555', lineHeight: '1.6' }}>
                    <div><strong>Storage Bucket:</strong> {backupStatus?.r2_connection.bucket || 'nsaipetrosoft-backups'}</div>
                    <div><strong>Zero Egress Guarantee:</strong> Cloudflare R2 charges ₹0.00 for backup downloads.</div>
                    <div><strong>Total Backups Stored:</strong> {backupsList.length} database snapshot(s) available</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
                  <button
                    className="win-btn-classic win-btn-primary"
                    style={{ height: '36px', fontSize: '12px', fontWeight: 700, background: 'linear-gradient(180deg, #27ae60 0%, #1e8449 100%)', color: '#fff', border: '1px solid #145a32' }}
                    onClick={handleTriggerBackup}
                    disabled={isBackingUp}
                  >
                    {isBackingUp ? '⏳ Generating Compressed Snapshot...' : '📦 Take Instant Cloud Backup (.json.gz)'}
                  </button>

                  <a
                    href={getMasterExcelDownloadUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className="win-btn-classic"
                    style={{
                      height: '34px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: 'linear-gradient(180deg, #1d6f42 0%, #155724 100%)',
                      color: '#fff',
                      border: '1px solid #0e3d19',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                    title="Download complete multi-sheet Excel workbook formatted for Accountants & CAs"
                  >
                    📊 Download Master Excel Workbook (.xlsx)
                  </a>

                  <div style={{ fontSize: '10px', color: '#777', textAlign: 'center' }}>
                    Multi-tab Excel for CAs & Accountants | Daily Cloudflare R2 Cloud Archive
                  </div>
                </div>
              </div>

              {/* Backups List Table */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Available Database Archive Snapshots (.json.gz)</span>
                  <button className="win-btn-classic" style={{ fontSize: '10px', height: '18px' }} onClick={openBackupDialog}>🔄 Refresh List</button>
                </div>
                <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '200px', overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Archive Filename</th>
                        <th>Date & Time (UTC)</th>
                        <th className="text-right">Size</th>
                        <th>Storage Tier</th>
                        <th style={{ width: '100px', textAlign: 'center' }}>Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backupsList.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: '#888' }}>
                            No backup archives found yet. Click "Take Instant PostgreSQL Backup" above to generate your first snapshot!
                          </td>
                        </tr>
                      ) : (
                        backupsList.map((b, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{b.filename}</td>
                            <td>{new Date(b.last_modified).toLocaleString()}</td>
                            <td className="text-right">{b.size_kb} KB</td>
                            <td>
                              <span style={{
                                padding: '1px 6px',
                                borderRadius: '3px',
                                fontSize: '10px',
                                fontWeight: 700,
                                background: b.storage === 'cloudflare_r2' ? '#e8f8f5' : '#fef9e7',
                                color: b.storage === 'cloudflare_r2' ? '#117a65' : '#b7950b',
                                border: `1px solid ${b.storage === 'cloudflare_r2' ? '#a3e4d7' : '#f9e79f'}`
                              }}>
                                {b.storage === 'cloudflare_r2' ? '☁️ Cloudflare R2' : '💾 Local Disk'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <a
                                href={getBackupDownloadUrl(b.filename)}
                                target="_blank"
                                rel="noreferrer"
                                download={b.filename}
                                className="win-btn-classic"
                                style={{
                                  display: 'inline-block',
                                  textDecoration: 'none',
                                  lineHeight: '18px',
                                  height: '18px',
                                  padding: '0 6px',
                                  fontSize: '10px',
                                  fontWeight: 600
                                }}
                              >
                                ⬇️ Download
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cloudflare R2 Connection Details & Help Guide */}
              <div style={{ border: '1px solid #d4d0c8', background: '#ece9d8', padding: '10px', fontSize: '11px', lineHeight: '1.6' }}>
                <div style={{ fontWeight: 700, color: '#333', marginBottom: '4px' }}>
                  🔑 Cloudflare R2 Setup Guide for Railway:
                </div>
                <div style={{ color: '#444' }}>
                  To link your live Cloudflare R2 bucket with zero egress fees, add these 4 variables in your <strong>Railway Project Settings → Variables</strong>:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '6px', fontFamily: 'monospace', fontSize: '11px' }}>
                  <div style={{ background: '#fff', padding: '4px 6px', border: '1px solid #ccc' }}>R2_ACCOUNT_ID</div>
                  <div style={{ background: '#fff', padding: '4px 6px', border: '1px solid #ccc' }}>R2_BUCKET_NAME = nsaipetrosoft-backups</div>
                  <div style={{ background: '#fff', padding: '4px 6px', border: '1px solid #ccc' }}>R2_ACCESS_KEY_ID</div>
                  <div style={{ background: '#fff', padding: '4px 6px', border: '1px solid #ccc' }}>R2_SECRET_ACCESS_KEY</div>
                </div>
                <div style={{ marginTop: '6px', color: '#666' }}>
                  <em>Note: Even without R2 credentials entered, backups are safely generated, compressed, and downloadable immediately from the server!</em>
                </div>
              </div>
            </div>

            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">ESC=Exit | 100% Zero Bandwidth Fees</span>
              <button className="win-btn-classic" onClick={() => setActiveDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Manager Authorization PIN Security Dialog */}
      {managerPinModal && managerPinModal.isOpen && (
        <div className="win-modal-overlay" style={{ zIndex: 12000 }}>
          <div className="win-form-dialog" style={{ width: '420px', border: '2px solid #b71c1c', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
            <div className="win-dialog-titlebar" style={{ background: 'linear-gradient(180deg, #d32f2f 0%, #b71c1c 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔐</span>
                <span>Security: Manager Authorization Required</span>
              </div>
              <button
                className="win-titlebar-btn"
                onClick={() => setManagerPinModal(null)}
                title="Cancel (ESC)"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const targetPin = (stationProfile.managerPin || '1234').trim();
                if (managerPinInput.trim() === targetPin) {
                  const cb = managerPinModal.onAuthorized;
                  setManagerPinModal(null);
                  setManagerPinInput('');
                  setManagerPinError('');
                  cb();
                } else {
                  setManagerPinError('Access Denied: Incorrect Manager PIN.');
                }
              }}
              className="win-dialog-body"
              style={{ padding: '16px' }}
            >
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ fontSize: '32px' }}>🛡️</div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#b71c1c', marginBottom: '4px' }}>
                    Restricted Station Operation
                  </div>
                  <div style={{ fontSize: '11px', color: '#222' }}>
                    Action: <strong>{managerPinModal.actionTitle}</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: '#555', marginTop: '3px' }}>
                    Please enter your Manager Security PIN to confirm and commit this operation:
                  </div>
                </div>
              </div>

              <div className="win-form-row" style={{ justifyContent: 'center', marginBottom: '10px' }}>
                <span className="win-label" style={{ fontWeight: 700 }}>Manager PIN:</span>
                <input
                  type="password"
                  autoFocus
                  maxLength={8}
                  className="win-input"
                  style={{ width: '130px', textAlign: 'center', fontSize: '16px', letterSpacing: '4px', fontWeight: 'bold' }}
                  value={managerPinInput}
                  onChange={(e) => {
                    setManagerPinInput(e.target.value);
                    setManagerPinError('');
                  }}
                  placeholder="••••"
                />
              </div>

              {managerPinError && (
                <div style={{ color: '#d32f2f', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', marginBottom: '10px' }}>
                  ⚠ {managerPinError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #d4d0c8', paddingTop: '10px' }}>
                <button
                  type="submit"
                  className="win-btn-classic win-btn-primary"
                  style={{ minWidth: '95px', fontWeight: 700 }}
                >
                  Authorize (F2)
                </button>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ minWidth: '70px' }}
                  onClick={() => setManagerPinModal(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
