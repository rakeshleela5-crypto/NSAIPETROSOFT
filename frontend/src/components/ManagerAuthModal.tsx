import React, { useState } from 'react';
import { verifyManagerPinApi } from '../api/client';

export interface ManagerPinModalState {
  isOpen: boolean;
  actionTitle: string;
  onAuthorized: (pin?: string) => void;
}

interface ManagerAuthModalProps {
  modalState: ManagerPinModalState | null;
  onClose: () => void;
  correctPin?: string;
}

export const ManagerAuthModal: React.FC<ManagerAuthModalProps> = ({
  modalState,
  onClose,
}) => {
  const [managerPinInput, setManagerPinInput] = useState<string>('');
  const [managerPinError, setManagerPinError] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  if (!modalState || !modalState.isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerPinInput.trim()) {
      setManagerPinError('Please enter the Manager PIN.');
      return;
    }

    setIsVerifying(true);
    setManagerPinError('');

    try {
      // Primary: Verify cryptographically against PostgreSQL backend
      await verifyManagerPinApi(managerPinInput.trim(), modalState.actionTitle);
      const cb = modalState.onAuthorized;
      const enteredPin = managerPinInput.trim();
      setManagerPinInput('');
      setManagerPinError('');
      setIsVerifying(false);
      onClose();
      cb(enteredPin);
    } catch (err: any) {
      setIsVerifying(false);
      setManagerPinError(err.message || 'Access Denied: Incorrect Manager PIN.');
    }
  };

  return (
    <div className="win-modal-overlay" style={{ zIndex: 12000 }}>
      <div className="win-form-dialog" style={{ width: '420px', border: '2px solid #b71c1c', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
        <div className="win-dialog-titlebar" style={{ background: 'linear-gradient(180deg, #d32f2f 0%, #b71c1c 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔐</span>
            <span>Security: Manager Authorization Required</span>
          </div>
          <button
            className="win-titlebar-btn"
            onClick={onClose}
            title="Cancel (ESC)"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="win-dialog-body" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div style={{ fontSize: '32px' }}>🛡️</div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#b71c1c', marginBottom: '4px' }}>
                Restricted Station Operation
              </div>
              <div style={{ fontSize: '11px', color: '#222' }}>
                Action: <strong>{modalState.actionTitle}</strong>
              </div>
              <div style={{ fontSize: '11px', color: '#555', marginTop: '3px' }}>
                Please enter your Manager Security PIN to confirm and commit this operation:
              </div>
            </div>
          </div>

          <div className="win-form-row" style={{ justifyContent: 'center', marginBottom: '10px' }}>
            <span className="win-label" style={{ fontWeight: 700 }}>Manager PIN:</span>
            <input
              type="password"
              autoFocus
              maxLength={8}
              className="win-input"
              style={{ width: '130px', textAlign: 'center', fontSize: '16px', letterSpacing: '4px', fontWeight: 'bold' }}
              value={managerPinInput}
              onChange={(e) => {
                setManagerPinInput(e.target.value);
                setManagerPinError('');
              }}
              placeholder="••••"
            />
          </div>

          {managerPinError && (
            <div style={{ color: '#d32f2f', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', marginBottom: '10px' }}>
              ⚠ {managerPinError}
            </div>
          )}

          <div className="win-actions-row" style={{ borderTop: '1px solid #d4d0c8', paddingTop: '10px' }}>
            <button
              type="submit"
              className="win-btn-classic win-btn-primary"
              style={{ fontWeight: 700 }}
              disabled={isVerifying}
            >
              <span>🔑</span>
              <span>{isVerifying ? 'Verifying...' : 'Authorize (F2)'}</span>
            </button>
            <button
              type="button"
              className="win-btn-classic"
              style={{ minWidth: '70px' }}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
