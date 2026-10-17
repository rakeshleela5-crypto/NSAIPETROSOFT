import React from 'react';

interface StampingReminderItem {
  nozzle_name: string;
  tank: string;
  last_stamped: string;
  next_due: string;
  days_remaining: number;
  status: string;
}

interface StampingReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  stampingList: StampingReminderItem[];
}

export const StampingReminderModal: React.FC<StampingReminderModalProps> = ({
  isOpen,
  onClose,
  stampingList,
}) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '700px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚖️</span>
            <span>Weights & Measures Nozzle Stamping Schedule</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <div style={{ marginBottom: '8px', fontSize: '11px', color: '#555' }}>
            Statutory annual calibration reminder under Legal Metrology Act for fuel dispensing units.
          </div>
          <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '250px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th>Nozzle Name</th>
                  <th>Connected Tank</th>
                  <th>Last Stamped</th>
                  <th>Next Due Date</th>
                  <th>Days Left</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stampingList.map((s, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 700 }}>{s.nozzle_name}</td>
                    <td>{s.tank}</td>
                    <td>{s.last_stamped}</td>
                    <td style={{ fontWeight: 700, color: '#c0392b' }}>{s.next_due}</td>
                    <td style={{ fontWeight: 700 }}>{s.days_remaining} Days</td>
                    <td>
                      <span style={{ background: '#e8f8f5', color: '#27ae60', padding: '2px 6px', fontWeight: 700 }}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
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
