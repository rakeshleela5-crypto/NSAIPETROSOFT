/**
 * NSAIPETROSOFT WhatsApp Integration Utility
 * Real-world click-to-WhatsApp delivery for Indian petrol pump fleets & retail customers.
 */

export function cleanIndianMobile(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  if (digits.length > 10 && !digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

export function openWhatsAppChat(mobile: string, message: string): boolean {
  const cleanPhone = cleanIndianMobile(mobile);
  const encodedText = encodeURIComponent(message);
  
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}

export interface CreditSaleWhatsAppParams {
  stationName: string;
  stationCity: string;
  billNo: string;
  slipNo: string;
  date: string;
  customerName: string;
  vehicleNo: string;
  productName: string;
  qty: number;
  rate: number;
  amount: number;
  cashPaid?: number;
  balanceAfter: number;
  odometerKm?: number;
  driverName?: string;
  driverMobile?: string;
  indentNo?: string;
  mileageKml?: number;
}

export function formatCreditSaleWhatsApp(p: CreditSaleWhatsAppParams): string {
  const netDue = (p.amount || 0) - (p.cashPaid || 0);
  return (
    `⛽ *${p.stationName.toUpperCase()}*\n` +
    `📍 ${p.stationCity}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧾 *FUEL DELIVERY NOTE (CREDIT)*\n` +
    `*Bill No:* ${p.billNo}  |  *Slip:* ${p.slipNo || '-'}\n` +
    (p.indentNo ? `*Indent / Voucher:* ${p.indentNo}\n` : '') +
    `*Date:* ${p.date}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Customer:* ${p.customerName}\n` +
    `🚛 *Vehicle:* ${p.vehicleNo.toUpperCase()}\n` +
    (p.driverName ? `👨‍✈️ *Driver:* ${p.driverName}\n` : '') +
    (p.odometerKm ? `⏱️ *Odometer:* ${p.odometerKm} KM\n` : '') +
    (p.mileageKml ? `⚡ *Calculated Mileage:* ${p.mileageKml.toFixed(2)} KM/L\n` : '') +
    `⛽ *Product:* ${p.productName}\n` +
    `📊 *Quantity:* ${Number(p.qty || 0).toFixed(2)} Liters\n` +
    `🏷️ *Rate:* ₹${Number(p.rate || 0).toFixed(2)}/L\n` +
    `💰 *Bill Amount:* ₹${Number(p.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
    (p.cashPaid && p.cashPaid > 0 ? `💵 *Cash Advance Paid:* ₹${p.cashPaid.toFixed(2)}\n` : '') +
    (p.cashPaid && p.cashPaid > 0 ? `💳 *Net Credit:* ₹${netDue.toFixed(2)}\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📈 *Current Ledger Balance:* ₹${Number(p.balanceAfter || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Thank you for fueling with us! Visit Again._`
  );
}

export interface PaymentReceiptWhatsAppParams {
  stationName: string;
  stationCity: string;
  receiptNo: string;
  date: string;
  customerName: string;
  amount: number;
  paymentMode: string;
  bankName?: string;
  newBalance: number;
}

export function formatPaymentReceiptWhatsApp(p: PaymentReceiptWhatsAppParams): string {
  return (
    `⛽ *${p.stationName.toUpperCase()}*\n` +
    `📍 ${p.stationCity}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *PAYMENT RECEIPT ACKNOWLEDGMENT*\n` +
    `*Receipt No:* ${p.receiptNo}\n` +
    `*Date:* ${p.date}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Received From:* ${p.customerName}\n` +
    `💵 *Amount Received:* ₹${Number(p.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
    `💳 *Payment Mode:* ${p.paymentMode} ${p.bankName ? `(${p.bankName})` : ''}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📉 *Remaining Outstanding Balance:* ₹${Number(p.newBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Payment received with thanks._`
  );
}

export interface StatementWhatsAppParams {
  stationName: string;
  stationCity: string;
  customerName: string;
  date: string;
  totalDebits: number;
  totalCredits: number;
  outstandingBalance: number;
}

export function formatStatementWhatsApp(p: StatementWhatsAppParams): string {
  return (
    `⛽ *${p.stationName.toUpperCase()}* - Account Statement\n` +
    `📍 ${p.stationCity}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *M/s ${p.customerName}*\n` +
    `*Statement As Of:* ${p.date}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 *Total Purchases:* ₹${Number(p.totalDebits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
    `💵 *Total Payments Received:* ₹${Number(p.totalCredits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
    `⚠️ *Net Outstanding Due:* ₹${Number(p.outstandingBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Kindly review and arrange remittance at your earliest convenience._\n` +
    `_Thank you for your valued partnership._`
  );
}
