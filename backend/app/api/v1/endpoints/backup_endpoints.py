import io
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user_optional, require_roles
from app.db.session import get_db
from app.models.petrol_pump import User
from app.services.backup_service import (
    LOCAL_BACKUP_DIR,
    create_and_store_backup,
    generate_excel_workbook,
    list_all_backups,
    r2_service,
    restore_database_snapshot,
)

router = APIRouter()


async def verify_backup_authorized(
    request: Request,
    pin: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> bool:
    """
    Enforces that backup administration requires Manager or Admin privileges.
    Accepts:
    1. Active session with admin or manager role
    2. Manager PIN override token or query parameter
    """
    if current_user and current_user.role in ("admin", "manager"):
        return True
    
    # Check manager token from cookie
    from app.core.security import decode_access_token
    manager_cookie = request.cookies.get("nsai_manager_token")
    if manager_cookie:
        payload = decode_access_token(manager_cookie)
        if payload and payload.get("role") in ("admin", "manager"):
            return True

    # Check query PIN
    if pin:
        from app.api.v1.endpoints.petrol_pump_endpoints import verify_manager_pin
        if await verify_manager_pin(pin, db):
            return True

    raise HTTPException(
        status_code=403,
        detail="Access Denied: Station Manager or Administrator credentials required to access database snapshots.",
    )


@router.get("/status", summary="Check Cloudflare R2 Connection & Setup Status")
async def get_backup_status(
    authorized: bool = Depends(verify_backup_authorized),
):
    """Returns Cloudflare R2 connectivity and configuration status."""
    conn = r2_service.test_connection()
    all_backups = list_all_backups()
    return {
        "status": "ready",
        "r2_connection": conn,
        "backup_count": len(all_backups),
        "latest_backup": all_backups[0] if all_backups else None,
        "configuration_instructions": {
            "required_env_vars": [
                "R2_ACCOUNT_ID",
                "R2_ACCESS_KEY_ID",
                "R2_SECRET_ACCESS_KEY",
                "R2_BUCKET_NAME",
            ],
            "help_url": "https://dash.cloudflare.com/?to=/:account/r2",
        },
    }


@router.post("/create", summary="Trigger Immediate Database Snapshot & Cloudflare R2 Archive")
async def create_backup(
    db: AsyncSession = Depends(get_db),
    authorized: bool = Depends(verify_backup_authorized),
):
    """
    Extracts all database tables from PostgreSQL, compresses with gzip,
    and uploads to Cloudflare R2 (or saves locally if R2 not yet linked).
    """
    try:
        result = await create_and_store_backup(db)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup generation failed: {str(e)}")


@router.post("/presigned-url", summary="Generate Cloudflare R2 Presigned URL")
async def generate_presigned_url_endpoint(
    payload: dict,
    authorized: bool = Depends(verify_backup_authorized),
):
    """
    Generates a secure S3v4 presigned URL for direct zero-egress document/receipt/backup
    upload or download to Cloudflare R2.
    """
    key = payload.get("key") or payload.get("filename")
    if not key:
        raise HTTPException(status_code=400, detail="Document key or filename is required.")
    expiration = int(payload.get("expiration") or payload.get("expires_in") or 900)
    action = payload.get("action", "download").lower()
    client_method = "put_object" if action in ("upload", "put") else "get_object"
    content_type = payload.get("content_type", "application/pdf" if key.endswith(".pdf") else "application/gzip")

    url = r2_service.generate_presigned_url(
        key=key,
        expiration=expiration,
        client_method=client_method,
        content_type=content_type,
    )

    return {
        "url": url,
        "key": key,
        "bucket": r2_service.bucket_name,
        "action": action,
        "client_method": client_method,
        "expires_in": expiration,
        "content_type": content_type,
    }


@router.post("/restore", summary="Restore Database Snapshot to PostgreSQL")
async def restore_backup_endpoint(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    authorized: bool = Depends(verify_backup_authorized),
):
    """
    Surgically restores an entire ERP database backup into PostgreSQL.
    Accepts raw JSON snapshot data or filename to pull from R2/local disk.
    """
    try:
        # Check if snapshot is provided as raw JSON data or filename
        snapshot_data = payload.get("data") or payload.get("snapshot") or payload
        filename = payload.get("filename")

        if filename and not snapshot_data:
            safe_filename = Path(filename).name
            raw_bytes = None
            if r2_service.is_configured():
                try:
                    raw_bytes = r2_service.get_object_bytes(f"backups/{safe_filename}")
                except Exception:
                    pass
            if not raw_bytes:
                local_path = (LOCAL_BACKUP_DIR / safe_filename).resolve()
                if local_path.is_file() and local_path.exists():
                    with open(local_path, "rb") as f:
                        raw_bytes = f.read()

            if not raw_bytes:
                raise HTTPException(status_code=404, detail=f"Backup archive '{safe_filename}' not found")

            # Decompress if gzip
            import gzip
            import json
            try:
                decompressed = gzip.decompress(raw_bytes)
                snapshot_data = json.loads(decompressed.decode("utf-8"))
            except Exception:
                snapshot_data = json.loads(raw_bytes.decode("utf-8"))

        if not isinstance(snapshot_data, dict):
            raise HTTPException(status_code=400, detail="Invalid snapshot data format")

        result = await restore_database_snapshot(db, snapshot_data)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database restoration failed: {str(e)}")


@router.get("", summary="List All Cloudflare R2 & Local Database Backups")
async def get_backups_list(
    authorized: bool = Depends(verify_backup_authorized),
):
    """Lists all available disaster recovery backups."""
    backups = list_all_backups()
    return backups


@router.get("/download/{filename}", summary="Download Database Backup Archive")
async def download_backup(
    filename: str,
    authorized: bool = Depends(verify_backup_authorized),
):
    """
    Downloads the .json.gz database archive.
    Strictly sanitizes the filename to prevent directory traversal attacks.
    """
    safe_filename = Path(filename).name
    if not safe_filename or safe_filename != filename or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid backup filename format")

    if not safe_filename.endswith(".json.gz") and not safe_filename.endswith(".gz"):
        raise HTTPException(status_code=400, detail="Invalid archive file extension")

    # 1. Check Cloudflare R2
    if r2_service.is_configured():
        client = r2_service.get_client()
        try:
            resp = client.list_objects_v2(Bucket=r2_service.bucket_name, Prefix="backups/")
            for obj in resp.get("Contents", []):
                if Path(obj["Key"]).name == safe_filename:
                    data = r2_service.get_object_bytes(obj["Key"])
                    if data:
                        return Response(
                            content=data,
                            media_type="application/gzip",
                            headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
                        )
        except Exception:
            pass

    # 2. Check local disk safely
    local_file = (LOCAL_BACKUP_DIR / safe_filename).resolve()
    base_resolved = LOCAL_BACKUP_DIR.resolve()
    try:
        is_safe = local_file.is_relative_to(base_resolved)
    except AttributeError:
        is_safe = base_resolved in local_file.parents

    if is_safe and local_file.is_file() and local_file.exists():
        with open(local_file, "rb") as f:
            data = f.read()
        return Response(
            content=data,
            media_type="application/gzip",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
        )

    raise HTTPException(status_code=404, detail=f"Backup file '{safe_filename}' not found.")


@router.get("/export-excel", summary="Export Multi-Tab Master Excel (.xlsx) Workbook for Accountants & CAs")
async def export_master_excel(
    db: AsyncSession = Depends(get_db),
    authorized: bool = Depends(verify_backup_authorized),
):
    """
    Generates a live, fully-styled multi-sheet Microsoft Excel (.xlsx) file
    containing all station ledgers, cash books, credit sales, meter readings,
    and tank dips.
    """
    try:
        filename, excel_bytes = await generate_excel_workbook(db)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Excel workbook: {str(e)}")
