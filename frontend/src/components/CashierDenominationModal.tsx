import React from 'react';
import type { DenominationMap } from '../models';

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
}

export const CashierDenominationModal: React.FC<CashierDenominationModalProps> = ({
  isOpen,
  onClose,
  denoms,
  setDenoms,
  denomResult,
  onCalculateDenom,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '680px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>💵</span>
            <span>Cashier Currency Denomination & Gap Tally</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
