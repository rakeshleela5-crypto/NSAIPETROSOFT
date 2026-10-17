import React from 'react';
import type { DenominationMap, StationProfile } from '../models';
import { exportToCsv } from '../utils/exportCsv';
import { getTodayErpDate } from '../utils/dateUtils';

interface DayBookReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  denoms: DenominationMap;
  empCashAmount: number;
  creditBillsList: any[];
  cardSettlements: any[];
  empCardSwipes: any[];
  expensesList: any[];
  empExpensesList: any[];
  salesReadings: any[];
  empNozzleReadings: any[];
  empLubeItems: any[];
  shiftName: string;
  stationProfile: StationProfile;
  empSettlementEmp: string;
  empSettlementMachine: string;
  showToast: (msg: string) => void;
}

export const DayBookReportModal: React.FC<DayBookReportModalProps> = ({
  isOpen,
  onClose,
  denoms,
  empCashAmount,
  creditBillsList,
  cardSettlements,
  empCardSwipes,
  expensesList,
  empExpensesList,
  salesReadings,
  empNozzleReadings,
  empLubeItems,
  shiftName,
  stationProfile,
  empSettlementEmp,
  empSettlementMachine,
  showToast,
}) => {
  if (!isOpen) return null;

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
          <button className="win-btn" onClick={onClose}>✕</button>
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

            {/* 2 Columns */}
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

                {/* Gap Amount Display */}
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
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
