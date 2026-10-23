import React, { useState } from 'react';
import { exportToCsv } from '../utils/exportCsv';
import { updateNozzleStampingApi } from '../api/client';

export interface StampingReminderItem {
  nozzle_id?: number;
  nozzle_name: string;
  tank: string;
  last_stamped: string;
  next_due: string;
  days_remaining: number;
  wm_seal_no?: string;
  wm_certificate_no?: string;
  status: string;
}

interface StampingReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  stampingList: StampingReminderItem[];
  loadAllErpData?: () => Promise<void>;
  showToast?: (msg: string) => void;
  requestManagerAuthorization?: (actionDesc: string, onAuthorized: (pin?: string) => Promise<void> | void) => void;
}

export const StampingReminderModal: React.FC<StampingReminderModalProps> = ({
  isOpen,
  onClose,
  stampingList,
  loadAllErpData,
  showToast,
  requestManagerAuthorization,
}) => {
  const [showUpdateForm, setShowUpdateForm] = useState<boolean>(false);
  const [selectedNozzleId, setSelectedNozzleId] = useState<number>(stampingList[0]?.nozzle_id || 1);
  const [stampedDate, setStampedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [nextDueDate, setNextDueDate] = useState<string>(
    new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0]
  );
  const [sealNo, setSealNo] = useState<string>('WM-GJ-2026-A1');
  const [certNo, setCertNo] = useState<string>('CERT-LM-2026/01');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleDateChange = (d: string) => {
    setStampedDate(d);
    try {
      const dt = new Date(d);
      dt.setFullYear(dt.getFullYear() + 1);
      setNextDueDate(dt.toISOString().split('T')[0]);
    } catch {
      // ignore
    }
  };

  const handleExecuteUpdate = async (managerPin: string = '1234') => {
    try {
      setIsSubmitting(true);
      await updateNozzleStampingApi(selectedNozzleId, {
        last_stamped_date: stampedDate,
        stamping_due_date: nextDueDate,
        wm_seal_no: sealNo.trim(),
        wm_certificate_no: certNo.trim(),
        manager_pin: managerPin,
      });

      if (showToast) {
        showToast(`✔ Legal Metrology Stamping updated for Nozzle #${selectedNozzleId}!`);
      }
      setShowUpdateForm(false);
      if (loadAllErpData) {
        await loadAllErpData();
      }
    } catch (err: any) {
      if (showToast) {
        showToast(`❌ Stamping update failed: ${err.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitStamping = (e: React.FormEvent) => {
    e.preventDefault();
    if (requestManagerAuthorization) {
      requestManagerAuthorization(
        `Update Weights & Measures Stamping Calibration for Nozzle #${selectedNozzleId}`,
        async (pin?: string) => {
          await handleExecuteUpdate(pin || '1234');
        }
      );
    } else {
      handleExecuteUpdate();
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '820px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚖️</span>
            <span>Weights & Measures (Legal Metrology) Nozzle Stamping Schedule</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#555' }}>
              Statutory calibration & verification record under Legal Metrology Act (Rule 14 & 27).
            </span>
            <button
              type="button"
              className="win-btn-classic"
              style={{ fontWeight: 700, background: showUpdateForm ? '#fbeee6' : '#ebf5fb' }}
              onClick={() => setShowUpdateForm(!showUpdateForm)}
            >
              <span>{showUpdateForm ? '✕ Cancel Update' : '🛠️ Record Official Stamping'}</span>
            </button>
          </div>

          {/* Update Stamping Form */}
          {showUpdateForm && (
            <div style={{ background: '#fdfefe', border: '1px solid #7f9db9', padding: '10px', marginBottom: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#1a5276', marginBottom: '6px' }}>
                Record Inspector Calibration & Lead/Wire Seal Verification
              </div>
              <form onSubmit={handleSubmitStamping}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '6px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '100px' }}>Select Nozzle</span>
                    <select
                      className="win-select"
                      style={{ flex: 1 }}
                      value={selectedNozzleId}
                      onChange={(e) => setSelectedNozzleId(parseInt(e.target.value))}
                    >
                      {stampingList.map((s, idx) => (
                        <option key={idx} value={s.nozzle_id || idx + 1}>
                          {s.nozzle_name} ({s.tank})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '100px' }}>Stamped Date</span>
                    <input
                      type="date"
                      className="win-input"
                      style={{ flex: 1 }}
                      value={stampedDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '100px' }}>W&M Seal No</span>
                    <input
                      type="text"
                      className="win-input"
                      style={{ flex: 1 }}
                      placeholder="e.g. WM-GJ-2026-981"
                      value={sealNo}
                      onChange={(e) => setSealNo(e.target.value)}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '100px' }}>Certificate No</span>
                    <input
                      type="text"
                      className="win-input"
                      style={{ flex: 1 }}
                      placeholder="e.g. CERT-LM-2026/0481"
                      value={certNo}
                      onChange={(e) => setCertNo(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                  <button
                    type="submit"
                    className="win-btn-classic win-btn-primary"
                    disabled={isSubmitting}
                    style={{ fontWeight: 700 }}
                  >
                    <span>💾</span>
                    <span style={{ marginLeft: '4px' }}>Save Calibration Certificate</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Stamping Grid */}
          <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '280px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th>Nozzle Name</th>
                  <th>Connected Tank</th>
                  <th>Last Stamped</th>
                  <th>Next Due Date</th>
                  <th>Days Left</th>
                  <th>Seal / Cert No</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stampingList.map((s, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 700 }}>{s.nozzle_name}</td>
                    <td>{s.tank}</td>
                    <td>{s.last_stamped}</td>
                    <td style={{ fontWeight: 700, color: s.days_remaining <= 30 ? '#c0392b' : '#27ae60' }}>
                      {s.next_due}
                    </td>
                    <td style={{ fontWeight: 700 }}>{s.days_remaining} Days</td>
                    <td style={{ fontSize: '11px', color: '#555' }}>
                      {s.wm_seal_no || 'WM-VERIFIED'}
                      {s.wm_certificate_no ? ` (${s.wm_certificate_no})` : ''}
                    </td>
                    <td>
                      <span style={{
                        background: s.status === 'EXPIRED' ? '#fdebd0' : s.status === 'DUE_SOON' ? '#fef9e7' : '#e8f8f5',
                        color: s.status === 'EXPIRED' ? '#b9770e' : s.status === 'DUE_SOON' ? '#b7950b' : '#27ae60',
                        padding: '2px 6px',
                        fontWeight: 700,
                        fontSize: '10px',
                      }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="button"
              className="win-btn-classic"
              style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 600 }}
              onClick={() => exportToCsv(
                `NSAIPETROSOFT_StampingSchedule_${new Date().toISOString().split('T')[0]}`,
                ['Nozzle Name', 'Connected Tank', 'Last Stamped', 'Next Due Date', 'Days Left', 'Seal No', 'Status'],
                stampingList.map(s => [s.nozzle_name, s.tank, s.last_stamped, s.next_due, `${s.days_remaining} Days`, s.wm_seal_no || '', s.status])
              )}
              title="Export Legal Metrology stamping schedule to Microsoft Excel or CSV"
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
