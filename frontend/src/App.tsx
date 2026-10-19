import React, { useEffect, useState, lazy, Suspense } from 'react';
import './App.css';
import {
  API_BASE_URL,
  calculateSettlement,
  createBankAccount,
  createCardSettlement,
  createCreditSale,
  createExpense,
  createTankDip,
  createTransfer,
  deleteCreditSale,
  deleteExpense,
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
  triggerCreateBackup,
  updateRate,
  fetchCreditSaleThermalSlip,
  fetchStationProfileApi,
  saveStationProfileApi,
} from './api/client';
import { printThermalReceiptHtml } from './utils/thermalPrinter';
import { exportToCsv } from './utils/exportCsv';
import {
  formatCreditSaleWhatsApp,
  openWhatsAppChat,
} from './utils/whatsapp';
import {
  enqueueOfflineRecord,
  getOfflineQueueCount,
  initOfflineNetworkListener,
  syncOfflineQueue,
} from './utils/offlineQueue';
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
  DialogType,
  StationProfile,
} from './models';
import { calculateNetMeterQty, validateCreditSaleInputs, validateMeterReading } from './utils/petroUtils';
import {
  BankAccountsMasterModal,
  CalculatorModal,
  CardEntryModal,
  CashBillModal,
  CashierDenominationModal,
  CreditCustomerSaleModal,
  CustomerStatementModal,
  ExpenseBookModal,
  FuelRateMasterModal,
  HelpDeskModal,
  ManagerAuthModal,
  SelectCustomerBillModal,
  ShiftSalesModal,
  StampingReminderModal,
  TankDipRegisterModal,
  TransferEntryModal,
  UndergroundTankMasterModal,
  ViewStockModal,
} from './components';

// Code-split heavy reporting and management modals on demand (QA-08)
const CrystalReportViewerModal = lazy(() =>
  import('./components/CrystalReportViewerModal').then((m) => ({ default: m.CrystalReportViewerModal }))
);
const EmployeeSettlementModal = lazy(() =>
  import('./components/EmployeeSettlementModal').then((m) => ({ default: m.EmployeeSettlementModal }))
);
const ControlPanelModal = lazy(() =>
  import('./components/ControlPanelModal').then((m) => ({ default: m.ControlPanelModal }))
);
const PurchaseEntryModal = lazy(() =>
  import('./components/PurchaseEntryModal').then((m) => ({ default: m.PurchaseEntryModal }))
);
const DayBookReportModal = lazy(() =>
  import('./components/DayBookReportModal').then((m) => ({ default: m.DayBookReportModal }))
);
const PaymentReceiptModal = lazy(() =>
  import('./components/PaymentReceiptModal').then((m) => ({ default: m.PaymentReceiptModal }))
);
const NozzleTotalizerMasterModal = lazy(() =>
  import('./components/NozzleTotalizerMasterModal').then((m) => ({ default: m.NozzleTotalizerMasterModal }))
);
const ReportCriteriaModal = lazy(() =>
  import('./components/ReportCriteriaModal').then((m) => ({ default: m.ReportCriteriaModal }))
);
const CloudBackupModal = lazy(() =>
  import('./components/CloudBackupModal').then((m) => ({ default: m.CloudBackupModal }))
);
const CustomerFleetMasterModal = lazy(() =>
  import('./components/CustomerFleetMasterModal').then((m) => ({ default: m.CustomerFleetMasterModal }))
);

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
      dealerCode: 'RO-BPCL-101',
      address: 'HIGHWAY SERVICE STATION',
      city: 'SURAT',
      state: 'GUJARAT',
      stateCode: '24',
      pincode: '395003',
      gstin: '24AAACN1234F1Z5',
      phone: '+91 98765 43210',
      upiVpa: '',
      printerPaperWidth: '80mm',
      managerPin: '1234',
    };
  });

  const saveStationProfile = (updated: StationProfile) => {
    setStationProfile(updated);
    try {
      localStorage.setItem('nsaipetrosoft_station_profile', JSON.stringify(updated));
    } catch {}
    saveStationProfileApi(updated).catch((err) => {
      console.warn('Backend station profile sync deferred:', err);
    });
    showToast('✔ Station Outlet Profile Updated & Synced to Cloud!');
  };

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
  const [creditOdometer, setCreditOdometer] = useState<number>(0);
  const [creditDriverName, setCreditDriverName] = useState<string>('');
  const [creditIndentNo, setCreditIndentNo] = useState<string>('');
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(getOfflineQueueCount());
  const [whatsappSlip, setWhatsappSlip] = useState<string | null>(null);
  const [creditRecipientMobile, setCreditRecipientMobile] = useState<string>('');
  const [isSavingCreditSale, setIsSavingCreditSale] = useState<boolean>(false);

  // Past Credit Bills
  const [creditBillsList, setCreditBillsList] = useState<any[]>([]);
  const [shiftSettlementsList, setShiftSettlementsList] = useState<any[]>([]);

  // Sales Entry Nozzle Totalizers (Frame 0110)
  const [salesDate, setSalesDate] = useState<string>(getTodayErpDate());
  const [salesReadings, setSalesReadings] = useState<any[]>([]);

  // Payment Receipt State (Frame 0085)
  const [payReceiptsHistory, setPayReceiptsHistory] = useState<any[]>([]);

  // Expense Book State
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [expDate, setExpDate] = useState<string>(getTodayErpDate());
  const [expCategory, setExpCategory] = useState<string>('Station Maintenance');
  const [expAmount, setExpAmount] = useState<number>(0.0);
  const [expNarration, setExpNarration] = useState<string>('');
  const [expPaidTo, setExpPaidTo] = useState<string>('');

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

  // Set Report Criteria State (Frame 0375)
  const [reportCriteriaRadio, setReportCriteriaRadio] = useState<string>('DSR');
  const [activeReportTitle, setActiveReportTitle] = useState<string>('DSR REPORT');

  // Credit Sale Print Confirmation Prompt (Frame 0050)
  const [showPrintConfirm, setShowPrintConfirm] = useState<boolean>(false);
  const [lastCreditSlip, setLastCreditSlip] = useState<any>(null);

  // Manager Authorization PIN Modal State
  const [managerPinModal, setManagerPinModal] = useState<{
    isOpen: boolean;
    actionTitle: string;
    onAuthorized: () => void;
  } | null>(null);

  const requestManagerAuthorization = (actionTitle: string, onAuthorized: () => void) => {
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

  // Purchase Inward PO History (Frame 0161)
  const [purPoHistory, setPurPoHistory] = useState<any[]>([]);


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
            const qty = calculateNetMeterQty(n.opening_meter, n.closing_meter, n.testing);
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
            mobile: s.customer_mobile || '',
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
            mobile: p.customer_mobile || '',
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

      // Cloud Dealership / Station Profile Sync
      try {
        const cloudProfile = await fetchStationProfileApi();
        if (cloudProfile && cloudProfile.stationName) {
          setStationProfile((prev) => ({
            ...prev,
            ...cloudProfile,
          }));
          try {
            localStorage.setItem('nsaipetrosoft_station_profile', JSON.stringify(cloudProfile));
          } catch {}
        }
      } catch (profErr) {
        // Fallback to local profile silently if endpoint not ready
      }
    } catch (err: any) {
      console.warn('Live ERP synchronization error:', err);
      setBackendOnline(false);
    }
  };

  const loadData = loadAllErpData;

  useEffect(() => {
    loadAllErpData();

    const unsubscribeOffline = initOfflineNetworkListener((online, count) => {
      setIsNetworkOnline(online);
      setOfflineQueueCount(count);
      if (online) {
        showToast('🟢 Forecourt internet restored! Auto-synced offline records to Railway.');
        loadAllErpData();
      } else {
        showToast('🟠 Forecourt network dropped: Operating in resilient offline buffering mode.');
      }
    });

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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unsubscribeOffline();
    };
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
            mobile: s.customer_mobile || '',
            vehicle: s.vehicle_no,
            qty: s.qty,
            total: s.amount,
          }))
        );
      }
      if (custs && custs.length > 0) {
        setCustomers(custs);
        setCreditRecipientMobile(custs[0]?.mobile || '');
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
              const qty = calculateNetMeterQty(n.opening_meter, n.closing_meter, n.testing);
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
              const qty = calculateNetMeterQty(n.opening_meter, n.closing_meter, n.testing);
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
    const custObj = customers.find((c) => c.id === creditCustId);
    const valResult = validateCreditSaleInputs(
      creditQty,
      creditRate,
      0,
      creditCashPaid,
      custObj?.credit_limit || 0,
      custObj?.current_outstanding || 0
    );
    if (!valResult.isValid) {
      showToast(`❌ Validation Error: ${valResult.error}`);
      return;
    }
    // Prompt Frame 0050: Are you Sure? Do you want to Print this Receipt..??
    setShowPrintConfirm(true);
  };

  const processCreditSaleSuccess = async (res: any, printSlip: boolean) => {
    const custObj = customers.find((c) => c.id === creditCustId);
    const prodObj = ratesList.find((r) => r.id === creditProductId);
    const formattedWa = formatCreditSaleWhatsApp({
      stationName: stationProfile.stationName,
      stationCity: stationProfile.city,
      billNo: res.bill_no,
      slipNo: creditSlipNo,
      date: formatErpDate(creditDate),
      customerName: custObj?.name || 'CUSTOMER',
      vehicleNo: creditVehicle,
      productName: prodObj?.name || 'High Speed Diesel (HSD)',
      qty: creditQty,
      rate: creditRate,
      amount: creditQty * creditRate,
      cashPaid: creditCashPaid,
      balanceAfter: res.new_balance,
      odometerKm: creditOdometer,
      driverName: creditDriverName,
      indentNo: creditIndentNo,
      mileageKml: res.mileage_kml,
    });
    setWhatsappSlip(formattedWa);
    setCreditRecipientMobile(res.customer_mobile || custObj?.mobile || '');

    const newBill = {
      id: res.id,
      date: formatErpDate(creditDate),
      shift: 'First',
      slip: creditSlipNo,
      bill: res.bill_no,
      cust: custObj?.name || 'CUSTOMER',
      mobile: res.customer_mobile || custObj?.mobile || '',
      vehicle: creditVehicle,
      qty: creditQty,
      total: creditQty * creditRate - creditCashPaid,
    };
    const freshSales = await fetchCreditSales().catch(() => null);
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
    showToast(`✔ Credit Bill #${res.bill_no} Saved! Balance: ₹${res.new_balance.toFixed(2)}${res.mileage_kml ? ` | Mileage: ${res.mileage_kml.toFixed(2)} KM/L` : ''}`);
    if (printSlip) {
      try {
        const thermalData = await fetchCreditSaleThermalSlip(res.id);
        printThermalReceiptHtml(thermalData.html);
      } catch {
        const fallbackHtml = `
          <div style="font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; line-height: 1.4; color: #000;">
            <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
              <div style="font-size: 15px; font-weight: bold;">${stationProfile.stationName}</div>
              <div style="font-size: 11px;">${stationProfile.oilCompany} RETAIL OUTLET</div>
              <div style="font-size: 10px;">CREDIT SALE DELIVERY RECEIPT</div>
            </div>
            <div style="display: flex; justify-content: space-between;"><span>Bill No:</span><span>${res.bill_no}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>Date:</span><span>${formatErpDate(creditDate)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>Customer:</span><span>${custObj?.name || 'CUSTOMER'}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>Vehicle:</span><span>${creditVehicle || '-'}</span></div>
            ${creditIndentNo ? `<div style="display: flex; justify-content: space-between;"><span>Indent No:</span><span>${creditIndentNo}</span></div>` : ''}
            ${creditDriverName ? `<div style="display: flex; justify-content: space-between;"><span>Driver:</span><span>${creditDriverName}</span></div>` : ''}
            ${creditOdometer ? `<div style="display: flex; justify-content: space-between;"><span>Odometer:</span><span>${creditOdometer} KM</span></div>` : ''}
            <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
            <div style="display: flex; justify-content: space-between; font-weight: bold;"><span>Net Credit:</span><span>Rs ${(creditQty * creditRate - creditCashPaid).toFixed(2)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>Cur. Balance:</span><span>Rs ${res.new_balance.toFixed(2)}</span></div>
            <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
            <div style="margin-top: 25px; border-top: 1px solid #000; padding-top: 4px; font-size: 10px; display: flex; justify-content: space-between;">
              <span>Driver Sign</span><span>Authorized Sign</span>
            </div>
            <div style="text-align: center; font-size: 9px; margin-top: 8px;">
              <div>THANK YOU! VISIT AGAIN</div>
            </div>
          </div>
        `;
        printThermalReceiptHtml(fallbackHtml);
      }
    }
    await loadAllErpData();
  };

  const executeCreditSaleSave = async (printSlip: boolean) => {
    if (isSavingCreditSale) return;
    setIsSavingCreditSale(true);
    setShowPrintConfirm(false);
    const salePayload = {
      customer_id: creditCustId,
      vehicle_no: creditVehicle,
      product_id: creditProductId,
      slip_no: creditSlipNo,
      qty: creditQty,
      rate: creditRate,
      cash_paid: creditCashPaid,
      odometer_km: creditOdometer || 0,
      driver_name: creditDriverName || '',
      indent_no: creditIndentNo || '',
      remarks: creditRemark,
    };

    if (!navigator.onLine) {
      try {
        enqueueOfflineRecord('CREDIT_SALE', salePayload);
        setOfflineQueueCount(getOfflineQueueCount());
        const custObj = customers.find((c) => c.id === creditCustId);
        const prodObj = ratesList.find((r) => r.id === creditProductId);
        const tempBillNo = `OFF-${Date.now().toString().slice(-4)}`;
        const netTotal = creditQty * creditRate - creditCashPaid;
        const estBalance = (custObj?.current_outstanding || 0) + netTotal;

        const formattedWa = formatCreditSaleWhatsApp({
          stationName: stationProfile.stationName,
          stationCity: stationProfile.city,
          billNo: tempBillNo,
          slipNo: creditSlipNo,
          date: formatErpDate(creditDate),
          customerName: custObj?.name || 'CUSTOMER',
          vehicleNo: creditVehicle,
          productName: prodObj?.name || 'High Speed Diesel (HSD)',
          qty: creditQty,
          rate: creditRate,
          amount: creditQty * creditRate,
          cashPaid: creditCashPaid,
          balanceAfter: estBalance,
          odometerKm: creditOdometer,
          driverName: creditDriverName,
          indentNo: creditIndentNo,
        });
        setWhatsappSlip(formattedWa);
        setCreditRecipientMobile(custObj?.mobile || '');

        const offlineBill = {
          id: Date.now(),
          date: formatErpDate(creditDate),
          shift: 'First',
          slip: creditSlipNo,
          bill: tempBillNo,
          cust: custObj?.name || 'CUSTOMER',
          mobile: custObj?.mobile || '',
          vehicle: creditVehicle,
          qty: creditQty,
          total: netTotal,
        };
        setCreditBillsList([offlineBill, ...creditBillsList]);
        setLastCreditSlip(offlineBill);
        showToast(`💾 Offline Forecourt: Slip #${creditSlipNo} saved to local queue. Will auto-sync when connected.`);
      } finally {
        setIsSavingCreditSale(false);
      }
      return;
    }

    try {
      let res: any;
      try {
        res = await createCreditSale(salePayload);
      } catch (err: any) {
        if (err.message && err.message.includes('CREDIT LIMIT EXCEEDED')) {
          const custName = customers.find((c) => c.id === creditCustId)?.name || 'Customer';
          requestManagerAuthorization(`Override Credit Limit for ${custName} (${err.message})`, async () => {
            try {
              const overrideRes = await createCreditSale({
                ...salePayload,
                manager_override_pin: '1234',
              });
              await processCreditSaleSuccess(overrideRes, printSlip);
            } catch (authErr: any) {
              showToast(`❌ Authorization override failed: ${authErr.message}`);
            } finally {
              setIsSavingCreditSale(false);
            }
          });
          return;
        }
        throw err;
      }
      await processCreditSaleSuccess(res, printSlip);
    } catch (err: any) {
      if (!navigator.onLine || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        enqueueOfflineRecord('CREDIT_SALE', salePayload);
        setOfflineQueueCount(getOfflineQueueCount());
        showToast(`⚠ Network dropped mid-sale. Slip #${creditSlipNo} buffered locally for auto-sync.`);
      } else {
        showToast(err.message || 'Error saving credit bill');
      }
    } finally {
      setIsSavingCreditSale(false);
    }
  };

  const handleSaveShiftMeters = async () => {
    for (let i = 0; i < salesReadings.length; i++) {
      const r = salesReadings[i];
      const isRollover = r.close < r.open && r.open > 0;
      const val = validateMeterReading(r.open, r.close, isRollover, r.test);
      if (!val.isValid) {
        showToast(`❌ Totalizer Error (Pump #${i + 1}): ${val.error}`);
        return;
      }
    }
    requestManagerAuthorization(`Update Dispenser Meter Totalizers (${shiftName} Shift)`, async () => {
      const payload = {
        shift_name: shiftName,
        readings: salesReadings.map((r, i) => ({
          nozzle_id: r.nozzle_id || (i + 1),
          opening_meter: r.open,
          closing_meter: r.close,
          testing_qty: r.test,
          is_rollover: r.close < r.open && r.open > 0,
          split_closing_meter: r.split_closing || undefined,
          split_rate: r.split_rate || undefined,
        })),
      };
      try {
        if (!navigator.onLine) {
          enqueueOfflineRecord('SHIFT_METERS', payload);
          setOfflineQueueCount(getOfflineQueueCount());
          showToast(`💾 Offline Mode: Shift meter readings buffered locally. Will auto-sync.`);
          return;
        }
        await saveShiftMeters(payload);
        showToast('✔ Shift meter readings saved and totalizers updated!');
        await loadAllErpData();
      } catch (err: any) {
        if (!navigator.onLine || err.message?.includes('Failed to fetch')) {
          enqueueOfflineRecord('SHIFT_METERS', payload);
          setOfflineQueueCount(getOfflineQueueCount());
          showToast(`💾 Offline Buffer: Shift readings saved locally.`);
        } else {
          showToast(err.message || 'Error saving shift meters');
        }
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
          <span style={{ fontSize: '11px', color: backendOnline ? '#2e7d32' : '#e67e22' }} title={`Backend API: ${API_BASE_URL}`}>
            ● {backendOnline ? 'Cloud Backend' : 'Local Standby'}
          </span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '1px 6px',
              borderRadius: '3px',
              fontSize: '11px',
              fontWeight: 700,
              background: isNetworkOnline ? '#e8f5e9' : '#fff3e0',
              color: isNetworkOnline ? '#1b5e20' : '#e65100',
              border: `1px solid ${isNetworkOnline ? '#81c784' : '#ffb74d'}`,
            }}
            title={isNetworkOnline ? "Forecourt network connected to Railway PostgreSQL" : "Network disconnected. Offline slips buffered locally."}
          >
            <span>{isNetworkOnline ? '🟢 Online (Railway)' : '🟠 Forecourt Offline'}</span>
            {offlineQueueCount > 0 && (
              <span
                style={{
                  background: '#d32f2f',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '0 4px',
                  fontSize: '9.5px',
                  cursor: 'pointer',
                }}
                onClick={async () => {
                  const res = await syncOfflineQueue();
                  setOfflineQueueCount(getOfflineQueueCount());
                  showToast(`⚡ Synchronized ${res.synced} of ${res.total} queued records to Railway.`);
                }}
                title="Click to force background sync"
              >
                {offlineQueueCount} queued ⚡
              </span>
            )}
          </div>
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
                      ['Customer Code', 'Customer Name', 'City', 'Mobile', 'Credit Limit (INR)', 'Outstanding (INR)', 'Status'],
                      customersList.map(c => [
                        c.code || '',
                        c.name,
                        c.city || '',
                        c.mobile || '',
                        c.credit_limit || 0,
                        (c.current_outstanding ?? (c as any).outstanding ?? 0),
                        c.is_blocked ? 'BLOCKED' : 'ACTIVE'
                      ])
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
                        <th style={{ width: '55%' }}>Customer Name</th>
                        <th className="text-right" style={{ width: '30%' }}>Outstanding</th>
                        <th style={{ width: '15%', textAlign: 'center' }}>WA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customersList.map((c) => (
                        <tr
                          key={c.id}
                          style={{ cursor: 'pointer' }}
                          title="Click to view Customer Statement of Accounts"
                        >
                          <td style={{ color: '#0055ea', fontWeight: 600 }} onClick={() => openCustomerStatement(c.id)}>{c.name}</td>
                          <td className="text-right" onClick={() => openCustomerStatement(c.id)}>{((c.current_outstanding ?? (c as any).outstanding ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ height: '17px', padding: '0 3px', fontSize: '10px', background: '#25d366', color: '#fff', borderColor: '#128c7e', fontWeight: 700 }}
                              title={`Send instant WhatsApp balance reminder to ${c.name} (${c.mobile || 'No mobile'})`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const bal = (c.current_outstanding ?? (c as any).outstanding ?? 0);
                                const msg = `⛽ *${stationProfile.stationName.toUpperCase()}*\nDear *${c.name}*,\nYour current unbilled fuel outstanding balance is *₹${bal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}*.\nKindly arrange remittance at your earliest convenience.\nThank you!`;
                                openWhatsAppChat(c.mobile || '', msg);
                                showToast(`📲 Opening WhatsApp reminder for ${c.name}...`);
                              }}
                            >
                              📲
                            </button>
                          </td>
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
       * MODULAR WINDOWS MODALS (Components Decoupled from App.tsx)
       * ============================================================= */}
      <Suspense fallback={null}>
      <ShiftSalesModal
        isOpen={activeDialog === 'sales'}
        onClose={() => setActiveDialog(null)}
        salesDate={salesDate}
        setSalesDate={setSalesDate}
        shiftName={shiftName}
        setShiftName={setShiftName}
        importFromApp={importFromApp}
        setImportFromApp={setImportFromApp}
        shiftNumber={shiftNumber}
        setShiftNumber={setShiftNumber}
        salesReadings={salesReadings}
        setSalesReadings={setSalesReadings}
        employeesList={employeesList}
        shiftSettlementsList={shiftSettlementsList}
        showToast={showToast}
        onOpenCreditDialog={() => setActiveDialog('credit')}
        onOpenExpenseBook={() => setActiveDialog('expense')}
        onOpenDenomDialog={() => setActiveDialog('denom')}
        onSaveShiftMeters={handleSaveShiftMeters}
      />

      <CreditCustomerSaleModal
        isOpen={activeDialog === 'credit'}
        onClose={() => setActiveDialog(null)}
        customers={customers}
        ratesList={ratesList}
        stationProfile={stationProfile}
        creditDate={creditDate}
        setCreditDate={setCreditDate}
        creditShift={creditShift}
        setCreditShift={setCreditShift}
        creditSlipNo={creditSlipNo}
        setCreditSlipNo={setCreditSlipNo}
        creditBillNo={creditBillNo}
        setCreditBillNo={setCreditBillNo}
        creditCustId={creditCustId}
        setCreditCustId={setCreditCustId}
        creditVehicle={creditVehicle}
        setCreditVehicle={setCreditVehicle}
        creditProductId={creditProductId}
        setCreditProductId={setCreditProductId}
        creditRate={creditRate}
        setCreditRate={setCreditRate}
        creditQty={creditQty}
        setCreditQty={setCreditQty}
        creditCashPaid={creditCashPaid}
        setCreditCashPaid={setCreditCashPaid}
        creditRemark={creditRemark}
        setCreditRemark={setCreditRemark}
        whatsappSlip={whatsappSlip}
        creditRecipientMobile={creditRecipientMobile}
        setCreditRecipientMobile={setCreditRecipientMobile}
        lastCreditSlip={lastCreditSlip}
        creditBillsList={creditBillsList}
        showPrintConfirm={showPrintConfirm}
        onSaveCreditSale={handleSaveCreditSale}
        onExecuteCreditSaleSave={executeCreditSaleSave}
        creditOdometer={creditOdometer}
        setCreditOdometer={setCreditOdometer}
        creditDriverName={creditDriverName}
        setCreditDriverName={setCreditDriverName}
        creditIndentNo={creditIndentNo}
        setCreditIndentNo={setCreditIndentNo}
        onDeleteCreditBill={(b) => {
          requestManagerAuthorization(`Delete Credit Bill #${b.bill} (${b.cust} - ₹${b.total})`, async () => {
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
              showToast(`✔ Credit bill #${b.bill} deleted & ledger reversed!`);
              await loadAllErpData();
            } catch (err: any) {
              showToast(`⚠ Error deleting credit sale: ${err.message || 'Database error'}`);
            }
          });
        }}
        showToast={showToast}
      />

      <PaymentReceiptModal
        isOpen={activeDialog === 'payment'}
        onClose={() => setActiveDialog(null)}
        customers={customers}
        accountsList={accountsList}
        stationProfile={stationProfile}
        payReceiptsHistory={payReceiptsHistory}
        showToast={showToast}
        loadAllErpData={loadAllErpData}
        requestManagerAuthorization={requestManagerAuthorization}
      />

      <ExpenseBookModal
        isOpen={activeDialog === 'expense'}
        onClose={() => setActiveDialog(null)}
        expensesList={expensesList}
        expDate={expDate}
        setExpDate={setExpDate}
        expCategory={expCategory}
        setExpCategory={setExpCategory}
        expAmount={expAmount}
        setExpAmount={setExpAmount}
        expPaidTo={expPaidTo}
        setExpPaidTo={setExpPaidTo}
        expNarration={expNarration}
        setExpNarration={setExpNarration}
        onSaveExpense={handleSaveExpense}
        onDeleteExpense={handleDeleteExpense}
      />

      <TransferEntryModal
        isOpen={activeDialog === 'transfer'}
        onClose={() => setActiveDialog(null)}
        accountsList={accountsList}
        fromAccId={fromAccId}
        setFromAccId={setFromAccId}
        toAccId={toAccId}
        setToAccId={setToAccId}
        transferAmt={transferAmt}
        setTransferAmt={setTransferAmt}
        onSaveTransfer={handleSaveTransfer}
      />

      <FuelRateMasterModal
        isOpen={activeDialog === 'rate'}
        onClose={() => setActiveDialog(null)}
        ratesList={ratesList}
        rateHist={rateHist}
        rateProduct={rateProduct}
        setRateProduct={setRateProduct}
        rateValue={rateValue}
        setRateValue={setRateValue}
        onSaveRate={handleSaveRate}
      />

      <TankDipRegisterModal
        isOpen={activeDialog === 'dip'}
        onClose={() => setActiveDialog(null)}
        tanks={tanks}
        dipTankId={dipTankId}
        setDipTankId={setDipTankId}
        dipOpenCm={dipOpenCm}
        setDipOpenCm={setDipOpenCm}
        dipOpenStock={dipOpenStock}
        setDipOpenStock={setDipOpenStock}
        dipReceipt={dipReceipt}
        setDipReceipt={setDipReceipt}
        dipCloseCm={dipCloseCm}
        setDipCloseCm={setDipCloseCm}
        dipCloseStock={dipCloseStock}
        setDipCloseStock={setDipCloseStock}
        dipsList={dipsList}
        onSaveDip={handleSaveDip}
      />

      <PurchaseEntryModal
        isOpen={activeDialog === 'purchase'}
        onClose={() => setActiveDialog(null)}
        purPoHistory={purPoHistory}
        showToast={showToast}
        loadAllErpData={loadAllErpData}
        requestManagerAuthorization={requestManagerAuthorization}
      />

      <CashierDenominationModal
        isOpen={activeDialog === 'denom'}
        onClose={() => setActiveDialog(null)}
        denoms={denoms}
        setDenoms={setDenoms}
        denomResult={denomResult}
        onCalculateDenom={handleCalculateDenom}
      />

      <CustomerStatementModal
        isOpen={activeDialog === 'statement'}
        onClose={() => setActiveDialog(null)}
        selectedStatement={selectedStatement}
        stationProfile={stationProfile}
        showToast={showToast}
      />

      <StampingReminderModal
        isOpen={activeDialog === 'stamping'}
        onClose={() => setActiveDialog(null)}
        stampingList={stampingList}
      />

      <HelpDeskModal
        isOpen={activeDialog === 'help'}
        onClose={() => setActiveDialog(null)}
      />

      <CalculatorModal
        isOpen={activeDialog === 'calc'}
        onClose={() => setActiveDialog(null)}
      />

      <ReportCriteriaModal
        isOpen={activeDialog === 'reports'}
        onClose={() => setActiveDialog(null)}
        reportCriteriaRadio={reportCriteriaRadio}
        setReportCriteriaRadio={setReportCriteriaRadio}
        setActiveReportTitle={setActiveReportTitle}
        customers={customers}
        accountsList={accountsList}
        employeesList={employeesList}
        stationProfile={stationProfile}
        openCrystalReport={openCrystalReport}
        showToast={showToast}
      />

      <CrystalReportViewerModal
        isOpen={activeDialog === 'crystalViewer'}
        onClose={() => setActiveDialog(null)}
        activeReportTitle={activeReportTitle}
        reportCriteriaRadio={reportCriteriaRadio}
        openCrystalReport={openCrystalReport}
        stationProfile={stationProfile}
        critFromDate={getCurrentMonthStartErpDate()}
        critToDate={getTodayErpDate()}
        critShift="First"
        critItem="Diesel"
        salesReadings={salesReadings}
        dsrReport={dsrReport}
        creditBillsList={creditBillsList}
        cardSettlements={cardSettlements}
        vatReport={vatReport}
        purPoHistory={purPoHistory}
        profitReport={profitReport}
        commissionReport={commissionReport}
        lfrReport={lfrReport}
        tdsReport={tdsReport}
        profitLossReport={profitLossReport}
        expensesList={expensesList}
        payReceiptsHistory={payReceiptsHistory}
        showToast={showToast}
      />

      <EmployeeSettlementModal
        isOpen={activeDialog === 'employeeSettlement'}
        onClose={() => setActiveDialog(null)}
        empSettlementDate={empSettlementDate}
        setEmpSettlementDate={setEmpSettlementDate}
        empSettlementShift={empSettlementShift}
        setEmpSettlementShift={setEmpSettlementShift}
        empSettlementSaleNo={empSettlementSaleNo}
        setEmpSettlementSaleNo={setEmpSettlementSaleNo}
        empSettlementEmp={empSettlementEmp}
        setEmpSettlementEmp={setEmpSettlementEmp}
        empSettlementMachine={empSettlementMachine}
        setEmpSettlementMachine={setEmpSettlementMachine}
        empSettlementRemarks={empSettlementRemarks}
        setEmpSettlementRemarks={setEmpSettlementRemarks}
        employeesList={employeesList}
        salesReadings={salesReadings}
        setSalesReadings={setSalesReadings}
        empNozzleReadings={empNozzleReadings}
        setEmpNozzleReadings={setEmpNozzleReadings}
        empLubeItems={empLubeItems}
        setEmpLubeItems={setEmpLubeItems}
        empCardSwipes={empCardSwipes}
        setEmpCardSwipes={setEmpCardSwipes}
        empExpensesList={empExpensesList}
        setEmpExpensesList={setEmpExpensesList}
        empCashAmount={empCashAmount}
        setEmpCashAmount={setEmpCashAmount}
        empCreditSaleAmount={empCreditSaleAmount}
        setEmpCreditSaleAmount={setEmpCreditSaleAmount}
        empCreditReceived={empCreditReceived}
        setEmpCreditReceived={setEmpCreditReceived}
        empUplagBaki={empUplagBaki}
        setEmpUplagBaki={setEmpUplagBaki}
        denoms={denoms}
        onOpenDenom={() => setActiveDialog('denom')}
        onOpenDayBook={() => setActiveDialog('dayBookReport')}
        showToast={showToast}
        loadAllErpData={loadAllErpData}
      />

      <DayBookReportModal
        isOpen={activeDialog === 'dayBookReport'}
        onClose={() => setActiveDialog(null)}
        denoms={denoms}
        empCashAmount={empCashAmount}
        creditBillsList={creditBillsList}
        cardSettlements={cardSettlements}
        empCardSwipes={empCardSwipes}
        expensesList={expensesList}
        empExpensesList={empExpensesList}
        salesReadings={salesReadings}
        empNozzleReadings={empNozzleReadings}
        empLubeItems={empLubeItems}
        shiftName={shiftName}
        stationProfile={stationProfile}
        empSettlementEmp={empSettlementEmp}
        empSettlementMachine={empSettlementMachine}
        showToast={showToast}
      />

      <SelectCustomerBillModal
        isOpen={activeDialog === 'selectCustomerBill'}
        onClose={() => setActiveDialog(null)}
        customers={customers}
        stationProfile={stationProfile}
        openCustomerStatement={openCustomerStatement}
      />

      <CustomerFleetMasterModal
        isOpen={activeDialog === 'customerMaster'}
        onClose={() => setActiveDialog(null)}
        customers={customers}
        openCustomerStatement={openCustomerStatement}
        showToast={showToast}
        loadAllErpData={loadAllErpData}
      />

      <UndergroundTankMasterModal
        isOpen={activeDialog === 'tankMaster'}
        onClose={() => setActiveDialog(null)}
        tanks={tanks}
        onOpenDipDialog={openDipDialog}
      />

      <NozzleTotalizerMasterModal
        isOpen={activeDialog === 'nozzleMaster'}
        onClose={() => setActiveDialog(null)}
        salesReadings={salesReadings}
        onOpenSalesDialog={() => setActiveDialog('sales')}
        showToast={showToast}
        onRefresh={loadAllErpData}
      />

      <BankAccountsMasterModal
        isOpen={activeDialog === 'bankMaster'}
        onClose={() => setActiveDialog(null)}
        accountsList={accountsList}
        newBankName={newBankName}
        setNewBankName={setNewBankName}
        newBankType={newBankType}
        setNewBankType={setNewBankType}
        newBankBalance={newBankBalance}
        setNewBankBalance={setNewBankBalance}
        onCreateBankAccount={handleCreateBankAccount}
        onOpenTransfer={() => setActiveDialog('transfer')}
      />

      <ControlPanelModal
        isOpen={activeDialog === 'controlPanel'}
        onClose={() => setActiveDialog(null)}
        stationProfile={stationProfile}
        saveStationProfile={saveStationProfile}
        shiftNumber={shiftNumber}
        shiftName={shiftName}
        shiftStatus={shiftStatus}
        dispenserLocked={dispenserLocked}
        setDispenserLocked={setDispenserLocked}
        handleCloseShift={handleCloseShift}
        handleOpenNextShift={handleOpenNextShift}
        showToast={showToast}
        requestManagerAuthorization={requestManagerAuthorization}
        loadAllErpData={loadAllErpData}
      />

      <CardEntryModal
        isOpen={activeDialog === 'cardEntry'}
        onClose={() => setActiveDialog(null)}
        cardMachine={cardMachine}
        setCardMachine={setCardMachine}
        cardBatchNo={cardBatchNo}
        setCardBatchNo={setCardBatchNo}
        cardSlipsCount={cardSlipsCount}
        setCardSlipsCount={setCardSlipsCount}
        cardBatchTotal={cardBatchTotal}
        setCardBatchTotal={setCardBatchTotal}
        cardSettlements={cardSettlements}
        onSaveCardSettlement={handleSaveCardSettlement}
      />

      <CashBillModal
        isOpen={activeDialog === 'cashBill'}
        onClose={() => setActiveDialog(null)}
        ratesList={ratesList}
        salesReadings={salesReadings}
        customers={customers}
        stationProfile={stationProfile}
        showToast={showToast}
        loadAllErpData={loadAllErpData}
      />

      <ViewStockModal
        isOpen={activeDialog === 'viewStock'}
        onClose={() => setActiveDialog(null)}
        tanks={tanks}
        kpis={kpis}
        onOpenDipDialog={() => openDipDialog()}
      />

      <CloudBackupModal
        isOpen={activeDialog === 'backup'}
        onClose={() => setActiveDialog(null)}
        backupStatus={backupStatus}
        backupsList={backupsList}
        isBackingUp={isBackingUp}
        onTriggerBackup={handleTriggerBackup}
        onRefreshList={openBackupDialog}
        getMasterExcelDownloadUrl={getMasterExcelDownloadUrl}
        getBackupDownloadUrl={getBackupDownloadUrl}
      />

      <ManagerAuthModal
        modalState={managerPinModal}
        onClose={() => setManagerPinModal(null)}
        correctPin={stationProfile.managerPin || '1234'}
      />
      </Suspense>

    </div>
  );
}
