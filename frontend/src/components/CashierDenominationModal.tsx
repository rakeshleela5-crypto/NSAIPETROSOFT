import React, { useState, useEffect } from 'react';
import type { DenominationMap } from '../models';
import { fetchCashDropsApi, recordCashDropApi, deleteCashDropApi } from '../api/client';

interface DenomResult {
  cash_total: number;
  expected_cash: number;
  gap_amount: number;
  status: string;
}

interface CashierDenominationModalProps {
  isOpen: boolean;
  onClose: () => void;
  denoms: DenominationMap;
  setDenoms: (d: DenominationMap) => void;
  denomResult: DenomResult | null;
  onCalculateDenom: () => void;
  showToast?: (msg: string) => void;
  loadAllErpData?: () => Promise<void>;
}

export const CashierDenominationModal: React.FC<CashierDenominationModalProps> = ({
  isOpen,
  onClose,
  denoms,
  setDenoms,
  denomResult,
  onCalculateDenom,
  showToast,
  loadAllErpData,
}) => {
  const [activeTab, setActiveTab] = useState<'denom' | 'safe_drops'>('denom');

  // Safe Cash Drop Form State
  const [cashDrops, setCashDrops] = useState<any[]>([]);
  const [isLoadingDrops, setIsLoadingDrops] = useState<boolean>(false);
  const [isSubmittingDrop, setIsSubmittingDrop] = useState<boolean>(false);
  const [dropAmount, setDropAmount] = useState<number>(10000);
  const [dropCashier, setDropCashier] = useState<string>('Cashier DSM');
  const [dropEnvelope, setDropEnvelope] = useState<string>(`DROP-${Date.now().toString().slice(-4)}`);
  const [dropShift, setDropShift] = useState<string>('Day');
  const [dropRemarks, setDropRemarks] = useState<string>('Mid-shift safe deposit');

  const loadCashDrops = async () => {
    try {
      setIsLoadingDrops(true);
      const data = await fetchCashDropsApi();
      setCashDrops(data || []);
    } catch {
      setCashDrops([]);
    } finally {
      setIsLoadingDrops(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'safe_drops') {
      loadCashDrops();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleRecordDrop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dropAmount <= 0) return;
    try {
      setIsSubmittingDrop(true);
      await recordCashDropApi({
        amount: dropAmount,
        witness_name: dropCashier.trim().toUpperCase(),
        notes: `Cashier: ${dropCashier.trim().toUpperCase()} | Env: ${dropEnvelope.trim().toUpperCase()} | Shift: ${dropShift}${dropRemarks ? ` | ${dropRemarks.trim()}` : ''}`,
      });
      if (showToast) showToast(`✔ Safe Cash Drop of ₹${dropAmount.toLocaleString('en-IN')} committed to PostgreSQL!`);
      setDropEnvelope(`DROP-${Date.now().toString().slice(-4)}`);
      await loadCashDrops();
      if (loadAllErpData) await loadAllErpData();
    } catch (err: any) {
      if (showToast) showToast(`❌ Safe Drop Error: ${err.message}`);
    } finally {
      setIsSubmittingDrop(false);
    }
  };

  const handleDeleteDrop = async (dropId: number) => {
    if (!window.confirm('Void this safe cash drop entry?')) return;
    try {
      await deleteCashDropApi(dropId);
      if (showToast) showToast('✔ Safe cash drop voided from PostgreSQL.');
      await loadCashDrops();
      if (loadAllErpData) await loadAllErpData();
    } catch (err: any) {
      if (showToast) showToast(`❌ Error voiding drop: ${err.message}`);
    }
  };

  const totalSafeDrops = cashDrops.reduce((acc, d) => acc + Number(d.amount || 0), 0);

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '740px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>💵</span>
            <span>Cashier Currency Denomination & Safe Drops (PostgreSQL-Backed)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tab Headers */}
        <div className="win-tab-header" style={{ padding: '6px 12px 0', borderBottom: '1px solid #7f9db9' }}>
          <button
            type="button"
            className={`win-tab-btn ${activeTab === 'denom' ? 'active' : ''}`}
            onClick={() => setActiveTab('denom')}
          >
            💵 Denomination Count & Tally
          </button>
          <button
            type="button"
            className={`win-tab-btn ${activeTab === 'safe_drops' ? 'active' : ''}`}
            onClick={() => setActiveTab('safe_drops')}
          >
            🔒 Shift Safe Cash Drops ({cashDrops.length})
          </button>
        </div>

        <div className="win-dialog-body">
          {/* TAB 1: CURRENCY DENOMINATIONS */}
          {activeTab === 'denom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>Physical Currency Notes Count</div>
                <div className="win-form-row">
                  <span className="win-label">₹ 2,000 ×</span>
                  <input
                    type="number"
                    className="win-input"
                    value={denoms.n2000}
                    onChange={(e) => setDenoms({ ...denoms, n2000: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 500 ×</span>
                  <input
                    type="number"
                    className="win-input"
                    value={denoms.n500}
                    onChange={(e) => setDenoms({ ...denoms, n500: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 200 ×</span>
                  <input
                    type="number"
                    className="win-input"
                    value={denoms.n200}
                    onChange={(e) => setDenoms({ ...denoms, n200: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 100 ×</span>
                  <input
                    type="number"
                    className="win-input"
                    value={denoms.n100}
                    onChange={(e) => setDenoms({ ...denoms, n100: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 50 ×</span>
                  <input
                    type="number"
                    className="win-input"
                    value={denoms.n50}
                    onChange={(e) => setDenoms({ ...denoms, n50: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 20 ×</span>
                  <input
                    type="number"
                    className="win-input"
                    value={denoms.n20}
                    onChange={(e) => setDenoms({ ...denoms, n20: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="win-form-row">
                  <span className="win-label">₹ 10 ×</span>
                  <input
                    type="number"
                    className="win-input"
                    value={denoms.n10}
                    onChange={(e) => setDenoms({ ...denoms, n10: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="win-form-row">
                  <span className="win-label">Coins ₹</span>
                  <input
                    type="number"
                    className="win-input"
                    value={denoms.coins}
                    onChange={(e) => setDenoms({ ...denoms, coins: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <button
                  type="button"
                  className="win-btn-classic win-btn-primary"
                  style={{ width: '100%', marginTop: '8px' }}
                  onClick={onCalculateDenom}
                >
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
                  <div style={{
                    marginTop: '8px',
                    padding: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textAlign: 'center',
                    background: denomResult.gap_amount < 0 ? '#fdecea' : '#e8f8f5',
                    color: denomResult.gap_amount < 0 ? '#c0392b' : '#27ae60'
                  }}>
                    Status: {denomResult.status}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SAFE CASH DROPS */}
          {activeTab === 'safe_drops' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.3fr', gap: '12px' }}>
              <div style={{ background: '#f5f5f5', border: '1px solid #7f9db9', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontWeight: 700, fontSize: '12px', color: '#0a246a', marginBottom: '8px' }}>
                  🔒 Drop Cash Envelope into Station Safe
                </div>
                <form onSubmit={handleRecordDrop}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '95px' }}>Drop Amount ₹</span>
                    <input
                      type="number"
                      step="100"
                      className="win-input"
                      required
                      value={dropAmount}
                      onChange={(e) => setDropAmount(parseFloat(e.target.value) || 0)}
                      style={{ flex: 1, fontWeight: 700, fontSize: '13px' }}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '95px' }}>Cashier DSM</span>
                    <input
                      type="text"
                      className="win-input"
                      required
                      value={dropCashier}
                      onChange={(e) => setDropCashier(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '95px' }}>Envelope #</span>
                    <input
                      type="text"
                      className="win-input"
                      required
                      value={dropEnvelope}
                      onChange={(e) => setDropEnvelope(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '95px' }}>Shift</span>
                    <select className="win-select" value={dropShift} onChange={(e) => setDropShift(e.target.value)} style={{ flex: 1 }}>
                      <option value="First">First Shift</option>
                      <option value="Second">Second Shift</option>
                      <option value="Night">Night Shift</option>
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '95px' }}>Remarks</span>
                    <input
                      type="text"
                      className="win-input"
                      placeholder="e.g. 20x500 notes in sealed pouch"
                      value={dropRemarks}
                      onChange={(e) => setDropRemarks(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div className="win-actions-row" style={{ marginTop: '12px' }}>
                    <button
                      type="submit"
                      className="win-btn-classic win-btn-primary"
                      disabled={isSubmittingDrop}
                      style={{ width: '100%', fontWeight: 700 }}
                    >
                      <span>🔒</span>
                      <span>{isSubmittingDrop ? 'Committing to PostgreSQL...' : 'Commit Safe Drop to DB'}</span>
                    </button>
                  </div>
                </form>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '11px', color: '#0a246a' }}>
                    Shift Safe Drops History
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '11px', color: '#1b5e20' }}>
                    Total Vaulted: ₹ {totalSafeDrops.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '280px', overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Envelope #</th>
                        <th>Cashier</th>
                        <th className="text-right">Amount (₹)</th>
                        <th>Status</th>
                        <th style={{ width: '36px', textAlign: 'center' }}>Del</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingDrops ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '10px' }}>Loading safe drops...</td></tr>
                      ) : cashDrops.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', color: '#666', padding: '10px' }}>No safe drops recorded yet this shift.</td></tr>
                      ) : (
                        cashDrops.map((d: any) => (
                          <tr key={d.id}>
                            <td style={{ fontSize: '10px' }}>{new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                            <td style={{ fontWeight: 600 }}>{d.drop_number}</td>
                            <td>{d.cashier_name}</td>
                            <td className="text-right" style={{ fontWeight: 700, color: '#1b5e20' }}>
                              ₹ {Number(d.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td><span style={{ fontSize: '9px', background: '#e8f8f5', color: '#27ae60', padding: '1px 4px', fontWeight: 700 }}>VAULTED</span></td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="win-btn-classic"
                                style={{ height: '18px', padding: '0 4px', fontSize: '9px', color: '#c0392b' }}
                                onClick={() => handleDeleteDrop(d.id)}
                                title="Void safe drop"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
