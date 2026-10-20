import React from 'react';
import type { DenominationMap, StationProfile } from '../models';
import { exportToCsv } from '../utils/exportCsv';
import { getTodayErpDate } from '../utils/dateUtils';
import { printThermalReceiptHtml } from '../utils/thermalPrinter';

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
  empCreditReceived?: number;
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
  empCreditReceived = 0,
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
  const effectiveCreditCollections = Number(empCreditReceived || 0);

  const totalFuelSales = salesReadings.length > 0
    ? salesReadings.reduce((acc, r) => acc + Number(r.amount || 0), 0)
    : empNozzleReadings.reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const totalLubeSales = empLubeItems.reduce((acc, l) => acc + Number(l.amount || 0), 0);
  const totalThroughput = Math.round((totalFuelSales + totalLubeSales + Number.EPSILON) * 100) / 100;

  // Airtight Shift Settlement Formulas:
  // 1. Expected Cash = Net Nozzle Sales + Lube Sales - Credit Bills - Card/UPI Receipts - Shift Expenses + Credit Collections
  const expectedCash = Math.round((totalThroughput - effectiveCreditTotal - effectiveDigitalTotal - effectiveExpenseTotal + effectiveCreditCollections + Number.EPSILON) * 100) / 100;

  // 2. Cashier Shortage / Excess = Physical Cash Handed Over - Expected Cash
  const cashierDiff = Math.round((effectiveCash - expectedCash + Number.EPSILON) * 100) / 100;
  const isShortage = cashierDiff < -1.0;
  const isExcess = cashierDiff > 1.0;
  const tallyStatus = isShortage
    ? `SHORTAGE (Cashier Owes: ₹ ${Math.abs(cashierDiff).toFixed(2)})`
    : isExcess
    ? `EXCESS (+₹ ${cashierDiff.toFixed(2)})`
    : 'BALANCED (₹ 0.00)';
  const totalReconciled = effectiveCash + effectiveCreditTotal + effectiveDigitalTotal + effectiveExpenseTotal;
  const totalMeterSales = totalThroughput;
  const gap = cashierDiff;

  const handlePrintThermalZReport = () => {
    const is58mm = stationProfile.printerPaperWidth === '58mm';
    const paperWidth = is58mm ? 58 : 80;
    const bodyWidth = is58mm ? '200px' : '280px';
    const fontSize = is58mm ? '10px' : '11.5px';
    const titleSize = is58mm ? '12px' : '14px';

    const denomHtml = denomRows
      .filter((d) => typeof d.count === 'number' && d.count > 0)
      .map(
        (d) => `
        <div style="display: flex; justify-content: space-between;">
          <span>${d.label} ${d.count}</span>
          <span>Rs. ${Number(d.value).toFixed(2)}</span>
        </div>`
      )
      .join('');

    const html = `
      <div style="font-family: 'Courier New', monospace; font-size: ${fontSize}; width: ${bodyWidth}; margin: 0 auto; line-height: 1.35; color: #000;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: ${titleSize}; font-weight: bold;">${stationProfile.stationName}</div>
          <div style="font-size: 10.5px;">${stationProfile.oilCompany} RETAIL OUTLET</div>
          ${stationProfile.dealerCode ? `<div style="font-size: 9.5px;">RO Code: ${stationProfile.dealerCode}</div>` : ''}
          <div style="font-size: 9.5px;">${stationProfile.address ? `${stationProfile.address}, ` : ''}${stationProfile.city || ''} ${stationProfile.stateCode ? `(${stationProfile.stateCode})` : ''}</div>
          <div style="font-size: 9.5px;">GSTIN: ${stationProfile.gstin || '-'} | PH: ${stationProfile.phone || '-'}</div>
          <div style="font-weight: bold; margin-top: 4px; border-top: 1px dashed #000; padding-top: 2px;">*** DAY-CLOSE Z-REPORT ***</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Date: ${getTodayErpDate()}</span>
          <span>Time: ${new Date().toLocaleTimeString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Shift: ${shiftName}</span>
          <span>Cashier: ${empSettlementEmp}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="font-weight: bold; text-align: center; margin-bottom: 2px;">PHYSICAL CASH TALLY</div>
        ${denomHtml}
        ${denoms.coins > 0 ? `
          <div style="display: flex; justify-content: space-between;">
            <span>Coins</span>
            <span>Rs. ${Number(denoms.coins).toFixed(2)}</span>
          </div>` : ''}
        <div style="border-top: 1px dashed #000; display: flex; justify-content: space-between; font-weight: bold; margin-top: 2px; padding-top: 2px;">
          <span>CASH HANDOVER:</span>
          <span>Rs. ${effectiveCash.toFixed(2)}</span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between;">
          <span>Net Sales (Nozzle + Lube):</span>
          <span>Rs. ${totalThroughput.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>— Credit Slips:</span>
          <span>Rs. ${effectiveCreditTotal.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>— Digital / Bank POS:</span>
          <span>Rs. ${effectiveDigitalTotal.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>— Shift Expenses:</span>
          <span>Rs. ${effectiveExpenseTotal.toFixed(2)}</span>
        </div>
        ${effectiveCreditCollections > 0 ? `
        <div style="display: flex; justify-content: space-between;">
          <span>+ Credit Recoveries:</span>
          <span>Rs. ${effectiveCreditCollections.toFixed(2)}</span>
        </div>` : ''}
        <div style="border-top: 1px dashed #000; margin-top: 3px; padding-top: 3px; display: flex; justify-content: space-between; font-weight: bold;">
          <span>EXPECTED CASH:</span>
          <span>Rs. ${expectedCash.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>PHYSICAL CASH:</span>
          <span>Rs. ${effectiveCash.toFixed(2)}</span>
        </div>
        <div style="border-top: 1px dashed #000; margin-top: 4px; padding-top: 4px; display: flex; justify-content: space-between; font-weight: bold; font-size: ${titleSize};">
          <span>TALLY STATUS:</span>
          <span>${tallyStatus}</span>
        </div>
        <div style="margin-top: 30px; border-top: 1px solid #000; padding-top: 4px; font-size: 9.5px; display: flex; justify-content: space-between;">
          <span>Cashier Sign</span>
          <span>Duty Manager</span>
        </div>
        <div style="text-align: center; font-size: 8.5px; margin-top: 6px;">
          <div>*** SHIFT CLOSE AUDIT VERIFIED ***</div>
          <div>POWERED BY NSAIPETROSOFT SYSTEM</div>
        </div>
      </div>
    `;
    printThermalReceiptHtml(html, { paperWidthMm: paperWidth });
    showToast('🧾 Thermal Z-Report printed successfully');
  };

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
          <button className="crystal-tool-btn" onClick={handlePrintThermalZReport} title="Print Thermal POS Z-Report (80mm/58mm)">🧾 Print Thermal Z-Report</button>
          <button className="crystal-tool-btn" onClick={() => window.print()} title="Print Full Sheet Report">🖨️ Print Full Sheet</button>
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

                {/* Airtight Shift Settlement Audit Card */}
                <div style={{ background: isShortage ? '#ffebee' : isExcess ? '#e8f5e9' : '#fffde7', border: `2px solid ${isShortage ? '#c62828' : isExcess ? '#2e7d32' : '#f57f17'}`, padding: '8px', marginTop: '8px' }}>
                  <div style={{ fontWeight: 800, fontSize: '11px', color: '#333', marginBottom: '6px', borderBottom: '1px solid #ddd', paddingBottom: '3px' }}>
                    FORECOURT SHIFT SETTLEMENT AUDIT:
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span>1. Net Nozzle & Lube Throughput:</span>
                    <strong>₹ {totalThroughput.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#555' }}>
                    <span>— Credit Fleet Slips:</span>
                    <span>- ₹ {effectiveCreditTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#555' }}>
                    <span>— Bank POS / Digital Collections:</span>
                    <span>- ₹ {effectiveDigitalTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#555' }}>
                    <span>— Shift Petty Cash Expenses:</span>
                    <span>- ₹ {effectiveExpenseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {effectiveCreditCollections > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#2e7d32' }}>
                      <span>+ Credit Dues Received:</span>
                      <span>+ ₹ {effectiveCreditCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid #ccc', margin: '4px 0', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700 }}>
                    <span>= EXPECTED CASH:</span>
                    <span>₹ {expectedCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700 }}>
                    <span>= PHYSICAL CASH HANDED OVER:</span>
                    <span>₹ {effectiveCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{
                    borderTop: `2px solid ${isShortage ? '#c62828' : isExcess ? '#2e7d32' : '#f57f17'}`,
                    paddingTop: '6px',
                    marginTop: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontWeight: 900,
                    fontSize: '12.5px',
                    color: isShortage ? '#b71c1c' : isExcess ? '#1b5e20' : '#e65100',
                  }}>
                    <span>CASHIER TALLY STATUS:</span>
                    <span>{tallyStatus}</span>
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
