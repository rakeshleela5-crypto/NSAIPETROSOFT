import io
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.backup_service import (
    LOCAL_BACKUP_DIR,
    create_and_store_backup,
    list_all_backups,
    r2_service,
)

router = APIRouter()


@router.get("/status", summary="Check Cloudflare R2 Connection & Setup Status")
async def get_backup_status():
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
async def create_backup(db: AsyncSession = Depends(get_db)):
    """
    Extracts all database tables from PostgreSQL, compresses with gzip,
    and uploads to Cloudflare R2 (or saves locally if R2 not yet linked).
    """
    try:
        result = await create_and_store_backup(db)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup generation failed: {str(e)}")


@router.get("", summary="List All Cloudflare R2 & Local Database Backups")
async def get_backups_list():
    """Lists all available disaster recovery backups."""
    backups = list_all_backups()
    return backups


@router.get("/download/{filename}", summary="Download Database Backup Archive")
async def download_backup(filename: str):
    """Downloads the .json.gz database archive."""
    # 1. Check Cloudflare R2
    if r2_service.is_configured():
        # Look for the file in R2
        client = r2_service.get_client()
        try:
            # First try prefix search
            resp = client.list_objects_v2(Bucket=r2_service.bucket_name, Prefix="backups/")
            for obj in resp.get("Contents", []):
                if Path(obj["Key"]).name == filename:
                    data = r2_service.get_object_bytes(obj["Key"])
                    if data:
                        return Response(
                            content=data,
                            media_type="application/gzip",
                            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
                        )
        except Exception:
            pass

    # 2. Check local disk
    local_file = LOCAL_BACKUP_DIR / filename
    if local_file.exists():
        with open(local_file, "rb") as f:
            data = f.read()
        return Response(
            content=data,
            media_type="application/gzip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    raise HTTPException(status_code=404, detail=f"Backup file '{filename}' not found.")
