import React from 'react';
import type { TankStock, DashboardKPIs } from '../models';

interface ViewStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  tanks: TankStock[];
  kpis: DashboardKPIs;
  onOpenDipDialog: () => void;
}

export const ViewStockModal: React.FC<ViewStockModalProps> = ({
  isOpen,
  onClose,
  tanks,
  kpis,
  onOpenDipDialog,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '740px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⛽</span>
            <span>Underground Fuel Storage & Stock Level Visualizer</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <div className="tank-visualizer-grid">
            {/* Tank 1 MS */}
            <div className="tank-gauge-card">
              <div className="tank-cylinder">
                <div className="tank-liquid-ms" style={{ height: `${tanks[0]?.percent || 0}%` }} />
              </div>
              <div className="tank-details">
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#c0392b' }}>
                  {tanks[0]?.name || 'MS Tank 1'} ({tanks[0]?.product || 'Petrol'})
                </div>
                <div><strong>Gross Capacity:</strong> {(tanks[0]?.capacity || 20000).toLocaleString('en-IN')} Liters</div>
                <div><strong>Current Stock:</strong> {(tanks[0]?.current_stock || 0).toLocaleString('en-IN')} L ({tanks[0]?.percent || 0}%)</div>
                <div><strong>Current Dip:</strong> {tanks[0]?.dip_cm || 0} cm</div>
                <div><strong>Water Dip:</strong> 0.0 cm (Clear)</div>
                <div><strong>Safe Inward Space:</strong> {Math.max(0, (tanks[0]?.capacity || 20000) - (tanks[0]?.current_stock || 0)).toLocaleString('en-IN')} Liters</div>
                <div style={{ color: tanks[0]?.is_low ? '#c0392b' : '#27ae60', fontWeight: 700, marginTop: '4px' }}>
                  ● {tanks[0]?.is_low ? 'Low Stock Alert' : 'Sufficient Fuel Available'}
                </div>
              </div>
            </div>

            {/* Tank 2 HSD */}
            <div className="tank-gauge-card">
              <div className="tank-cylinder">
                <div className="tank-liquid-hsd" style={{ height: `${tanks[1]?.percent || 0}%` }} />
              </div>
              <div className="tank-details">
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#0984e3' }}>
                  {tanks[1]?.name || 'HSD Tank 1'} ({tanks[1]?.product || 'Diesel'})
                </div>
                <div><strong>Gross Capacity:</strong> {(tanks[1]?.capacity || 20000).toLocaleString('en-IN')} Liters</div>
                <div><strong>Current Stock:</strong> {(tanks[1]?.current_stock || 0).toLocaleString('en-IN')} L ({tanks[1]?.percent || 0}%)</div>
                <div><strong>Current Dip:</strong> {tanks[1]?.dip_cm || 0} cm</div>
                <div><strong>Water Dip:</strong> 0.0 cm (Clear)</div>
                <div><strong>Safe Inward Space:</strong> {Math.max(0, (tanks[1]?.capacity || 20000) - (tanks[1]?.current_stock || 0)).toLocaleString('en-IN')} Liters</div>
                <div style={{ color: tanks[1]?.is_low ? '#c0392b' : '#27ae60', fontWeight: 700, marginTop: '4px' }}>
                  ● {tanks[1]?.is_low ? 'Low Stock Alert' : 'High Stock Level'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '16px', background: '#ece9d8', border: '1px solid #7f9db9', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><strong>Total Tank Valuation:</strong> ₹ {kpis.total_stock_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            <button className="win-btn-classic win-btn-primary" onClick={onOpenDipDialog}>
              📐 Record Today's Dip
            </button>
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
