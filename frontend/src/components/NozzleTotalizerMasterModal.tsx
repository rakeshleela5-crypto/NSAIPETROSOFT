import React from 'react';

interface SalesReadingRow {
  nozzle: string;
  item: string;
  close: number;
  rate: number;
  [key: string]: any;
}

interface NozzleTotalizerMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  salesReadings: SalesReadingRow[];
  onOpenSalesDialog: () => void;
}

export const NozzleTotalizerMasterModal: React.FC<NozzleTotalizerMasterModalProps> = ({
  isOpen,
  onClose,
  salesReadings,
  onOpenSalesDialog,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '820px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🚰</span>
            <span>Fuel Dispenser & Nozzle Totalizer Master</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '280px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th>Nozzle Name</th>
                  <th>Product</th>
                  <th>Tank</th>
                  <th>Dispenser MPD</th>
                  <th>Closing Meter</th>
                  <th>Rate (₹)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {salesReadings.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>{r.nozzle}</td>
                    <td>{r.item}</td>
                    <td>{r.item === 'Petrol' ? 'MS Tank 1' : 'HSD Tank 1'}</td>
                    <td>Wayne Dresser MPD-{(i % 2) + 1}</td>
                    <td style={{ fontWeight: 600 }}>{r.close.toFixed(2)}</td>
                    <td>₹ {r.rate}</td>
                    <td><span style={{ color: '#27ae60', fontWeight: 700 }}>● ACTIVE / CERTIFIED</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="win-btn-classic win-btn-primary" onClick={onOpenSalesDialog}>Sales Entry</button>
            <button className="win-btn-classic" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
