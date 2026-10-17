import React, { useState } from 'react';
import type { TankStock } from '../models';
import { exportToCsv } from '../utils/exportCsv';
import { calculateDipVolumeApi } from '../api/client';

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
  const [calcNotice, setCalcNotice] = useState<string>('');

  if (!isOpen) return null;

  const handleCalcOpen = async () => {
    if (dipOpenCm <= 0) return;
    try {
      setCalcNotice('Calculating open volume from strapping table...');
      const res = await calculateDipVolumeApi(dipTankId, dipOpenCm);
      setDipOpenStock(res.volume_liters);
      setCalcNotice(`✔ Opening Dip ${dipOpenCm} cm = ${res.volume_liters} L (${res.fill_percent}% full)`);
    } catch (err: any) {
      setCalcNotice(`⚠ Calculation error: ${err.message}`);
    }
  };

  const handleCalcClose = async () => {
    if (dipCloseCm <= 0) return;
    try {
      setCalcNotice('Calculating closing volume from strapping table...');
      const res = await calculateDipVolumeApi(dipTankId, dipCloseCm);
      setDipCloseStock(res.volume_liters);
      setCalcNotice(`✔ Closing Dip ${dipCloseCm} cm = ${res.volume_liters} L (${res.fill_percent}% full)`);
    } catch (err: any) {
      setCalcNotice(`⚠ Calculation error: ${err.message}`);
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '640px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📐</span>
            <span>Tank Dip Register & Evaporation Loss Audit</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          {calcNotice && (
            <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', color: '#0d47a1', padding: '4px 8px', fontSize: '11px', marginBottom: '8px', fontWeight: 600 }}>
              {calcNotice}
            </div>
          )}
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
                style={{ width: '80px', fontWeight: 700 }}
                value={dipOpenCm}
                onChange={(e) => setDipOpenCm(parseFloat(e.target.value) || 0)}
              />
              <button
                type="button"
                className="win-btn-classic"
                style={{ fontSize: '10px', height: '22px', padding: '0 4px', background: '#e8f5e9', borderColor: '#81c784', fontWeight: 600 }}
                onClick={handleCalcOpen}
                title="Auto-calculate liters using cylindrical strapping table"
              >
                ⚡ Strapping Calc
              </button>
              <span className="win-label" style={{ minWidth: '60px', marginLeft: '6px' }}>Stock (L)</span>
              <input
                type="number"
                className="win-input"
                style={{ flex: 1, fontWeight: 700 }}
                value={dipOpenStock}
                onChange={(e) => setDipOpenStock(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="win-form-row">
              <span className="win-label">Inward Receipt (L)</span>
              <input
                type="number"
                className="win-input"
                style={{ width: '120px' }}
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
                style={{ width: '80px', fontWeight: 700 }}
                value={dipCloseCm}
                onChange={(e) => setDipCloseCm(parseFloat(e.target.value) || 0)}
              />
              <button
                type="button"
                className="win-btn-classic"
                style={{ fontSize: '10px', height: '22px', padding: '0 4px', background: '#e8f5e9', borderColor: '#81c784', fontWeight: 600 }}
                onClick={handleCalcClose}
                title="Auto-calculate liters using cylindrical strapping table"
              >
                ⚡ Strapping Calc
              </button>
              <span className="win-label" style={{ minWidth: '60px', marginLeft: '6px' }}>Stock (L)</span>
              <input
                type="number"
                className="win-input"
                style={{ flex: 1, fontWeight: 700 }}
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
                ['Date', 'Tank Name', 'Open Dip (cm)', 'Open Stock (L)', 'Close Dip (cm)', 'Close Stock (L)', 'Dip Sales (L)', 'Meter Sales (L)', 'Variation (L)'],
                dipsList.length > 0
                  ? dipsList.map((d: any) => [
                      d.date,
                      d.tank_name || d.tank_id || `Tank ${d.tank_id || ''}`,
                      d.opening_dip,
                      d.opening_stock,
                      d.closing_dip,
                      d.closing_stock,
                      d.dip_sale ?? d.dip_wise_sale ?? 0,
                      d.meter_sale ?? d.meter_wise_sale ?? 0,
                      d.variation ?? d.variation_liters ?? 0,
                    ])
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
