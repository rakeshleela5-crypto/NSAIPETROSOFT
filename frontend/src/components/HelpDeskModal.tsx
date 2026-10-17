import React from 'react';

interface HelpDeskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpDeskModal: React.FC<HelpDeskModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '500px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📞</span>
            <span>Help Desk & Technical Support</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body" style={{ lineHeight: '1.6' }}>
          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
            NSAIPETROSOFT Petroleum Systems — Enterprise Support
          </div>
          <div><strong>Primary Support Helpline:</strong> +91-63551-90064</div>
          <div><strong>Secondary Support Helpline:</strong> +91-95866-51811</div>
          <div><strong>Working Hours:</strong> Monday – Saturday (09:00 AM – 06:00 PM)</div>
          <div><strong>Technical Email:</strong> support@nsaipetrosoft.com</div>
          <div style={{ marginTop: '12px', padding: '8px', background: '#e5f1fb', border: '1px solid #70c0e7', fontSize: '11px' }}>
            💡 <strong>Instant Shortcuts:</strong> Press <strong>F1</strong> for Sales Entry, <strong>F2</strong> for Rate Master, <strong>F3</strong> for Credit Bills, <strong>F4</strong> for Payment, <strong>F5</strong> for Expense, <strong>F6</strong> for Transfer, <strong>F10</strong> for Reports, and <strong>ESC</strong> to dismiss any window.
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
