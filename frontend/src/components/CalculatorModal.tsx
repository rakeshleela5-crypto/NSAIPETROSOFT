import React, { useState, useEffect, useRef } from 'react';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertValue?: (val: string) => void;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({ isOpen, onClose, onInsertValue }) => {
  const [calcInput, setCalcInput] = useState<string>('0');
  const [history, setHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState<boolean>(false);

  // Draggable floating window state
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 120, y: 120 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 120,
    startY: 120,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag from titlebar
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: pos.x,
      startY: pos.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - 320, dragStartRef.current.startX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 450, dragStartRef.current.startY + dy)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleCalcBtn = (val: string) => {
    if (val === 'C') {
      setCalcInput('0');
    } else if (val === 'CE') {
      setCalcInput('0');
    } else if (val === 'DEL') {
      setCalcInput((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
    } else if (val === '=') {
      try {
        const sanitized = calcInput.replace(/[^0-9+\-*/.]/g, '');
        // eslint-disable-next-line no-eval
        const result = Function(`'use strict'; return (${sanitized})`)();
        const rounded = Math.round((result + Number.EPSILON) * 100) / 100;
        const entry = `${calcInput} = ${rounded}`;
        setHistory((prev) => [entry, ...prev.slice(0, 9)]);
        setCalcInput(String(rounded));
      } catch {
        setCalcInput('Error');
      }
    } else {
      setCalcInput((prev) => {
        if (prev === '0' || prev === 'Error') {
          return val === '.' ? '0.' : val;
        }
        return prev + val;
      });
    }
  };

  // Keyboard numpad listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '-', '*', '/', '.'].includes(e.key)) {
        e.preventDefault();
        handleCalcBtn(e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleCalcBtn('=');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleCalcBtn('DEL');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, calcInput]);

  const handleCopy = () => {
    navigator.clipboard.writeText(calcInput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onInsertValue) {
      onInsertValue(calcInput);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        zIndex: 9999,
        width: '320px',
        backgroundColor: '#ece9d8',
        border: '2px solid #ffffff',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5), inset 1px 1px #fff, inset -1px -1px #808080',
        borderRadius: '4px',
        userSelect: 'none',
        fontFamily: 'Tahoma, Arial, sans-serif',
      }}
    >
      {/* Draggable Title Bar */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          background: 'linear-gradient(90deg, #0a246a 0%, #a6caf0 100%)',
          color: '#ffffff',
          padding: '6px 10px',
          fontWeight: 700,
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>🧮</span>
          <span>Forecourt Tape Calculator (Draggable)</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: '#c0392b',
            color: '#fff',
            border: '1px solid #78281f',
            borderRadius: '2px',
            width: '18px',
            height: '18px',
            fontSize: '11px',
            lineHeight: '14px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '10px' }}>
        {/* Running Tape History */}
        {history.length > 0 && (
          <div
            style={{
              background: '#f9f9f9',
              border: '1px solid #7f9db9',
              padding: '4px 6px',
              fontSize: '10.5px',
              color: '#555',
              maxHeight: '48px',
              overflowY: 'auto',
              marginBottom: '6px',
              fontFamily: 'monospace',
            }}
          >
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{h}</span>
              </div>
            ))}
          </div>
        )}

        {/* Display Screen */}
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <input
            type="text"
            readOnly
            value={calcInput}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: '#ffffff',
              border: '2px solid #7f9db9',
              fontSize: '20px',
              fontWeight: 700,
              textAlign: 'right',
              padding: '6px 10px',
              fontFamily: 'monospace',
              color: '#002b80',
            }}
          />
        </div>

        {/* Calculator Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
          <button type="button" className="calc-btn calc-btn-op" onClick={() => handleCalcBtn('C')}>C</button>
          <button type="button" className="calc-btn calc-btn-op" onClick={() => handleCalcBtn('CE')}>CE</button>
          <button type="button" className="calc-btn calc-btn-op" onClick={() => handleCalcBtn('DEL')}>⌫</button>
          <button type="button" className="calc-btn calc-btn-op" onClick={() => handleCalcBtn('/')}>÷</button>

          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('7')}>7</button>
          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('8')}>8</button>
          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('9')}>9</button>
          <button type="button" className="calc-btn calc-btn-op" onClick={() => handleCalcBtn('*')}>×</button>

          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('4')}>4</button>
          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('5')}>5</button>
          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('6')}>6</button>
          <button type="button" className="calc-btn calc-btn-op" onClick={() => handleCalcBtn('-')}>−</button>

          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('1')}>1</button>
          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('2')}>2</button>
          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('3')}>3</button>
          <button type="button" className="calc-btn calc-btn-op" onClick={() => handleCalcBtn('+')}>+</button>

          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('0')} style={{ gridColumn: 'span 2' }}>0</button>
          <button type="button" className="calc-btn" onClick={() => handleCalcBtn('.')}>.</button>
          <button type="button" className="calc-btn" style={{ background: '#0055ea', color: '#fff', fontWeight: 700 }} onClick={() => handleCalcBtn('=')}>=</button>
        </div>

        {/* Copy / Insert into Input Action Bar */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
          <button
            type="button"
            onClick={handleCopy}
            className="win-btn-classic"
            style={{
              flex: 1,
              background: copied ? '#e8f5e9' : '#ffffff',
              color: copied ? '#2e7d32' : '#002b80',
              fontWeight: 700,
              fontSize: '11px',
              padding: '4px',
            }}
          >
            {copied ? '✔ Copied to Clipboard!' : '📋 Copy / Insert to Input'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="win-btn-classic"
            style={{ padding: '4px 12px', fontSize: '11px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
