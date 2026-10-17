import React from 'react';
import type { DenominationMap } from '../models';
import { saveShiftSettlement, triggerCreateBackup } from '../api/client';
import { calculateNetMeterQty } from '../utils/petroUtils';

interface EmployeeSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  empSettlementDate: string;
  setEmpSettlementDate: (d: string) => void;
  empSettlementShift: string;
  setEmpSettlementShift: (s: string) => void;
  empSettlementSaleNo: string;
  setEmpSettlementSaleNo: (n: string) => void;
  empSettlementEmp: string;
  setEmpSettlementEmp: (e: string) => void;
  empSettlementMachine: string;
  setEmpSettlementMachine: (m: string) => void;
  empSettlementRemarks: string;
  setEmpSettlementRemarks: (r: string) => void;
  employeesList: Array<{ id: number; code: string; name: string; designation: string }>;
  salesReadings: any[];
  setSalesReadings: (r: any[]) => void;
  empNozzleReadings: any[];
  setEmpNozzleReadings: (r: any[]) => void;
  empLubeItems: any[];
  setEmpLubeItems: (l: any[]) => void;
  empCardSwipes: any[];
  setEmpCardSwipes: (c: any[]) => void;
  empExpensesList: any[];
  setEmpExpensesList: (e: any[]) => void;
  empCashAmount: number;
  setEmpCashAmount: (a: number) => void;
  empCreditSaleAmount: number;
  setEmpCreditSaleAmount: (a: number) => void;
  empCreditReceived: number;
  setEmpCreditReceived: (a: number) => void;
  empUplagBaki: number;
  setEmpUplagBaki: (a: number) => void;
  denoms: DenominationMap;
  onOpenDenom: () => void;
  onOpenDayBook: () => void;
  showToast: (msg: string) => void;
  loadAllErpData: () => Promise<void>;
}

export const EmployeeSettlementModal: React.FC<EmployeeSettlementModalProps> = ({
  isOpen,
  onClose,
  empSettlementDate,
  setEmpSettlementDate,
  empSettlementShift,
  setEmpSettlementShift,
  empSettlementSaleNo,
  setEmpSettlementSaleNo,
  empSettlementEmp,
  setEmpSettlementEmp,
  empSettlementMachine,
  setEmpSettlementMachine,
  empSettlementRemarks,
  setEmpSettlementRemarks,
  employeesList,
  salesReadings,
  setSalesReadings,
  empNozzleReadings,
  setEmpNozzleReadings,
  empLubeItems,
  setEmpLubeItems,
  empCardSwipes,
  setEmpCardSwipes,
  empExpensesList,
  setEmpExpensesList,
  empCashAmount,
  setEmpCashAmount,
  empCreditSaleAmount,
  setEmpCreditSaleAmount,
  empCreditReceived,
  setEmpCreditReceived,
  empUplagBaki,
  setEmpUplagBaki,
  denoms,
  onOpenDenom,
  onOpenDayBook,
  showToast,
  loadAllErpData,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="emp-settlement-dialog">
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>👨‍💼</span>
            <span>Employee Daily Sales Settlement (FrmLis...)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
          {/* Top Form Fields */}
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
                      const sale = r.qty ?? r.sale ?? calculateNetMeterQty(op, cl, tst);
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
                                  curr.qty = calculateNetMeterQty(o, newCl, t);
                                  curr.amount = parseFloat((curr.qty * (curr.rate || 0)).toFixed(2));
                                  updated[i] = curr;
                                  setSalesReadings(updated);
                                } else {
                                  const updated = [...empNozzleReadings];
                                  const curr = { ...updated[i] };
                                  curr.close = newCl;
                                  const o = curr.op ?? curr.open ?? 0;
                                  const t = curr.test ?? 0;
                                  curr.sale = calculateNetMeterQty(o, newCl, t);
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
                                  curr.qty = calculateNetMeterQty(o, c, newTst);
                                  curr.amount = parseFloat((curr.qty * (curr.rate || 0)).toFixed(2));
                                  updated[i] = curr;
                                  setSalesReadings(updated);
                                } else {
                                  const updated = [...empNozzleReadings];
                                  const curr = { ...updated[i] };
                                  curr.test = newTst;
                                  const o = curr.op ?? curr.open ?? 0;
                                  const c = curr.close ?? 0;
                                  curr.sale = calculateNetMeterQty(o, c, newTst);
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

            {/* Right Side: Cash Collection & Gap Calculation */}
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
                    onClick={onOpenDenom}
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

                  {/* Gap Amount Banner */}
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
                    onClick={onOpenDayBook}
                    title="Print 2-Column Cashier Tally"
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
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
