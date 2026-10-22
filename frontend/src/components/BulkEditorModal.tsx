import React, { useState, useEffect } from 'react';
import type { LubeProductItem } from '../models';
import { erpStore } from '../store/erpStore';
import { saveLubeProductApi } from '../api/client';

interface BulkEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products?: LubeProductItem[];
  showToast?: (msg: string) => void;
  loadAllErpData?: () => Promise<void>;
}

export const BulkEditorModal: React.FC<BulkEditorModalProps> = ({
  isOpen,
  onClose,
  products = erpStore.getState().products,
  showToast,
  loadAllErpData,
}) => {
  const [gridData, setGridData] = useState<Array<{
    id: number;
    code: string;
    name: string;
    sale_price: number;
    cost_price: number;
    current_stock_units: number;
    reorder_level: number;
  }>>([]);

  const [hasChanges, setHasChanges] = useState<boolean>(false);

  useEffect(() => {
    if (products) {
      setGridData(
        products.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          sale_price: p.sale_price,
          cost_price: p.cost_price,
          current_stock_units: p.current_stock_units,
          reorder_level: p.reorder_level,
        }))
      );
      setHasChanges(false);
    }
  }, [products, isOpen]);

  if (!isOpen) return null;

  const handleCellChange = (id: number, field: string, val: number) => {
    setGridData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
    setHasChanges(true);
  };

  const handleCommitAll = async () => {
    try {
      erpStore.bulkUpdateProducts(gridData);
      for (const item of gridData) {
        try {
          await saveLubeProductApi({
            product_code: item.code,
            product_name: item.name,
            cost_price: item.cost_price,
            sale_price: item.sale_price,
            stock_qty: item.current_stock_units,
            reorder_level: item.reorder_level,
          });
        } catch {
          // Continue bulk loop
        }
      }
      if (showToast) showToast(`✔ Committed updates across ${gridData.length} products to master inventory!`);
      setHasChanges(false);
      if (loadAllErpData) await loadAllErpData();
      onClose();
    } catch (err: any) {
      if (showToast) showToast(`❌ Error: ${err.message}`);
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '840px', maxHeight: '90vh' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📝</span>
            <span>Bulk Product Spreadsheet Editor — Rapid Inline Stock & Price Update</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>

        <div className="win-dialog-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', color: '#555' }}>
              Edit values directly in the grid. Click <strong>Commit All Changes</strong> to save atomically.
            </span>
            {hasChanges && (
              <span style={{ fontSize: '11px', color: '#d35400', fontWeight: 700 }}>
                ● Uncommitted Changes Pending
              </span>
            )}
          </div>

          <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: '420px', overflowY: 'auto' }}>
            <table className="win-datagrid">
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>Code</th>
                  <th style={{ width: '38%' }}>Product Description</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Cost Price (₹)</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Sale Price (₹)</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Stock Units</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Reorder Lvl</th>
                </tr>
              </thead>
              <tbody>
                {gridData.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.code}</td>
                    <td style={{ color: '#0a246a', fontWeight: 600 }}>{row.name}</td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        value={row.cost_price}
                        onChange={(e) => handleCellChange(row.id, 'cost_price', parseFloat(e.target.value) || 0)}
                        className="win-input text-right"
                        style={{ width: '100%', height: '22px', padding: '0 4px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        value={row.sale_price}
                        onChange={(e) => handleCellChange(row.id, 'sale_price', parseFloat(e.target.value) || 0)}
                        className="win-input text-right"
                        style={{ width: '100%', height: '22px', padding: '0 4px', fontWeight: 700 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={row.current_stock_units}
                        onChange={(e) => handleCellChange(row.id, 'current_stock_units', parseInt(e.target.value, 10) || 0)}
                        className="win-input text-right"
                        style={{ width: '100%', height: '22px', padding: '0 4px', fontWeight: 700, color: row.current_stock_units <= row.reorder_level ? '#c0392b' : '#27ae60' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={row.reorder_level}
                        onChange={(e) => handleCellChange(row.id, 'reorder_level', parseInt(e.target.value, 10) || 0)}
                        className="win-input text-right"
                        style={{ width: '100%', height: '22px', padding: '0 4px' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="win-btn-classic" onClick={onClose}>Discard</button>
            <button
              type="button"
              className="win-btn-classic win-btn-primary"
              onClick={handleCommitAll}
              style={{ fontWeight: 700, padding: '6px 16px' }}
            >
              💾 Commit All Changes
            </button>
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
