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
