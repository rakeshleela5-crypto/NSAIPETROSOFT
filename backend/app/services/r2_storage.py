import re
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Set

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_FOLDERS: Set[str] = {
    "shift-handovers",
    "tank-dips",
    "fleet-kyc",
    "invoices",
    "expense-vouchers",
}

ALLOWED_MIME_TYPES: Set[str] = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}


def sanitize_filename(filename: str) -> str:
    """
    Sanitizes raw filenames from client uploads to prevent directory traversal
    and special character corruption in Cloudflare R2 object keys.
    """
    base = Path(filename).name
    # Replace whitespace and unsafe characters with underscores
    clean = re.sub(r"[^\w.\-_]", "_", base)
    # Collapse consecutive underscores
    clean = re.sub(r"_+", "_", clean).strip("._")
    return clean or "upload.bin"


class R2StorageService:
    """
    Cloudflare R2 Storage Service (AWS S3-Compatible API via boto3).
    Supports:
    1. Direct client presigned PUT upload URLs (saving Railway RAM & bandwidth).
    2. Secure presigned GET URLs for viewing sensitive forecourt and audit documents.
    3. Server-side direct byte uploads for generated PDF invoices & shift reports.
    4. Object deletion for record cleanup.
    """

    def __init__(self):
        self._client = None

    @property
    def account_id(self) -> str:
        return settings.R2_ACCOUNT_ID.strip() if settings.R2_ACCOUNT_ID else ""

    @property
    def bucket_name(self) -> str:
        return (settings.R2_BUCKET_NAME or "nsaipetrosoft-storage").strip()

    @property
    def access_key_id(self) -> str:
        return (settings.R2_ACCESS_KEY_ID or "mock_r2_access_key").strip()

    @property
    def secret_access_key(self) -> str:
        return (settings.R2_SECRET_ACCESS_KEY or "mock_r2_secret_access_key").strip()

    @property
    def endpoint_url(self) -> str:
        if settings.R2_ENDPOINT_URL:
            return settings.R2_ENDPOINT_URL.strip().rstrip("/")
        if self.account_id:
            return f"https://{self.account_id}.r2.cloudflarestorage.com"
        return "https://mock-account.r2.cloudflarestorage.com"

    def is_configured(self) -> bool:
        """Returns True if live production credentials are present."""
        return bool(settings.R2_ACCOUNT_ID and settings.R2_ACCESS_KEY_ID and settings.R2_SECRET_ACCESS_KEY)

    def get_client(self):
        """Initializes and caches the singleton boto3 S3 client configured for Cloudflare R2."""
        if self._client is None:
            self._client = boto3.client(
                service_name="s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key_id,
                aws_secret_access_key=self.secret_access_key,
                region_name="auto",
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                ),
            )
        return self._client

    def build_object_key(self, folder: str, filename: str) -> str:
        """
        Builds a canonical unique R2 object key:
        {folder}/{YYYY-MM-DD}/{uuid4}_{sanitized_filename}
        """
        clean_folder = folder.strip().strip("/")
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        clean_name = sanitize_filename(filename)
        unique_prefix = uuid.uuid4().hex[:12]
        return f"{clean_folder}/{today_str}/{unique_prefix}_{clean_name}"

    def generate_presigned_upload_url(
        self,
        folder: str,
        filename: str,
        content_type: str,
        expires_in: int = 600,
    ) -> Dict[str, str]:
        """
        Generates an S3v4 presigned PUT URL for direct browser-to-R2 upload.
        Expires in 600 seconds (10 minutes) by default.
        """
        folder_clean = folder.strip().strip("/")
        if folder_clean not in ALLOWED_FOLDERS:
            raise ValueError(
                f"Invalid folder category '{folder}'. Allowed folders: {sorted(ALLOWED_FOLDERS)}"
            )

        content_type_clean = content_type.strip().lower()
        if content_type_clean not in ALLOWED_MIME_TYPES:
            raise ValueError(
                f"Invalid MIME type '{content_type}'. Allowed MIME types: {sorted(ALLOWED_MIME_TYPES)}"
            )

        object_key = self.build_object_key(folder_clean, filename)
        client = self.get_client()

        upload_url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": object_key,
                "ContentType": content_type_clean,
            },
            ExpiresIn=expires_in,
        )

        return {
            "upload_url": upload_url,
            "object_key": object_key,
        }

    def generate_presigned_download_url(
        self,
        object_key: str,
        expires_in: int = 3600,
    ) -> str:
        """
        Generates a temporary signed S3v4 GET URL for secure private viewing.
        Expires in 3600 seconds (1 hour) by default.
        """
        clean_key = object_key.strip().lstrip("/")
        if not clean_key or ".." in clean_key:
            raise ValueError("Invalid object key.")

        client = self.get_client()
        view_url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": clean_key,
            },
            ExpiresIn=expires_in,
        )
        return view_url

    def upload_bytes_directly(
        self,
        file_bytes: bytes,
        folder: str,
        filename: str,
        content_type: str = "application/pdf",
    ) -> str:
        """
        Server-side upload for backend-generated PDF invoices, credit bills,
        and daily shift handover summaries directly into Cloudflare R2.
        Returns the created object_key.
        """
        folder_clean = folder.strip().strip("/")
        object_key = self.build_object_key(folder_clean, filename)

        if not self.is_configured():
            logger.info(f"[R2 Dry-Run] Simulated direct byte upload for object key: {object_key}")
            return object_key

        client = self.get_client()
        client.put_object(
            Bucket=self.bucket_name,
            Key=object_key,
            Body=file_bytes,
            ContentType=content_type,
            Metadata={
                "project": "nsaipetrosoft",
                "folder": folder_clean,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        return object_key

    def delete_object(self, object_key: str) -> bool:
        """
        Deletes an object from Cloudflare R2 by object_key.
        Returns True upon successful deletion.
        """
        clean_key = object_key.strip().lstrip("/")
        if not clean_key:
            return False

        if not self.is_configured():
            logger.info(f"[R2 Dry-Run] Simulated object deletion for object key: {clean_key}")
            return True

        client = self.get_client()
        try:
            client.delete_object(
                Bucket=self.bucket_name,
                Key=clean_key,
            )
            return True
        except ClientError as e:
            logger.error(f"Failed to delete R2 object '{clean_key}': {e}")
            raise

    def test_connection(self) -> Dict[str, Any]:
        """Validates connection to Cloudflare R2 bucket."""
        if not self.is_configured():
            return {
                "connected": False,
                "configured": False,
                "message": "Cloudflare R2 credentials not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
            }
        try:
            client = self.get_client()
            client.list_objects_v2(Bucket=self.bucket_name, MaxKeys=1)
            return {
                "connected": True,
                "configured": True,
                "bucket": self.bucket_name,
                "endpoint": self.endpoint_url,
                "message": f"Successfully connected to Cloudflare R2 bucket '{self.bucket_name}'",
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


# Singleton service instance
r2_storage_service = R2StorageService()
