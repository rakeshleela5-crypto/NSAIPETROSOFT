import React, { useState } from 'react';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({ isOpen, onClose }) => {
  const [calcInput, setCalcInput] = useState<string>('0');

  if (!isOpen) return null;

  const handleCalcBtn = (val: string) => {
    if (val === 'C') {
      setCalcInput('0');
    } else if (val === '=') {
      try {
        // Safe evaluation of basic math expressions
        const sanitized = calcInput.replace(/[^0-9+\-*/.]/g, '');
        // eslint-disable-next-line no-eval
        const result = Function(`'use strict'; return (${sanitized})`)();
        setCalcInput(String(result));
      } catch {
        setCalcInput('Error');
      }
    } else {
      setCalcInput((prev) => (prev === '0' || prev === 'Error' ? val : prev + val));
    }
  };

  return (
    <div className="win-modal-overlay">
      <div className="win-form-dialog" style={{ width: '280px' }}>
        <div className="win-dialog-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🧮</span>
            <span>Calculator</span>
          </div>
          <button className="win-btn" onClick={onClose}>✕</button>
        </div>
        <div className="win-dialog-body">
          <input type="text" className="calc-display" readOnly value={calcInput} />
          <div className="calc-grid">
            {['C', '/', '*', '-'].map((op) => (
              <button key={op} className="calc-btn calc-btn-op" onClick={() => handleCalcBtn(op)}>{op}</button>
            ))}
            {['7', '8', '9', '+'].map((val) => (
              <button key={val} className={`calc-btn ${val === '+' ? 'calc-btn-op' : ''}`} onClick={() => handleCalcBtn(val)}>{val}</button>
            ))}
            {['4', '5', '6', '='].map((val) => (
              <button key={val} className={`calc-btn ${val === '=' ? 'calc-btn-op' : ''}`} onClick={() => handleCalcBtn(val)}>{val}</button>
            ))}
            {['1', '2', '3', '0'].map((val) => (
              <button key={val} className="calc-btn" onClick={() => handleCalcBtn(val)}>{val}</button>
            ))}
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
