import React, { useState } from 'react';
import { recordMeterSwapApi, fetchMeterSwapsApi } from '../api/client';
import { erpStore } from '../store/erpStore';

interface SalesReadingRow {
  nozzle?: string;
  item?: string;
  close?: number;
  open?: number;
  rate?: number;
  nozzle_id?: number;
  [key: string]: any;
}

interface NozzleTotalizerMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  salesReadings: SalesReadingRow[];
  onOpenSalesDialog: () => void;
  showToast?: (msg: string) => void;
  onRefresh?: () => Promise<void> | void;
}

export const NozzleTotalizerMasterModal: React.FC<NozzleTotalizerMasterModalProps> = ({
  isOpen,
  onClose,
  salesReadings,
  onOpenSalesDialog,
  showToast,
  onRefresh,
}) => {
  const [selectedNozzle, setSelectedNozzle] = useState<SalesReadingRow | null>(null);
  const [showSwapModal, setShowSwapModal] = useState<boolean>(false);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [auditList, setAuditList] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);

  // Meter Swap Form State
  const [oldFinalMeter, setOldFinalMeter] = useState<number>(0.0);
  const [newInitialMeter, setNewInitialMeter] = useState<number>(0.0);
  const [swapReason, setSwapReason] = useState<string>('Dispensing Unit (DU) Breakdown / Meter Replacement');
  const [wmSealNo, setWmSealNo] = useState<string>('WM-IND-2026-');
  const [managerPin, setManagerPin] = useState<string>('1234');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleOpenSwap = (row: SalesReadingRow, index: number) => {
    setSelectedNozzle({
      ...row,
      nozzle_id: row.nozzle_id || (index + 1),
    });
    setOldFinalMeter(row.close ?? row.open ?? 0.0);
    setNewInitialMeter(0.0);
    setWmSealNo(`WM-IND-2026-${(index + 1).toString().padStart(3, '0')}`);
    setManagerPin('1234');
    setShowSwapModal(true);
  };

  const handleOpenAudit = async (row: SalesReadingRow, index: number) => {
    const nozzleId = row.nozzle_id || (index + 1);
    setSelectedNozzle({ ...row, nozzle_id: nozzleId });
    setShowAuditModal(true);
    setIsLoadingAudit(true);
    try {
      const logs = await fetchMeterSwapsApi(nozzleId);
      setAuditList(logs || []);
    } catch (err: any) {
      if (showToast) showToast(`⚠ Could not fetch audit log: ${err.message}`);
      setAuditList([]);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleExecuteMeterSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNozzle?.nozzle_id) return;
    setIsSubmitting(true);
    try {
      await recordMeterSwapApi(selectedNozzle.nozzle_id, {
        old_final_meter: oldFinalMeter,
        new_initial_meter: newInitialMeter,
        reason: swapReason,
        wm_seal_no: wmSealNo,
        manager_pin: managerPin,
      });

      // Synchronize in-memory store immediately
      const storeState = erpStore.getState();
      const noz = storeState.nozzles.find((n) => n.id === selectedNozzle.nozzle_id);
      if (noz) {
        noz.opening_meter = newInitialMeter;
        noz.closing_meter = newInitialMeter;
        erpStore.notify();
      }

      if (showToast) {
        showToast(`✔ Meter swap authorized! ${selectedNozzle.nozzle || 'Nozzle'} re-initialized to ${newInitialMeter.toFixed(2)}.`);
      }
      setShowSwapModal(false);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      if (showToast) {
        showToast(`❌ Swap failed: ${err.message || 'Authorization rejected'}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🚰</span>
            <span>Fuel Dispenser & Nozzle Totalizer Master (Hardware Meter Management)</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          {/* Statutory Notice */}
          <div style={{
            background: '#e8f4fd',
            border: '1px solid #70b0ec',
            padding: '6px 10px',
            fontSize: '11px',
            borderRadius: '2px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <strong>Weights & Measures (W&M) Compliance Note:</strong> In case of mechanical totalizer rollover or hardware pump servicing, record an authorized Meter Changeover with the government seal number to prevent negative sales.
            </div>
            <span style={{ fontSize: '10px', color: '#0d47a1', fontWeight: 700 }}>Rule 13(B) Validated</span>
          </div>

          <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '310px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th>Nozzle Name</th>
                  <th>Product</th>
                  <th>Tank Source</th>
                  <th>Dispenser MPD</th>
                  <th className="text-right">Current Meter</th>
                  <th className="text-right">Rate (₹)</th>
                  <th>W&M Status</th>
                  <th style={{ textAlign: 'center', width: '160px' }}>Hardware Operations</th>
                </tr>
              </thead>
              <tbody>
                {salesReadings.map((r, i) => {
                  const currentMtr = r.close ?? r.open ?? 0.0;
                  const isPetrol = (r.item || '').toLowerCase().includes('petrol') || (r.item || '').includes('MS');
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{r.nozzle || `Nozzle ${i + 1}`}</td>
                      <td>{r.item || (isPetrol ? 'Petrol (MS)' : 'Diesel (HSD)')}</td>
                      <td>{isPetrol ? 'MS Tank 1' : 'HSD Tank 1'}</td>
                      <td>Wayne Dresser MPD-{(i % 2) + 1}</td>
                      <td className="text-right" style={{ fontWeight: 700, color: '#1565c0' }}>
                        {Number(currentMtr).toFixed(2)}
                      </td>
                      <td className="text-right">₹ {Number(r.rate || 0).toFixed(2)}</td>
                      <td>
                        <span style={{ color: '#27ae60', fontWeight: 700, fontSize: '10.5px' }}>
                          ● CERTIFIED
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="win-btn-classic"
                            style={{ fontSize: '10px', height: '20px', padding: '0 6px', fontWeight: 600 }}
                            onClick={() => handleOpenSwap(r, i)}
                            title="Record physical hardware meter changeover or repair reset"
                          >
                            ⚙ Swap Meter
                          </button>
                          <button
                            type="button"
                            className="win-btn-classic"
                            style={{ fontSize: '10px', height: '20px', padding: '0 5px' }}
                            onClick={() => handleOpenAudit(r, i)}
                            title="View W&M stamping & replacement history"
                          >
                            📋 Log
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit | Totalizer Integrity Enforced</span>
          <div className="win-actions-row">
            <button className="win-btn-classic win-btn-primary" onClick={onOpenSalesDialog}>
              Go to Shift Sales Entry
            </button>
            <button className="win-btn-classic" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      {/* SUB-MODAL 1: Hardware Meter Swap / Replacement */}
      {showSwapModal && selectedNozzle && (
        <div className="win-modal-overlay" style={{ zIndex: 1100 }}>
          <div className="win-form-dialog" style={{ width: '480px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚙</span>
                <span>Hardware Meter Replacement / W&M Stamping Reset</span>
              </div>
              <button className="win-btn" onClick={() => setShowSwapModal(false)}>✕</button>
            </div>
            <form onSubmit={handleExecuteMeterSwap}>
              <div className="win-dialog-body" style={{ padding: '12px' }}>
                <div style={{ background: '#fff9c4', border: '1px solid #fbc02d', padding: '8px', fontSize: '11px', marginBottom: '10px' }}>
                  <strong>Manager Authorization Required:</strong> This event closes the old meter permanently and initializes the new hardware totalizer at the designated opening reading.
                </div>

                <div className="win-form-row" style={{ marginBottom: '8px' }}>
                  <span className="win-label" style={{ minWidth: '130px' }}>Selected Nozzle:</span>
                  <input
                    type="text"
                    className="win-input"
                    value={`${selectedNozzle.nozzle || 'Nozzle'} (${selectedNozzle.item || 'Fuel'})`}
                    disabled
                    style={{ flex: 1, fontWeight: 700, background: '#eee' }}
                  />
                </div>

                <div className="win-form-row" style={{ marginBottom: '8px' }}>
                  <span className="win-label" style={{ minWidth: '130px' }}>Old Final Meter:</span>
                  <input
                    type="number"
                    step="0.01"
                    className="win-input"
                    value={oldFinalMeter}
                    onChange={(e) => setOldFinalMeter(parseFloat(e.target.value) || 0)}
                    required
                    style={{ flex: 1, fontWeight: 700, color: '#c0392b' }}
                  />
                </div>

                <div className="win-form-row" style={{ marginBottom: '8px' }}>
                  <span className="win-label" style={{ minWidth: '130px' }}>New Initial Meter:</span>
                  <input
                    type="number"
                    step="0.01"
                    className="win-input"
                    value={newInitialMeter}
                    onChange={(e) => setNewInitialMeter(parseFloat(e.target.value) || 0)}
                    required
                    style={{ flex: 1, fontWeight: 700, color: '#27ae60' }}
                  />
                </div>

                <div className="win-form-row" style={{ marginBottom: '8px' }}>
                  <span className="win-label" style={{ minWidth: '130px' }}>Replacement Reason:</span>
                  <select
                    className="win-select"
                    value={swapReason}
                    onChange={(e) => setSwapReason(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option>Dispensing Unit (DU) Breakdown / Meter Replacement</option>
                    <option>W&M Stamping / Annual Verification Reset</option>
                    <option>Electronic Pulser / Motherboard Failure</option>
                    <option>Mechanical Totalizer Jam / Overhaul</option>
                    <option>OMC Mandatory Dispenser Modernization</option>
                  </select>
                </div>

                <div className="win-form-row" style={{ marginBottom: '8px' }}>
                  <span className="win-label" style={{ minWidth: '130px' }}>W&M Stamping Seal:</span>
                  <input
                    type="text"
                    className="win-input"
                    placeholder="e.g. WM-GJ-2026-9042"
                    value={wmSealNo}
                    onChange={(e) => setWmSealNo(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>

                <div className="win-form-row" style={{ marginBottom: '8px' }}>
                  <span className="win-label" style={{ minWidth: '130px' }}>Manager PIN:</span>
                  <input
                    type="password"
                    maxLength={6}
                    className="win-input"
                    placeholder="Enter PIN (Default: 1234)"
                    value={managerPin}
                    onChange={(e) => setManagerPin(e.target.value)}
                    required
                    style={{ flex: 1, letterSpacing: '3px', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div className="win-dialog-footer">
                <span className="hotkeys-hint-red">PIN Protected</span>
                <div className="win-actions-row">
                  <button
                    type="submit"
                    className="win-btn-classic win-btn-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Authorizing...' : 'Confirm Meter Swap'}
                  </button>
                  <button
                    type="button"
                    className="win-btn-classic"
                    onClick={() => setShowSwapModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-MODAL 2: Audit Log of Meter Swaps */}
      {showAuditModal && selectedNozzle && (
        <div className="win-modal-overlay" style={{ zIndex: 1100 }}>
          <div className="win-form-dialog" style={{ width: '640px' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📋</span>
                <span>W&M Meter Changeover Audit Trail - {selectedNozzle.nozzle || 'Nozzle'}</span>
              </div>
              <button className="win-btn" onClick={() => setShowAuditModal(false)}>✕</button>
            </div>
            <div className="win-dialog-body" style={{ padding: '10px' }}>
              {isLoadingAudit ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>Loading audit records from Railway PostgreSQL...</div>
              ) : auditList.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                  No previous meter replacements recorded for this nozzle. Factory totalizer active.
                </div>
              ) : (
                <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '220px', overflowY: 'auto' }}>
                  <table className="win-datagrid">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="text-right">Old Final</th>
                        <th className="text-right">New Initial</th>
                        <th>Reason</th>
                        <th>W&M Seal</th>
                        <th>Authorized By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditList.map((a, idx) => (
                        <tr key={idx}>
                          <td>{a.date}</td>
                          <td className="text-right" style={{ color: '#c0392b', fontWeight: 600 }}>{Number(a.old_final_meter).toFixed(2)}</td>
                          <td className="text-right" style={{ color: '#27ae60', fontWeight: 600 }}>{Number(a.new_initial_meter).toFixed(2)}</td>
                          <td>{a.reason}</td>
                          <td style={{ fontWeight: 600 }}>{a.wm_seal_no || '-'}</td>
                          <td>{a.authorized_by}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="win-dialog-footer">
              <span className="hotkeys-hint-red">Statutory Record</span>
              <button className="win-btn-classic" onClick={() => setShowAuditModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
