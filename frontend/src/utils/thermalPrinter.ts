/**
 * Thermal Printer Utility for 58mm / 80mm ESC/POS Paper Rolls
 * Used in Petrol Pump POS counters and forecourt terminals.
 */

export interface ThermalSlipOptions {
  autoPrint?: boolean;
  paperWidthMm?: 58 | 80;
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
export function printPlainThermalSlip(slipText: string, title = 'Delivery Note'): void {
  const escaped = slipText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0mm;
    }
    @media print {
      body {
        width: 76mm;
        margin: 0;
        padding: 2mm;
        font-family: 'Courier New', Courier, monospace;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.3;
        color: #000;
      }
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.3;
      padding: 6px;
      width: 76mm;
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

  printThermalReceiptHtml(html);
}
