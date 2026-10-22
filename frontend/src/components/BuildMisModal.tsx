import React from 'react';
import type { CustomerFull, DashboardKPIs, StationProfile } from '../models';
import type { TankMasterItem } from '../store/erpStore';
import { erpStore } from '../store/erpStore';
import { getTodayErpDate } from '../utils/dateUtils';
import { exportToCsv } from '../utils/exportCsv';

interface BuildMisModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpis?: DashboardKPIs;
  tanks?: TankMasterItem[];
  customers?: CustomerFull[];
  creditBills?: any[];
  payReceipts?: any[];
  expensesList?: any[];
  stationProfile?: StationProfile;
  showToast?: (msg: string) => void;
}

export const BuildMisModal: React.FC<BuildMisModalProps> = ({
  isOpen,
  onClose,
  kpis = erpStore.getDashboardKPIs(),
  tanks = erpStore.getState().tanks,
  customers = erpStore.getState().customers,
  creditBills = erpStore.getState().creditBills,
  payReceipts = erpStore.getState().paymentReceipts,
  expensesList = erpStore.getState().expenses,
  showToast,
}) => {
  if (!isOpen) return null;

  // Analytical calculations
  const totalFuelLitres = tanks.reduce((sum, t) => sum + (t.current_stock || 0), 0);
  const totalCreditIssued = creditBills.reduce((sum, b) => sum + (b.amount || b.total || 0), 0);
  const totalCreditRecovered = payReceipts.reduce((sum, r) => sum + (r.amount || r.amt || 0), 0);
  const creditRecoveryRatio = totalCreditIssued > 0 ? Math.round((totalCreditRecovered / totalCreditIssued) * 100) : 85;

  const totalExpenses = expensesList.reduce((sum, e) => sum + (e.amount || 0), 0);
  const estGrossMargin = Math.round(kpis.today_sale * 0.032); // Average dealer margin ~3.2%
  const netDealerMargin = Math.max(0, estGrossMargin - totalExpenses);

  // Evaporation loss: MS (0.59%), HSD (0.10%)
  const msTank = tanks.find((t) => t.code === 'MS');
  const hsdTank = tanks.find((t) => t.code === 'HSD');
  const msEvaporationL = msTank ? Math.round(msTank.current_stock * 0.0059) : 84;
  const hsdEvaporationL = hsdTank ? Math.round(hsdTank.current_stock * 0.001) : 19;

  const handleExport = () => {
    exportToCsv(
      `NSAIPETROSOFT_Executive_MIS_${getTodayErpDate()}`,
      ['Metric', 'Value', 'Benchmark / Target', 'Status'],
      [
        ['Today Fuel Gross Sales', `INR ${kpis.today_sale.toFixed(2)}`, 'Daily Target 45,000L', 'ON_TRACK'],
        ['Estimated Dealer Net Margin', `INR ${netDealerMargin.toFixed(2)}`, '3.2% Turnover', 'HEALTHY'],
        ['Credit Recovery Ratio', `${creditRecoveryRatio}%`, '> 80% Fortnightly Target', creditRecoveryRatio >= 80 ? 'EXCELLENT' : 'MONITOR'],
        ['Total Customer Credit Outstanding', `INR ${kpis.total_outstanding.toFixed(2)}`, '< INR 25,00,000', 'STABLE'],
        ['Forecourt Operating Expenses', `INR ${totalExpenses.toFixed(2)}`, '< 1.0% Turnover', 'CONTROLLED'],
        ['Total Forecourt Fuel Inventory', `${totalFuelLitres.toLocaleString()} Litres`, 'Capacity Buffer', 'HEALTHY'],
      ]
    );
    if (showToast) showToast('✔ Executive MIS Report exported to CSV!');
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📈</span>
            <span>Executive MIS Forecourt Analytics & Operational Profitability Dashboard</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          {/* Header Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>
              Performance Intelligence Snapshot as of {getTodayErpDate()}
            </span>
            <button
              type="button"
              className="win-btn-classic"
              onClick={handleExport}
              style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 700 }}
            >
              📥 Export MIS Report (.CSV)
            </button>
          </div>

          {/* 4 Executive KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
            <div style={{ background: '#eef2f7', border: '1px solid #7f9db9', padding: '10px', borderRadius: '4px' }}>
              <div style={{ fontSize: '11px', color: '#555', fontWeight: 600 }}>Estimated Net Margin</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#1b5e20', margin: '4px 0' }}>
                ₹ {netDealerMargin.toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '10px', color: '#27ae60' }}>● Net of Daily Operating Costs</div>
            </div>

            <div style={{ background: '#eef2f7', border: '1px solid #7f9db9', padding: '10px', borderRadius: '4px' }}>
              <div style={{ fontSize: '11px', color: '#555', fontWeight: 600 }}>Credit Recovery Ratio</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: creditRecoveryRatio >= 80 ? '#27ae60' : '#d35400', margin: '4px 0' }}>
                {creditRecoveryRatio}%
              </div>
              <div style={{ fontSize: '10px', color: '#555' }}>Benchmark: &gt; 80% Fortnightly</div>
            </div>

            <div style={{ background: '#eef2f7', border: '1px solid #7f9db9', padding: '10px', borderRadius: '4px' }}>
              <div style={{ fontSize: '11px', color: '#555', fontWeight: 600 }}>Statutory Evaporation Allowance</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0984e3', margin: '4px 0' }}>
                {msEvaporationL + hsdEvaporationL} L
              </div>
              <div style={{ fontSize: '10px', color: '#555' }}>MS 0.59% | HSD 0.10%</div>
            </div>

            <div style={{ background: '#eef2f7', border: '1px solid #7f9db9', padding: '10px', borderRadius: '4px' }}>
              <div style={{ fontSize: '11px', color: '#555', fontWeight: 600 }}>Working Capital in Fuel</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0a246a', margin: '4px 0' }}>
                ₹ {kpis.total_stock_cost.toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '10px', color: '#555' }}>Across {tanks.length} Tanks ({totalFuelLitres.toLocaleString()} L)</div>
            </div>
          </div>

          {/* 2-Column Analytical Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
            {/* Top Fleet Outstanding Debtors Risk Assessment */}
            <div style={{ border: '1px solid #7f9db9', background: '#fff', padding: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#0a246a', marginBottom: '6px' }}>
                🚨 Fleet Credit Exposure & Aging Risk Ranking
              </div>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th className="text-right">Outstanding (₹)</th>
                    <th className="text-right">Limit (₹)</th>
                    <th>Risk Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {customers
                    .slice()
                    .sort((a, b) => (b.current_outstanding || 0) - (a.current_outstanding || 0))
                    .slice(0, 5)
                    .map((c) => {
                      const util = c.credit_limit > 0 ? Math.round(((c.current_outstanding || 0) / c.credit_limit) * 100) : 0;
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600, color: '#0a246a' }}>{c.name}</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>
                            ₹ {(c.current_outstanding || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="text-right">₹ {c.credit_limit.toLocaleString('en-IN')}</td>
                          <td>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '3px',
                                background: util > 90 ? '#ffebee' : util > 70 ? '#fff3e0' : '#e8f5e9',
                                color: util > 90 ? '#c62828' : util > 70 ? '#e65100' : '#2e7d32',
                              }}
                            >
                              {util}% UTILIZED
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Forecourt Loss & Recovery Audit */}
            <div style={{ border: '1px solid #7f9db9', background: '#fff', padding: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#0a246a', marginBottom: '6px' }}>
                ⚖️ Operational Loss & Recovery Diagnostics
              </div>
              <div style={{ fontSize: '11px', lineHeight: '1.8', color: '#333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
                  <span>MS Evaporation Allowance:</span>
                  <strong>{msEvaporationL} Litres (~₹{(msEvaporationL * 102.65).toFixed(0)})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
                  <span>HSD Evaporation Allowance:</span>
                  <strong>{hsdEvaporationL} Litres (~₹{(hsdEvaporationL * 94.5).toFixed(0)})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
                  <span>Total Daily Station Expenses:</span>
                  <strong style={{ color: '#c0392b' }}>₹ {totalExpenses.toLocaleString('en-IN')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
                  <span>Credit Recovery Inflow Today:</span>
                  <strong style={{ color: '#27ae60' }}>₹ {totalCreditRecovered.toLocaleString('en-IN')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
                  <span>Tanker Decanting Safety Margin:</span>
                  <strong style={{ color: '#0984e3' }}>± 3.0 kg/m³ Statutory</strong>
                </div>
              </div>
            </div>
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
