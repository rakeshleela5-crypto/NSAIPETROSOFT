/**
 * Thermal Printer Utility for 58mm / 80mm ESC/POS Paper Rolls
 * Used in Petrol Pump POS counters and forecourt terminals.
 */

export interface ThermalSlipOptions {
  autoPrint?: boolean;
  paperWidthMm?: 58 | 80;
}

/**
 * Generates an instant UPI Dynamic / Static QR Code URL using standard UPI Intent protocol.
 * Scannable by Google Pay, PhonePe, Paytm, BHIM, and bank UPI apps.
 */
export function generateUpiQrUrl(vpa: string, payeeName: string, amount?: number, note?: string): string {
  if (!vpa || !vpa.trim()) return '';
  const cleanVpa = vpa.trim();
  const cleanName = encodeURIComponent(payeeName.trim() || 'PETROL PUMP');
  let upiUri = `upi://pay?pa=${cleanVpa}&pn=${cleanName}&cu=INR`;
  if (amount && amount > 0) {
    upiUri += `&am=${amount.toFixed(2)}`;
  }
  if (note) {
    upiUri += `&tn=${encodeURIComponent(note.trim())}`;
  }
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=2&data=${encodeURIComponent(upiUri)}`;
}

/**
 * Prints HTML content directly into a hidden iframe styled for 80mm/58mm thermal receipts.
 * Avoids disruptive page navigation while giving crisp, thermal-compatible output.
 */
export function printThermalReceiptHtml(htmlContent: string, options: ThermalSlipOptions = {}): void {
  const paperWidth = options.paperWidthMm || 80;

  // Create or reuse hidden iframe
  let iframe = document.getElementById('thermal-print-iframe') as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'thermal-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = `${paperWidth}mm`;
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  } else {
    iframe.style.width = `${paperWidth}mm`;
  }

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    // Fallback: open popup window
    const printWin = window.open('', '_blank', `width=400,height=600`);
    if (printWin) {
      printWin.document.write(htmlContent);
      printWin.document.close();
      printWin.focus();
    }
    return;
  }

  iframeDoc.open();
  iframeDoc.write(htmlContent);
  iframeDoc.close();

  // Trigger print after iframe renders
  setTimeout(() => {
    try {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    } catch (err) {
      console.warn('Silent thermal iframe print failed, falling back:', err);
    }
  }, 250);
}

/**
 * Quick plain text thermal slip formatter for local printing
 */
export function printPlainThermalSlip(slipText: string, title = 'Delivery Note', options: ThermalSlipOptions = {}): void {
  const paperWidth = options.paperWidthMm || 80;
  const is58mm = paperWidth === 58;
  const printableWidth = is58mm ? '54mm' : '76mm';
  const fontSize = is58mm ? '10px' : '12px';

  const escaped = slipText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    @page {
      size: ${paperWidth}mm auto;
      margin: 0mm;
    }
    @media print {
      body {
        width: ${printableWidth};
        margin: 0;
        padding: 2mm;
        font-family: 'Courier New', Courier, monospace;
        font-size: ${fontSize};
        font-weight: 700;
        line-height: 1.3;
        color: #000;
      }
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${fontSize};
      font-weight: 700;
      line-height: 1.3;
      padding: 4px;
      width: ${printableWidth};
      margin: 0 auto;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body onload="window.print()">
  <pre>${escaped}</pre>
</body>
</html>`;

  printThermalReceiptHtml(html, options);
}

