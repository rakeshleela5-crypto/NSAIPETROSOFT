import React from 'react';
import type { TankStock } from '../models';
import { exportToCsv } from '../utils/exportCsv';

interface TankDipRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tanks: TankStock[];
  dipTankId: number;
  setDipTankId: (id: number) => void;
  dipOpenCm: number;
  setDipOpenCm: (cm: number) => void;
  dipOpenStock: number;
  setDipOpenStock: (stock: number) => void;
  dipReceipt: number;
  setDipReceipt: (receipt: number) => void;
  dipCloseCm: number;
  setDipCloseCm: (cm: number) => void;
  dipCloseStock: number;
  setDipCloseStock: (stock: number) => void;
  dipsList: any[];
  onSaveDip: (e: React.FormEvent) => void;
}

export const TankDipRegisterModal: React.FC<TankDipRegisterModalProps> = ({
  isOpen,
  onClose,
  tanks,
  dipTankId,
  setDipTankId,
  dipOpenCm,
  setDipOpenCm,
  dipOpenStock,
  setDipOpenStock,
  dipReceipt,
  setDipReceipt,
  dipCloseCm,
  setDipCloseCm,
  dipCloseStock,
  setDipCloseStock,
  dipsList,
  onSaveDip,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '620px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📐</span>
            <span>Tank Dip Register & Evaporation Loss Audit</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <form onSubmit={onSaveDip}>
            <div className="win-form-row">
              <span className="win-label">Tank</span>
              <select
                className="win-select"
                style={{ flex: 1 }}
                value={dipTankId}
                onChange={(e) => setDipTankId(parseInt(e.target.value))}
              >
                {tanks.length > 0 ? (
                  tanks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.product}) - Cap: {t.capacity.toLocaleString('en-IN')}L
                    </option>
                  ))
                ) : (
                  <>
                    <option value={1}>MS Tank 1 (Petrol) - Cap: 20000L</option>
                    <option value={2}>HSD Tank 1 (Diesel) - Cap: 20000L</option>
                  </>
                )}
              </select>
            </div>
            <div className="win-form-row">
              <span className="win-label">Opening Dip (cm)</span>
              <input
                type="number"
                step="0.1"
                className="win-input"
                value={dipOpenCm}
                onChange={(e) => setDipOpenCm(parseFloat(e.target.value) || 0)}
              />
              <span className="win-label" style={{ minWidth: '70px', marginLeft: '6px' }}>Stock (L)</span>
              <input
                type="number"
                className="win-input"
                value={dipOpenStock}
                onChange={(e) => setDipOpenStock(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Inward Receipt (L)</span>
              <input
                type="number"
                className="win-input"
                value={dipReceipt}
                onChange={(e) => setDipReceipt(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Closing Dip (cm)</span>
              <input
                type="number"
                step="0.1"
                className="win-input"
                value={dipCloseCm}
                onChange={(e) => setDipCloseCm(parseFloat(e.target.value) || 0)}
              />
              <span className="win-label" style={{ minWidth: '70px', marginLeft: '6px' }}>Stock (L)</span>
              <input
                type="number"
                className="win-input"
                value={dipCloseStock}
                onChange={(e) => setDipCloseStock(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button type="submit" className="win-btn-classic win-btn-primary">Record Dip (F2)</button>
            </div>
          </form>
        </div>
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | F2=Save</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="win-btn-classic"
              style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
              onClick={() => exportToCsv(
                `NSAIPETROSOFT_TankDips_${new Date().toISOString().split('T')[0]}`,
                ['Date', 'Tank ID', 'Open Dip (cm)', 'Open Stock (L)', 'Close Dip (cm)', 'Close Stock (L)', 'Dip Sales (L)', 'Meter Sales (L)', 'Variation (L)'],
                dipsList.length > 0
                  ? dipsList.map((d: any) => [d.date, d.tank_id, d.opening_dip, d.opening_stock, d.closing_dip, d.closing_stock, d.dip_wise_sale, d.meter_wise_sale, d.variation_liters])
                  : [[new Date().toISOString().split('T')[0], dipTankId, dipOpenCm, dipOpenStock, dipCloseCm, dipCloseStock, (dipOpenStock + dipReceipt - dipCloseStock), (dipOpenStock + dipReceipt - dipCloseStock), 0]]
              )}
              title="Export underground tank dip audit to Microsoft Excel or CSV"
            >
              📥 Export to Excel (CSV)
            </button>
            <button className="win-btn-classic" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
