/**
 * Thermal Printer Utility for 58mm / 80mm ESC/POS Paper Rolls
 * Used in Petrol Pump POS counters and forecourt terminals.
 * Supports:
 * 1. Direct raw binary ESC/POS bytes (cut, drawer kick, font formatting)
 * 2. WebSerial API direct hardware streaming to USB/Serial POS printers
 * 3. Local silent print service daemon (RawBT / localhost:9100)
 * 4. Zero-margin silent iframe fallback styled for 58mm / 80mm rolls
 */

export interface ThermalSlipOptions {
  autoPrint?: boolean;
  paperWidthMm?: 58 | 80;
  cutPaper?: boolean;
  openCashDrawer?: boolean;
  useDirectHardware?: boolean;
  localAgentUrl?: string;
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
 * Generates raw ESC/POS binary buffer for direct hardware POS printers.
 * Supported by Epson, TVS, Citizen, Rugtek, Bixolon, Star, and Xprinter.
 */
export function generateEscPosBuffer(
  slipText: string,
  options: { cutPaper?: boolean; openCashDrawer?: boolean; paperWidthMm?: 58 | 80 } = {}
): Uint8Array {
  const bytes: number[] = [];

  // ESC @: Initialize printer
  bytes.push(0x1b, 0x40);

  // Open cash drawer kick-out if requested: ESC p 0 25 250
  if (options.openCashDrawer) {
    bytes.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
  }

  // Set line spacing default
  bytes.push(0x1b, 0x32);

  // Encode ASCII characters
  for (let i = 0; i < slipText.length; i++) {
    const code = slipText.charCodeAt(i);
    if (code === 10) {
      bytes.push(0x0a); // LF
    } else if (code < 128) {
      bytes.push(code);
    } else {
      bytes.push(0x20); // space fallback for unmapped unicode
    }
  }

  // Feed 4 blank lines before paper cut
  bytes.push(0x0a, 0x0a, 0x0a, 0x0a);

  // GS V 66 0: Partial / Full paper cut with feed
  if (options.cutPaper !== false) {
    bytes.push(0x1d, 0x56, 0x42, 0x00);
  }

  return new Uint8Array(bytes);
}

/**
 * Direct hardware printing over WebSerial API.
 * Connects directly to USB-to-Serial or native RS232 thermal receipt printers without any print dialogs.
 */
export async function printViaWebSerial(escPosData: Uint8Array): Promise<boolean> {
  const navAny = navigator as any;
  if (!navAny.serial) {
    console.warn('WebSerial API not supported in this browser. Falling back to silent thermal iframe.');
    return false;
  }

  try {
    // Request port or get previously approved ports
    const ports = await navAny.serial.getPorts();
    const port = ports.length > 0 ? ports[0] : await navAny.serial.requestPort();
    await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });

    const writer = port.writable.getWriter();
    await writer.write(escPosData);
    writer.releaseLock();
    await port.close();
    return true;
  } catch (err) {
    console.warn('WebSerial printing error:', err);
    return false;
  }
}

/**
 * Dispatch raw ESC/POS bytes to a local silent print service daemon (e.g. RawBT, QZ Tray, or local port 9100 proxy)
 */
export async function sendToLocalPrintAgent(
  escPosData: Uint8Array,
  agentUrl = 'http://127.0.0.1:9100/print'
): Promise<boolean> {
  try {
    const response = await fetch(agentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: escPosData as any,
      mode: 'cors',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Prints HTML content directly into a hidden iframe styled for 80mm/58mm thermal receipts.
 * Avoids disruptive page navigation while giving crisp, thermal-compatible output with zero margins.
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
 * High-Level Thermal Receipt Printer:
 * Tries hardware WebSerial or local print agent if requested, then seamlessly falls back
 * to zero-margin silent iframe rendering for standard 80mm/58mm thermal roll paper.
 */
export async function printPlainThermalSlip(
  slipText: string,
  title = 'Delivery Note',
  options: ThermalSlipOptions = {}
): Promise<void> {
  const paperWidth = options.paperWidthMm || 80;
  const is58mm = paperWidth === 58;
  const printableWidth = is58mm ? '54mm' : '76mm';
  const fontSize = is58mm ? '10px' : '12px';

  // 1. If direct hardware port is requested, try raw ESC/POS stream
  if (options.useDirectHardware) {
    const escPosBytes = generateEscPosBuffer(slipText, {
      cutPaper: options.cutPaper ?? true,
      openCashDrawer: options.openCashDrawer ?? false,
      paperWidthMm: paperWidth,
    });

    // Try local print agent daemon first if url provided
    if (options.localAgentUrl) {
      const agentSuccess = await sendToLocalPrintAgent(escPosBytes, options.localAgentUrl);
      if (agentSuccess) return;
    }

    // Try WebSerial direct stream
    const serialSuccess = await printViaWebSerial(escPosBytes);
    if (serialSuccess) return;
  }

  // 2. Fallback: Zero-margin thermal CSS print container
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
        -webkit-print-color-adjust: exact;
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


