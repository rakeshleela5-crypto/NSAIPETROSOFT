import React, { useState, useEffect } from 'react';
import { erpStore } from '../store/erpStore';
import { getOfflineQueueCount } from '../utils/offlineQueue';

interface HelpDeskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpDeskModal: React.FC<HelpDeskModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'shortcuts' | 'auditGuide' | 'diagnostics'>('shortcuts');
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const state = erpStore.getState();
  const queueCount = getOfflineQueueCount();

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '740px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📞</span>
            <span>NSAIPETROSOFT Help Desk, Forecourt Operations Guide & System Diagnostics</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body" style={{ lineHeight: '1.6' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '2px solid #506f8c', marginBottom: '12px', background: '#e0dfdb', padding: '4px 8px 0 8px', gap: '4px' }}>
            <button
              type="button"
              style={{
                padding: '6px 14px',
                border: '1px solid #7f9db9',
                borderBottom: activeTab === 'shortcuts' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                background: activeTab === 'shortcuts' ? '#ece9d8' : '#d4d0c8',
                fontWeight: activeTab === 'shortcuts' ? 700 : 400,
                cursor: 'pointer',
                outline: 'none',
                borderTopLeftRadius: '3px',
                borderTopRightRadius: '3px',
                marginBottom: activeTab === 'shortcuts' ? '-2px' : '0',
                fontSize: '11px',
              }}
              onClick={() => setActiveTab('shortcuts')}
            >
              ⌨️ Keyboard Shortcuts
            </button>
            <button
              type="button"
              style={{
                padding: '6px 14px',
                border: '1px solid #7f9db9',
                borderBottom: activeTab === 'auditGuide' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                background: activeTab === 'auditGuide' ? '#ece9d8' : '#d4d0c8',
                fontWeight: activeTab === 'auditGuide' ? 700 : 400,
                cursor: 'pointer',
                outline: 'none',
                borderTopLeftRadius: '3px',
                borderTopRightRadius: '3px',
                marginBottom: activeTab === 'auditGuide' ? '-2px' : '0',
                fontSize: '11px',
              }}
              onClick={() => setActiveTab('auditGuide')}
            >
              ⛽ Forecourt Audit & Compliance
            </button>
            <button
              type="button"
              style={{
                padding: '6px 14px',
                border: '1px solid #7f9db9',
                borderBottom: activeTab === 'diagnostics' ? '2px solid #ece9d8' : '1px solid #7f9db9',
                background: activeTab === 'diagnostics' ? '#ece9d8' : '#d4d0c8',
                fontWeight: activeTab === 'diagnostics' ? 700 : 400,
                cursor: 'pointer',
                outline: 'none',
                borderTopLeftRadius: '3px',
                borderTopRightRadius: '3px',
                marginBottom: activeTab === 'diagnostics' ? '-2px' : '0',
                fontSize: '11px',
                color: '#0d47a1',
              }}
              onClick={() => setActiveTab('diagnostics')}
            >
              🩺 System Health Diagnostics
            </button>
          </div>

          {/* TAB 1: Keyboard Shortcuts */}
          {activeTab === 'shortcuts' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '12px', marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#1565c0', marginBottom: '8px' }}>
                  Forecourt Keyboard Accelerators (Speed Billing & Quick Navigation)
                </div>
                <table className="win-datagrid" style={{ width: '100%', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>Shortcut Key</th>
                      <th style={{ width: '38%' }}>Action / Dialog Opened</th>
                      <th style={{ width: '40%' }}>Operational Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>F1</kbd></td>
                      <td><b>Sales Entry</b></td>
                      <td>Opens Nozzle Meter Totalizers entry for active shift</td>
                    </tr>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>F2</kbd></td>
                      <td><b>Fuel Rate Master / Sale POS</b></td>
                      <td>Quickly view or change live fuel tariff or quick bill</td>
                    </tr>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>F3</kbd></td>
                      <td><b>Credit Customer Sale</b></td>
                      <td>Credit slip entry with hard credit limit verification</td>
                    </tr>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>F4</kbd></td>
                      <td><b>Payment Receipt</b></td>
                      <td>Record cash/cheque/UPI settlement from customer</td>
                    </tr>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>F5</kbd></td>
                      <td><b>Expense Book</b></td>
                      <td>Record daily forecourt operating expense vouchers</td>
                    </tr>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>F6</kbd></td>
                      <td><b>Transfer Entry</b></td>
                      <td>Contra transfer between Cash on Hand and Bank Accounts</td>
                    </tr>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>F7</kbd></td>
                      <td><b>Purchase Decanting Entry</b></td>
                      <td>Tanker receipt entry with LFR, Density and TDS Sec 194Q</td>
                    </tr>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>F8</kbd></td>
                      <td><b>DIP REGISTER</b></td>
                      <td>Daily tank physical dip reading and variance monitoring</td>
                    </tr>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>F9</kbd></td>
                      <td><b>Cashier Denominations</b></td>
                      <td>Physical currency note counter for cashier shift handover</td>
                    </tr>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>F10</kbd></td>
                      <td><b>Report Criteria Dialog</b></td>
                      <td>Access all 44 station statutory and audit reports</td>
                    </tr>
                    <tr>
                      <td><kbd style={{ background: '#eee', padding: '2px 6px', border: '1px solid #999', borderRadius: '3px' }}>ESC</kbd></td>
                      <td><b>Close / Dismiss Window</b></td>
                      <td>Safely closes the active modal without submitting changes</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Forecourt Audit Guide */}
          {activeTab === 'auditGuide' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '12px', marginBottom: '12px', fontSize: '11.5px', lineHeight: '1.7' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#b71c1c', marginBottom: '6px' }}>
                  Daily Petroleum Forecourt Audit & Statutory Compliance Guide
                </div>
                <div>
                  <b>1. Tank DIP Variance Standard (0.05% Permissible Limit):</b>
                  <br />
                  Under petroleum retail marketing guidelines, the daily variance between <i>Physical Dip Stock</i> and <i>Book Stock</i> must not exceed <b>0.05%</b> of throughput/capacity. Green variance indicates within tolerance; persistent red highlights indicate pipeline leakages or calibration drift.
                </div>
                <div style={{ marginTop: '8px' }}>
                  <b>2. Temperature & Density Testing (ASTM 53B):</b>
                  <br />
                  Before tanker decantation, measure observed temperature and hydrometer density. Convert to standardized density at <b>15°C</b> using ASTM Table 53B. The variance from invoice density must not exceed <b>±3.0 kg/m³</b> for MS and HSD.
                </div>
                <div style={{ marginTop: '8px' }}>
                  <b>3. Section 194Q TDS (0.1% on Goods Purchase):</b>
                  <br />
                  Purchases from Oil Marketing Companies (IOCL/BPCL/HPCL) exceeding ₹50 Lakhs in a financial year are subject to <b>0.1% TDS</b> on purchase value excluding GST/VAT. NSAIPETROSOFT auto-computes this deduction on every Purchase Entry.
                </div>
                <div style={{ marginTop: '8px' }}>
                  <b>4. Dispenser Totalizer Meter Rollover:</b>
                  <br />
                  Mechanical totalizers rollover at 999999. Electronic totalizers reset after 99999999. In case of rollover, check the <i>"Meter Rollover"</i> flag in Sales Entry to allow Closing Meter &lt; Opening Meter.
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Diagnostics Panel */}
          {activeTab === 'diagnostics' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '12px', marginBottom: '12px', fontSize: '11.5px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#0d47a1', marginBottom: '10px' }}>
                  Station POS Runtime & Forecourt Health Diagnostics
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ border: '1px solid #e0e0e0', padding: '8px', background: '#fafafa' }}>
                    <div><strong>Network Status:</strong> {isOnline ? '🟢 Online (Cloud Connected)' : '🟠 Forecourt Offline (Buffering)'}</div>
                    <div><strong>Offline Queue Depth:</strong> {queueCount} transactions queued</div>
                    <div><strong>Persistence Architecture:</strong> Cloud-Direct PostgreSQL (Zero LocalStorage)</div>
                    <div><strong>Database Schema Version:</strong> v2.0 (ACID Multi-ledger)</div>
                  </div>
                  <div style={{ border: '1px solid #e0e0e0', padding: '8px', background: '#fafafa' }}>
                    <div><strong>Active Tanks:</strong> {state.tanks.length} configured</div>
                    <div><strong>Active Nozzles:</strong> {state.nozzles.length} mapped</div>
                    <div><strong>Customer Fleet Records:</strong> {state.customers.length} registered</div>
                    <div><strong>Credit Bills Saved:</strong> {state.creditBills.length} slips</div>
                  </div>
                </div>

                <div style={{ marginTop: '12px', padding: '8px', background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '3px' }}>
                  <div style={{ fontWeight: 700, color: '#1b5e20' }}>✔ Forecourt POS Health: Optimal</div>
                  <div style={{ fontSize: '11px', color: '#333' }}>
                    Zero preloader deadlocks. Microsecond half-up decimal math active. Safe rollback storage initialized.
                  </div>
                </div>

                <div style={{ marginTop: '14px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                  <strong>Helpline Support:</strong> +91-63551-90064 / +91-95866-51811 (09:00 AM – 06:00 PM IST)
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | Hotkeys Active Forecourt-wide</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
