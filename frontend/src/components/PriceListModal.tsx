import React, { useState } from 'react';
import type { FuelProductRate, LubeProductItem, StationProfile } from '../models';
import { erpStore } from '../store/erpStore';
import { getTodayErpDate } from '../utils/dateUtils';
import { exportToCsv } from '../utils/exportCsv';

interface PriceListModalProps {
  isOpen: boolean;
  onClose: () => void;
  ratesList?: FuelProductRate[];
  products?: LubeProductItem[];
  stationProfile?: StationProfile;
  showToast?: (msg: string) => void;
}

export const PriceListModal: React.FC<PriceListModalProps> = ({
  isOpen,
  onClose,
  ratesList = erpStore.getState().rates,
  products = erpStore.getState().products,
  stationProfile = erpStore.getState().stationProfile,
  showToast,
}) => {
  const [search, setSearch] = useState<string>('');

  if (!isOpen) return null;

  const filteredRates = ratesList.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase())
  );

  const filteredLubes = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    const rows = [
      ...ratesList.map((r) => ['Fuel', r.code, r.name, 'Litre', r.rate, 0, r.vat_percent]),
      ...products.map((p) => ['Lube/DEF', p.code, p.name, p.package_size, p.sale_price, p.mrp, 18.0]),
    ];
    exportToCsv(
      `NSAIPETROSOFT_Master_Price_Catalog_${getTodayErpDate()}`,
      ['Product Class', 'Item Code', 'Description', 'Unit', 'Retail Rate (INR)', 'MRP (INR)', 'Tax %'],
      rows
    );
    if (showToast) showToast('✔ Master price catalog exported to CSV!');
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '820px', maxHeight: '90vh' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏷️</span>
            <span>Master Price List & Forecourt Tariff Board</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          {/* Header & Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div className="win-search-box" style={{ width: '280px', margin: 0 }}>
              <span style={{ fontWeight: 600 }}>🔍 Search:</span>
              <input
                type="text"
                placeholder="Search fuels or lubricants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="win-btn-classic"
                onClick={handleExport}
                style={{ background: '#e8f5e9', color: '#1b5e20', borderColor: '#81c784', fontWeight: 700 }}
              >
                📥 Export CSV / Excel
              </button>
              <button
                type="button"
                className="win-btn-classic win-btn-primary"
                onClick={handlePrint}
                style={{ fontWeight: 700 }}
              >
                🖨️ Print Price Catalog
              </button>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #7f9db9', padding: '10px', maxHeight: '420px', overflowY: 'auto' }}>
            {/* Station Subhead */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0a246a', paddingBottom: '6px', marginBottom: '10px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#0a246a' }}>{stationProfile.stationName}</div>
              <div style={{ fontSize: '11px', color: '#555' }}>
                {stationProfile.oilCompany} FORECOURT OFFICIAL TARIFF • EFFECTIVE AS OF {getTodayErpDate()}
              </div>
            </div>

            {/* Fuel Rates Section */}
            <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0a246a', marginBottom: '4px' }}>
              ⛽ Regulated Petroleum Fuel Rates (per Litre)
            </div>
            <table className="win-datagrid" style={{ marginBottom: '16px' }}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Fuel Grade</th>
                  <th className="text-right">Retail Selling Price (₹/L)</th>
                  <th className="text-right">State VAT %</th>
                  <th className="text-right">Cess %</th>
                  <th>Statutory Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredRates.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700 }}>{r.code}</td>
                    <td style={{ fontWeight: 600, color: '#0a246a' }}>{r.name}</td>
                    <td className="text-right" style={{ fontSize: '13px', fontWeight: 700, color: '#002b80' }}>
                      ₹ {r.rate.toFixed(2)}
                    </td>
                    <td className="text-right">{r.vat_percent}%</td>
                    <td className="text-right">{r.cess_percent}%</td>
                    <td style={{ fontSize: '10px', color: '#666' }}>OMC Daily Dynamic Pricing Snapshot</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Lubricants & Packaged Items Section */}
            <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0a246a', marginBottom: '4px' }}>
              🛢️ Lubricants, Diesel Exhaust Fluid (DEF) & Packed Products
            </div>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Product Description</th>
                  <th>Category</th>
                  <th>Pack Size</th>
                  <th className="text-right">MRP (₹)</th>
                  <th className="text-right">Discounted Price (₹)</th>
                  <th className="text-right">Current Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredLubes.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.code}</td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.category}</td>
                    <td>{p.package_size}</td>
                    <td className="text-right" style={{ textDecoration: p.mrp > p.sale_price ? 'line-through' : 'none', color: '#666' }}>
                      ₹ {p.mrp.toFixed(2)}
                    </td>
                    <td className="text-right" style={{ fontWeight: 700, color: '#27ae60' }}>
                      ₹ {p.sale_price.toFixed(2)}
                    </td>
                    <td className="text-right">{p.current_stock_units} Units</td>
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
