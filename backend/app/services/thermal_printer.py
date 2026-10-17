from datetime import datetime
from typing import Any, Dict, Optional


def build_esc_pos_header(station_name: str = "NSAIPETROSOFT FUELS", sub_text: str = "HIGHWAY PETROLEUM RETAIL") -> str:
    # ESC/POS commands
    # ESC @: Initialize printer (\x1b\x40)
    # ESC a 1: Center align (\x1b\x61\x01)
    # ESC ! 0x30: Double height + double width (\x1b\x21\x30)
    # ESC ! 0x00: Normal font (\x1b\x21\x00)
    return f"{station_name}\n{sub_text}\n"


def generate_credit_slip_text(
    sale: Any,
    customer_name: str,
    product_name: str,
    station_name: str = "NSAIPETROSOFT FUELS",
    phone: str = "+91 98765 43210",
    gstin: str = "24AAAAA0000A1Z5",
) -> str:
    line_sep = "-" * 32
    double_sep = "=" * 32

    date_str = sale.date.strftime("%d-%m-%Y") if hasattr(sale.date, "strftime") else str(sale.date)
    time_str = datetime.now().strftime("%H:%M")

    slip_lines = [
        station_name.center(32),
        "CREDIT DELIVERY NOTE".center(32),
        f"GSTIN: {gstin}".center(32),
        f"Tel: {phone}".center(32),
        double_sep,
        f"Date: {date_str}   Time: {time_str}",
        f"Bill No: {sale.bill_no:<8} Slip No: {sale.slip_no}",
        line_sep,
        f"Customer: {customer_name[:20]}",
        f"Vehicle : {sale.vehicle_no}",
        line_sep,
        f"Item: {product_name}",
        f"Qty : {sale.qty:>8.2f} Ltr",
        f"Rate: {sale.rate:>8.2f} /Ltr",
        line_sep,
        f"Gross Amount : Rs. {sale.amount + (sale.discount_amount or 0.0):>10.2f}",
    ]

    if sale.discount_amount and sale.discount_amount > 0:
        slip_lines.append(f"Discount     : Rs. -{sale.discount_amount:>9.2f}")

    if sale.cash_paid and sale.cash_paid > 0:
        slip_lines.append(f"Cash Paid    : Rs. {sale.cash_paid:>10.2f}")

    slip_lines.extend([
        double_sep,
        f"NET CREDIT   : Rs. {sale.credit_amount:>10.2f}",
        double_sep,
        f"Current Balance : Rs. {sale.customer_balance_after:>8.2f}",
        line_sep,
        "Driver Sign: ________________",
        "",
        "Authorized Sign: ____________",
        double_sep,
        "Thank you! Visit Again".center(32),
        line_sep,
        "\n\n\n",  # Feed paper before tear-off
    ])

    return "\n".join(slip_lines)


def generate_thermal_slip_html(slip_text: str, title: str = "Thermal Slip") -> str:
    escaped_text = slip_text.replace("<", "&lt;").replace(">", "&gt;")
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>{title}</title>
<style>
  @page {{
    size: 80mm auto;
    margin: 0mm;
  }}
  @media print {{
    html, body {{
      width: 76mm;
      margin: 0;
      padding: 2mm 3mm;
      background: #fff;
    }}
  }}
  body {{
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    color: #000;
    margin: 0 auto;
    padding: 10px;
    width: 76mm;
    background: #fff;
  }}
  pre {{
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
  }}
</style>
</head>
<body onload="window.print()">
  <pre>{escaped_text}</pre>
</body>
</html>"""
