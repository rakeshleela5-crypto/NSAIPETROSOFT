import React from 'react';
import type { FuelProductRate } from '../models';

interface RateHistoryItem {
  id?: number;
  product_name: string;
  rate: number;
  effective_date: string;
}

interface FuelRateMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  ratesList: FuelProductRate[];
  rateHist: RateHistoryItem[];
  rateProduct: number;
  setRateProduct: (id: number) => void;
  rateValue: number;
  setRateValue: (val: number) => void;
  onSaveRate: (e: React.FormEvent) => void;
  onDeleteRateHistory?: (historyId: number) => Promise<void> | void;
}

export const FuelRateMasterModal: React.FC<FuelRateMasterModalProps> = ({
  isOpen,
  onClose,
  ratesList,
  rateHist,
  rateProduct,
  setRateProduct,
  rateValue,
  setRateValue,
  onSaveRate,
  onDeleteRateHistory,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '560px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏷️</span>
            <span>Fuel Rate Master</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <form onSubmit={onSaveRate} style={{ marginBottom: '12px' }}>
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
              <button
                type="submit"
                className="win-btn-classic win-btn-primary"
                style={{ marginLeft: '6px' }}
              >
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
                      <th style={{ textAlign: 'center', width: '65px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateHist.map((h, idx) => (
                      <tr key={h.id || idx}>
                        <td>{h.product_name}</td>
                        <td style={{ fontWeight: 600 }}>₹ {h.rate}</td>
                        <td>{h.effective_date}</td>
                        <td style={{ textAlign: 'center' }}>
                          {h.id && onDeleteRateHistory ? (
                            <button
                              type="button"
                              className="win-btn-classic"
                              style={{ fontSize: '9.5px', height: '18px', padding: '0 4px', color: '#c0392b', fontWeight: 600 }}
                              onClick={() => onDeleteRateHistory(h.id!)}
                              title="Delete this revision and revert to preceding rate"
                            >
                              🗑️ Revert
                            </button>
                          ) : (
                            <span style={{ color: '#888', fontSize: '9px' }}>-</span>
                          )}
                        </td>
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
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
