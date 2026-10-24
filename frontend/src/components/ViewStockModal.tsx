import React from 'react';
import type { DashboardKPIs, LubeProductItem } from '../models';
import type { TankMasterItem } from '../store/erpStore';
import { erpStore } from '../store/erpStore';
import { recordLubeSaleApi } from '../api/client';
import { calcTankUllage } from '../utils/mathEngine';

interface ViewStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  tanks: TankMasterItem[];
  products: LubeProductItem[];
  kpis: DashboardKPIs;
  onOpenDipDialog: (tankId?: number) => void;
  showToast?: (msg: string) => void;
  loadAllErpData?: () => Promise<void>;
}

export const ViewStockModal: React.FC<ViewStockModalProps> = ({
  isOpen,
  onClose,
  tanks,
  products,
  kpis,
  onOpenDipDialog,
  showToast,
  loadAllErpData,
}) => {
  const [sellingProduct, setSellingProduct] = React.useState<LubeProductItem | null>(null);
  const [sellQty, setSellQty] = React.useState<number>(1);
  const [isSubmittingSale, setIsSubmittingSale] = React.useState<boolean>(false);

  if (!isOpen) return null;

  const totalLubeValuation = products.reduce(
    (sum, p) => sum + (p.current_stock_units || 0) * (p.cost_price || 0),
    0
  );

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '920px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⛽</span>
            <span>View Stock — Live Tank Gauges & Lubricant Inventory Valuation</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          {/* Section 1: Live Visual Tank Gauges */}
          <div style={{ fontWeight: 700, fontSize: '13px', color: '#0a246a', marginBottom: '8px' }}>
            ⛽ Underground Petroleum Storage Tank Gauges & Variance Monitor
          </div>

          <div className="tank-visualizer-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(2, Math.min(4, tanks.length))}, 1fr)`, gap: '10px' }}>
            {tanks.map((tank) => {
              const ullage = calcTankUllage(tank.capacity, tank.current_stock);
              const variance = (tank.dip_stock || tank.current_stock) - tank.book_stock;
              const isMs = tank.code === 'MS' || tank.product.toLowerCase().includes('petrol');
              const themeColor = isMs ? '#c0392b' : '#0984e3';

              return (
                <div key={tank.id} className="tank-gauge-card" style={{ border: `2px solid ${themeColor}` }}>
                  <div className="tank-cylinder">
                    <div
                      className={isMs ? 'tank-liquid-ms' : 'tank-liquid-hsd'}
                      style={{ height: `${Math.min(100, Math.max(5, ullage.fillPercent))}%` }}
                    />
                  </div>
                  <div className="tank-details">
                    <div style={{ fontWeight: 700, fontSize: '13px', color: themeColor }}>
                      {tank.name} ({tank.product})
                    </div>
                    <div><strong>Gross Capacity:</strong> {tank.capacity.toLocaleString('en-IN')} L</div>
                    <div><strong>Book Stock:</strong> {tank.book_stock.toLocaleString('en-IN')} L</div>
                    <div><strong>Dip Stock:</strong> {tank.dip_stock.toLocaleString('en-IN')} L</div>
                    <div style={{ color: Math.abs(variance) > 100 ? '#c0392b' : '#27ae60', fontWeight: 600 }}>
                      <strong>Variance:</strong> {variance >= 0 ? `+${variance.toFixed(1)}` : variance.toFixed(1)} L
                    </div>
                    <div><strong>Current Dip:</strong> {tank.dip_cm || 0} cm</div>
                    <div><strong>Water Dip:</strong> {tank.water_dip_cm || 0} cm</div>
                    <div>
                      <strong>Safe Ullage (95%):</strong>{' '}
                      <span style={{ color: '#27ae60', fontWeight: 700 }}>{ullage.safeUllage.toLocaleString('en-IN')} L</span>
                    </div>

                    <div style={{ color: tank.is_low ? '#c0392b' : '#27ae60', fontWeight: 700, marginTop: '4px' }}>
                      ● {tank.is_low ? 'Low Stock Warning' : 'Sufficient Fuel'}
                    </div>

                    <button
                      type="button"
                      className="win-btn-classic"
                      onClick={() => onOpenDipDialog(tank.id)}
                      style={{ marginTop: '6px', width: '100%', fontSize: '10.5px' }}
                    >
                      📐 Record Dip
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section 2: Complete Lube & Packed Item Inventory Table */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#0a246a' }}>
                🛢️ Packed Lubricants, Greases & DEF Stock Inventory
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1b5e20' }}>
                Lube Stock Valuation: ₹ {totalLubeValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '220px', overflowY: 'auto' }}>
              <table className="win-datagrid">
                <thead>
                  <tr>
                    <th>Item Code</th>
                    <th>Product Description</th>
                    <th>Category</th>
                    <th>Pack Size</th>
                    <th className="text-right">Unit Cost (₹)</th>
                    <th className="text-right">Sale Price (₹)</th>
                    <th className="text-right">Units In Stock</th>
                    <th className="text-right">Stock Valuation (₹)</th>
                    <th>Status</th>
                    <th style={{ width: '70px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const valuation = (p.current_stock_units || 0) * (p.cost_price || 0);
                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.code}</td>
                        <td style={{ fontWeight: 600, color: '#0a246a' }}>{p.name}</td>
                        <td>{p.category}</td>
                        <td>{p.package_size}</td>
                        <td className="text-right">₹ {p.cost_price.toFixed(2)}</td>
                        <td className="text-right">₹ {p.sale_price.toFixed(2)}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: p.is_low_stock ? '#c0392b' : '#27ae60' }}>
                          {p.current_stock_units}
                        </td>
                        <td className="text-right" style={{ fontWeight: 700, color: '#002b80' }}>
                          ₹ {valuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: p.is_low_stock ? '#c0392b' : '#27ae60',
                            }}
                          >
                            {p.is_low_stock ? 'REORDER' : 'IN STOCK'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="win-btn-classic"
                            style={{ height: '20px', padding: '0 6px', fontSize: '10px', fontWeight: 700, color: '#1b5e20' }}
                            disabled={(p.current_stock_units || 0) <= 0}
                            onClick={() => {
                              setSellingProduct(p);
                              setSellQty(1);
                            }}
                            title="Sell packaged units from counter"
                          >
                            🛒 Sell
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Total Valuation Banner */}
          <div
            style={{
              marginTop: '14px',
              background: '#ece9d8',
              border: '1px solid #7f9db9',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a246a' }}>
                Total Combined Forecourt Stock Valuation: ₹{' '}
                {kpis.total_stock_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '11px', color: '#555' }}>
                Includes Underground Fuel Tanks + Packed Lubricants + DEF Cans
              </div>
            </div>
            <button
              type="button"
              className="win-btn-classic win-btn-primary"
              onClick={() => onOpenDipDialog()}
              style={{ fontWeight: 700 }}
            >
              📐 Record Forecourt Dips
            </button>
          </div>
        </div>

        <div className="win-dialog-footer">
          <span className="hotkeys-hint-red">ESC=Exit</span>
          <button className="win-btn-classic" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* Retro Direct POS Counter Sale Modal */}
      {sellingProduct && (
        <div className="win-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="win-form-dialog" style={{ width: '420px', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
            <div className="win-dialog-titlebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🛒</span>
                <span>Direct Point-of-Sale: Sell Lubricant Units</span>
              </div>
              <button className="win-btn" onClick={() => setSellingProduct(null)} disabled={isSubmittingSale}>✕</button>
            </div>
            <div className="win-dialog-body">
              <div style={{ fontSize: '11px', color: '#444', marginBottom: '8px' }}>
                Record counter sale of packaged inventory with automatic Cash on Hand & Ledger update.
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '110px' }}>Product:</span>
                <span style={{ fontWeight: 700, color: '#0a246a' }}>{sellingProduct.name} ({sellingProduct.code})</span>
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '110px' }}>Available Stock:</span>
                <span style={{ fontWeight: 700, color: '#27ae60' }}>{sellingProduct.current_stock_units} units</span>
              </div>
              <div className="win-form-row">
                <span className="win-label" style={{ minWidth: '110px' }}>Sale Price / Unit:</span>
                <span style={{ fontWeight: 700 }}>₹ {sellingProduct.sale_price.toFixed(2)}</span>
              </div>
              <div className="win-form-row" style={{ marginTop: '6px' }}>
                <span className="win-label" style={{ minWidth: '110px' }}>Quantity to Sell:</span>
                <input
                  type="number"
                  min="1"
                  max={sellingProduct.current_stock_units}
                  className="win-input"
                  value={sellQty}
                  onChange={(e) => setSellQty(Math.max(1, Math.min(sellingProduct.current_stock_units || 1, parseInt(e.target.value) || 1)))}
                  style={{ width: '80px', fontWeight: 700, fontSize: '13px' }}
                />
              </div>
              <div className="win-form-row" style={{ marginTop: '8px', borderTop: '1px solid #7f9db9', paddingTop: '6px' }}>
                <span className="win-label" style={{ minWidth: '110px' }}>Total Cash Due:</span>
                <span style={{ fontWeight: 800, fontSize: '14px', color: '#1b5e20' }}>
                  ₹ {(sellQty * sellingProduct.sale_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="win-dialog-footer">
              <button
                type="button"
                className="win-btn-classic"
                onClick={() => setSellingProduct(null)}
                disabled={isSubmittingSale}
              >
                Cancel
              </button>
              <button
                type="button"
                className="win-btn-classic win-btn-primary"
                disabled={isSubmittingSale || sellQty <= 0 || sellQty > (sellingProduct.current_stock_units || 0)}
                onClick={async () => {
                  try {
                    setIsSubmittingSale(true);
                    // Pessimistic Execution: Call server API first
                    await recordLubeSaleApi({
                      lube_product_id: sellingProduct.id,
                      qty_units: sellQty,
                      rate: sellingProduct.sale_price,
                      payment_mode: 'CASH',
                    });
                    // Only update client store upon API success
                    erpStore.recordLubeSale({
                      lube_product_id: sellingProduct.id,
                      product_name: sellingProduct.name,
                      product_code: sellingProduct.code,
                      qty_units: sellQty,
                      rate: sellingProduct.sale_price,
                      payment_mode: 'CASH',
                    });
                    if (showToast) showToast(`✔ Sold ${sellQty} unit(s) of "${sellingProduct.name}"! Cash on Hand & inventory updated.`);
                    setSellingProduct(null);
                    if (loadAllErpData) await loadAllErpData();
                  } catch (err: any) {
                    if (showToast) showToast(`❌ Sale failed: ${err.message || 'Operation failed'}`);
                  } finally {
                    setIsSubmittingSale(false);
                  }
                }}
              >
                {isSubmittingSale ? 'Recording...' : '✔ Record Cash Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
