import React, { useState } from 'react';
import type { CustomerFull, StationProfile } from '../models';
import { getCurrentMonthStartIsoDate, getTodayIsoDate } from '../utils/dateUtils';

interface ReportCriteriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportCriteriaRadio: string;
  setReportCriteriaRadio: (rep: string) => void;
  setActiveReportTitle: (title: string) => void;
  customers: CustomerFull[];
  accountsList: Array<{ id: number; name: string; type: string }>;
  employeesList: Array<{ id: number; code: string; name: string; designation: string }>;
  stationProfile: StationProfile;
  openCrystalReport: (repName: string) => void;
  showToast: (msg: string) => void;
}

export const ReportCriteriaModal: React.FC<ReportCriteriaModalProps> = ({
  isOpen,
  onClose,
  reportCriteriaRadio,
  setReportCriteriaRadio,
  setActiveReportTitle,
  customers,
  accountsList,
  employeesList,
  stationProfile,
  openCrystalReport,
  showToast,
}) => {
  const [critFromDate, setCritFromDate] = useState<string>(() => getCurrentMonthStartIsoDate());
  const [critToDate, setCritToDate] = useState<string>(() => getTodayIsoDate());
  const [critCustomer, setCritCustomer] = useState<string>('---Select Any---');
  const [critSupplier, setCritSupplier] = useState<string>('---Select Any---');
  const [critItem, setCritItem] = useState<string>('Diesel');
  const [critInvoiceNo, setCritInvoiceNo] = useState<string>('');
  const [critDate, setCritDate] = useState<string>(() => getTodayIsoDate());
  const [critShift, setCritShift] = useState<string>('First');
  const [critLedger, setCritLedger] = useState<string>('');
  const [critAccountGroup, setCritAccountGroup] = useState<string>('---Select Any---');
  const [critVehicle, setCritVehicle] = useState<string>('');
  const [critBillPeriod, setCritBillPeriod] = useState<string>('---Select Any---');
  const [critEmployee, setCritEmployee] = useState<string>('ALL');

  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '990px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚙️</span>
            <span>Set Report Criteria — Petroleum MIS & Statutory Audits</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '12px' }}>
          {/* Left Column: 4 Columns of 44 Report Radios */}
          <div className="win-groupbox" style={{ padding: '8px' }}>
            <span className="win-groupbox-title">Select Report (All 44 Statutory & MIS Registers)</span>
            <div className="report-criteria-grid">
              {/* Column 1 */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '11px', color: '#b71c1c', marginBottom: '4px', borderBottom: '1px solid #ccc' }}>Statutory & Financial</div>
                {[
                  'DSR',
                  'VAT SUMMARY',
                  'PROFIT SUMMARY',
                  'PURCHASE LFR SUMMARY',
                  'DEALER COMMISION REPORT',
                  'TDS SUMMARY',
                  'PROFIT LOSS SUMMARY',
                  'Nozzle Wise Sales',
                  'Shift Wise Sales',
                  'Tank Stock Summary',
                  'Customer Outstanding Summary',
                ].map((rep) => (
                  <label key={rep} className="report-radio-label">
                    <input
                      type="radio"
                      name="reportSelection"
                      checked={reportCriteriaRadio === rep}
                      onChange={() => {
                        setReportCriteriaRadio(rep);
                        setActiveReportTitle(rep);
                      }}
                    />
                    <span style={{ fontWeight: reportCriteriaRadio === rep ? 700 : 400 }}>{rep}</span>
                  </label>
                ))}
              </div>

              {/* Column 2 */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '11px', color: '#1565c0', marginBottom: '4px', borderBottom: '1px solid #ccc' }}>Purchase & Sales</div>
                {[
                  'Purchase Summary (Invoice Wise)',
                  'Purchase Summary (Product Wise)',
                  'Purchase Register (Detailed)',
                  'Sales Register (Detailed)',
                  'Cash Sales Register',
                  'Credit Sales Register',
                  'Card / Digital Swipe Register',
                  'Expense Summary (Head Wise)',
                  'Shift Cashier Settlement Report',
                  'Tanker Decanting Register',
                  'Tank DIP Calibration Variation',
                ].map((rep) => (
                  <label key={rep} className="report-radio-label">
                    <input
                      type="radio"
                      name="reportSelection"
                      checked={reportCriteriaRadio === rep}
                      onChange={() => {
                        setReportCriteriaRadio(rep);
                        setActiveReportTitle(rep);
                      }}
                    />
                    <span style={{ fontWeight: reportCriteriaRadio === rep ? 700 : 400 }}>{rep}</span>
                  </label>
                ))}
              </div>

              {/* Column 3 */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '11px', color: '#2e7d32', marginBottom: '4px', borderBottom: '1px solid #ccc' }}>Ledger & Cash Book</div>
                {[
                  'Customer Ledger Statement',
                  'Supplier / Oil Company Ledger',
                  'Bank Book Summary',
                  'Cash Book Summary',
                  'Day Book (Cashier Tally)',
                  'Account Group Summary',
                  'Monthly Sales Comparison',
                  'Lube Sales & Stock Register',
                  'Density & Temperature Log',
                  'Meter Difference Audit',
                  'Testing Quantity Register',
                ].map((rep) => (
                  <label key={rep} className="report-radio-label">
                    <input
                      type="radio"
                      name="reportSelection"
                      checked={reportCriteriaRadio === rep}
                      onChange={() => {
                        setReportCriteriaRadio(rep);
                        setActiveReportTitle(rep);
                      }}
                    />
                    <span style={{ fontWeight: reportCriteriaRadio === rep ? 700 : 400 }}>{rep}</span>
                  </label>
                ))}
              </div>

              {/* Column 4 */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '11px', color: '#6a1b9a', marginBottom: '4px', borderBottom: '1px solid #ccc' }}>Legal & Audits</div>
                {[
                  'Stamping Schedule (Legal Metrology)',
                  'Employee Performance Register',
                  'Vehicle Wise Fuel Consumption',
                  'Discount & Credit Card Charges',
                  'Trial Balance',
                  'Profit & Loss Account',
                  'Balance Sheet',
                  'Cheque Return Register',
                  'Shortage / Leakage Analysis',
                  'GST Output Tax Summary',
                  'Daily Cash Denomination Log',
                ].map((rep) => (
                  <label key={rep} className="report-radio-label">
                    <input
                      type="radio"
                      name="reportSelection"
                      checked={reportCriteriaRadio === rep}
                      onChange={() => {
                        setReportCriteriaRadio(rep);
                        setActiveReportTitle(rep);
                      }}
                    />
                    <span style={{ fontWeight: reportCriteriaRadio === rep ? 700 : 400 }}>{rep}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Filter Criteria */}
          <div className="win-groupbox" style={{ padding: '8px' }}>
            <span className="win-groupbox-title">Criteria Details</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>From Date</span>
                <input type="date" className="win-input" value={critFromDate} onChange={(e) => setCritFromDate(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>To Date</span>
                <input type="date" className="win-input" value={critToDate} onChange={(e) => setCritToDate(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Customer</span>
                <select className="win-select" value={critCustomer} onChange={(e) => setCritCustomer(e.target.value)} style={{ flex: 1 }}>
                  <option>---Select Any---</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Supplier</span>
                <select className="win-select" value={critSupplier} onChange={(e) => setCritSupplier(e.target.value)} style={{ flex: 1 }}>
                  <option>---Select Any---</option>
                  {stationProfile.oilCompany && (
                    <option value={stationProfile.oilCompany}>{stationProfile.oilCompany}</option>
                  )}
                  <option>BHARAT PETROLEUM CO LTD</option>
                  <option>INDIAN OIL CORPORATION LTD</option>
                  <option>HINDUSTAN PETROLEUM CO LTD</option>
                  <option>NAYARA ENERGY LIMITED</option>
                  <option>RELIANCE BP MOBILITY LTD</option>
                </select>
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Item</span>
                <select className="win-select" value={critItem} onChange={(e) => setCritItem(e.target.value)} style={{ flex: 1 }}>
                  <option value="Diesel">High Speed Diesel (HSD)</option>
                  <option value="Petrol">Motor Spirit (Petrol MS)</option>
                  <option value="All">All Fuel Products & Lubes</option>
                </select>
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Invoice No</span>
                <input type="text" className="win-input" value={critInvoiceNo} onChange={(e) => setCritInvoiceNo(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Date</span>
                <input type="date" className="win-input" value={critDate} onChange={(e) => setCritDate(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Shift</span>
                <select className="win-select" value={critShift} onChange={(e) => setCritShift(e.target.value)} style={{ flex: 1 }}>
                  <option>First</option>
                  <option>Second</option>
                </select>
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Ledger</span>
                <select className="win-select" value={critLedger} onChange={(e) => setCritLedger(e.target.value)} style={{ flex: 1 }}>
                  <option value="">---Select Any---</option>
                  {accountsList.map((a) => (
                    <option key={a.id} value={a.name}>{a.name} ({a.type})</option>
                  ))}
                </select>
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Acct Group</span>
                <select className="win-select" value={critAccountGroup} onChange={(e) => setCritAccountGroup(e.target.value)} style={{ flex: 1 }}>
                  <option>---Select Any---</option>
                  <option>Sundry Debtors</option>
                  <option>Sundry Creditors</option>
                  <option>Bank Accounts</option>
                  <option>Direct Expenses</option>
                </select>
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Vehicle</span>
                <input type="text" className="win-input" value={critVehicle} onChange={(e) => setCritVehicle(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Bill Period</span>
                <select className="win-select" value={critBillPeriod} onChange={(e) => setCritBillPeriod(e.target.value)} style={{ flex: 1 }}>
                  <option>---Select Any---</option>
                  <option>Daily</option>
                  <option>Weekly</option>
                  <option>Fortnightly (15 Days)</option>
                  <option>Monthly</option>
                </select>
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '70px' }}>Employee</span>
                <select className="win-select" value={critEmployee} onChange={(e) => setCritEmployee(e.target.value)} style={{ flex: 1 }}>
                  <option value="ALL">---All Attendants---</option>
                  {employeesList.map((e) => (
                    <option key={e.id} value={e.name}>{e.name} ({e.code})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="win-btn-classic win-btn-primary"
                style={{ minHeight: '36px', fontSize: '12px', fontWeight: 700 }}
                onClick={() => openCrystalReport(reportCriteriaRadio)}
              >
                📊 Open Report (Crystal Viewer)
              </button>
              <button
                type="button"
                className="win-btn-classic"
                style={{ minHeight: '36px', fontSize: '11px' }}
                onClick={() => showToast(`✔ Email sent to dealer management for ${reportCriteriaRadio}!`)}
              >
                ✉️ Send Email to Head Office
              </button>
            </div>
          </div>
        </div>
        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">Selected: {reportCriteriaRadio} | Criteria Ready</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
