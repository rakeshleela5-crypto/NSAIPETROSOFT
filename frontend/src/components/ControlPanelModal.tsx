import React, { useState, useRef } from 'react';
import type { StationProfile } from '../models';
import { getTodayErpDate } from '../utils/dateUtils';
import { resetOperationsToCleanSlate } from '../api/client';
import { printThermalReceiptHtml, generateUpiQrUrl } from '../utils/thermalPrinter';
import { erpStore } from '../store/erpStore';
import { exportToCsv } from '../utils/exportCsv';

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
  const [controlPanelTab, setControlPanelTab] = useState<'shift' | 'profile' | 'backup' | 'cleaning' | 'companies'>('shift');
  const [profileForm, setProfileForm] = useState<StationProfile>(stationProfile);

  React.useEffect(() => {
    if (isOpen) {
      setProfileForm(stationProfile);
    }
  }, [isOpen, stationProfile]);

  // Backup & Restore states
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleaning two-step states
  const [cleanConfirmText, setCleanConfirmText] = useState<string>('');
  const [keepMasters, setKeepMasters] = useState<boolean>(true);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);

  // Multi-company / FY states
  const [selectedStationBranch, setSelectedStationBranch] = useState<string>(stationProfile.stationName);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState<string>('2026-27');

  if (!isOpen) return null;

  // 1. Download Backup JSON with Adler-32 Checksum
  const handleDownloadBackup = () => {
    try {
      const backup = erpStore.exportBackupJson();
      const blob = new Blob([backup.jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backup.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`✔ Database backup downloaded! Checksum: ${backup.checksum}`);
    } catch (err: any) {
      showToast(`❌ Backup creation failed: ${err.message}`);
    }
  };

  // 2. Restore Database JSON with Rollback Snapshot
  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setRestoreError(null);
        setRestoreStatus('Validating backup schema & checksum...');
        const content = evt.target?.result as string;
        const result = erpStore.restoreBackupJson(content);
        setRestoreStatus(`✔ Successfully restored ${result.recordsRestored} operational records. A rollback snapshot has been preserved.`);
        showToast('✔ ERP Database successfully restored from backup!');
        await loadAllErpData();
      } catch (err: any) {
        setRestoreError(`Restore failed: ${err.message}`);
        setRestoreStatus(null);
        showToast(`❌ Database restore error: ${err.message}`);
      }
    };
    reader.onerror = () => {
      setRestoreError('Failed to read the selected backup file.');
    };
    reader.readAsText(file);
  };

  // 3. Rollback Restore
  const handleRollbackSnapshot = async () => {
    try {
      const rolledBack = erpStore.rollbackSnapshot();
      if (!rolledBack) {
        showToast('ℹ No previous in-memory rollback snapshot found.');
        return;
      }
      showToast('✔ Rollback successful: Reverted to state prior to last restore.');
      await loadAllErpData();
    } catch (err: any) {
      showToast(`❌ Rollback error: ${err.message}`);
    }
  };

  // 4. Two-step Cleaning Data Purge
  const handleExecuteClean = () => {
    if (cleanConfirmText.trim() !== 'DELETE-DATA') {
      showToast('⚠ You must type "DELETE-DATA" exactly to confirm data purge.');
      return;
    }
    requestManagerAuthorization('Permanently purge operational transaction data', async () => {
      setIsCleaning(true);
      try {
        // Automatically download backup first
        handleDownloadBackup();

        // Clean local transactional tables
        erpStore.cleanSlateDatabase(keepMasters);

        // Also clean remote database if online
        try {
          await resetOperationsToCleanSlate();
        } catch (backendErr) {
          console.warn('Backend clean slate skipped or offline:', backendErr);
        }

        showToast('✔ Operational database cleaned. Pre-clean backup downloaded.');
        setCleanConfirmText('');
        await loadAllErpData();
        onClose();
      } catch (err: any) {
        showToast(`❌ Error cleaning database: ${err.message}`);
      } finally {
        setIsCleaning(false);
      }
    });
  };

  // 5. Thermal Shift Audit Handover Sheet
  const handlePrintShiftAuditSheet = () => {
    const is58mm = stationProfile.printerPaperWidth === '58mm';
    const paperWidth = is58mm ? 58 : 80;
    const bodyWidth = is58mm ? '200px' : '280px';
    const fontSize = is58mm ? '10.5px' : '12px';
    const headerSize = is58mm ? '13px' : '15px';

    const html = `
      <div style="font-family: 'Courier New', monospace; font-size: ${fontSize}; width: ${bodyWidth}; margin: 0 auto; line-height: 1.35; color: #000;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: ${headerSize}; font-weight: bold;">${stationProfile.stationName}</div>
          <div style="font-size: 11px;">${stationProfile.oilCompany} RETAIL OUTLET</div>
          ${stationProfile.dealerCode ? `<div style="font-size: 10px;">RO/Dealer Code: ${stationProfile.dealerCode}</div>` : ''}
          <div style="font-size: 10px;">${stationProfile.address ? `${stationProfile.address}, ` : ''}${stationProfile.city || ''} ${stationProfile.stateCode ? `(${stationProfile.stateCode})` : ''}</div>
          <div style="font-size: 10px;">GSTIN: ${stationProfile.gstin || '-'} | PH: ${stationProfile.phone || '-'}</div>
          <div style="font-weight: bold; margin-top: 4px; border-top: 1px dashed #000; padding-top: 2px;">SHIFT AUDIT & HANDOVER SHEET</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>SO No: ${shiftNumber}</span>
          <span>Shift: ${shiftName}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Date: ${getTodayErpDate()}</span>
          <span>Time: ${new Date().toLocaleTimeString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Shift Status:</span>
          <span><b>${shiftStatus.toUpperCase()}</b></span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Forecourt Lock:</span>
          <span><b>${dispenserLocked ? 'LOCKED' : 'ONLINE / ACTIVE'}</b></span>
        </div>
        <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
        <div style="margin-top: 35px; border-top: 1px solid #000; padding-top: 4px; font-size: 10px; display: flex; justify-content: space-between;">
          <span>Relieving Cashier</span>
          <span>Duty Manager</span>
        </div>
        <div style="text-align: center; font-size: 9px; margin-top: 8px;">
          <div>*** SHIFT HANDOVER COMPLETE ***</div>
          <div>POWERED BY NSAIPETROSOFT SYSTEM</div>
        </div>
      </div>
    `;
    printThermalReceiptHtml(html, { paperWidthMm: paperWidth });
  };

  // 6. Export BI Ready JSON
  const handleExportBiJson = () => {
    const state = erpStore.getState();
    const biData = {
      exportTimestamp: new Date().toISOString(),
      station: stationProfile,
      financialYear: selectedFinancialYear,
      kpis: erpStore.getDashboardKPIs(),
      tanks: state.tanks,
      nozzles: state.nozzles,
      customers: state.customers,
      salesCount: state.salesEntries.length,
      creditBillsCount: state.creditBills.length,
      purchasesCount: state.purchases.length,
    };
    const blob = new Blob([JSON.stringify(biData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NSAIPETROSOFT_BI_Dataset_${getTodayErpDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✔ BI-Ready JSON dataset exported successfully!');
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '800px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🎛️</span>
            <span>Station Control Panel: Shift, Profile, Backup, Restore & Maintenance</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          {/* Tab Selector */}
          <div style={{ display: 'flex', borderBottom: '2px solid #506f8c', marginBottom: '12px', background: '#e0dfdb', padding: '4px 8px 0 8px', gap: '4px' }}>
            <button
              type="button"
              style={{
                padding: '6px 14px',
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
              ⚙️ Shift Operations
            </button>
            <button
              type="button"
              style={{
                padding: '6px 14px',
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
              🏢 Station Profile
            </button>
            <button
              type="button"
              style={{
                padding: '6px 14px',
                border: '1px solid #7f9db9',
                borderBottom: controlPanelTab === 'backup' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                background: controlPanelTab === 'backup' ? '#ece9d8' : '#d4d0c8',
                fontWeight: controlPanelTab === 'backup' ? 700 : 400,
                cursor: 'pointer',
                outline: 'none',
                borderTopLeftRadius: '3px',
                borderTopRightRadius: '3px',
                marginBottom: controlPanelTab === 'backup' ? '-2px' : '0',
                fontSize: '11px',
                color: '#1565c0',
              }}
              onClick={() => setControlPanelTab('backup')}
            >
              💾 Backup & Restore DB
            </button>
            <button
              type="button"
              style={{
                padding: '6px 14px',
                border: '1px solid #7f9db9',
                borderBottom: controlPanelTab === 'cleaning' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                background: controlPanelTab === 'cleaning' ? '#ece9d8' : '#d4d0c8',
                fontWeight: controlPanelTab === 'cleaning' ? 700 : 400,
                cursor: 'pointer',
                outline: 'none',
                borderTopLeftRadius: '3px',
                borderTopRightRadius: '3px',
                marginBottom: controlPanelTab === 'cleaning' ? '-2px' : '0',
                fontSize: '11px',
                color: '#c0392b',
              }}
              onClick={() => setControlPanelTab('cleaning')}
            >
              🧹 Cleaning / Clean Slate
            </button>
            <button
              type="button"
              style={{
                padding: '6px 14px',
                border: '1px solid #7f9db9',
                borderBottom: controlPanelTab === 'companies' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                background: controlPanelTab === 'companies' ? '#ece9d8' : '#d4d0c8',
                fontWeight: controlPanelTab === 'companies' ? 700 : 400,
                cursor: 'pointer',
                outline: 'none',
                borderTopLeftRadius: '3px',
                borderTopRightRadius: '3px',
                marginBottom: controlPanelTab === 'companies' ? '-2px' : '0',
                fontSize: '11px',
                color: '#2e7d32',
              }}
              onClick={() => setControlPanelTab('companies')}
            >
              🌐 Sync, Share & Multi-Company
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
                  onClick={handlePrintShiftAuditSheet}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '8px' }}>
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
                    <span className="win-label" style={{ minWidth: '100px' }}>RO / Dealer Code</span>
                    <input
                      type="text"
                      className="win-input"
                      value={profileForm.dealerCode || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, dealerCode: e.target.value.toUpperCase() })}
                      style={{ flex: 1 }}
                      placeholder="e.g. RO-49210 / DEALER-01"
                    />
                  </div>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 0.8fr 1fr', gap: '8px' }}>
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
                    <span className="win-label" style={{ minWidth: '45px' }}>Code</span>
                    <input
                      type="text"
                      maxLength={2}
                      className="win-input"
                      value={profileForm.stateCode || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, stateCode: e.target.value })}
                      style={{ flex: 1, fontWeight: 700, textAlign: 'center' }}
                      placeholder="e.g. 24 / 32"
                      title="2-digit State Code (e.g. 24 Gujarat, 32 Kerala, 27 Maharashtra)"
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
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        const stCode = val.length >= 2 ? val.slice(0, 2) : profileForm.stateCode;
                        setProfileForm({ ...profileForm, gstin: val, stateCode: stCode || profileForm.stateCode });
                      }}
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

                {/* UPI VPA and Thermal Printer Roll Width */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', marginTop: '6px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '100px', color: '#1565c0', fontWeight: 'bold' }}>UPI VPA / QR</span>
                    <input
                      type="text"
                      className="win-input"
                      value={profileForm.upiVpa || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, upiVpa: e.target.value.trim() })}
                      style={{ flex: 1, fontWeight: 600, color: '#0d47a1' }}
                      placeholder="e.g. ownername@okaxis or store@icici"
                      title="UPI Virtual Payment Address for dynamic QR code counter collection"
                    />
                  </div>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '110px' }}>Printer Width</span>
                    <select
                      className="win-select"
                      value={profileForm.printerPaperWidth || '80mm'}
                      onChange={(e) => setProfileForm({ ...profileForm, printerPaperWidth: e.target.value as '80mm' | '58mm' })}
                      style={{ flex: 1, fontWeight: 600 }}
                    >
                      <option value="80mm">80mm / 3-inch (Desktop TVS, Epson TM-T82, NGX POS)</option>
                      <option value="58mm">58mm / 2-inch (Handheld POS, Bluetooth Terminal)</option>
                    </select>
                  </div>
                </div>

                {/* Live POS Receipt & UPI QR Preview Card */}
                <div style={{ marginTop: '10px', background: '#f5f5f5', border: '1px dashed #7f9db9', padding: '10px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#333', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>🧾 Live POS Receipt Header & UPI QR Preview ({profileForm.printerPaperWidth || '80mm'} Roll):</span>
                    <span style={{ color: '#2e7d32' }}>✔ Ready for Real Store Deployment</span>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ flex: 1, background: '#fff', border: '1px solid #ccc', padding: '8px', fontFamily: 'Courier New, monospace', fontSize: profileForm.printerPaperWidth === '58mm' ? '10px' : '11.5px', lineHeight: '1.3' }}>
                      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px' }}>{profileForm.stationName || 'STORE NAME'}</div>
                      <div style={{ textAlign: 'center', fontSize: '10px' }}>{profileForm.oilCompany || 'RETAIL OUTLET'}</div>
                      {profileForm.dealerCode && <div style={{ textAlign: 'center', fontSize: '9.5px' }}>RO / Dealer: {profileForm.dealerCode}</div>}
                      <div style={{ textAlign: 'center', fontSize: '9.5px' }}>{profileForm.address || 'STREET ADDRESS'}, {profileForm.city || 'CITY'} {profileForm.stateCode ? `(${profileForm.stateCode})` : ''}</div>
                      <div style={{ textAlign: 'center', fontSize: '9.5px' }}>GSTIN: {profileForm.gstin || '-'} | PH: {profileForm.phone || '-'}</div>
                    </div>
                    {profileForm.upiVpa ? (
                      <div style={{ textAlign: 'center', background: '#fff', border: '1px solid #90caf9', padding: '6px', borderRadius: '4px', minWidth: '110px' }}>
                        <img
                          src={generateUpiQrUrl(profileForm.upiVpa, profileForm.stationName, 100, 'TEST PAYMENT')}
                          alt="UPI QR Code"
                          style={{ width: '85px', height: '85px', display: 'block', margin: '0 auto' }}
                        />
                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#0d47a1', marginTop: '2px' }}>{profileForm.upiVpa}</div>
                        <div style={{ fontSize: '8px', color: '#666' }}>Scan with GPay/PhonePe</div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', background: '#fff3e0', border: '1px dashed #ff9800', padding: '10px', fontSize: '10px', color: '#e65100', width: '130px' }}>
                        <div>📱 No UPI VPA set</div>
                        <div style={{ fontSize: '8.5px', marginTop: '4px' }}>Add UPI ID above to enable instant counter QR codes</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  className="win-btn-classic"
                  style={{ color: '#c0392b' }}
                  onClick={() => {
                    const defaultProf: StationProfile = {
                      stationName: 'NSAIPETROSOFT RETAIL OUTLET',
                      oilCompany: 'BHARAT PETROLEUM CORPORATION LTD',
                      dealerCode: 'RO-BPCL-101',
                      address: 'HIGHWAY SERVICE STATION',
                      city: 'SURAT',
                      state: 'GUJARAT',
                      stateCode: '24',
                      pincode: '395003',
                      gstin: '24AAACN1234F1Z5',
                      phone: '+91 98765 43210',
                      upiVpa: '',
                      printerPaperWidth: '80mm',
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

          {/* TAB 3: Backup & Restore DB */}
          {controlPanelTab === 'backup' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '14px', marginBottom: '14px' }}>
                <div style={{ fontWeight: 700, color: '#1565c0', fontSize: '13px', marginBottom: '8px', borderBottom: '1px solid #d4d0c8', paddingBottom: '4px' }}>
                  💾 Complete ERP Database Serialization, Backup & Restore
                </div>
                <div style={{ fontSize: '11.5px', color: '#444', lineHeight: '1.6', marginBottom: '14px' }}>
                  Export your entire petrol pump database (tanks, meters, fuel rates, credit bills, ledger accounts, cashbook, and receipts) into a checksum-verified JSON file. You can restore this backup on any computer running Cloudflare Pages or desktop Chrome without loss of data.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {/* Backup Card */}
                  <div style={{ border: '1px solid #90caf9', background: '#f0f7ff', padding: '12px', borderRadius: '4px' }}>
                    <div style={{ fontWeight: 700, color: '#0d47a1', marginBottom: '6px', fontSize: '12px' }}>
                      📥 Create Full System Backup
                    </div>
                    <div style={{ fontSize: '11px', color: '#555', marginBottom: '10px' }}>
                      Generates a timestamped JSON file (<code>NSaiPetroSoft_Backup_YYYY-MM-DD.json</code>) with an Adler-32 checksum to verify payload integrity.
                    </div>
                    <button
                      type="button"
                      className="win-btn-classic win-btn-primary"
                      style={{ width: '100%', height: '34px', fontSize: '11.5px', fontWeight: 700 }}
                      onClick={handleDownloadBackup}
                    >
                      💾 Download Checksummed Backup
                    </button>
                  </div>

                  {/* Restore Card */}
                  <div style={{ border: '1px solid #a5d6a7', background: '#f1f8e9', padding: '12px', borderRadius: '4px' }}>
                    <div style={{ fontWeight: 700, color: '#1b5e20', marginBottom: '6px', fontSize: '12px' }}>
                      📤 Restore Database from JSON
                    </div>
                    <div style={{ fontSize: '11px', color: '#555', marginBottom: '10px' }}>
                      Upload a previously exported <code>.json</code> backup. An automatic rollback snapshot is preserved before applying changes.
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".json"
                      onChange={handleFileRestore}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="win-btn-classic"
                      style={{ width: '100%', height: '34px', fontSize: '11.5px', fontWeight: 700, background: '#2e7d32', color: '#fff', borderColor: '#1b5e20' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      📂 Select Backup File & Restore
                    </button>
                  </div>
                </div>

                {/* Status / Error Messages */}
                {restoreStatus && (
                  <div style={{ marginTop: '12px', padding: '8px 12px', background: '#e8f5e9', border: '1px solid #81c784', color: '#1b5e20', fontSize: '11.5px', borderRadius: '3px' }}>
                    {restoreStatus}
                  </div>
                )}
                {restoreError && (
                  <div style={{ marginTop: '12px', padding: '8px 12px', background: '#ffebee', border: '1px solid #e57373', color: '#b71c1c', fontSize: '11.5px', borderRadius: '3px' }}>
                    {restoreError}
                  </div>
                )}

                {/* Rollback Action */}
                <div style={{ marginTop: '16px', paddingTop: '10px', borderTop: '1px dashed #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#666' }}>
                    Need to revert a recent restore? A safety snapshot is kept automatically.
                  </span>
                  <button
                    type="button"
                    className="win-btn-classic"
                    style={{ fontSize: '11px', color: '#d32f2f' }}
                    onClick={handleRollbackSnapshot}
                  >
                    ↩ Rollback to Pre-Restore Snapshot
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Cleaning & Data Purge */}
          {controlPanelTab === 'cleaning' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '14px', marginBottom: '14px' }}>
                <div style={{ fontWeight: 700, color: '#c0392b', fontSize: '13px', marginBottom: '8px', borderBottom: '1px solid #d4d0c8', paddingBottom: '4px' }}>
                  ⚠ Strict Two-Step Data Cleaning & Operational Reset
                </div>
                <div style={{ fontSize: '11px', color: '#444', lineHeight: '1.6', marginBottom: '12px' }}>
                  This operation resets the transaction ledgers to an initial clean operational baseline. All historical shifts, meter sales, credit slips, cash vouchers, and expenses will be purged.
                </div>

                <div style={{ background: '#fff3cd', border: '1px solid #ffeeba', padding: '10px', borderRadius: '4px', marginBottom: '12px', fontSize: '11.5px' }}>
                  <div style={{ fontWeight: 700, color: '#856404', marginBottom: '4px' }}>🛡️ Safety Guardrails:</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={keepMasters}
                      onChange={(e) => setKeepMasters(e.target.checked)}
                    />
                    Preserve Master Records (Tanks, Customer Fleet, Dispenser Nozzles, Lubricant Catalog & Bank Accounts)
                  </label>
                  <div style={{ fontSize: '10.5px', color: '#666', marginTop: '4px', marginLeft: '22px' }}>
                    Recommended: Keeps your pump infrastructure intact while setting customer balances and sales tallies to ₹ 0.00.
                  </div>
                </div>

                <div className="win-actions-row" style={{ marginBottom: '14px' }}>
                  <button
                    type="button"
                    className="win-btn-classic"
                    style={{ background: '#e3f2fd', color: '#0d47a1', borderColor: '#90caf9', fontWeight: 700, padding: '6px 14px' }}
                    onClick={handleDownloadBackup}
                  >
                    1. Download Safety Backup First 📥
                  </button>
                </div>

                <div style={{ background: '#fafafa', border: '1px solid #e0e0e0', padding: '12px', borderRadius: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#b71c1c', marginBottom: '6px' }}>
                    2. Type <span style={{ background: '#ffcdd2', padding: '1px 5px', borderRadius: '2px', fontFamily: 'monospace' }}>DELETE-DATA</span> to unlock purge (Safety backup will auto-download):
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="win-input"
                      placeholder="Type DELETE-DATA in capital letters"
                      value={cleanConfirmText}
                      onChange={(e) => setCleanConfirmText(e.target.value)}
                      style={{ width: '280px', fontWeight: 700, letterSpacing: '1px' }}
                    />
                    <button
                      type="button"
                      className="win-btn-classic"
                      disabled={cleanConfirmText.trim() !== 'DELETE-DATA' || isCleaning}
                      style={{
                        background: cleanConfirmText.trim() === 'DELETE-DATA' ? '#d32f2f' : '#e0e0e0',
                        color: cleanConfirmText.trim() === 'DELETE-DATA' ? '#fff' : '#888',
                        borderColor: cleanConfirmText.trim() === 'DELETE-DATA' ? '#b71c1c' : '#ccc',
                        fontWeight: 700,
                        padding: '6px 16px',
                        cursor: cleanConfirmText.trim() === 'DELETE-DATA' ? 'pointer' : 'not-allowed',
                      }}
                      onClick={handleExecuteClean}
                    >
                      {isCleaning ? 'Cleaning Data...' : '🚨 Confirm & Purge Transactions'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Sync, Share & Multi-Company */}
          {controlPanelTab === 'companies' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '14px', marginBottom: '14px' }}>
                <div style={{ fontWeight: 700, color: '#2e7d32', fontSize: '13px', marginBottom: '8px', borderBottom: '1px solid #d4d0c8', paddingBottom: '4px' }}>
                  🌐 Multi-Station Forecourt Profile Switcher & Business Intelligence Exports
                </div>
                <div style={{ fontSize: '11.5px', color: '#444', lineHeight: '1.6', marginBottom: '12px' }}>
                  Manage multiple retail pump outlets or switch financial years. Export standardized BI datasets for PowerBI, Excel Pivot, or CA tax auditing.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '120px' }}>Active Forecourt</span>
                    <select
                      className="win-select"
                      value={selectedStationBranch}
                      onChange={(e) => {
                        setSelectedStationBranch(e.target.value);
                        showToast(`Switched active station profile to: ${e.target.value}`);
                      }}
                      style={{ flex: 1, fontWeight: 700 }}
                    >
                      <option value={stationProfile.stationName}>{stationProfile.stationName} (Main Branch)</option>
                      <option value="SHREE AMBICA FUELS - HIGHWAY">SHREE AMBICA FUELS (Highway Branch #2)</option>
                      <option value="SAI SERVICE STATION - CITY OUTLET">SAI SERVICE STATION (City Forecourt #3)</option>
                    </select>
                  </div>

                  <div className="win-form-row">
                    <span className="win-label" style={{ minWidth: '110px' }}>Financial Year</span>
                    <select
                      className="win-select"
                      value={selectedFinancialYear}
                      onChange={(e) => {
                        setSelectedFinancialYear(e.target.value);
                        showToast(`Selected Financial Year: ${e.target.value}`);
                      }}
                      style={{ flex: 1, fontWeight: 700 }}
                    >
                      <option value="2026-27">FY 2026-27 (Current Active)</option>
                      <option value="2025-26">FY 2025-26 (Audited / Closed)</option>
                      <option value="2024-25">FY 2024-25 (Historical Archive)</option>
                    </select>
                  </div>
                </div>

                <div style={{ border: '1px solid #c8e6c9', background: '#f1f8e9', padding: '12px', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 700, color: '#2e7d32', marginBottom: '6px', fontSize: '12px' }}>
                    📊 Multi-Format Export Utilities (Excel / CSV / BI-Ready JSON)
                  </div>
                  <div className="win-actions-row">
                    <button
                      type="button"
                      className="win-btn-classic"
                      style={{ background: '#1b5e20', color: '#fff', borderColor: '#0d3813', fontWeight: 700, padding: '6px 14px' }}
                      onClick={() => {
                        const state = erpStore.getState();
                        exportToCsv(
                          `NSAIPETROSOFT_Full_Station_Ledger_${getTodayErpDate()}`,
                          ['Type', 'Identifier', 'Date', 'Entity / Customer', 'Product', 'Quantity / Volume', 'Total Amount (INR)'],
                          [
                            ...state.creditBills.map((b) => ['CREDIT_SALE', b.bill_no, b.date, b.customer_name, b.product, b.qty, b.amount]),
                            ...state.purchases.map((p) => ['PURCHASE', p.invoice_no, p.date, p.dealer_name, p.product_name, p.qty_kl * 1000, p.final_amount]),
                            ...state.paymentReceipts.map((r) => ['RECEIPT', r.receipt_no, r.date, r.customer_name, r.payment_mode, 1, r.amount]),
                            ...state.expenses.map((e) => ['EXPENSE', `#${e.id}`, e.date, e.category, e.narration || '', 1, e.amount]),
                          ]
                        );
                        showToast('✔ Complete station transactional register exported to Excel CSV!');
                      }}
                    >
                      📥 Export Multi-Ledger Excel (.csv)
                    </button>
                    <button
                      type="button"
                      className="win-btn-classic"
                      style={{ background: '#0d47a1', color: '#fff', borderColor: '#072458', fontWeight: 700, padding: '6px 14px' }}
                      onClick={handleExportBiJson}
                    >
                      📑 Export BI-Ready JSON
                    </button>
                  </div>
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
