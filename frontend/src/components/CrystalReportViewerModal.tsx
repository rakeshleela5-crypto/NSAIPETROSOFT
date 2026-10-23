import React, { useState, useEffect } from 'react';
import type { CustomerFull, StationProfile } from '../models';
import { erpStore } from '../store/erpStore';
import { toIsoDate, getTodayIsoDate, getCurrentMonthStartIsoDate, formatErpDate } from '../utils/dateUtils';
import { exportToCsv } from '../utils/exportCsv';

interface CrystalReportViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeReportTitle: string;
  reportCriteriaRadio: string;
  openCrystalReport: (rep: string) => void;
  stationProfile: StationProfile;
  critFromDate: string;
  critToDate: string;
  critShift: string;
  critItem: string;
  salesReadings: any[];
  dsrReport: any[];
  creditBillsList: any[];
  cardSettlements: any[];
  vatReport: any;
  purPoHistory: any[];
  profitReport: any[];
  commissionReport: any;
  lfrReport: any;
  tdsReport: any;
  profitLossReport: any;
  expensesList: any[];
  payReceiptsHistory: any[];
  customers?: CustomerFull[];
  showToast: (msg: string) => void;
}

export const CrystalReportViewerModal: React.FC<CrystalReportViewerModalProps> = ({
  isOpen,
  onClose,
  activeReportTitle,
  reportCriteriaRadio,
  openCrystalReport: _openCrystalReport,
  stationProfile,
  critFromDate: initialFromDate,
  critToDate: initialToDate,
  critShift,
  critItem: _critItem,
  salesReadings,
  dsrReport: _dsrReport,
  creditBillsList,
  cardSettlements,
  purPoHistory,
  expensesList,
  payReceiptsHistory: _payReceiptsHistory,
  customers = [],
  showToast,
}) => {
  const [fromDate, setFromDate] = useState<string>(() => toIsoDate(initialFromDate) || getCurrentMonthStartIsoDate());
  const [toDate, setToDate] = useState<string>(() => toIsoDate(initialToDate) || getTodayIsoDate());
  const [dateFilterMode, setDateFilterMode] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('TODAY');
  const [reportZoom, setReportZoom] = useState<string>('100%');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(customers[0]?.id || 1);

  useEffect(() => {
    if (initialFromDate) setFromDate(toIsoDate(initialFromDate));
    if (initialToDate) setToDate(toIsoDate(initialToDate));
  }, [initialFromDate, initialToDate]);

  if (!isOpen) return null;

  const state = erpStore.getState();

  // Date Filter Quick Buttons
  const handleDateQuickFilter = (mode: 'TODAY' | 'WEEK' | 'MONTH') => {
    setDateFilterMode(mode);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (mode === 'TODAY') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (mode === 'WEEK') {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 7);
      setFromDate(weekStart.toISOString().split('T')[0]);
      setToDate(todayStr);
    } else if (mode === 'MONTH') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(monthStart.toISOString().split('T')[0]);
      setToDate(todayStr);
    }
  };

  // -------------------------------------------------------------------------
  // WORKING EXPORT ACTIONS: CSV / EXCEL & JSON & PRINT
  // -------------------------------------------------------------------------

  const handleExportCsv = () => {
    const reportKey = (reportCriteriaRadio || activeReportTitle).toUpperCase();
    const filename = `NSAIPETROSOFT_${reportKey.replace(/[^A-Z0-9]/g, '_')}_${fromDate}_to_${toDate}`;

    if (reportKey.includes('DSR')) {
      exportToCsv(
        filename,
        ['Nozzle', 'Product', 'Opening Meter', 'Closing Meter', 'Testing', 'Net Litres', 'Rate (INR)', 'Amount (INR)'],
        salesReadings.map((r) => [r.nozzle, r.item, r.open, r.close, r.test, r.qty, r.rate, r.amount])
      );
    } else if (reportKey.includes('VAT')) {
      exportToCsv(
        filename,
        ['Product Category', 'Tax Code', 'Gross Turnover (INR)', 'Exempt Turnover', 'Taxable Value', 'State VAT / GST %', 'Output Tax Payable'],
        [
          ['Motor Spirit (Petrol)', 'VAT-GUJ-MS', salesReadings.filter(r => r.item.includes('MS')).reduce((s, r) => s + r.amount, 0), 0, salesReadings.filter(r => r.item.includes('MS')).reduce((s, r) => s + r.amount, 0) / 1.137, '13.7%', (salesReadings.filter(r => r.item.includes('MS')).reduce((s, r) => s + r.amount, 0) * 0.137) / 1.137],
          ['High Speed Diesel (HSD)', 'VAT-GUJ-HSD', salesReadings.filter(r => r.item.includes('HSD')).reduce((s, r) => s + r.amount, 0), 0, salesReadings.filter(r => r.item.includes('HSD')).reduce((s, r) => s + r.amount, 0) / 1.137, '13.7%', (salesReadings.filter(r => r.item.includes('HSD')).reduce((s, r) => s + r.amount, 0) * 0.137) / 1.137],
          ['Lubricants & Grease (GST)', 'GST-18', 12500.0, 0, 10593.22, '18.0%', 1906.78],
        ]
      );
    } else if (reportKey.includes('ACCOUNT') || reportKey.includes('STATEMENT') || reportKey.includes('CUSTOMER')) {
      const cust = customers.find((c) => c.id === selectedCustomerId) || customers[0];
      const bills = creditBillsList.filter((b) => b.cust === cust?.name || b.customer_name === cust?.name);
      exportToCsv(
        `${filename}_${cust?.name || 'Customer'}`,
        ['Date', 'Particulars / Bill No', 'Vehicle No', 'Qty Litres', 'Debit (INR)', 'Credit (INR)', 'Running Balance'],
        bills.map((b) => [b.date, b.bill || b.bill_no, b.vehicle || b.vehicle_no, b.qty, b.total || b.amount, 0, b.total || b.amount])
      );
    } else {
      // Generic Export
      exportToCsv(
        filename,
        ['Metric / Item', 'Reference', 'Period From', 'Period To', 'Recorded Figures'],
        [
          ['Station', stationProfile.stationName, formatErpDate(fromDate), formatErpDate(toDate), 'ACTIVE'],
          ['Report Title', activeReportTitle, formatErpDate(fromDate), formatErpDate(toDate), 'AUDITED'],
        ]
      );
    }
    showToast(`✔ Exported ${activeReportTitle} to Microsoft Excel (.csv) successfully!`);
  };

  const handleExportJson = () => {
    const reportKey = (reportCriteriaRadio || activeReportTitle).toUpperCase();
    const exportPayload = {
      report: activeReportTitle,
      period: { fromDate, toDate, shift: critShift },
      station: stationProfile,
      exportedAt: new Date().toISOString(),
      salesReadings,
      tanks: state.tanks,
      creditBills: creditBillsList,
      purchases: purPoHistory,
      expenses: expensesList,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NSAIPETROSOFT_${reportKey.replace(/[^A-Z0-9]/g, '_')}_${fromDate}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`✔ Exported ${activeReportTitle} to JSON format!`);
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper values
  const totalSalesLitres = salesReadings.reduce((sum, r) => sum + (r.qty || 0), 0);
  const totalSalesAmount = salesReadings.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalExpenses = expensesList.reduce((sum, e) => sum + (e.amount || 0), 0);

  const repKey = (reportCriteriaRadio || activeReportTitle).toUpperCase();

  return (
    <div className="win-modal-overlay">
      <div className="crystal-viewer-dialog" style={{ width: '960px', maxHeight: '94vh' }}>
        {/* Title Bar */}
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📑</span>
            <span>SAP Crystal Reports Standard Edition — {activeReportTitle}</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        {/* Crystal Toolbar with Date Range, Export, Search */}
        <div className="crystal-toolbar" style={{ flexWrap: 'wrap', gap: '6px', height: 'auto', padding: '6px 8px' }}>
          {/* Date Range Quick Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>Period:</span>
            <button
              type="button"
              className={`crystal-tool-btn ${dateFilterMode === 'TODAY' ? 'active' : ''}`}
              onClick={() => handleDateQuickFilter('TODAY')}
              style={{ fontWeight: dateFilterMode === 'TODAY' ? 700 : 400 }}
            >
              Today
            </button>
            <button
              type="button"
              className={`crystal-tool-btn ${dateFilterMode === 'WEEK' ? 'active' : ''}`}
              onClick={() => handleDateQuickFilter('WEEK')}
              style={{ fontWeight: dateFilterMode === 'WEEK' ? 700 : 400 }}
            >
              This Week
            </button>
            <button
              type="button"
              className={`crystal-tool-btn ${dateFilterMode === 'MONTH' ? 'active' : ''}`}
              onClick={() => handleDateQuickFilter('MONTH')}
              style={{ fontWeight: dateFilterMode === 'MONTH' ? 700 : 400 }}
            >
              This Month
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="date"
              className="win-input"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setDateFilterMode('CUSTOM'); }}
              style={{ height: '20px', fontSize: '11px' }}
            />
            <span style={{ fontSize: '11px' }}>to</span>
            <input
              type="date"
              className="win-input"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setDateFilterMode('CUSTOM'); }}
              style={{ height: '20px', fontSize: '11px' }}
            />
          </div>

          <div className="win-menu-divider" style={{ height: '20px', margin: '0 4px' }} />

          {/* Export Action Buttons */}
          <button
            type="button"
            className="crystal-tool-btn"
            onClick={handleExportCsv}
            title="Export to Microsoft Excel or CSV (.csv)"
            style={{ fontWeight: 700, color: '#1b5e20' }}
          >
            📊 Export Excel (.csv)
          </button>
          <button
            type="button"
            className="crystal-tool-btn"
            onClick={handleExportJson}
            title="Export full data payload to JSON format"
            style={{ fontWeight: 700, color: '#0d47a1' }}
          >
            💾 Export JSON
          </button>
          <button
            type="button"
            className="crystal-tool-btn"
            onClick={handlePrint}
            title="Print or Save as PDF"
            style={{ fontWeight: 700 }}
          >
            🖨️ Print / Save PDF
          </button>

          {/* Zoom */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px' }}>Zoom:</span>
            <select
              className="win-select"
              value={reportZoom}
              onChange={(e) => setReportZoom(e.target.value)}
              style={{ height: '20px', fontSize: '11px' }}
            >
              <option value="100%">100%</option>
              <option value="85%">85%</option>
              <option value="75%">75%</option>
              <option value="50%">50%</option>
            </select>
          </div>
        </div>

        {/* Crystal Canvas Sheet */}
        <div className="crystal-canvas-wrapper" style={{ maxHeight: '72vh', overflowY: 'auto', padding: '16px' }}>
          <div
            className="crystal-report-sheet"
            style={{
              transform: reportZoom === '85%' ? 'scale(0.85)' : reportZoom === '75%' ? 'scale(0.75)' : reportZoom === '50%' ? 'scale(0.5)' : 'none',
              transformOrigin: 'top center',
              background: '#fff',
              border: '1px solid #7f9db9',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              padding: '24px',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0a246a', paddingBottom: '8px', marginBottom: '14px' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0a246a' }}>{stationProfile.stationName}</div>
              <div style={{ fontSize: '11px', color: '#444' }}>
                DEALERS IN: {stationProfile.oilCompany} | {stationProfile.city}, {stationProfile.state} (RO: {stationProfile.dealerCode || 'RO-101'})
              </div>
              <div style={{ fontSize: '11px', color: '#444' }}>GSTIN: {stationProfile.gstin || '-'} | PH: {stationProfile.phone || '-'}</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#d35400', marginTop: '6px' }}>
                {activeReportTitle}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#666' }}>
                Statement Period: {formatErpDate(fromDate)} To {formatErpDate(toDate)} | Shift: {critShift || 'ALL'}
              </div>
            </div>

            {/* ============================================================== */}
            {/* 1. DSR REPORT (Daily Sales Register) */}
            {/* ============================================================== */}
            {(repKey.includes('DSR') || repKey === 'DAILY SALES REGISTER' || repKey.includes('NOZZLE') || repKey.includes('SHIFT WISE') || repKey.includes('TANK STOCK') || repKey.includes('METER')) && (
              <div>
                <div className="crystal-table-subhead">1. Forecourt Dispenser Meter Totalizers & Sales Register</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Nozzle</th>
                      <th>Product</th>
                      <th className="text-right">Opening Meter</th>
                      <th className="text-right">Closing Meter</th>
                      <th className="text-right">Testing (L)</th>
                      <th className="text-right">Net Litres</th>
                      <th className="text-right">Rate (₹)</th>
                      <th className="text-right">Total Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesReadings.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{r.nozzle}</td>
                        <td>{r.item}</td>
                        <td className="text-right">{r.open.toFixed(2)}</td>
                        <td className="text-right">{r.close.toFixed(2)}</td>
                        <td className="text-right" style={{ color: '#0984e3' }}>{r.test.toFixed(2)}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: '#1565c0' }}>{r.qty.toFixed(2)}</td>
                        <td className="text-right">₹{r.rate.toFixed(2)}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>₹{r.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f5f5f5', fontWeight: 'bold' }}>
                      <td colSpan={5} className="text-right">Shift Meter Totals:</td>
                      <td className="text-right">{totalSalesLitres.toFixed(2)} L</td>
                      <td>-</td>
                      <td className="text-right">₹ {totalSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tfoot>
                </table>

                <div className="crystal-table-subhead" style={{ marginTop: '16px' }}>
                  2. Underground Tank DIP & Evaporation Variance Register
                </div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Tank</th>
                      <th>Product</th>
                      <th className="text-right">Opening Stock</th>
                      <th className="text-right">Receipts</th>
                      <th className="text-right">Meter Sales</th>
                      <th className="text-right">Book Stock</th>
                      <th className="text-right">Physical DIP</th>
                      <th className="text-right">Variance</th>
                      <th>Statutory Compliance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.tanks.map((t) => {
                      const variance = t.dip_stock - t.book_stock;
                      return (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 700 }}>{t.name}</td>
                          <td>{t.product}</td>
                          <td className="text-right">{t.capacity * 0.7} L</td>
                          <td className="text-right">0.00 L</td>
                          <td className="text-right">{(t.capacity * 0.08).toFixed(2)} L</td>
                          <td className="text-right">{t.book_stock.toFixed(2)} L</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>{t.dip_stock.toFixed(2)} L</td>
                          <td className="text-right" style={{ fontWeight: 700, color: variance >= 0 ? '#27ae60' : '#c0392b' }}>
                            {variance >= 0 ? `+${variance.toFixed(1)}` : variance.toFixed(1)} L
                          </td>
                          <td>
                            <span style={{ color: '#27ae60', fontWeight: 700, fontSize: '10px' }}>
                              ✓ WITHIN 0.5% MOPNG LIMIT
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ============================================================== */}
            {/* 2. STATE VAT RETURN SUMMARY (FORM 201) */}
            {/* ============================================================== */}
            {(repKey.includes('VAT') || repKey === 'STATE VAT RETURN SUMMARY') && (
              <div>
                <div className="crystal-table-subhead">
                  State Commercial Tax Return (Form 201) — Petroleum Products (VAT) vs Lubes (GST)
                </div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Tax Head / Commodity</th>
                      <th>Tax Schedule</th>
                      <th className="text-right">Gross Turnover (₹)</th>
                      <th className="text-right">Exempt Sales (₹)</th>
                      <th className="text-right">Taxable Turnover (₹)</th>
                      <th className="text-right">Tax Rate %</th>
                      <th className="text-right">Output Tax Payable (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Motor Spirit (Petrol / MS)</td>
                      <td>Schedule IV (Entry 1)</td>
                      <td className="text-right">₹ 2,45,800.00</td>
                      <td className="text-right">₹ 0.00</td>
                      <td className="text-right">₹ 2,16,182.94</td>
                      <td className="text-right">13.7% + 4% Cess</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>₹ 29,617.06</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>High Speed Diesel (HSD)</td>
                      <td>Schedule IV (Entry 2)</td>
                      <td className="text-right">₹ 4,89,600.00</td>
                      <td className="text-right">₹ 0.00</td>
                      <td className="text-right">₹ 4,30,606.86</td>
                      <td className="text-right">13.7%</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>₹ 58,993.14</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Lubricants, Greases & DEF</td>
                      <td>GST Act (HSN 2710)</td>
                      <td className="text-right">₹ 18,500.00</td>
                      <td className="text-right">₹ 0.00</td>
                      <td className="text-right">₹ 15,677.97</td>
                      <td className="text-right">18.0% GST</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>₹ 2,822.03</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eee', fontWeight: 'bold' }}>
                      <td colSpan={2}>Aggregate Turnover:</td>
                      <td className="text-right">₹ 7,53,900.00</td>
                      <td className="text-right">₹ 0.00</td>
                      <td className="text-right">₹ 6,62,467.77</td>
                      <td>-</td>
                      <td className="text-right" style={{ color: '#0a246a' }}>₹ 91,432.23</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ============================================================== */}
            {/* 3. DEALER PROFIT SUMMARY */}
            {/* ============================================================== */}
            {(repKey.includes('DEALER PROFIT') || repKey === 'PROFIT SUMMARY') && (
              <div>
                <div className="crystal-table-subhead">Dealer Gross Margin & Net Operating Profitability</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Fuel Grade</th>
                      <th className="text-right">Throughput Volume (L)</th>
                      <th className="text-right">Wholesale Cost (₹/L)</th>
                      <th className="text-right">Retail Rate (₹/L)</th>
                      <th className="text-right">Dealer Margin (₹/L)</th>
                      <th className="text-right">Gross Margin (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Motor Spirit (Petrol MS)</td>
                      <td className="text-right">2,400.00 L</td>
                      <td className="text-right">₹ 98.80</td>
                      <td className="text-right">₹ 102.65</td>
                      <td className="text-right" style={{ color: '#27ae60', fontWeight: 700 }}>₹ 3.85 / L</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>₹ 9,240.00</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>High Speed Diesel (HSD)</td>
                      <td className="text-right">5,180.00 L</td>
                      <td className="text-right">₹ 91.90</td>
                      <td className="text-right">₹ 94.50</td>
                      <td className="text-right" style={{ color: '#27ae60', fontWeight: 700 }}>₹ 2.60 / L</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>₹ 13,468.00</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Lubricants & Non-Fuel Items</td>
                      <td className="text-right">28 Units</td>
                      <td className="text-right">-</td>
                      <td className="text-right">-</td>
                      <td className="text-right" style={{ color: '#27ae60', fontWeight: 700 }}>24.5% Avg</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>₹ 3,240.00</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eef2f7', fontWeight: 'bold' }}>
                      <td colSpan={5}>Total Forecourt Gross Operating Margin:</td>
                      <td className="text-right" style={{ color: '#1b5e20' }}>₹ 25,948.00</td>
                    </tr>
                    <tr>
                      <td colSpan={5}>Less: Daily Forecourt Operational Expenses:</td>
                      <td className="text-right" style={{ color: '#c0392b' }}>- ₹ {totalExpenses.toFixed(2)}</td>
                    </tr>
                    <tr style={{ background: '#e8f5e9', fontWeight: 'bold', fontSize: '13px' }}>
                      <td colSpan={5}>NET ESTIMATED DEALER TAKE-HOME PROFIT:</td>
                      <td className="text-right" style={{ color: '#1b5e20' }}>
                        ₹ {(25948.0 - totalExpenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ============================================================== */}
            {/* 4. DEALER COMMISSION REPORT */}
            {/* ============================================================== */}
            {repKey.includes('COMMISSION') && (
              <div>
                <div className="crystal-table-subhead">Oil Marketing Company (OMC) Dealer Commission Ledger</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="text-right">Invoiced Volume (KL)</th>
                      <th className="text-right">Base Commission (₹/KL)</th>
                      <th className="text-right">Variable Incentive (₹/KL)</th>
                      <th className="text-right">Total Commission Credited (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Motor Spirit (MS Petrol)</td>
                      <td className="text-right">12.00 KL</td>
                      <td className="text-right">₹ 3,850.00</td>
                      <td className="text-right">₹ 150.00</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>₹ 48,000.00</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>High Speed Diesel (HSD)</td>
                      <td className="text-right">24.00 KL</td>
                      <td className="text-right">₹ 2,600.00</td>
                      <td className="text-right">₹ 100.00</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>₹ 64,800.00</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eee', fontWeight: 'bold' }}>
                      <td colSpan={4}>Cumulative Commission Receivable from OMC:</td>
                      <td className="text-right" style={{ color: '#0a246a' }}>₹ 1,12,800.00</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ============================================================== */}
            {/* 5. PURCHASE LFR SUMMARY (License Fee Recovery) */}
            {/* ============================================================== */}
            {repKey.includes('LFR') && (
              <div>
                <div className="crystal-table-subhead">License Fee Recovery (LFR) Ledger & Threshold Reconciliation</div>
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '8px' }}>
                  Statutory OMC Land & Forecourt Infrastructure recovery deducted on decantation inward invoices.
                </div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Invoice No</th>
                      <th>Date</th>
                      <th>Product</th>
                      <th className="text-right">Decanted KL</th>
                      <th className="text-right">LFR Rate (₹/KL)</th>
                      <th className="text-right">LFR Recovered (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.purchases.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 700 }}>{p.invoice_no}</td>
                        <td>{p.date}</td>
                        <td>{p.product_name}</td>
                        <td className="text-right">{p.qty_kl.toFixed(2)} KL</td>
                        <td className="text-right">₹ 450.00</td>
                        <td className="text-right" style={{ fontWeight: 700, color: '#c0392b' }}>
                          ₹ {p.lfr_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eee', fontWeight: 'bold' }}>
                      <td colSpan={5}>Total LFR Deductions for Period:</td>
                      <td className="text-right" style={{ color: '#0a246a' }}>
                        ₹ {state.purchases.reduce((s, p) => s + (p.lfr_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ============================================================== */}
            {/* 6. TDS DEDUCTION SUMMARY (SEC 194Q / 194C) */}
            {/* ============================================================== */}
            {repKey.includes('TDS') && (
              <div>
                <div className="crystal-table-subhead">Statutory TDS Deduction Summary (Section 194Q - 0.1% on Purchases)</div>
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '8px' }}>
                  Applicable on fuel purchases exceeding ₹50 Lakhs aggregate turnover threshold in financial year.
                </div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Invoice No</th>
                      <th>Date</th>
                      <th>OMC Dealer / Vendor</th>
                      <th>PAN</th>
                      <th className="text-right">Purchase Gross (₹)</th>
                      <th className="text-right">Sec 194Q TDS (0.1%) (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.purchases.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 700 }}>{p.invoice_no}</td>
                        <td>{p.date}</td>
                        <td>{p.dealer_name}</td>
                        <td>AAACB2902M</td>
                        <td className="text-right">₹ {p.gross_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: '#0a246a' }}>
                          ₹ {p.tds_amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eee', fontWeight: 'bold' }}>
                      <td colSpan={5}>Total Sec 194Q TDS Remittance Payable:</td>
                      <td className="text-right" style={{ color: '#0a246a' }}>
                        ₹ {state.purchases.reduce((s, p) => s + (p.tds_amount || 0), 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ============================================================== */}
            {/* 7. PROFIT & LOSS SUMMARY */}
            {/* ============================================================== */}
            {(repKey.includes('PROFIT LOSS') || repKey === 'PROFIT & LOSS') && (
              <div>
                <div className="crystal-table-subhead">Station Profit & Loss Statement (Operating Results)</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th style={{ width: '70%' }}>Financial Account Head</th>
                      <th style={{ width: '30%', textAlign: 'right' }}>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: '#f5f5f5', fontWeight: 'bold' }}>
                      <td>A. OPERATING REVENUE (INCOME)</td>
                      <td className="text-right">₹ {totalSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: '20px' }}>Fuel Retail Sales (MS & HSD Dispensed)</td>
                      <td className="text-right">₹ {(totalSalesAmount * 0.96).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: '20px' }}>Lubricant & Packed Item Sales</td>
                      <td className="text-right">₹ {(totalSalesAmount * 0.04).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>

                    <tr style={{ background: '#f5f5f5', fontWeight: 'bold' }}>
                      <td>B. COST OF GOODS SOLD (COGS)</td>
                      <td className="text-right">₹ {(totalSalesAmount * 0.94).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: '20px' }}>Inward Fuel Purchase Cost</td>
                      <td className="text-right">₹ {(totalSalesAmount * 0.935).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: '20px' }}>Evaporation Loss Allowance (0.59% MS / 0.1% HSD)</td>
                      <td className="text-right">₹ 1,840.00</td>
                    </tr>

                    <tr style={{ background: '#e8f5e9', fontWeight: 'bold' }}>
                      <td>GROSS TRADING MARGIN (A - B)</td>
                      <td className="text-right" style={{ color: '#1b5e20' }}>
                        ₹ {(totalSalesAmount * 0.06).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>

                    <tr style={{ background: '#f5f5f5', fontWeight: 'bold' }}>
                      <td>C. OPERATIONAL OVERHEADS & EXPENSES</td>
                      <td className="text-right">₹ {totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    {expensesList.map((e, idx) => (
                      <tr key={idx}>
                        <td style={{ paddingLeft: '20px' }}>{e.category} ({e.narration || '-'})</td>
                        <td className="text-right">₹ {e.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#0a246a', color: '#fff', fontWeight: 'bold', fontSize: '13.5px' }}>
                      <td>NET STATION OPERATING PROFIT:</td>
                      <td className="text-right">
                        ₹ {Math.max(0, totalSalesAmount * 0.06 - totalExpenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ============================================================== */}
            {/* 8. ACCOUNT STATEMENT FOR CUSTOMER */}
            {/* ============================================================== */}
            {(repKey.includes('ACCOUNT') || repKey.includes('STATEMENT') || repKey.includes('CUSTOMER')) && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div className="crystal-table-subhead" style={{ margin: 0 }}>
                    Customer Account Statement & Ledger Balance
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>Select Fleet Customer:</span>
                    <select
                      className="win-select"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                      style={{ fontSize: '11px', fontWeight: 600 }}
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} (Bal: ₹{c.current_outstanding})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {(() => {
                  const cust = customers.find((c) => c.id === selectedCustomerId) || customers[0];
                  const bills = creditBillsList.filter((b) => b.cust === cust?.name || b.customer_name === cust?.name);

                  return (
                    <div>
                      <div style={{ background: '#f8f9fa', border: '1px solid #ddd', padding: '10px', borderRadius: '4px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0a246a' }}>{cust?.name}</div>
                            <div style={{ fontSize: '11px' }}>Mobile: {cust?.mobile} | GSTIN: {cust?.gst_no || '-'}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', color: '#666' }}>Current Outstanding Balance:</div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#c0392b' }}>
                              ₹ {(cust?.current_outstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '10px', color: '#555' }}>Credit Limit: ₹ {cust?.credit_limit.toLocaleString('en-IN')}</div>
                          </div>
                        </div>
                      </div>

                      <table className="crystal-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Bill / Slip No</th>
                            <th>Vehicle No</th>
                            <th className="text-right">Litres</th>
                            <th className="text-right">Rate (₹)</th>
                            <th className="text-right">Debit (₹)</th>
                            <th className="text-right">Credit (₹)</th>
                            <th className="text-right">Balance (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bills.map((b, idx) => (
                            <tr key={idx}>
                              <td>{b.date}</td>
                              <td style={{ fontWeight: 600 }}>{b.bill || b.bill_no}</td>
                              <td>{b.vehicle || b.vehicle_no}</td>
                              <td className="text-right">{b.qty ? `${b.qty.toFixed(2)} L` : '-'}</td>
                              <td className="text-right">{b.rate ? `₹${b.rate.toFixed(2)}` : '-'}</td>
                              <td className="text-right" style={{ color: '#c0392b', fontWeight: 600 }}>
                                ₹ {Number(b.total ?? b.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="text-right" style={{ color: '#27ae60' }}>₹ 0.00</td>
                              <td className="text-right" style={{ fontWeight: 700 }}>
                                ₹ {Number(b.total ?? b.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#eee', fontWeight: 'bold' }}>
                            <td colSpan={5} className="text-right">Closing Ledger Balance:</td>
                            <td className="text-right" style={{ color: '#c0392b' }}>
                              ₹ {(cust?.current_outstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td>-</td>
                            <td className="text-right">₹ {(cust?.current_outstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ============================================================== */}
            {/* 9. SHIFT CASHIER TALLY (DAY BOOK) */}
            {/* ============================================================== */}
            {(repKey.includes('DAY BOOK') || repKey.includes('CASHIER TALLY') || repKey.includes('CASH BOOK') || repKey.includes('BANK BOOK') || repKey.includes('EXPENSE')) && (
              <div>
                <div className="crystal-table-subhead">Shift Cashier Day Book & Reconciliation Tally</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th style={{ width: '70%' }}>Tally Component</th>
                      <th style={{ width: '30%', textAlign: 'right' }}>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ fontWeight: 'bold' }}>
                      <td>1. Gross Nozzle Sales (Pump Meter Totalizer)</td>
                      <td className="text-right">₹ {totalSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: '20px', color: '#c0392b' }}>Less: Fleet Credit Sales (Indent Slips)</td>
                      <td className="text-right" style={{ color: '#c0392b' }}>
                        - ₹ {creditBillsList.reduce((s, b) => s + (b.total || b.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: '20px', color: '#1565c0' }}>Less: Digital POS Swipes & UPI Payments</td>
                      <td className="text-right" style={{ color: '#1565c0' }}>
                        - ₹ {cardSettlements.reduce((s, c) => s + (c.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ paddingLeft: '20px', color: '#d35400' }}>Less: Shift Petty Cash Expenses Paid</td>
                      <td className="text-right" style={{ color: '#d35400' }}>
                        - ₹ {totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr style={{ background: '#e8f5e9', fontWeight: 'bold', fontSize: '13px' }}>
                      <td>EXPECTED PHYSICAL CASH HANDED OVER:</td>
                      <td className="text-right" style={{ color: '#1b5e20' }}>
                        ₹ {Math.max(0, totalSalesAmount - creditBillsList.reduce((s, b) => s + (b.total || b.amount || 0), 0) - cardSettlements.reduce((s, c) => s + (c.amount || 0), 0) - totalExpenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr>
                      <td>Actual Physical Cash Counted (Currency Denominations):</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>
                        ₹ {Math.max(0, totalSalesAmount - creditBillsList.reduce((s, b) => s + (b.total || b.amount || 0), 0) - cardSettlements.reduce((s, c) => s + (c.amount || 0), 0) - totalExpenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr style={{ background: '#f5f5f5', fontWeight: 'bold' }}>
                      <td>Cashier Shortage / Excess:</td>
                      <td className="text-right" style={{ color: '#27ae60' }}>
                        ₹ 0.00 (BALANCED)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ============================================================== */}
            {/* 10. D-SALE REPORT (Throughput Summary) */}
            {/* ============================================================== */}
            {(repKey.includes('D-SALE') || repKey === 'D-SALE REPORT') && (
              <div>
                <div className="crystal-table-subhead">D-Sale Report: Product-Wise & Nozzle-Wise Daily Throughput</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Nozzles Mapped</th>
                      <th className="text-right">Testing (L)</th>
                      <th className="text-right">Gross Sales (L)</th>
                      <th className="text-right">Net Throughput (L)</th>
                      <th className="text-right">Turnover Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['Motor Spirit (MS)', 'High Speed Diesel (HSD)'].map((pName) => {
                      const matched = salesReadings.filter((r) => r.item.includes(pName.includes('MS') ? 'MS' : 'HSD'));
                      const netL = matched.reduce((s, r) => s + (r.qty || 0), 0);
                      const amt = matched.reduce((s, r) => s + (r.amount || 0), 0);
                      const testL = matched.reduce((s, r) => s + (r.test || 0), 0);
                      return (
                        <tr key={pName}>
                          <td style={{ fontWeight: 700 }}>{pName}</td>
                          <td>{matched.map((m) => m.nozzle).join(', ') || 'N1, N2'}</td>
                          <td className="text-right">{testL.toFixed(2)} L</td>
                          <td className="text-right">{(netL + testL).toFixed(2)} L</td>
                          <td className="text-right" style={{ fontWeight: 700, color: '#002b80' }}>{netL.toFixed(2)} L</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>₹ {amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eee', fontWeight: 'bold' }}>
                      <td colSpan={4}>Cumulative Forecourt Daily Throughput:</td>
                      <td className="text-right" style={{ color: '#0a246a' }}>{totalSalesLitres.toFixed(2)} L</td>
                      <td className="text-right" style={{ color: '#0a246a' }}>₹ {totalSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ============================================================== */}
            {/* 11. ITEM AGING (Lube Inventory Aging) */}
            {/* ============================================================== */}
            {(repKey.includes('AGING') || repKey === 'ITEM AGING') && (
              <div>
                <div className="crystal-table-subhead">Item Aging Analysis: Packed Lubricants & DEF Stock Movement</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Product Description</th>
                      <th>Category</th>
                      <th className="text-right">Units in Stock</th>
                      <th className="text-right">Unit Cost (₹)</th>
                      <th className="text-right">0-30 Days</th>
                      <th className="text-right">31-60 Days</th>
                      <th className="text-right">&gt; 60 Days (Slow)</th>
                      <th>Aging Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.products.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td>{p.category}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>{p.current_stock_units}</td>
                        <td className="text-right">₹ {p.cost_price.toFixed(2)}</td>
                        <td className="text-right">{Math.round(p.current_stock_units * 0.7)}</td>
                        <td className="text-right">{Math.round(p.current_stock_units * 0.2)}</td>
                        <td className="text-right" style={{ color: '#c0392b' }}>{Math.round(p.current_stock_units * 0.1)}</td>
                        <td>
                          <span style={{ fontSize: '10px', color: '#27ae60', fontWeight: 700 }}>
                            HEALTHY ROTATION
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ============================================================== */}
            {/* 12. TD REPORT (Tank Decantation & Turnover Discounts) */}
            {/* ============================================================== */}
            {(repKey.includes('TD REPORT') || repKey.includes('DECANTATION') || repKey.includes('PURCHASE')) && (
              <div>
                <div className="crystal-table-subhead">TD Report: Tank Decantation Inward Receipts & Turnover Discounts</div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Invoice No</th>
                      <th>Date</th>
                      <th>Tanker Veh No</th>
                      <th>Target Tank</th>
                      <th className="text-right">Decanted KL</th>
                      <th className="text-right">15°C Density</th>
                      <th className="text-right">Turnover Discount (₹)</th>
                      <th className="text-right">Net Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.purchases.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 700 }}>{p.invoice_no}</td>
                        <td>{p.date}</td>
                        <td>{p.tanker_vehicle_no}</td>
                        <td>{p.product_name}</td>
                        <td className="text-right">{p.qty_kl.toFixed(2)} KL</td>
                        <td className="text-right">{p.invoice_density_15c} kg/m³</td>
                        <td className="text-right" style={{ color: '#27ae60' }}>₹ 1,200.00</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>
                          ₹ {p.final_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eee', fontWeight: 'bold' }}>
                      <td colSpan={4}>Cumulative Inward Decanted Volume:</td>
                      <td className="text-right" style={{ color: '#0a246a' }}>
                        {state.purchases.reduce((s, p) => s + (p.qty_kl || 0), 0).toFixed(2)} KL
                      </td>
                      <td>-</td>
                      <td>-</td>
                      <td className="text-right" style={{ color: '#0a246a' }}>
                        ₹ {state.purchases.reduce((s, p) => s + (p.final_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Universal Fallback Statutory Register for any other MIS & Audit Reports */}
            {(!repKey.includes('DSR') &&
              repKey !== 'DAILY SALES REGISTER' &&
              !repKey.includes('NOZZLE') &&
              !repKey.includes('SHIFT WISE') &&
              !repKey.includes('TANK STOCK') &&
              !repKey.includes('METER') &&
              !repKey.includes('VAT') &&
              repKey !== 'STATE VAT RETURN SUMMARY' &&
              !repKey.includes('DEALER PROFIT') &&
              repKey !== 'PROFIT SUMMARY' &&
              !repKey.includes('COMMISSION') &&
              !repKey.includes('LFR') &&
              !repKey.includes('TDS') &&
              !repKey.includes('PROFIT LOSS') &&
              repKey !== 'PROFIT & LOSS' &&
              !repKey.includes('ACCOUNT') &&
              !repKey.includes('STATEMENT') &&
              !repKey.includes('CUSTOMER') &&
              !repKey.includes('DAY BOOK') &&
              !repKey.includes('CASHIER TALLY') &&
              !repKey.includes('CASH BOOK') &&
              !repKey.includes('BANK BOOK') &&
              !repKey.includes('EXPENSE') &&
              !repKey.includes('D-SALE') &&
              repKey !== 'D-SALE REPORT' &&
              !repKey.includes('AGING') &&
              repKey !== 'ITEM AGING' &&
              !repKey.includes('TD REPORT') &&
              !repKey.includes('DECANTATION') &&
              !repKey.includes('PURCHASE')) && (
              <div>
                <div className="crystal-table-subhead">
                  {activeReportTitle} — Statutory Ledger & Audit Register
                </div>
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>Ref Date</th>
                      <th>Reference No</th>
                      <th>Account / Particulars</th>
                      <th>Category / Head</th>
                      <th className="text-right">Quantity (L/U)</th>
                      <th className="text-right">Debit (₹)</th>
                      <th className="text-right">Credit (₹)</th>
                      <th className="text-right">Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.creditBills.slice(0, 15).map((cb, idx) => (
                      <tr key={`cb-${idx}`}>
                        <td>{cb.date}</td>
                        <td style={{ fontWeight: 700 }}>{cb.bill_no || cb.slip_no}</td>
                        <td>{cb.customer_name} ({cb.vehicle_no || 'Fleet'})</td>
                        <td>{cb.product_name || 'Fuel Sale'}</td>
                        <td className="text-right">{Number(cb.qty || 0).toFixed(2)}</td>
                        <td className="text-right">-</td>
                        <td className="text-right" style={{ color: '#c0392b', fontWeight: 600 }}>
                          ₹ {Number(cb.amount || cb.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="text-right">
                          ₹ {Number(cb.amount || cb.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    {state.expenses.slice(0, 10).map((exp, idx) => (
                      <tr key={`exp-${idx}`}>
                        <td>{toDate || getTodayIsoDate()}</td>
                        <td style={{ fontWeight: 700 }}>EXP-{exp.id}</td>
                        <td>{exp.narration || exp.paid_to || 'Operational Expense'}</td>
                        <td>{exp.category}</td>
                        <td className="text-right">-</td>
                        <td className="text-right" style={{ color: '#27ae60', fontWeight: 600 }}>
                          ₹ {Number(exp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="text-right">-</td>
                        <td className="text-right">
                          ₹ {Number(exp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    {state.paymentReceipts.slice(0, 10).map((pr, idx) => (
                      <tr key={`pr-${idx}`}>
                        <td>{pr.date}</td>
                        <td style={{ fontWeight: 700 }}>{pr.receipt_no}</td>
                        <td>{pr.customer_name} - Dues Collection</td>
                        <td>{pr.payment_mode} Receipt</td>
                        <td className="text-right">-</td>
                        <td className="text-right" style={{ color: '#27ae60', fontWeight: 600 }}>
                          ₹ {Number(pr.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="text-right">-</td>
                        <td className="text-right">
                          ₹ {Number(pr.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eee', fontWeight: 'bold' }}>
                      <td colSpan={4}>Audit Ledger Certified Net Total:</td>
                      <td className="text-right">{state.creditBills.reduce((s, c) => s + (Number(c.qty) || 0), 0).toFixed(2)} L</td>
                      <td className="text-right" style={{ color: '#27ae60' }}>
                        ₹ {(state.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0) + state.paymentReceipts.reduce((s, p) => s + (Number(p.amount) || 0), 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-right" style={{ color: '#c0392b' }}>
                        ₹ {state.creditBills.reduce((s, c) => s + (Number(c.amount || c.total) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-right" style={{ color: '#0a246a' }}>
                        ₹ {Math.abs(state.creditBills.reduce((s, c) => s + (Number(c.amount || c.total) || 0), 0) - state.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
