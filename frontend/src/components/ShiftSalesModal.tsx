import React from 'react';
import { exportToCsv } from '../utils/exportCsv';
import { getTodayErpDate } from '../utils/dateUtils';
import { calculateNetMeterQty } from '../utils/petroUtils';

interface EmployeeItem {
  id: number;
  name: string;
  code?: string;
}

interface SalesReadingRow {
  emp: string;
  nozzle: string;
  item: string;
  open: number;
  close: number;
  test: number;
  qty: number;
  rate: number;
  amount: number;
  vat: string | number;
  lube: number;
  [key: string]: any;
}

interface ShiftSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  salesDate: string;
  setSalesDate: (d: string) => void;
  shiftName: string;
  setShiftName: (s: string) => void;
  importFromApp: boolean;
  setImportFromApp: (b: boolean) => void;
  shiftNumber: string;
  setShiftNumber: (s: string) => void;
  salesReadings: SalesReadingRow[];
  setSalesReadings: (readings: SalesReadingRow[]) => void;
  employeesList: EmployeeItem[];
  shiftSettlementsList: any[];
  showToast: (msg: string) => void;
  onOpenCreditDialog: () => void;
  onOpenExpenseBook: () => void;
  onOpenDenomDialog: () => void;
  onSaveShiftMeters: () => void;
}

export const ShiftSalesModal: React.FC<ShiftSalesModalProps> = ({
  isOpen,
  onClose,
  salesDate,
  setSalesDate,
  shiftName,
  setShiftName,
  importFromApp,
  setImportFromApp,
  shiftNumber,
  setShiftNumber,
  salesReadings,
  setSalesReadings,
  employeesList,
  shiftSettlementsList,
  showToast,
  onOpenCreditDialog,
  onOpenExpenseBook,
  onOpenDenomDialog,
  onSaveShiftMeters,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⛽</span>
            <span>Sales Entry (Nozzle Totalizers & Tank Balance)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '8px' }}>
            <div className="win-form-row">
              <span className="win-label" style={{ minWidth: '40px' }}>Date</span>
              <input
                type="text"
                className="win-input"
                value={salesDate}
                onChange={(e) => setSalesDate(e.target.value)}
                style={{ width: '100px', fontWeight: 600 }}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label" style={{ minWidth: '40px' }}>Shift</span>
              <select
                className="win-select"
                style={{ width: '80px' }}
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
              >
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
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button
                type="button"
                className="win-btn-classic"
                style={{ fontSize: '11px', padding: '2px 8px', background: '#eff6ff', borderColor: '#93c5fd', color: '#1d4ed8', fontWeight: 700 }}
                onClick={() => {
                  const copy = salesReadings.map((row) => {
                    const testVal = 5.0;
                    const qty = calculateNetMeterQty(row.open, row.close, testVal);
                    const amt = Math.round(qty * row.rate * 100) / 100;
                    const vatPct = row.vat_percent || (row.item?.includes('Petrol') || row.item?.includes('MS') ? 13.7 : 20.2);
                    const vat = ((amt * vatPct) / (100 + vatPct)).toFixed(2);
                    return { ...row, test: testVal, qty, amount: amt, vat };
                  });
                  setSalesReadings(copy);
                  showToast('✔ 5.0 L daily calibration test applied to all nozzles.');
                }}
                title="Apply standard 5-liter daily measure-can calibration testing on all active nozzles"
              >
                ⚡ Set 5L Test (All)
              </button>
              <button
                type="button"
                className="win-btn-classic"
                style={{ fontSize: '11px', padding: '2px 6px' }}
                onClick={() => {
                  const copy = salesReadings.map((row) => {
                    const qty = calculateNetMeterQty(row.open, row.close, 0.0);
                    const amt = Math.round(qty * row.rate * 100) / 100;
                    const vatPct = row.vat_percent || (row.item?.includes('Petrol') || row.item?.includes('MS') ? 13.7 : 20.2);
                    const vat = ((amt * vatPct) / (100 + vatPct)).toFixed(2);
                    return { ...row, test: 0.0, qty, amount: amt, vat };
                  });
                  setSalesReadings(copy);
                  showToast('✔ Testing quantities reset to 0.');
                }}
                title="Reset testing quantities to 0"
              >
                Clear Test
              </button>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontWeight: 700 }}>SO NO.</span>
              <input
                type="text"
                className="win-input"
                value={shiftNumber}
                onChange={(e) => setShiftNumber(e.target.value)}
                style={{ width: '70px', fontWeight: 700 }}
              />
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
                  <th>Rollover / Status</th>
                  <th>Testing (L)</th>
                  <th>Sale Qty</th>
                  <th>Rate</th>
                  <th>Total Amount</th>
                  <th>06:00 AM Split</th>
                </tr>
              </thead>
              <tbody>
                {salesReadings.map((r, i) => {
                  const isRollover = r.close < r.open && r.open > 0;
                  return (
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
                          id={`closing_meter_${i}`}
                          type="number"
                          className="win-input"
                          style={{ width: '75px', fontWeight: 600 }}
                          value={r.close}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const nextInput = document.getElementById(`closing_meter_${i + 1}`);
                              if (nextInput) {
                                (nextInput as HTMLInputElement).focus();
                                (nextInput as HTMLInputElement).select();
                              }
                            }
                          }}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const copy = [...salesReadings];
                            copy[i].close = val;
                            copy[i].qty = calculateNetMeterQty(copy[i].open, val, copy[i].test);
                            if (copy[i].split_closing && copy[i].split_rate) {
                              const q1 = Math.max(0, copy[i].split_closing - copy[i].open);
                              const q2 = Math.max(0, val - copy[i].split_closing - copy[i].test);
                              copy[i].amount = (q1 * copy[i].split_rate) + (q2 * copy[i].rate);
                            } else {
                              copy[i].amount = copy[i].qty * copy[i].rate;
                            }
                            const vatPct = copy[i].vat_percent != null && copy[i].vat_percent > 0
                              ? copy[i].vat_percent
                              : (copy[i].item?.includes('Petrol') || copy[i].item?.includes('MS') ? 13.7 : 20.2);
                            copy[i].vat = ((copy[i].amount * vatPct) / (100 + vatPct)).toFixed(2);
                            setSalesReadings(copy);
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isRollover ? (
                          <span
                            style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #f59e0b',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              fontSize: '9.5px',
                              fontWeight: 700,
                            }}
                            title="Totalizer wrapped around to 0. Net volume automatically computed using (1,000,000 - Open) + Close"
                          >
                            ⚡ Rollover (Auto)
                          </span>
                        ) : (
                          <span style={{ color: '#16a34a', fontSize: '10px' }}>✓ Normal</span>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          className="win-input"
                          style={{ width: '45px' }}
                          value={r.test}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const copy = [...salesReadings];
                            copy[i].test = val;
                            copy[i].qty = calculateNetMeterQty(copy[i].open, copy[i].close, val);
                            copy[i].amount = copy[i].qty * copy[i].rate;
                            const vatPct = copy[i].vat_percent != null && copy[i].vat_percent > 0
                              ? copy[i].vat_percent
                              : (copy[i].item?.includes('Petrol') || copy[i].item?.includes('MS') ? 13.7 : 20.2);
                            copy[i].vat = ((copy[i].amount * vatPct) / (100 + vatPct)).toFixed(2);
                            setSalesReadings(copy);
                          }}
                        />
                      </td>
                      <td style={{ fontWeight: 700, color: '#1565c0' }}>{r.qty.toFixed(2)}</td>
                      <td>{r.rate}</td>
                      <td style={{ fontWeight: 700 }}>₹ {r.amount.toFixed(2)}</td>
                      <td>
                        <input
                          type="number"
                          placeholder="06 AM Meter"
                          title="Enter reading at 06:00 AM price revision snapshot if rate changed mid-shift"
                          className="win-input"
                          style={{ width: '70px', fontSize: '10px' }}
                          value={r.split_closing || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const copy = [...salesReadings];
                            copy[i].split_closing = val;
                            if (val > copy[i].open) {
                              const q1 = Math.max(0, val - copy[i].open);
                              const q2 = Math.max(0, copy[i].close - val - copy[i].test);
                              const splitR = copy[i].split_rate || copy[i].rate;
                              copy[i].amount = (q1 * splitR) + (q2 * copy[i].rate);
                            }
                            setSalesReadings(copy);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
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
              <div className="win-actions-row" style={{ marginTop: '6px' }}>
                <button type="button" className="win-btn-classic" onClick={onOpenCreditDialog}>
                  <span>💳</span>
                  <span>Credit Entry</span>
                </button>
                <button type="button" className="win-btn-classic" onClick={onOpenExpenseBook}>
                  <span>📒</span>
                  <span>Expense Book</span>
                </button>
                <button type="button" className="win-btn-classic" onClick={onOpenDenomDialog}>
                  <span>💵</span>
                  <span>Cash Settlement</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | F2=Save | F1=New | CTRL+A=Add To List</span>
          <div className="win-actions-row">
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
              <span>📥</span>
              <span>Export to Excel (CSV)</span>
            </button>
            <button type="button" className="win-btn-classic win-btn-primary" onClick={onSaveShiftMeters}>
              <span>💾</span>
              <span>Save (F2)</span>
            </button>
            <button type="button" className="win-btn-classic" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
