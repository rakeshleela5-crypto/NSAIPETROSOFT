import React from 'react';
import type { TankStock } from '../models';

interface UndergroundTankMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tanks: TankStock[];
  onOpenDipDialog: (tankId?: number) => void;
}

export const UndergroundTankMasterModal: React.FC<UndergroundTankMasterModalProps> = ({
  isOpen,
  onClose,
  tanks,
  onOpenDipDialog,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '750px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⛽</span>
            <span>Underground Fuel Storage Tank Master & Calibration Charts</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '14px' }}>
            <div style={{ border: '2px solid #506f8c', padding: '10px', background: '#fff' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#c0392b' }}>Tank 1: MS (Motor Spirit / Petrol)</div>
              <div style={{ fontSize: '11px', marginTop: '6px', lineHeight: '1.6' }}>
                <div><strong>Total Gross Capacity:</strong> {(tanks[0]?.capacity || 20000).toLocaleString('en-IN')} Liters</div>
                <div><strong>Dead Stock Allowance:</strong> 500 Liters (Pump Suction Cutoff)</div>
                <div><strong>Safe Filling Limit (Ullage):</strong> {((tanks[0]?.capacity || 20000) * 0.95).toLocaleString('en-IN')} Liters (95%)</div>
                <div><strong>Current Physical Stock:</strong> {tanks[0] ? `${tanks[0].current_stock.toLocaleString('en-IN')} Liters (${tanks[0].percent}%)` : '0 Liters (0%)'}</div>
                <div><strong>Tank Dimensions:</strong> 2.4m Dia × 4.6m Length Double-Walled</div>
              </div>
              <button className="win-btn-classic" style={{ marginTop: '8px' }} onClick={() => onOpenDipDialog(1)}>
                📐 Record Dip Reading
              </button>
            </div>

            <div style={{ border: '2px solid #506f8c', padding: '10px', background: '#fff' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#2980b9' }}>Tank 2: HSD (High Speed Diesel)</div>
              <div style={{ fontSize: '11px', marginTop: '6px', lineHeight: '1.6' }}>
                <div><strong>Total Gross Capacity:</strong> {(tanks[1]?.capacity || 20000).toLocaleString('en-IN')} Liters</div>
                <div><strong>Dead Stock Allowance:</strong> 500 Liters (Pump Suction Cutoff)</div>
                <div><strong>Safe Filling Limit (Ullage):</strong> {((tanks[1]?.capacity || 20000) * 0.95).toLocaleString('en-IN')} Liters (95%)</div>
                <div><strong>Current Physical Stock:</strong> {tanks[1] ? `${tanks[1].current_stock.toLocaleString('en-IN')} Liters (${tanks[1].percent}%)` : '0 Liters (0%)'}</div>
                <div><strong>Tank Dimensions:</strong> 2.4m Dia × 4.6m Length Double-Walled</div>
              </div>
              <button className="win-btn-classic" style={{ marginTop: '8px' }} onClick={() => onOpenDipDialog(2)}>
                📐 Record Dip Reading
              </button>
            </div>
          </div>

          <div style={{ fontWeight: 700, marginBottom: '4px' }}>Statutory Dip Calibration Table (Height cm vs Liters)</div>
          <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '160px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th>Dip Height (cm)</th>
                  <th>Petrol (MS) Liters</th>
                  <th>Diesel (HSD) Liters</th>
                  <th>Capacity %</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>25.0 cm</td><td>1,240 L</td><td>1,250 L</td><td>6.2%</td></tr>
                <tr><td>50.0 cm</td><td>3,420 L</td><td>3,440 L</td><td>17.1%</td></tr>
                <tr><td>100.0 cm</td><td>8,950 L</td><td>8,990 L</td><td>44.8%</td></tr>
                {tanks[0] && (
                  <tr style={{ background: '#e8f5e9', fontWeight: 700 }}>
                    <td>{tanks[0].dip_cm ? `${tanks[0].dip_cm.toFixed(1)} cm (Current MS DIP)` : 'Dip Not Recorded'}</td>
                    <td>{tanks[0].current_stock.toLocaleString('en-IN')} L</td>
                    <td>-</td>
                    <td>{tanks[0].percent}%</td>
                  </tr>
                )}
                {tanks[1] && (
                  <tr style={{ background: '#e3f2fd', fontWeight: 700 }}>
                    <td>{tanks[1].dip_cm ? `${tanks[1].dip_cm.toFixed(1)} cm (Current HSD DIP)` : 'Dip Not Recorded'}</td>
                    <td>-</td>
                    <td>{tanks[1].current_stock.toLocaleString('en-IN')} L</td>
                    <td>{tanks[1].percent}%</td>
                  </tr>
                )}
                <tr><td>200.0 cm</td><td>18,200 L</td><td>18,250 L</td><td>91.0%</td></tr>
              </tbody>
            </table>
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
