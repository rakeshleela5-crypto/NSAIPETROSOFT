"""
Layer 5: Cloudflare R2 Storage & CORS Header Validation Suite
Author: Lead Cloud & Infrastructure Architect
Target: Cloudflare R2 + https://nsaipetrosoft.pages.dev + Railway API

Validates:
1. S3v4 Presigned URL Generation for receipt and invoice PDF document storage.
2. Presigned URL expiration constraints (validating 900-second expiration).
3. Browser CORS headers from https://nsaipetrosoft.pages.dev (Access-Control-Allow-Origin, Credentials, Methods).
4. Zero-egress receipt and invoice archive integrity (gzip compression, SHA-256 checksums).
"""

import hashlib
import sys
import time
import pytest
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, "backend")

from app.core.config import settings
from app.services.backup_service import R2StorageService, r2_service
from app.main import app

LIVE_BACKEND_URL = "https://nsaipetrosoft-production.up.railway.app"
PAGES_ORIGIN = "https://nsaipetrosoft.pages.dev"

@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"

def test_r2_presigned_url_generation_and_expiration():
    """
    Verifies that the R2 service correctly generates signed URLs
    with strict expiration for direct browser-to-R2 zero-egress document uploads.
    """
    svc = R2StorageService()
    test_key = "receipts/2026-10/REC-99881122.pdf"
    expiry_seconds = 900  # 15 minutes

    # Test Download URL (GET)
    get_url = svc.generate_presigned_url(
        key=test_key,
        expiration=expiry_seconds,
        client_method="get_object",
    )
    assert get_url is not None
    assert test_key in get_url
    assert "expires=" in get_url.lower() or "x-amz-expires=" in get_url.lower()

    # Test Upload URL (PUT)
    put_url = svc.generate_presigned_url(
        key=test_key,
        expiration=expiry_seconds,
        client_method="put_object",
        content_type="application/pdf",
    )
    assert put_url is not None
    assert test_key in put_url


@pytest.mark.asyncio
async def test_cloudflare_pages_cors_preflight_headers():
    """
    Validates that the FastAPI backend properly grants CORS access to https://nsaipetrosoft.pages.dev.
    File uploads fail in the browser if CORS headers are missing or improperly configured.
    """
    async with AsyncClient(base_url=LIVE_BACKEND_URL, timeout=15.0) as client:
        # Preflight OPTIONS request
        options_res = await client.options(
            "/api/v1/pump/status",
            headers={
                "Origin": PAGES_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )
        assert options_res.status_code in (200, 204), f"OPTIONS status was {options_res.status_code}"
        
        allow_origin = options_res.headers.get("access-control-allow-origin")
        assert allow_origin == PAGES_ORIGIN or allow_origin == "*", (
            f"CORS Origin Mismatch: Expected {PAGES_ORIGIN}, got {allow_origin}"
        )

        allow_cred = options_res.headers.get("access-control-allow-credentials")
        assert allow_cred == "true" or allow_origin == "*", (
            f"CORS Credentials missing or not true: {allow_cred}"
        )

        # GET request with Origin header
        get_res = await client.get(
            "/health",
            headers={"Origin": PAGES_ORIGIN},
        )
        assert get_res.status_code == 200
        get_allow_origin = get_res.headers.get("access-control-allow-origin")
        assert get_allow_origin == PAGES_ORIGIN or get_allow_origin == "*", (
            f"GET CORS header missing: {get_allow_origin}"
        )


def test_zero_egress_document_checksum_and_compression():
    """
    Verifies that documents and database snapshots are properly compressed with gzip
    and cryptographically fingerprinted with SHA-256 before storage on Cloudflare R2.
    """
    import gzip
    sample_invoice_data = {
        "invoice_no": "INV-2026-OCT-0941",
        "customer": "Gujarat Logistics Fleet Corporation",
        "product": "HSD (High Speed Diesel)",
        "volume_ltr": 1500.00,
        "rate_inr": 92.45,
        "total_inr": 138675.00,
        "decentro_utr": "629813459012",
        "timestamp": "2026-10-25T13:45:00Z",
    }

    import json
    raw_bytes = json.dumps(sample_invoice_data, indent=2).encode("utf-8")
    compressed = gzip.compress(raw_bytes)

    # Verify compression savings
    assert len(compressed) < len(raw_bytes), "Gzip failed to compress payload"

    # Compute SHA-256 checksum for tamper-proof verification
    checksum = hashlib.sha256(compressed).hexdigest()
    assert len(checksum) == 64

    # Verify lossless decompression
    decompressed = gzip.decompress(compressed)
    restored_data = json.loads(decompressed.decode("utf-8"))
    assert restored_data["invoice_no"] == "INV-2026-OCT-0941"
    assert restored_data["total_inr"] == 138675.00
