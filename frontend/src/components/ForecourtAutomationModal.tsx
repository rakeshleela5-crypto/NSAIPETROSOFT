import React, { useState, useEffect } from 'react';
import type { StationProfile } from '../models';

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

interface ControllerLogRecord {
  id: string;
  time: string;
  pump: number;
  nozzle: string;
  product: string;
  liters: number;
  rate: number;
  amount: number;
  status: 'SYNCED' | 'PENDING';
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

  // Live Dispenser Status
  const [dispensers, setDispensers] = useState<AutomatedDispenser[]>([
    { pumpId: 1, nozzleId: 'N1', product: 'MS', rate: 102.65, status: 'IDLE', currentLiters: 0, currentAmount: 0, totalizer: 45280.5 },
    { pumpId: 1, nozzleId: 'N2', product: 'HSD', rate: 94.50, status: 'IDLE', currentLiters: 0, currentAmount: 0, totalizer: 89410.2 },
    { pumpId: 2, nozzleId: 'N3', product: 'MS', rate: 102.65, status: 'IDLE', currentLiters: 0, currentAmount: 0, totalizer: 31200.0 },
    { pumpId: 2, nozzleId: 'N4', product: 'HSD', rate: 94.50, status: 'IDLE', currentLiters: 0, currentAmount: 0, totalizer: 62450.8 },
  ]);

  // Controller Log Records
  const [logs, setLogs] = useState<ControllerLogRecord[]>([
    { id: 'TX-9421', time: '14:22:15', pump: 1, nozzle: 'N1 (MS)', product: 'Petrol (MS)', liters: 25.40, rate: 102.65, amount: 2607.31, status: 'SYNCED' },
    { id: 'TX-9422', time: '14:24:30', pump: 2, nozzle: 'N4 (HSD)', product: 'Diesel (HSD)', liters: 48.00, rate: 94.50, amount: 4536.00, status: 'SYNCED' },
    { id: 'TX-9423', time: '14:28:10', pump: 1, nozzle: 'N2 (HSD)', product: 'Diesel (HSD)', liters: 15.00, rate: 94.50, amount: 1417.50, status: 'PENDING' },
    { id: 'TX-9424', time: '14:31:05', pump: 2, nozzle: 'N3 (MS)', product: 'Petrol (MS)', liters: 10.00, rate: 102.65, amount: 1026.50, status: 'PENDING' },
  ]);

  // Real-time Dispensing Simulation Engine
  useEffect(() => {
    if (!isOpen || !isSimulating) return;

    const timer = setInterval(() => {
      setDispensers((prev) =>
        prev.map((d) => {
          if (d.nozzleId === 'N1') {
            // Simulate active car fueling on Nozzle 1
            const nextLiters = Math.round((d.currentLiters + 0.35) * 100) / 100;
            if (nextLiters >= 20.0) {
              // Fueling complete
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

  const handlePushToPos = (log: ControllerLogRecord) => {
    if (onOpenCashBillWithData) {
      onOpenCashBillWithData({
        vehicle: 'WALK-IN',
        product: log.product.includes('MS') ? 'MS' : 'HSD',
        liters: log.liters,
        rate: log.rate,
      });
      showToast(`✔ Loaded automated TX #${log.id} (${log.liters}L) into POS Bill!`);
      onClose();
    } else {
      showToast(`✔ Automation TX #${log.id} synced with POS register.`);
    }
  };

  const handleSimulateNewDrop = () => {
    const newTx: ControllerLogRecord = {
      id: `TX-${Math.floor(1000 + Math.random() * 9000)}`,
      time: new Date().toLocaleTimeString(),
      pump: 1,
      nozzle: 'N1 (MS)',
      product: 'Petrol (MS)',
      liters: 20.0,
      rate: 102.65,
      amount: 2053.0,
      status: 'PENDING',
    };
    setLogs([newTx, ...logs]);
    showToast(`📡 Live Controller Push: Nozzle N1 completed 20.00L dispensing.`);
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px', maxHeight: '94vh', overflowY: 'auto' }}>
        {/* Title Bar */}
        <div className="win-dialog-titlebar">
          <div className="win-dialog-titlebar-content">
            <span>📡</span>
            <span style={{ fontWeight: 700 }}>Forecourt Automation & Dispenser Controller Hub — {stationProfile.stationName}</span>
            <span className="win-pos-hotkey-badge">[RS-485 / TCP Gateway]</span>
          </div>
          <button className="win-btn win-btn-close" onClick={onClose} title="Close (ESC)">✕</button>
        </div>

        <div className="win-dialog-body" style={{ padding: '14px' }}>
          {/* Hardware Protocol Status Bar */}
          <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px', marginBottom: '14px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1.5, minWidth: '220px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Controller Protocol Standard:</span>
              <select className="win-select" value={selectedProtocol} onChange={(e) => setSelectedProtocol(e.target.value)} style={{ width: '100%', fontWeight: 700 }}>
                <option value="DOMS PSS 5000 (Ethernet TCP/IP)">DOMS PSS 5000 (Ethernet TCP/IP)</option>
                <option value="Gilbarco Veeder-Root (Two-Wire DART)">Gilbarco Veeder-Root (Two-Wire DART)</option>
                <option value="Orpak SiteOmat (Forecourt Hub)">Orpak SiteOmat (Forecourt Hub)</option>
                <option value="Radian Petroleum Controller">Radian Petroleum Controller</option>
                <option value="Tokheim Kaizen / Tatsuno Loop">Tokheim Kaizen / Tatsuno Loop</option>
                <option value="Generic USB/Serial Controller (.DAT/.CSV)">Generic USB/Serial Controller (.DAT/.CSV)</option>
              </select>
            </div>

            <div style={{ flex: 1, minWidth: '150px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Gateway IP / Port:</span>
              <input type="text" className="win-input" value={controllerIp} onChange={(e) => setControllerIp(e.target.value)} style={{ width: '100%', fontFamily: 'monospace', fontWeight: 700 }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '14px' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#16a34a' }} />
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#166534' }}>Protocol Gateway Active</span>
            </div>
          </div>

          {/* Section: Live Dispenser Monitor */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#0a246a' }}>
                ⛽ Forecourt Dispensers Real-Time Telemetry (Live Flow)
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className={`win-btn-classic ${isSimulating ? 'win-btn-primary' : ''}`}
                  onClick={() => setIsSimulating(!isSimulating)}
                  style={{ fontSize: '11px', padding: '2px 8px', fontWeight: 700 }}
                >
                  {isSimulating ? '⏸ Pause Simulation' : '▶ Start Dispenser Fueling Demo'}
                </button>
                <button
                  type="button"
                  className="win-btn-classic"
                  onClick={handleSimulateNewDrop}
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                >
                  ⚡ Simulate Completed Fuel Drop
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {dispensers.map((d) => (
                <div
                  key={d.nozzleId}
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

          {/* Section: Incoming Automation Transaction Buffer */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#0a246a' }}>
                📋 Controller Transaction Log Buffer (Ready to Push to POS)
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Auto-detected via Controller Listener
              </div>
            </div>

            <div style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '4px', overflowX: 'auto' }}>
              <table className="win-datagrid" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>TX ID</th>
                    <th>Time</th>
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
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{log.id}</td>
                      <td>{log.time}</td>
                      <td style={{ fontWeight: 600 }}>Pump {log.pump} ({log.nozzle})</td>
                      <td>{log.product}</td>
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
                        <button
                          type="button"
                          className="win-btn-classic"
                          onClick={() => handlePushToPos(log)}
                          style={{
                            fontSize: '10px',
                            height: '20px',
                            padding: '0 6px',
                            background: '#e0f2fe',
                            borderColor: '#7dd3fc',
                            color: '#0369a1',
                            fontWeight: 700,
                          }}
                          title="Push this automated pump transaction into POS Cash Memo"
                        >
                          ⚡ Push to POS
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="win-dialog-footer" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontSize: '11px', color: '#475569' }}>
            💡 <i>Supports DOMS, Gilbarco, Orpak, Radian, Tokheim, and Tatsuno forecourt controller hardware.</i>
          </div>
          <button type="button" className="win-btn-classic" onClick={onClose} style={{ padding: '4px 14px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
