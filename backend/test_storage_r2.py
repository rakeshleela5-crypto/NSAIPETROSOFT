"""
Cloudflare R2 Object Storage Integration & Security Audit Suite for NSAiPetroSoft
Tests:
1. Direct client presigned upload URL generation (S3v4 PUT).
2. Strict MIME type & folder validation (rejection of .exe, .sh, unauthorized folders).
3. Secure private viewing with temporary signed GET URLs.
4. Path traversal / directory traversal protection.
5. Server-side direct byte uploads for generated PDF invoices & shift handovers.
6. Record deletion and storage cleanup.
7. Schema verification (database stores relative object_key VARCHAR rather than hardcoded URLs).
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.r2_storage import (
    ALLOWED_FOLDERS,
    ALLOWED_MIME_TYPES,
    R2StorageService,
    r2_storage_service,
    sanitize_filename,
)
from app.models.petrol_pump import (
    Expense,
    ShiftHandover,
    TankDipLog,
    FleetInvoice,
    CreditSale,
    ShiftMeterReading,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def storage_service():
    return R2StorageService()


# -------------------------------------------------------------
# 1. Filename Sanitization & Key Structure Tests
# -------------------------------------------------------------
def test_sanitize_filename_prevents_traversal():
    assert sanitize_filename("../../../etc/passwd") == "passwd"
    assert sanitize_filename("..\\..\\windows\\system32\\calc.exe") == "calc.exe"
    assert sanitize_filename("my closing meter (MPD 1).jpg") == "my_closing_meter_MPD_1_.jpg"
    assert sanitize_filename("   spaced   name.png  ") == "spaced_name.png"
    assert sanitize_filename("") == "upload.bin"


def test_object_key_generation_structure(storage_service):
    folder = "shift-handovers"
    filename = "meter_close.jpg"
    key = storage_service.build_object_key(folder, filename)

    parts = key.split("/")
    assert len(parts) == 3
    assert parts[0] == folder
    # Date format YYYY-MM-DD
    assert len(parts[1].split("-")) == 3
    # Contains uuid and sanitized filename
    assert "meter_close.jpg" in parts[2]


# -------------------------------------------------------------
# 2. Presigned Upload Endpoint Tests (FastAPI /api/v1/storage)
# -------------------------------------------------------------
@pytest.mark.anyio
async def test_presigned_upload_all_valid_categories():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        test_cases = [
            ("shift-handovers", "closing_photo.jpg", "image/jpeg"),
            ("tank-dips", "dip_reading.png", "image/png"),
            ("fleet-kyc", "gst_certificate.pdf", "application/pdf"),
            ("invoices", "fleet_monthly_bill.pdf", "application/pdf"),
            ("expense-vouchers", "fuel_filter_receipt.webp", "image/webp"),
        ]

        for folder, filename, mime in test_cases:
            resp = await client.post(
                "/api/v1/storage/presigned-upload",
                json={
                    "folder": folder,
                    "filename": filename,
                    "content_type": mime,
                    "expires_in": 600,
                },
            )
            assert resp.status_code == 200, f"Failed for {folder}: {resp.text}"
            data = resp.json()
            assert "upload_url" in data
            assert "object_key" in data
            assert data["folder"] == folder
            assert data["content_type"] == mime
            assert data["expires_in"] == 600
            assert data["object_key"].startswith(f"{folder}/")
            # Presigned URL includes S3v4 signature parameters
            upload_url = data["upload_url"].lower()
            assert "x-amz-signature=" in upload_url or "signature=" in upload_url


@pytest.mark.anyio
async def test_presigned_upload_rejects_invalid_mime_types():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        invalid_mimes = [
            ("shift-handovers", "script.sh", "text/x-shellscript"),
            ("tank-dips", "malware.exe", "application/x-msdownload"),
            ("fleet-kyc", "exploit.html", "text/html"),
            ("invoices", "payload.js", "application/javascript"),
            ("expense-vouchers", "archive.zip", "application/zip"),
        ]

        for folder, filename, mime in invalid_mimes:
            resp = await client.post(
                "/api/v1/storage/presigned-upload",
                json={
                    "folder": folder,
                    "filename": filename,
                    "content_type": mime,
                },
            )
            assert resp.status_code == 400, f"Expected 400 for {mime}, got {resp.status_code}"
            assert "MIME type" in resp.json()["detail"] or "prohibited" in resp.json()["detail"]


@pytest.mark.anyio
async def test_presigned_upload_rejects_dangerous_extensions():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        dangerous_files = ["trojan.exe", "backdoor.sh", "script.bat", "powershell.ps1"]
        for bad_file in dangerous_files:
            resp = await client.post(
                "/api/v1/storage/presigned-upload",
                json={
                    "folder": "shift-handovers",
                    "filename": bad_file,
                    "content_type": "image/jpeg",  # Spoofed MIME type
                },
            )
            assert resp.status_code == 400
            assert "prohibited" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_presigned_upload_rejects_invalid_folder():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        invalid_folders = ["root", "system", "passwords", "../etc", "database-backups"]
        for bad_folder in invalid_folders:
            resp = await client.post(
                "/api/v1/storage/presigned-upload",
                json={
                    "folder": bad_folder,
                    "filename": "photo.jpg",
                    "content_type": "image/jpeg",
                },
            )
            assert resp.status_code == 400
            assert "Invalid folder category" in resp.json()["detail"]


# -------------------------------------------------------------
# 3. Secure Private Viewing & Deletion Tests
# -------------------------------------------------------------
@pytest.mark.anyio
async def test_presigned_view_generates_signed_get_url():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        test_key = "invoices/2026-10-27/gst_fleet_invoice_1001.pdf"
        resp = await client.get(
            "/api/v1/storage/presigned-view",
            params={"object_key": test_key, "expires_in": 1800},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["object_key"] == test_key
        assert data["expires_in"] == 1800
        view_url = data["view_url"].lower()
        assert "x-amz-signature=" in view_url or "signature=" in view_url
        assert test_key in data["view_url"]


@pytest.mark.anyio
async def test_presigned_view_rejects_path_traversal():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        resp = await client.get(
            "/api/v1/storage/presigned-view",
            params={"object_key": "../../secret/credentials.json"},
        )
        assert resp.status_code == 400
        assert "Directory traversal is prohibited" in resp.json()["detail"]


@pytest.mark.anyio
async def test_storage_deletion_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        test_key = "expense-vouchers/2026-10-27/voucher_void_99.jpg"
        resp = await client.delete(
            "/api/v1/storage/delete",
            params={"object_key": test_key},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["object_key"] == test_key


@pytest.mark.anyio
async def test_storage_status_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        resp = await client.get("/api/v1/storage/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ready"
        assert set(data["allowed_folders"]) == ALLOWED_FOLDERS
        assert set(data["allowed_mime_types"]) == ALLOWED_MIME_TYPES


# -------------------------------------------------------------
# 4. Direct Server-Side Byte Upload Method Test
# -------------------------------------------------------------
def test_direct_byte_upload_generates_key(storage_service):
    pdf_bytes = b"%PDF-1.4 Mock Fleet Credit Invoice for Gujarat Transport"
    key = storage_service.upload_bytes_directly(
        file_bytes=pdf_bytes,
        folder="invoices",
        filename="INV-2026-9001.pdf",
        content_type="application/pdf",
    )
    assert key.startswith("invoices/")
    assert "INV-2026-9001.pdf" in key


# -------------------------------------------------------------
# 5. Database Schema Key Persistence Verification
# -------------------------------------------------------------
def test_database_schema_models_store_object_key_varchar():
    """
    Verifies that all relevant models store relative R2 object_key (VARCHAR)
    and NOT full hardcoded bucket URLs.
    """
    models_to_verify = [
        Expense,
        ShiftHandover,
        TankDipLog,
        FleetInvoice,
        CreditSale,
        ShiftMeterReading,
    ]

    for model in models_to_verify:
        columns = {c.name: c for c in model.__table__.columns}
        assert "object_key" in columns, f"Model {model.__name__} missing object_key column"
        col = columns["object_key"]
        # Column must be VARCHAR/String
        assert hasattr(col.type, "length"), f"{model.__name__}.object_key must be VARCHAR"
        assert col.type.length >= 255, f"{model.__name__}.object_key length too short"
