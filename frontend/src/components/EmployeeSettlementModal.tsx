import React, { useState } from 'react';
import type { DenominationMap } from '../models';
import {
  saveShiftSettlement,
  triggerCreateBackup,
  settleEmployeeShortageApi,
  fetchEmployeeShortagesApi,
} from '../api/client';
import { calculateNetMeterQty } from '../utils/petroUtils';
import { enqueueOfflineRecord } from '../utils/offlineQueue';

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
  employeesList: Array<{ id: number; code: string; name: string; designation?: string; shortage_balance?: number; [key: string]: any }>;
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
  const [showShortageModal, setShowShortageModal] = useState<boolean>(false);
  const [shortageAmount, setShortageAmount] = useState<number>(0.0);
  const [shortageType, setShortageType] = useState<string>('CASH_RECOVERY');
  const [shortageNotes, setShortageNotes] = useState<string>('Immediate cash recovery from employee');
  const [shortagePin, setShortagePin] = useState<string>('1234');
  const [shortageLogs, setShortageLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [isSettling, setIsSettling] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentEmp = employeesList.find((e) => e.name === empSettlementEmp);

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

                {/* Airtight Shift Settlement Calculation */}
                {(() => {
                  const meterAndLubeTotal = (
                    (salesReadings.length > 0
                      ? salesReadings.reduce((acc, r) => acc + (r.amount || 0), 0)
                      : empNozzleReadings.reduce((acc, r) => acc + (r.amount || 0), 0)) +
                    empLubeItems.reduce((acc, l) => acc + (l.amount || 0), 0)
                  );
                  const cardTotal = empCardSwipes.reduce((acc, c) => acc + c.amount, 0);
                  const expTotal = empExpensesList.reduce((acc, e) => acc + e.amount, 0);

                  // 1. Expected Cash = (Net Nozzle Sales × Rate) + Lube Sales - Credit Bills - Card/UPI Receipts - Shift Expenses + Credit Collections
                  const expectedCash = Math.round((meterAndLubeTotal - empCreditSaleAmount - cardTotal - expTotal + empCreditReceived + Number.EPSILON) * 100) / 100;

                  // 2. Cashier Shortage / Excess = Physical Cash Handed Over - Expected Cash
                  const cashierDiff = Math.round((empCashAmount - expectedCash + Number.EPSILON) * 100) / 100;
                  const isShortage = cashierDiff < -1.0;
                  const isExcess = cashierDiff > 1.0;

                  return (
                    <div style={{ background: '#f5f5f5', border: '1px solid #aaa', padding: '8px', marginTop: '6px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#333', borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '4px' }}>
                        SHIFT SETTLEMENT AUDIT FORMULA:
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                        <span>Total Sales (Nozzle + Lube):</span>
                        <strong>₹ {meterAndLubeTotal.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#555' }}>
                        <span>— Credit Bills:</span>
                        <span>- ₹ {empCreditSaleAmount.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#555' }}>
                        <span>— Card / POS Total:</span>
                        <span>- ₹ {cardTotal.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#555' }}>
                        <span>— Shift Expenses:</span>
                        <span>- ₹ {expTotal.toFixed(2)}</span>
                      </div>
                      {empCreditReceived > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#2e7d32' }}>
                          <span>+ Credit Dues Received:</span>
                          <span>+ ₹ {empCreditReceived.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ borderTop: '1px solid #ddd', marginTop: '3px', paddingTop: '3px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700 }}>
                        <span>= 1. Expected Cash:</span>
                        <span>₹ {expectedCash.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700 }}>
                        <span>= 2. Physical Cash Handed Over:</span>
                        <span>₹ {empCashAmount.toFixed(2)}</span>
                      </div>

                      {/* Gap Amount Banner */}
                      <div style={{
                        marginTop: '8px',
                        padding: '8px',
                        background: isShortage ? '#ffebee' : isExcess ? '#e8f5e9' : '#fffde7',
                        border: `2px solid ${isShortage ? '#c62828' : isExcess ? '#2e7d32' : '#f57f17'}`,
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: isShortage ? '#c62828' : isExcess ? '#2e7d32' : '#f57f17' }}>
                          Cashier Shortage / Excess (Physical - Expected)
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: isShortage ? '#b71c1c' : isExcess ? '#1b5e20' : '#e65100' }}>
                          {cashierDiff >= 0 ? `+₹ ${cashierDiff.toFixed(2)}` : `-₹ ${Math.abs(cashierDiff).toFixed(2)}`}
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: isShortage ? '#d32f2f' : isExcess ? '#2e7d32' : '#555', marginTop: '2px' }}>
                          {isShortage ? '⚠️ CASHIER SHORTAGE: Amount must be recovered' : isExcess ? '🟢 CASHIER EXCESS: Surplus handed over' : '✔ BALANCED: Physical cash matches expected'}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                  {/* Cashier Accumulated Shortage Liability */}
                  <div style={{
                    marginTop: '6px',
                    padding: '5px 8px',
                    background: '#fff3e0',
                    border: '1px solid #ffe0b2',
                    borderRadius: '2px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '11px',
                  }}>
                    <span>
                      Cashier Ledger Balance: <strong style={{ color: Number(currentEmp?.shortage_balance || 0) > 0 ? '#d32f2f' : '#2e7d32' }}>
                        ₹ {Number(currentEmp?.shortage_balance || 0).toFixed(2)}
                      </strong> {Number(currentEmp?.shortage_balance || 0) > 0 ? '(Due)' : ''}
                    </span>
                    <button
                      type="button"
                      className="win-btn-classic"
                      style={{ fontSize: '10px', height: '20px', padding: '0 6px', fontWeight: 700 }}
                      onClick={async () => {
                        if (!currentEmp?.id) {
                          showToast('Please select a cashier first.');
                          return;
                        }
                        const bal = Number(currentEmp.shortage_balance || 0);
                        setShortageAmount(bal > 0 ? bal : 0);
                        setShortageType('CASH_RECOVERY');
                        setShortageNotes('Immediate cash recovery during shift handover');
                        setShortagePin('1234');
                        setShowShortageModal(true);
                        setIsLoadingLogs(true);
                        try {
                          const logs = await fetchEmployeeShortagesApi(currentEmp.id);
                          setShortageLogs(logs || []);
                        } catch {
                          setShortageLogs([]);
                        } finally {
                          setIsLoadingLogs(false);
                        }
                      }}
                    >
                      💳 Settle / Ledger
                    </button>
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
                      const matchedEmp = employeesList.find((e) => e.name === empSettlementEmp);
                      const payload = {
                        shift_name: empSettlementShift,
                        employee_id: matchedEmp?.id,
                        remarks: empSettlementRemarks,
                        denominations: denoms,
                        cash_total: empCashAmount,
                        digital_total: empCardSwipes.reduce((acc, c) => acc + c.amount, 0),
                        credit_total: empCreditSaleAmount,
                        expense_total: empExpensesList.reduce((acc, e) => acc + e.amount, 0),
                        expected_cash: liveMeterTotal - empCreditSaleAmount - empCardSwipes.reduce((acc, c) => acc + c.amount, 0) - empExpensesList.reduce((acc, e) => acc + e.amount, 0) + empCreditReceived,
                        actual_cash: empCashAmount,
                        gap_amount: gap,
                      };

                      try {
                        if (!navigator.onLine) {
                          enqueueOfflineRecord('SHIFT_SETTLEMENT', payload);
                          showToast(`💾 Offline Mode: Shift settlement buffered locally. Will auto-sync.`);
                          return;
                        }
                        await saveShiftSettlement(payload);
                        showToast(`✔ Shift Settlement Saved to PostgreSQL! Gap: ₹${gap.toFixed(2)}`);
                        await loadAllErpData();
                        try {
                          triggerCreateBackup().then((res) => {
                            showToast(`☁ Shift settlement snapshot archived to cloud: ${res.filename}`);
                          }).catch(() => {});
                        } catch {}
                      } catch (err: any) {
                        if (!navigator.onLine || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
                          enqueueOfflineRecord('SHIFT_SETTLEMENT', payload);
                          showToast(`💾 Offline Buffer: Shift settlement queued for auto-sync.`);
                        } else {
                          showToast(`⚠ Error saving shift settlement: ${err.message || 'Database error'}`);
                        }
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

      {/* SUB-MODAL: Employee Shortage Settlement & Advance Ledger */}
      {showShortageModal && currentEmp && (
        <div className="win-modal-overlay" style={{ zIndex: 1100 }}>
          <div className="win-form-dialog" style={{ width: '560px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💳</span>
                <span>Employee Shortage Recovery Ledger - {currentEmp.name}</span>
              </div>
              <button className="win-btn" onClick={() => setShowShortageModal(false)}>✕</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!currentEmp?.id || shortageAmount <= 0) {
                showToast('Please enter a valid recovery amount.');
                return;
              }
              setIsSettling(true);
              try {
                const res = await settleEmployeeShortageApi(currentEmp.id, {
                  amount: shortageAmount,
                  settlement_type: shortageType,
                  notes: shortageNotes,
                  manager_pin: shortagePin,
                });
                showToast(`✔ Shortage recovery of ₹${shortageAmount.toFixed(2)} recorded! New Balance: ₹${res.new_balance.toFixed(2)}`);
                setShowShortageModal(false);
                await loadAllErpData();
              } catch (err: any) {
                showToast(`❌ Recovery failed: ${err.message || 'Authorization rejected'}`);
              } finally {
                setIsSettling(false);
              }
            }}>
              <div className="win-dialog-body" style={{ padding: '12px' }}>
                <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', padding: '8px', fontSize: '11px', marginBottom: '10px' }}>
                  <strong>Advance / Shortage Reconciliation:</strong> Recovered cash is credited back to the station cash drawer, while payroll deductions are noted for monthly salary processing.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '90px' }}>Cashier:</span>
                    <input type="text" className="win-input" value={currentEmp.name} disabled style={{ flex: 1, background: '#eee', fontWeight: 700 }} />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '90px' }}>Current Due:</span>
                    <input type="text" className="win-input" value={`₹ ${Number(currentEmp.shortage_balance || 0).toFixed(2)}`} disabled style={{ flex: 1, background: '#eee', color: '#c62828', fontWeight: 800 }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '90px' }}>Recovery Amt:</span>
                    <input
                      type="number"
                      step="0.01"
                      className="win-input"
                      value={shortageAmount}
                      onChange={(e) => setShortageAmount(parseFloat(e.target.value) || 0)}
                      required
                      style={{ flex: 1, fontWeight: 700 }}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '90px' }}>Recovery Mode:</span>
                    <select
                      className="win-select"
                      value={shortageType}
                      onChange={(e) => setShortageType(e.target.value)}
                      style={{ flex: 1, fontWeight: 600 }}
                    >
                      <option value="CASH_RECOVERY">Cash Payment (Immediate)</option>
                      <option value="PAYROLL_DEDUCTION">Monthly Payroll Deduction</option>
                      <option value="WAIVER_AUTHORIZED">Manager Authorized Waiver</option>
                    </select>
                  </div>
                </div>

                <div className="win-form-row" style={{ marginBottom: '8px' }}>
                  <span className="win-label" style={{ minWidth: '90px' }}>Ledger Notes:</span>
                  <input
                    type="text"
                    className="win-input"
                    value={shortageNotes}
                    onChange={(e) => setShortageNotes(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>

                <div className="win-form-row" style={{ marginBottom: '10px' }}>
                  <span className="win-label" style={{ minWidth: '90px' }}>Manager PIN:</span>
                  <input
                    type="password"
                    maxLength={6}
                    className="win-input"
                    placeholder="Enter PIN (Default: 1234)"
                    value={shortagePin}
                    onChange={(e) => setShortagePin(e.target.value)}
                    required
                    style={{ width: '130px', letterSpacing: '3px', fontWeight: 700 }}
                  />
                </div>

                {/* Audit History */}
                <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px', color: '#333' }}>
                  Past Shortages & Recoveries:
                </div>
                <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '110px', overflowY: 'auto' }}>
                  {isLoadingLogs ? (
                    <div style={{ padding: '8px', textAlign: 'center', fontSize: '11px' }}>Loading ledger history...</div>
                  ) : shortageLogs.length === 0 ? (
                    <div style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: '#666' }}>No previous shortage records for this employee.</div>
                  ) : (
                    <table className="win-datagrid" style={{ fontSize: '10.5px' }}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th className="text-right">Amount</th>
                          <th>Status</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shortageLogs.map((log, idx) => (
                          <tr key={idx}>
                            <td>{log.date}</td>
                            <td>{log.entry_type || log.type}</td>
                            <td className="text-right" style={{ fontWeight: 600, color: (log.entry_type || log.type) === 'SHORTAGE' ? '#c62828' : '#2e7d32' }}>
                              ₹ {Number(log.amount || 0).toFixed(2)}
                            </td>
                            <td>{log.status || 'Settled'}</td>
                            <td>{log.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="win-dialog-footer">
                <span className="hotkeys-hint-red">Manager Authorization Required</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="submit"
                    className="win-btn-classic win-btn-primary"
                    disabled={isSettling}
                  >
                    {isSettling ? 'Recording...' : 'Confirm Recovery'}
                  </button>
                  <button
                    type="button"
                    className="win-btn-classic"
                    onClick={() => setShowShortageModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
