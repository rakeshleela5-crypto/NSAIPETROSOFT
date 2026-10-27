import React, { useState, useEffect, useCallback } from 'react';
import type { StationProfile } from '../models';
import {
  fetchForecourtLogsApi,
  simulateForecourtDropApi,
  pushForecourtLogToPosApi,
  type ForecourtLogItem,
} from '../api/client';

interface ForecourtAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  stationProfile: StationProfile;
  showToast: (msg: string) => void;
  onOpenCashBillWithData?: (data: { vehicle: string; product: string; liters: number; rate: number }) => void;
}

interface AutomatedDispenser {
  pumpId: number;
  nozzleId: string;
  product: 'MS' | 'HSD';
  rate: number;
  status: 'IDLE' | 'NOZZLE_UP' | 'DISPENSING' | 'COMPLETED';
  currentLiters: number;
  currentAmount: number;
  totalizer: number;
}

export const ForecourtAutomationModal: React.FC<ForecourtAutomationModalProps> = ({
  isOpen,
  onClose,
  stationProfile,
  showToast,
  onOpenCashBillWithData,
}) => {
  const [selectedProtocol, setSelectedProtocol] = useState<string>('DOMS PSS 5000 (Ethernet TCP/IP)');
  const [controllerIp, setControllerIp] = useState<string>('192.168.1.150:4001');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live Dispenser Status
  const [dispensers, setDispensers] = useState<AutomatedDispenser[]>([
    { pumpId: 1, nozzleId: 'N1', product: 'MS', rate: 102.65, status: 'IDLE', currentLiters: 0, currentAmount: 0, totalizer: 45280.5 },
    { pumpId: 1, nozzleId: 'N2', product: 'HSD', rate: 94.50, status: 'IDLE', currentLiters: 0, currentAmount: 0, totalizer: 89410.2 },
    { pumpId: 2, nozzleId: 'N3', product: 'MS', rate: 102.65, status: 'IDLE', currentLiters: 0, currentAmount: 0, totalizer: 31200.0 },
    { pumpId: 2, nozzleId: 'N4', product: 'HSD', rate: 94.50, status: 'IDLE', currentLiters: 0, currentAmount: 0, totalizer: 62450.8 },
  ]);

  // Controller Log Records loaded from PostgreSQL
  const [logs, setLogs] = useState<ForecourtLogItem[]>([]);

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    setErrorMessage(null);
    try {
      const records = await fetchForecourtLogsApi();
      setLogs(records);
    } catch (err: any) {
      console.error('Failed to load forecourt logs:', err);
      setErrorMessage(err.message || 'Failed to connect to Forecourt Controller API');
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen, loadLogs]);

  // Real-time Dispensing Simulation Engine
  useEffect(() => {
    if (!isOpen || !isSimulating) return;

    const timer = setInterval(() => {
      setDispensers((prev) =>
        prev.map((d) => {
          if (d.nozzleId === 'N1') {
            const nextLiters = Math.round((d.currentLiters + 0.35) * 100) / 100;
            if (nextLiters >= 20.0) {
              return {
                ...d,
                status: 'COMPLETED',
                currentLiters: 20.0,
                currentAmount: Math.round(20.0 * d.rate * 100) / 100,
                totalizer: Math.round((d.totalizer + 20.0) * 100) / 100,
              };
            }
            return {
              ...d,
              status: 'DISPENSING',
              currentLiters: nextLiters,
              currentAmount: Math.round(nextLiters * d.rate * 100) / 100,
            };
          }
          return d;
        })
      );
    }, 400);

    return () => clearInterval(timer);
  }, [isOpen, isSimulating]);

  if (!isOpen) return null;

  const handlePushToPos = async (log: ForecourtLogItem) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await pushForecourtLogToPosApi({
        log_id: log.id,
        payment_mode: 'CASH',
        customer_name: 'Walk-in Retail Customer',
        vehicle_no: 'WALK-IN',
      });
      await loadLogs();
      if (onOpenCashBillWithData) {
        onOpenCashBillWithData({
          vehicle: 'WALK-IN',
          product: log.product_code || (log.product_name.includes('MS') ? 'MS' : 'HSD'),
          liters: log.liters,
          rate: log.rate,
        });
        showToast(`✔ Loaded automated TX #${log.tx_id} (${log.liters}L) into POS Bill!`);
        onClose();
      } else {
        showToast(res.message || `✔ Automation TX #${log.tx_id} committed to PostgreSQL POS register.`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Push to POS failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulateNewDrop = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await simulateForecourtDropApi({
        pump_id: 1,
        nozzle_name: 'Pump 1 - Nozzle N1 (MS)',
        product_name: 'Petrol (MS)',
        product_code: 'MS',
        liters: 20.0,
        rate: 102.65,
        protocol: selectedProtocol,
        controller_ip: controllerIp,
      });
      await loadLogs();
      showToast(res.message || `📡 Live Controller Push: Nozzle N1 completed 20.00L dispensing committed to PostgreSQL.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Simulation ingestion failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '940px', maxHeight: '94vh', overflowY: 'auto' }}>
        {/* Title Bar */}
        <div className="win-dialog-titlebar">
          <div className="win-dialog-titlebar-content">
            <span>📡</span>
            <span style={{ fontWeight: 700 }}>Forecourt Automation & Dispenser Controller Hub — {stationProfile.stationName}</span>
            <span className="win-pos-hotkey-badge">[PostgreSQL Live Persistence]</span>
          </div>
          <button className="win-btn win-btn-close" onClick={onClose} title="Close (ESC)">✕</button>
        </div>

        <div className="win-dialog-body" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {errorMessage && (
            <div style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#991b1b', padding: '8px 12px', borderRadius: '4px', fontSize: '12px' }}>
              ⚠️ <b>Error:</b> {errorMessage}
            </div>
          )}

          {/* Section: Protocol & IP Gateway Config */}
          <div className="win-card" style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155' }}>
                  Controller Protocol:
                  <select
                    className="win-select"
                    value={selectedProtocol}
                    onChange={(e) => setSelectedProtocol(e.target.value)}
                    style={{ marginLeft: '6px', fontSize: '11px', height: '24px' }}
                  >
                    <option value="DOMS PSS 5000 (Ethernet TCP/IP)">DOMS PSS 5000 (Ethernet TCP/IP)</option>
                    <option value="Gilbarco Two-Wire Current Loop (RS-485)">Gilbarco Two-Wire Current Loop (RS-485)</option>
                    <option value="Orpak Forecourt Site Controller (FSC)">Orpak Forecourt Site Controller (FSC)</option>
                    <option value="Radian Forecourt Automation Hub">Radian Forecourt Automation Hub</option>
                    <option value="Tokheim Kaizen Controller (IFSF-LON)">Tokheim Kaizen Controller (IFSF-LON)</option>
                  </select>
                </label>

                <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155' }}>
                  Gateway Host / IP:
                  <input
                    type="text"
                    className="win-input"
                    value={controllerIp}
                    onChange={(e) => setControllerIp(e.target.value)}
                    style={{ marginLeft: '6px', width: '150px', fontSize: '11px', height: '24px' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    background: '#dcfce7',
                    color: '#166534',
                    border: '1px solid #86efac',
                  }}
                >
                  ● GATEWAY ONLINE (PostgreSQL Synced)
                </span>

                <button
                  type="button"
                  className="win-btn-classic"
                  onClick={() => setIsSimulating(!isSimulating)}
                  style={{
                    fontSize: '11px',
                    height: '24px',
                    padding: '0 8px',
                    background: isSimulating ? '#fee2e2' : '#e0e7ff',
                    borderColor: isSimulating ? '#fca5a5' : '#a5b4fc',
                    color: isSimulating ? '#991b1b' : '#3730a3',
                    fontWeight: 700,
                  }}
                >
                  {isSimulating ? '⏹ Pause Dispenser Sim' : '▶ Simulate Fueling Motion'}
                </button>

                <button
                  type="button"
                  className="win-btn-classic"
                  onClick={handleSimulateNewDrop}
                  disabled={isSubmitting}
                  style={{
                    fontSize: '11px',
                    height: '24px',
                    padding: '0 10px',
                    background: '#ecfdf5',
                    borderColor: '#6ee7b7',
                    color: '#065f46',
                    fontWeight: 700,
                  }}
                  title="Inject live transaction directly into PostgreSQL forecourt_controller_logs table"
                >
                  {isSubmitting ? '⏳ Ingesting...' : '⚡ Ingest Live Drop (PostgreSQL)'}
                </button>
              </div>
            </div>
          </div>

          {/* Section: Live Dispenser Monitor */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '12px', color: '#0a246a', marginBottom: '8px' }}>
              ⛽ Live Forecourt Dispenser Totalizers & Real-time Flow
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {dispensers.map((d) => (
                <div
                  key={`${d.pumpId}-${d.nozzleId}`}
                  style={{
                    background: d.status === 'DISPENSING' ? '#ecfdf5' : '#ffffff',
                    border: `2px solid ${d.status === 'DISPENSING' ? '#10b981' : d.status === 'COMPLETED' ? '#3b82f6' : '#cbd5e1'}`,
                    borderRadius: '4px',
                    padding: '10px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '11.5px' }}>Pump {d.pumpId} • {d.nozzleId}</span>
                    <span
                      style={{
                        padding: '1px 5px',
                        borderRadius: '2px',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        background: d.product === 'MS' ? '#fef3c7' : '#dbeafe',
                        color: d.product === 'MS' ? '#b45309' : '#1d4ed8',
                      }}
                    >
                      {d.product === 'MS' ? 'Petrol (MS)' : 'Diesel (HSD)'}
                    </span>
                  </div>

                  <div style={{ textAlign: 'center', margin: '8px 0' }}>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>VOLUME DISPENSED</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: d.status === 'DISPENSING' ? '#047857' : '#0f172a', fontFamily: 'monospace' }}>
                      {d.currentLiters.toFixed(2)} <span style={{ fontSize: '12px' }}>L</span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0369a1' }}>
                      ₹ {d.currentAmount.toFixed(2)}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '4px', fontSize: '10px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Rate: ₹{d.rate.toFixed(2)}</span>
                    <span style={{ fontWeight: 600, color: d.status === 'DISPENSING' ? '#16a34a' : '#475569' }}>
                      {d.status === 'DISPENSING' ? '🟢 FUELING...' : d.status === 'COMPLETED' ? '🔵 COMPLETE' : '⚪ IDLE'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Incoming Automation Transaction Buffer backed by PostgreSQL */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#0a246a' }}>
                📋 PostgreSQL Controller Transaction Log Buffer (Ready to Push to POS)
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {isLoadingLogs ? '⏳ Fetching fresh logs from PostgreSQL...' : `${logs.length} transactions recorded`}
              </div>
            </div>

            <div style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '4px', overflowX: 'auto' }}>
              <table className="win-datagrid" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>TX ID</th>
                    <th>Event Time</th>
                    <th>Pump / Nozzle</th>
                    <th>Product</th>
                    <th className="text-right">Qty (L)</th>
                    <th className="text-right">Rate (₹)</th>
                    <th className="text-right">Amount (₹)</th>
                    <th style={{ textAlign: 'center' }}>Sync Status</th>
                    <th style={{ textAlign: 'center' }}>POS Action</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '16px', color: '#64748b' }}>
                        {isLoadingLogs ? 'Loading records...' : 'No forecourt transactions recorded yet. Click "Ingest Live Drop (PostgreSQL)" above to simulate.'}
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{log.tx_id}</td>
                        <td>{log.event_time ? new Date(log.event_time).toLocaleTimeString() : '-'}</td>
                        <td style={{ fontWeight: 600 }}>Pump {log.pump_id} ({log.nozzle_name})</td>
                        <td>{log.product_name}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>{log.liters.toFixed(2)}</td>
                        <td className="text-right">₹{log.rate.toFixed(2)}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: '#0a246a' }}>
                          ₹{log.amount.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '1px 5px',
                              borderRadius: '2px',
                              fontSize: '9.5px',
                              fontWeight: 700,
                              background: log.status === 'SYNCED' ? '#dcfce7' : '#fef9c3',
                              color: log.status === 'SYNCED' ? '#15803d' : '#854d0e',
                            }}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {log.status === 'SYNCED' ? (
                            <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>✔ Synced</span>
                          ) : (
                            <button
                              type="button"
                              className="win-btn-classic"
                              onClick={() => handlePushToPos(log)}
                              disabled={isSubmitting}
                              style={{
                                fontSize: '10px',
                                height: '20px',
                                padding: '0 6px',
                                background: '#e0f2fe',
                                borderColor: '#7dd3fc',
                                color: '#0369a1',
                                fontWeight: 700,
                              }}
                              title="Commit this automated pump transaction into PostgreSQL POS retail_cash_invoices"
                            >
                              ⚡ Push to POS
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="win-dialog-footer" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontSize: '11px', color: '#475569' }}>
            💡 <i>Real-time DOMS / Gilbarco controller logs backed by ACID PostgreSQL transactions in `forecourt_controller_logs`.</i>
          </div>
          <button type="button" className="win-btn-classic" onClick={onClose} style={{ padding: '4px 14px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
