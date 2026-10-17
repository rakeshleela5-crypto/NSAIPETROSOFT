import React, { useState } from 'react';
import type { StationProfile } from '../models';
import { getTodayErpDate } from '../utils/dateUtils';
import { resetOperationsToCleanSlate } from '../api/client';

interface ControlPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  stationProfile: StationProfile;
  saveStationProfile: (p: StationProfile) => void;
  shiftNumber: string;
  shiftName: string;
  shiftStatus: string;
  dispenserLocked: boolean;
  setDispenserLocked: (v: boolean) => void;
  handleCloseShift: () => void;
  handleOpenNextShift: () => void;
  showToast: (msg: string) => void;
  requestManagerAuthorization: (actionDesc: string, onAuthorized: () => Promise<void> | void) => void;
  loadAllErpData: () => Promise<void>;
}

export const ControlPanelModal: React.FC<ControlPanelModalProps> = ({
  isOpen,
  onClose,
  stationProfile,
  saveStationProfile,
  shiftNumber,
  shiftName,
  shiftStatus,
  dispenserLocked,
  setDispenserLocked,
  handleCloseShift,
  handleOpenNextShift,
  showToast,
  requestManagerAuthorization,
  loadAllErpData,
}) => {
  const [controlPanelTab, setControlPanelTab] = useState<'shift' | 'profile' | 'maintenance'>('shift');
  const [profileForm, setProfileForm] = useState<StationProfile>(stationProfile);

  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '740px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🎛️</span>
            <span>Station Shift Management & Dealership Profile Control Panel</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          {/* Tab Selector */}
          <div style={{ display: 'flex', borderBottom: '2px solid #506f8c', marginBottom: '12px', background: '#e0dfdb', padding: '4px 8px 0 8px', gap: '4px' }}>
            <button
              type="button"
              style={{
                padding: '6px 16px',
                border: '1px solid #7f9db9',
                borderBottom: controlPanelTab === 'shift' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                background: controlPanelTab === 'shift' ? '#ece9d8' : '#d4d0c8',
                fontWeight: controlPanelTab === 'shift' ? 700 : 400,
                cursor: 'pointer',
                outline: 'none',
                borderTopLeftRadius: '3px',
                borderTopRightRadius: '3px',
                marginBottom: controlPanelTab === 'shift' ? '-2px' : '0',
                fontSize: '11px',
              }}
              onClick={() => setControlPanelTab('shift')}
            >
              ⚙️ Shift Operations & Dispenser Locks
            </button>
            <button
              type="button"
              style={{
                padding: '6px 16px',
                border: '1px solid #7f9db9',
                borderBottom: controlPanelTab === 'profile' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                background: controlPanelTab === 'profile' ? '#ece9d8' : '#d4d0c8',
                fontWeight: controlPanelTab === 'profile' ? 700 : 400,
                cursor: 'pointer',
                outline: 'none',
                borderTopLeftRadius: '3px',
                borderTopRightRadius: '3px',
                marginBottom: controlPanelTab === 'profile' ? '-2px' : '0',
                fontSize: '11px',
              }}
              onClick={() => {
                setProfileForm(stationProfile);
                setControlPanelTab('profile');
              }}
            >
              🏢 Station Outlet Profile & Dealership Settings
            </button>
            <button
              type="button"
              style={{
                padding: '6px 16px',
                border: '1px solid #7f9db9',
                borderBottom: controlPanelTab === 'maintenance' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                background: controlPanelTab === 'maintenance' ? '#ece9d8' : '#d4d0c8',
                fontWeight: controlPanelTab === 'maintenance' ? 700 : 400,
                cursor: 'pointer',
                outline: 'none',
                borderTopLeftRadius: '3px',
                borderTopRightRadius: '3px',
                marginBottom: controlPanelTab === 'maintenance' ? '-2px' : '0',
                fontSize: '11px',
                color: '#c0392b',
              }}
              onClick={() => setControlPanelTab('maintenance')}
            >
              🧹 Clean Operational Baseline
            </button>
          </div>

          {/* TAB 1: Shift Operations */}
          {controlPanelTab === 'shift' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '14px', marginBottom: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                  <div><strong>Station Date:</strong> {getTodayErpDate()}</div>
                  <div><strong>SO Counter:</strong> #{shiftNumber}</div>
                  <div><strong>Active Shift:</strong> {shiftName} Shift</div>
                  <div>
                    <strong>Shift Status:</strong>{' '}
                    <span style={{ color: shiftStatus === 'OPEN' ? '#27ae60' : '#c0392b', fontWeight: 700 }}>
                      ● {shiftStatus}
                    </span>
                  </div>
                  <div>
                    <strong>Automation Lock:</strong>{' '}
                    <span style={{ color: dispenserLocked ? '#c0392b' : '#27ae60', fontWeight: 700 }}>
                      {dispenserLocked ? 'LOCKED (Sales Closed)' : 'UNLOCKED (Dispensing Active)'}
                    </span>
                  </div>
                  <div>
                    <strong>Dealership:</strong> {stationProfile.stationName}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  className="win-btn-classic win-btn-primary"
                  style={{ height: '36px', fontSize: '12px' }}
                  onClick={handleCloseShift}
                >
                  🔒 Close Shift & Lock Meters
                </button>
                <button
                  className="win-btn-classic"
                  style={{ height: '36px', fontSize: '12px' }}
                  onClick={handleOpenNextShift}
                >
                  ▶️ Start Next Shift
                </button>
                <button
                  className="win-btn-classic"
                  style={{ height: '36px', fontSize: '12px' }}
                  onClick={() => {
                    setDispenserLocked(!dispenserLocked);
                    showToast(dispenserLocked ? 'Dispensers Unlocked' : 'Dispensers Locked');
                  }}
                >
                  ⚡ Toggle Dispenser Lock
                </button>
                <button
                  className="win-btn-classic"
                  style={{ height: '36px', fontSize: '12px' }}
                  onClick={() => window.print()}
                >
                  🖨️ Print Shift Audit Sheet
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Station Outlet Profile */}
          {controlPanelTab === 'profile' && (
            <form onSubmit={(e) => {
              e.preventDefault();
              saveStationProfile(profileForm);
            }}>
              <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '12px', marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, color: '#1565c0', fontSize: '12px', marginBottom: '8px', borderBottom: '1px solid #d4d0c8', paddingBottom: '4px' }}>
                  Dealership Branding & Oil Marketing Company (OMC) Credentials
                </div>

                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '150px' }}>Station Outlet Name</span>
                  <input
                    type="text"
                    className="win-input"
                    required
                    value={profileForm.stationName}
                    onChange={(e) => setProfileForm({ ...profileForm, stationName: e.target.value.toUpperCase() })}
                    style={{ flex: 1, fontWeight: 700 }}
                    placeholder="e.g. SHREE SHYAM PETROLEUM / NSAIPETROSOFT"
                  />
                </div>

                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '150px' }}>Oil Company (OMC)</span>
                  <select
                    className="win-select"
                    value={profileForm.oilCompany}
                    onChange={(e) => setProfileForm({ ...profileForm, oilCompany: e.target.value })}
                    style={{ flex: 1, fontWeight: 600 }}
                  >
                    <option value="BHARAT PETROLEUM CORPORATION LTD">BHARAT PETROLEUM CORPORATION LTD (BPCL)</option>
                    <option value="INDIAN OIL CORPORATION LTD">INDIAN OIL CORPORATION LTD (IOCL)</option>
                    <option value="HINDUSTAN PETROLEUM CORPORATION LTD">HINDUSTAN PETROLEUM CORPORATION LTD (HPCL)</option>
                    <option value="NAYARA ENERGY LIMITED">NAYARA ENERGY LIMITED (ESSAR OIL)</option>
                    <option value="SHELL INDIA MARKETS PVT LTD">SHELL INDIA MARKETS PVT LTD</option>
                    <option value="RELIANCE BP MOBILITY LTD">JIO-BP (RELIANCE BP MOBILITY LTD)</option>
                  </select>
                </div>

                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '150px' }}>Custom OMC Title</span>
                  <input
                    type="text"
                    className="win-input"
                    value={profileForm.oilCompany}
                    onChange={(e) => setProfileForm({ ...profileForm, oilCompany: e.target.value.toUpperCase() })}
                    style={{ flex: 1 }}
                    placeholder="Edit or customize Oil Company title if required"
                  />
                </div>

                <div className="win-form-row">
                  <span className="win-label" style={{ minWidth: '150px' }}>Highway / Street Address</span>
                  <input
                    type="text"
                    className="win-input"
                    value={profileForm.address}
                    onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value.toUpperCase() })}
                    style={{ flex: 1 }}
                    placeholder="e.g. HIGHWAY SERVICE STATION, NH-48"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: '8px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '40px' }}>City</span>
                    <input
                      type="text"
                      className="win-input"
                      value={profileForm.city}
                      onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value.toUpperCase() })}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '45px' }}>State</span>
                    <input
                      type="text"
                      className="win-input"
                      value={profileForm.state}
                      onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value.toUpperCase() })}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '55px' }}>Pincode</span>
                    <input
                      type="text"
                      className="win-input"
                      value={profileForm.pincode}
                      onChange={(e) => setProfileForm({ ...profileForm, pincode: e.target.value })}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '8px', marginTop: '6px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '60px' }}>GSTIN No</span>
                    <input
                      type="text"
                      className="win-input"
                      value={profileForm.gstin}
                      onChange={(e) => setProfileForm({ ...profileForm, gstin: e.target.value.toUpperCase() })}
                      style={{ flex: 1, fontWeight: 700 }}
                      placeholder="e.g. 24AAACN1234F1Z5"
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '70px' }}>Contact Ph</span>
                    <input
                      type="text"
                      className="win-input"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      style={{ flex: 1 }}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '85px', color: '#b71c1c', fontWeight: 'bold' }}>Manager PIN</span>
                    <input
                      type="password"
                      maxLength={8}
                      className="win-input"
                      value={profileForm.managerPin || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, managerPin: e.target.value })}
                      style={{ flex: 1, letterSpacing: '2px', fontWeight: 'bold' }}
                      placeholder="Default: 1234"
                      title="4-digit PIN for Rate & Meter Authorization"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ color: '#c0392b' }}
                  onClick={() => {
                    const defaultProf: StationProfile = {
                      stationName: 'NSAIPETROSOFT RETAIL OUTLET',
                      oilCompany: 'BHARAT PETROLEUM CORPORATION LTD',
                      address: 'HIGHWAY SERVICE STATION',
                      city: 'SURAT',
                      state: 'GUJARAT',
                      pincode: '395003',
                      gstin: '24AAACN1234F1Z5',
                      phone: '+91 98765 43210',
                      managerPin: '1234',
                    };
                    setProfileForm(defaultProf);
                    saveStationProfile(defaultProf);
                  }}
                >
                  🔄 Reset Factory Defaults
                </button>
                <button
                  type="submit"
                  className="win-btn-classic win-btn-primary"
                  style={{ padding: '6px 20px', fontWeight: 700 }}
                >
                  💾 Save Station Outlet Profile
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Operational Data Reset */}
          {controlPanelTab === 'maintenance' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '14px', marginBottom: '14px' }}>
                <div style={{ fontWeight: 700, color: '#c0392b', fontSize: '13px', marginBottom: '8px', borderBottom: '1px solid #d4d0c8', paddingBottom: '4px' }}>
                  ⚠ Operational Clean Baseline Reset (Purge Demo Data)
                </div>
                <div style={{ fontSize: '11px', color: '#444', lineHeight: '1.6', marginBottom: '12px' }}>
                  This operation will permanently purge all historical demo shifts, meter sales, credit slips, cash vouchers, and expenses from the live PostgreSQL database on Railway.
                  <br />
                  <br />
                  ✅ <b>Preserved Masters:</b> Fuel Products (MS, HSD, Lube), Underground Tanks, Dispensing Units & Nozzles, Fleet Customers list, and Bank Accounts structure.
                  <br />
                  🔄 <b>Reset Operational Balances:</b> Today's sales will become ₹ 0.00, customer outstanding balances will reset to ₹ 0.00, bank balances will reset to ₹ 0.00, and a fresh <b>Shift #00001 (Status: Open)</b> will be initialized.
                  <br />
                  🔒 <b>Security:</b> Requires Manager PIN authorization (default: <code>{stationProfile.managerPin || '1234'}</code>).
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="win-btn-classic"
                    style={{ background: '#d32f2f', color: '#fff', borderColor: '#b71c1c', fontWeight: 700, padding: '8px 16px', fontSize: '12px', cursor: 'pointer' }}
                    onClick={() => {
                      requestManagerAuthorization('Purge all demo transactions and reset to clean zero baseline', async () => {
                        try {
                          const res = await resetOperationsToCleanSlate();
                          showToast(`✔ ${res.message}`);
                          onClose();
                          await loadAllErpData();
                        } catch (err: any) {
                          showToast(`⚠ Error resetting operations: ${err.message}`);
                        }
                      });
                    }}
                  >
                    🧹 Purge Demo Data & Start Clean Baseline
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | Changes Persist Across All ERP Modules</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
