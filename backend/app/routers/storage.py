import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.services.r2_storage import (
    ALLOWED_FOLDERS,
    ALLOWED_MIME_TYPES,
    r2_storage_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()

DANGEROUS_EXTENSIONS = {
    ".exe", ".sh", ".bash", ".bat", ".cmd", ".ps1", ".vbs", ".dll", ".so", ".bin", ".scr", ".msi", ".jar"
}


class PresignedUploadRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255, description="Filename with extension, e.g. closing_meter.jpg")
    content_type: str = Field(..., min_length=3, max_length=100, description="MIME type, e.g. image/jpeg, application/pdf")
    folder: str = Field(..., description="Target category: shift-handovers, tank-dips, fleet-kyc, invoices, expense-vouchers")
    expires_in: Optional[int] = Field(default=600, ge=60, le=7200, description="Expiration time in seconds (default 600)")


class PresignedUploadResponse(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int
    folder: str
    content_type: str


class PresignedViewResponse(BaseModel):
    view_url: str
    object_key: str
    expires_in: int


class DeleteObjectResponse(BaseModel):
    success: bool
    object_key: str
    message: str


@router.post(
    "/presigned-upload",
    response_model=PresignedUploadResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate Presigned PUT Upload URL for Direct R2 Client Upload",
)
async def generate_presigned_upload(payload: PresignedUploadRequest):
    """
    Forecourt Client Direct Upload:
    Generates a secure S3v4 presigned PUT URL allowing the frontend browser
    to upload nozzle closing meter photos, tank dip receipts, indent slips,
    and KYC docs directly to Cloudflare R2, bypassing Railway application RAM/egress.
    """
    clean_folder = payload.folder.strip().lower()
    if clean_folder not in ALLOWED_FOLDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid folder category '{payload.folder}'. Allowed categories: {sorted(ALLOWED_FOLDERS)}",
        )

    clean_mime = payload.content_type.strip().lower()
    if clean_mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Disallowed MIME type '{payload.content_type}'. Allowed types: {sorted(ALLOWED_MIME_TYPES)}",
        )

    filename_lower = payload.filename.lower()
    if any(filename_lower.endswith(ext) for ext in DANGEROUS_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Executable and script files are strictly prohibited from storage upload.",
        )

    try:
        expires_in = payload.expires_in or 600
        result = r2_storage_service.generate_presigned_upload_url(
            folder=clean_folder,
            filename=payload.filename,
            content_type=clean_mime,
            expires_in=expires_in,
        )
        return PresignedUploadResponse(
            upload_url=result["upload_url"],
            object_key=result["object_key"],
            expires_in=expires_in,
            folder=clean_folder,
            content_type=clean_mime,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as exc:
        logger.error(f"Failed to generate presigned upload URL: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate presigned upload URL: {str(exc)}",
        )


@router.get(
    "/presigned-view",
    response_model=PresignedViewResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate Temporary Presigned GET URL for Private R2 Object Viewing",
)
async def generate_presigned_view(
    object_key: str = Query(..., min_length=3, description="Canonical R2 object key"),
    expires_in: int = Query(default=3600, ge=60, le=86400, description="Signed URL lifespan in seconds"),
):
    """
    Secure Private Viewing:
    Cloudflare R2 bucket remains completely private. Sensitive audit docs,
    fleet credit invoices, and station inspection photos are accessed via
    temporary signed GET URLs that expire automatically.
    """
    clean_key = object_key.strip().lstrip("/")
    if not clean_key or ".." in clean_key or "\\" in clean_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid object key format. Directory traversal is prohibited.",
        )

    try:
        url = r2_storage_service.generate_presigned_download_url(
            object_key=clean_key,
            expires_in=expires_in,
        )
        return PresignedViewResponse(
            view_url=url,
            object_key=clean_key,
            expires_in=expires_in,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as exc:
        logger.error(f"Failed to generate presigned view URL for key '{clean_key}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate signed view URL: {str(exc)}",
        )


@router.delete(
    "/delete",
    response_model=DeleteObjectResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete an Object from Cloudflare R2",
)
async def delete_storage_object(
    object_key: str = Query(..., min_length=3, description="Object key to remove from R2 bucket"),
):
    """
    Deletes an object from Cloudflare R2 when a record (e.g. cancelled voucher or voided dip) is removed.
    """
    clean_key = object_key.strip().lstrip("/")
    if not clean_key or ".." in clean_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid object key.",
        )

    try:
        r2_storage_service.delete_object(clean_key)
        return DeleteObjectResponse(
            success=True,
            object_key=clean_key,
            message=f"Object '{clean_key}' deleted successfully from R2.",
        )
    except Exception as exc:
        logger.error(f"Failed to delete object '{clean_key}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete object: {str(exc)}",
        )


@router.get(
    "/status",
    summary="Check Cloudflare R2 Storage Connection and Settings",
)
async def storage_status():
    """Returns Cloudflare R2 status and configuration metadata."""
    conn = r2_storage_service.test_connection()
    return {
        "status": "ready",
        "service": "Cloudflare R2 Object Storage",
        "r2_connection": conn,
        "bucket": r2_storage_service.bucket_name,
        "allowed_folders": sorted(ALLOWED_FOLDERS),
        "allowed_mime_types": sorted(ALLOWED_MIME_TYPES),
    }
