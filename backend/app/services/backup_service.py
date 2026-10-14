import io
import gzip
import hashlib
import json
import logging
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.petrol_pump import (
    BankAccount,
    Customer,
    Employee,
    Expense,
    FuelProduct,
    Nozzle,
    PaymentReceipt,
    PurchaseEntry,
    RateHistory,
    Shift,
    ShiftMeterReading,
    ShiftSettlement,
    Tank,
    TankDipEntry,
    Vehicle,
    CreditSale,
)

logger = logging.getLogger(__name__)

# Local backup directory for fallback and offline caching
LOCAL_BACKUP_DIR = Path("backups")
LOCAL_BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _json_serial(obj: Any) -> Any:
    """JSON serializer for dates, datetimes, decimals, etc."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return str(obj)


class R2StorageService:
    """Cloudflare R2 Object Storage Manager for Disaster Recovery Backups."""

    def __init__(self):
        self.endpoint_url = settings.EFFECTIVE_R2_ENDPOINT
        self.access_key = settings.R2_ACCESS_KEY_ID
        self.secret_key = settings.R2_SECRET_ACCESS_KEY
        self.bucket_name = settings.R2_BUCKET_NAME

    def is_configured(self) -> bool:
        return bool(self.endpoint_url and self.access_key and self.secret_key and self.bucket_name)

    def get_client(self):
        if not self.is_configured():
            return None
        return boto3.client(
            service_name="s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name="auto",  # Cloudflare R2 standard region
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    def test_connection(self) -> Dict[str, Any]:
        if not self.is_configured():
            return {
                "connected": False,
                "configured": False,
                "message": "Cloudflare R2 credentials not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in Railway.",
            }
        try:
            client = self.get_client()
            # Try head_bucket or list_objects_v2 with max 1 key
            client.list_objects_v2(Bucket=self.bucket_name, MaxKeys=1)
            return {
                "connected": True,
                "configured": True,
                "bucket": self.bucket_name,
                "endpoint": self.endpoint_url,
                "message": f"Successfully connected to Cloudflare R2 bucket '{self.bucket_name}'!",
            }
        except ClientError as e:
            err_code = e.response.get("Error", {}).get("Code", "Unknown")
            err_msg = e.response.get("Error", {}).get("Message", str(e))
            return {
                "connected": False,
                "configured": True,
                "error_code": err_code,
                "message": f"Cloudflare R2 Error ({err_code}): {err_msg}",
            }
        except Exception as ex:
            return {
                "connected": False,
                "configured": True,
                "message": f"Cloudflare R2 connection error: {str(ex)}",
            }

    def upload_file(self, key: str, file_bytes: bytes, content_type: str = "application/gzip") -> Dict[str, Any]:
        client = self.get_client()
        if not client:
            raise RuntimeError("Cloudflare R2 is not configured.")

        client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=file_bytes,
            ContentType=content_type,
            Metadata={
                "project": "nsaipetrosoft",
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        return {
            "bucket": self.bucket_name,
            "key": key,
            "size_bytes": len(file_bytes),
        }

    def list_backups(self) -> List[Dict[str, Any]]:
        client = self.get_client()
        if not client:
            return []

        try:
            resp = client.list_objects_v2(Bucket=self.bucket_name, Prefix="backups/")
            objects = resp.get("Contents", [])
            # Sort newest first
            objects.sort(key=lambda x: x.get("LastModified", datetime.min), reverse=True)
            return [
                {
                    "key": obj["Key"],
                    "filename": Path(obj["Key"]).name,
                    "size_bytes": obj["Size"],
                    "size_kb": round(obj["Size"] / 1024, 2),
                    "last_modified": obj["LastModified"].isoformat(),
                    "storage": "cloudflare_r2",
                }
                for obj in objects
            ]
        except Exception as e:
            logger.warning(f"Failed to list R2 backups: {e}")
            return []

    def get_object_bytes(self, key: str) -> Optional[bytes]:
        client = self.get_client()
        if not client:
            return None
        try:
            resp = client.get_object(Bucket=self.bucket_name, Key=key)
            return resp["Body"].read()
        except Exception as e:
            logger.error(f"Error fetching R2 backup {key}: {e}")
            return None


r2_service = R2StorageService()


# ---------------------------------------------------------------------------
# Database Table Serialization
# ---------------------------------------------------------------------------
async def _extract_table_data(db: AsyncSession, model_class: Any) -> List[Dict[str, Any]]:
    """Extract all rows for a given model as a list of dicts."""
    res = await db.execute(select(model_class))
    rows = res.scalars().all()
    output = []
    for row in rows:
        d = {}
        for col in row.__table__.columns:
            val = getattr(row, col.name)
            if isinstance(val, (datetime, date)):
                d[col.name] = val.isoformat()
            else:
                d[col.name] = val
        output.append(d)
    return output


async def generate_database_snapshot(db: AsyncSession) -> Tuple[str, bytes, Dict[str, Any]]:
    """
    Extracts all ERP data from PostgreSQL, compresses it with gzip,
    and returns (filename, compressed_bytes, metadata).
    """
    now = datetime.now(timezone.utc)
    now_str = now.strftime("%Y-%m-%d_%H%M%S")
    filename = f"nsaipetrosoft_backup_{now_str}.json.gz"

    tables_to_dump = {
        "fuel_products": FuelProduct,
        "rate_histories": RateHistory,
        "tanks": Tank,
        "nozzles": Nozzle,
        "employees": Employee,
        "customers": Customer,
        "vehicles": Vehicle,
        "shifts": Shift,
        "shift_meter_readings": ShiftMeterReading,
        "credit_sales": CreditSale,
        "payment_receipts": PaymentReceipt,
        "expenses": Expense,
        "purchase_entries": PurchaseEntry,
        "tank_dip_entries": TankDipEntry,
        "shift_settlements": ShiftSettlement,
        "bank_accounts": BankAccount,
    }

    dump_data: Dict[str, Any] = {}
    stats: Dict[str, int] = {}
    total_records = 0

    for table_name, model in tables_to_dump.items():
        try:
            rows = await _extract_table_data(db, model)
            dump_data[table_name] = rows
            stats[table_name] = len(rows)
            total_records += len(rows)
        except Exception as e:
            logger.warning(f"Error reading table {table_name}: {e}")
            dump_data[table_name] = []
            stats[table_name] = 0

    payload = {
        "metadata": {
            "system": "NSAIPETROSOFT Petroleum ERP",
            "version": "2.0.0",
            "created_at": now.isoformat(),
            "environment": settings.ENVIRONMENT,
            "total_tables": len(tables_to_dump),
            "total_records": total_records,
            "table_counts": stats,
        },
        "tables": dump_data,
    }

    raw_json = json.dumps(payload, default=_json_serial, indent=2).encode("utf-8")
    raw_size = len(raw_json)

    # Compress with standard gzip
    compressed_bytes = gzip.compress(raw_json, compresslevel=9)
    compressed_size = len(compressed_bytes)

    sha256 = hashlib.sha256(compressed_bytes).hexdigest()

    meta = {
        "filename": filename,
        "timestamp": now.isoformat(),
        "total_records": total_records,
        "raw_size_bytes": raw_size,
        "compressed_size_bytes": compressed_size,
        "compression_ratio": f"{round((1 - compressed_size / raw_size) * 100, 1)}%",
        "sha256": sha256,
        "stats": stats,
    }

    return filename, compressed_bytes, meta


async def create_and_store_backup(db: AsyncSession) -> Dict[str, Any]:
    """
    Creates a PostgreSQL database snapshot, attempts upload to Cloudflare R2,
    and falls back/stores a local copy so backup is never lost.
    """
    filename, file_bytes, meta = await generate_database_snapshot(db)

    # Always save a local copy in backups directory
    local_path = LOCAL_BACKUP_DIR / filename
    with open(local_path, "wb") as f:
        f.write(file_bytes)

    r2_status = r2_service.test_connection()
    uploaded_to_r2 = False
    r2_key = None
    r2_message = None

    if r2_status.get("connected"):
        try:
            month_folder = datetime.now(timezone.utc).strftime("%Y-%m")
            r2_key = f"backups/{month_folder}/{filename}"
            r2_service.upload_file(r2_key, file_bytes)
            uploaded_to_r2 = True
            r2_message = f"Successfully archived to Cloudflare R2 bucket '{r2_service.bucket_name}'!"
        except Exception as e:
            logger.error(f"Failed to upload backup to R2: {e}")
            r2_message = f"Saved locally. R2 upload failed: {str(e)}"
    else:
        r2_message = "Saved locally. Cloudflare R2 credentials not configured on server."

    return {
        "status": "success",
        "filename": filename,
        "size_kb": round(meta["compressed_size_bytes"] / 1024, 2),
        "total_records": meta["total_records"],
        "sha256": meta["sha256"],
        "storage": "cloudflare_r2" if uploaded_to_r2 else "local_disk",
        "uploaded_to_r2": uploaded_to_r2,
        "r2_key": r2_key,
        "message": r2_message,
        "stats": meta["stats"],
        "created_at": meta["timestamp"],
    }


def list_all_backups() -> List[Dict[str, Any]]:
    """Lists backups from Cloudflare R2 and merges with any local backup files."""
    r2_backups = []
    if r2_service.is_configured():
        r2_backups = r2_service.list_backups()

    local_backups = []
    if LOCAL_BACKUP_DIR.exists():
        for f in LOCAL_BACKUP_DIR.glob("*.json.gz"):
            stat = f.stat()
            local_backups.append({
                "key": f.name,
                "filename": f.name,
                "size_bytes": stat.st_size,
                "size_kb": round(stat.st_size / 1024, 2),
                "last_modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "storage": "local_disk",
            })

    # Combine: give preference to R2 entries, add unique local entries
    seen_filenames = set()
    combined = []
    for b in r2_backups:
        seen_filenames.add(b["filename"])
        combined.append(b)
    for b in local_backups:
        if b["filename"] not in seen_filenames:
            combined.append(b)

    combined.sort(key=lambda x: x.get("last_modified", ""), reverse=True)
    return combined


# ---------------------------------------------------------------------------
# Multi-Tab Master Excel (.xlsx) Generator for Accountants & CA Audits
# ---------------------------------------------------------------------------
def _style_excel_sheet(ws, title: str, headers: List[str], rows: List[List[Any]], number_columns: Optional[List[int]] = None):
    """Styles an openpyxl worksheet with petroleum ERP dark-navy theme, borders, and auto widths."""
    ws.title = title[:31]  # Excel max sheet title length is 31 chars
    try:
        ws.views.sheetView[0].showGridLines = True
    except Exception:
        pass

    header_fill = PatternFill(start_color="1A365D", end_color="1A365D", fill_type="solid")  # Deep Navy
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    thin_border = Border(
        left=Side(style="thin", color="CBD5E0"),
        right=Side(style="thin", color="CBD5E0"),
        top=Side(style="thin", color="CBD5E0"),
        bottom=Side(style="thin", color="CBD5E0"),
    )

    ws.append(headers)
    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border
    ws.row_dimensions[1].height = 26

    even_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    odd_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")

    for r_idx, row_data in enumerate(rows, start=2):
        ws.append(row_data)
        fill = even_fill if r_idx % 2 == 0 else odd_fill
        for c_idx in range(1, len(row_data) + 1):
            cell = ws.cell(row=r_idx, column=c_idx)
            cell.fill = fill
            cell.border = thin_border
            cell.font = Font(name="Calibri", size=10)
            if number_columns and c_idx in number_columns:
                cell.number_format = "#,##0.00"
                cell.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cell.alignment = Alignment(vertical="center")
        ws.row_dimensions[r_idx].height = 20

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or "")
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)


async def generate_excel_workbook(db: AsyncSession) -> Tuple[str, bytes]:
    """
    Builds a complete, multi-tab Microsoft Excel (.xlsx) workbook
    containing all station data formatted for Accountants and CAs.
    """
    now = datetime.now(timezone.utc)
    now_str = now.strftime("%Y-%m-%d_%H%M")
    filename = f"NSAIPETROSOFT_Full_Books_{now_str}.xlsx"

    wb = openpyxl.Workbook()
    # Remove default sheet
    default_sheet = wb.active

    # 1. Summary Sheet
    ws_summary = wb.create_sheet(title="Station_Summary")
    summary_headers = ["Domain / Table", "Module Description", "Total Database Records", "Status"]
    ws_summary.append(["NSAIPETROSOFT PETROLEUM ERP — COMPLETE STATION AUDIT EXPORT"])
    ws_summary.merge_cells("A1:D1")
    title_cell = ws_summary["A1"]
    title_cell.font = Font(name="Calibri", size=14, bold=True, color="1A365D")
    title_cell.alignment = Alignment(horizontal="left", vertical="center")
    ws_summary.append([f"Generated On: {now.strftime('%d-%b-%Y %H:%M:%S UTC')} | Financial Year: 2026-27"])
    ws_summary.merge_cells("A2:D2")
    ws_summary.append([])  # blank row

    # Fetch all data in parallel or sequence
    expenses = (await db.execute(select(Expense))).scalars().all()
    credit_sales = (await db.execute(select(CreditSale))).scalars().all()
    customers = (await db.execute(select(Customer))).scalars().all()
    meters = (await db.execute(select(ShiftMeterReading))).scalars().all()
    payments = (await db.execute(select(PaymentReceipt))).scalars().all()
    dips = (await db.execute(select(TankDipEntry))).scalars().all()
    purchases = (await db.execute(select(PurchaseEntry))).scalars().all()
    banks = (await db.execute(select(BankAccount))).scalars().all()
    products = (await db.execute(select(FuelProduct))).scalars().all()
    tanks = (await db.execute(select(Tank))).scalars().all()

    summary_rows = [
        ["Expenses Cash Book", "Daily petty cash and station expenses vouchers", len(expenses), "Active"],
        ["Credit Customer Sales", "Credit bills issued to transport & fleet vehicles", len(credit_sales), "Active"],
        ["Customer Directory", "Customer account master with limits and outstanding", len(customers), "Active"],
        ["Shift Meter Readings", "Pump nozzle opening/closing totalizer sales", len(meters), "Active"],
        ["Payment Receipts", "Customer collection receipts (Cash/Cheque/Bank)", len(payments), "Active"],
        ["Tank DIP Register", "Daily underground tank dip readings and sales variation", len(dips), "Active"],
        ["Purchases Decanting", "Inward fuel tanker deliveries and density tests", len(purchases), "Active"],
        ["Bank & Ledger Accounts", "Station bank accounts, cash in hand, and POS machines", len(banks), "Active"],
        ["Fuel Products", "Product rates, VAT %, Cess %, and density standards", len(products), "Active"],
        ["Underground Tanks", "Tank storage capacities and safe filling limits", len(tanks), "Active"],
    ]

    # Append summary table
    ws_summary.append(summary_headers)
    for col_idx in range(1, len(summary_headers) + 1):
        cell = ws_summary.cell(row=4, column=col_idx)
        cell.fill = PatternFill(start_color="1A365D", end_color="1A365D", fill_type="solid")
        cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal="center", vertical="center")
    for r_idx, srow in enumerate(summary_rows, start=5):
        ws_summary.append(srow)
        fill = PatternFill(start_color="F8FAFC", fill_type="solid") if r_idx % 2 == 0 else PatternFill(start_color="FFFFFF", fill_type="solid")
        for c_idx in range(1, len(srow) + 1):
            c = ws_summary.cell(row=r_idx, column=c_idx)
            c.fill = fill
            c.font = Font(name="Calibri", size=10)

    for col in ws_summary.columns:
        col_letter = get_column_letter(col[0].column)
        max_l = max(len(str(c.value or "")) for c in col)
        ws_summary.column_dimensions[col_letter].width = max(max_l + 4, 16)

    # 2. Expenses Sheet
    ws_exp = wb.create_sheet()
    exp_headers = ["Voucher ID", "Voucher Date", "Expense Category", "Amount (₹)", "Paid To / Beneficiary", "Narration"]
    exp_rows = [
        [e.id, str(e.date), e.category, e.amount, e.paid_to or "-", e.narration or "-"]
        for e in expenses
    ]
    _style_excel_sheet(ws_exp, "Expenses_CashBook", exp_headers, exp_rows, number_columns=[4])

    # 3. Credit Sales Sheet
    ws_credit = wb.create_sheet()
    credit_headers = ["Bill No", "Date", "Slip No", "Customer ID", "Vehicle No", "Product ID", "Rate (₹/L)", "Liters", "Amount (₹)", "Cash Paid (₹)", "Net Credit (₹)", "Remarks"]
    credit_rows = [
        [cs.bill_no, str(cs.date), cs.slip_no, cs.customer_id, cs.vehicle_no, cs.product_id, cs.rate, cs.qty, cs.amount, cs.cash_paid, cs.credit_amount, cs.remarks or "-"]
        for cs in credit_sales
    ]
    _style_excel_sheet(ws_credit, "Credit_Sales", credit_headers, credit_rows, number_columns=[7, 8, 9, 10, 11])

    # 4. Customer Directory Sheet
    ws_cust = wb.create_sheet()
    cust_headers = ["Customer ID", "Account Name", "Mobile", "City", "Credit Limit (₹)", "Current Balance (₹)", "Bill Cycle", "Status"]
    cust_rows = [
        [c.id, c.name, c.mobile, c.city or "SURAT", c.credit_limit, c.current_outstanding, c.bill_period, "BLOCKED" if c.is_blocked else "ACTIVE"]
        for c in customers
    ]
    _style_excel_sheet(ws_cust, "Customer_Directory", cust_headers, cust_rows, number_columns=[5, 6])

    # 5. Shift Meter Readings Sheet
    ws_meters = wb.create_sheet()
    meter_headers = ["Reading ID", "Shift ID", "Nozzle ID", "Opening Meter", "Closing Meter", "Testing Qty (L)", "Sale Qty (L)", "Rate (₹)", "Amount (₹)"]
    meter_rows = [
        [m.id, m.shift_id, m.nozzle_id, m.opening_meter, m.closing_meter, m.testing_qty, m.sale_qty, m.rate, m.total_amount]
        for m in meters
    ]
    _style_excel_sheet(ws_meters, "Shift_Meters", meter_headers, meter_rows, number_columns=[4, 5, 6, 7, 8, 9])

    # 6. Payment Receipts Sheet
    ws_pay = wb.create_sheet()
    pay_headers = ["Receipt No", "Date", "Customer ID", "Amount (₹)", "Payment Mode", "Bank / Cheque Ref", "Remarks"]
    pay_rows = [
        [p.receipt_no, str(p.date), p.customer_id, p.amount, p.payment_mode, p.cheque_no or p.bank_name or "-", p.remarks or "-"]
        for p in payments
    ]
    _style_excel_sheet(ws_pay, "Payment_Receipts", pay_headers, pay_rows, number_columns=[4])

    # 7. Tank DIP Register Sheet
    ws_dip = wb.create_sheet()
    dip_headers = ["Record ID", "Date", "Tank ID", "Opening Dip (cm)", "Opening Stock (L)", "Closing Dip (cm)", "Closing Stock (L)", "Dip Sale (L)", "Meter Sale (L)", "Variation (L)"]
    dip_rows = [
        [d.id, str(d.date), d.tank_id, d.opening_dip, d.opening_stock, d.closing_dip, d.closing_stock, d.dip_wise_sale, d.meter_wise_sale, d.variation_liters]
        for d in dips
    ]
    _style_excel_sheet(ws_dip, "Tank_DIP_Register", dip_headers, dip_rows, number_columns=[4, 5, 6, 7, 8, 9, 10])

    # 8. Purchases Decanting Sheet
    ws_pur = wb.create_sheet()
    pur_headers = ["Invoice No", "Date", "Dealer", "Tanker Vehicle", "Product ID", "Qty Liters", "Rate/KL (₹)", "Gross Amount (₹)", "VAT Amount (₹)", "Final Invoice Amount (₹)"]
    pur_rows = [
        [pu.invoice_no, str(pu.date), pu.dealer_name, pu.tanker_vehicle_no, pu.product_id, pu.qty_liters, pu.rate_per_kl, pu.gross_amount, pu.vat_amount, pu.final_amount]
        for pu in purchases
    ]
    _style_excel_sheet(ws_pur, "Purchases_Decanting", pur_headers, pur_rows, number_columns=[6, 7, 8, 9, 10])

    # 9. Bank Accounts Sheet
    ws_bank = wb.create_sheet()
    bank_headers = ["Account ID", "Account Name", "Account Type", "Current Balance (₹)"]
    bank_rows = [
        [b.id, b.account_name, b.account_type, b.balance]
        for b in banks
    ]
    _style_excel_sheet(ws_bank, "Bank_Accounts", bank_headers, bank_rows, number_columns=[4])

    # 10. Fuel Rates Sheet
    ws_prod = wb.create_sheet()
    prod_headers = ["Product ID", "Product Code", "Product Name", "Current Rate (₹)", "VAT %", "Cess %", "Standard Density"]
    prod_rows = [
        [pr.id, pr.code, pr.name, pr.current_rate, pr.vat_percent, pr.cess_percent, pr.density_standard]
        for pr in products
    ]
    _style_excel_sheet(ws_prod, "Fuel_Rate_Master", prod_headers, prod_rows, number_columns=[4, 5, 6, 7])

    # Remove the default sheet created by openpyxl
    if default_sheet in wb.worksheets:
        wb.remove(default_sheet)

    # Save to buffer
    excel_buffer = io.BytesIO()
    wb.save(excel_buffer)
    excel_bytes = excel_buffer.getvalue()

    return filename, excel_bytes
