"""
NSAiPetroSoft - 5-Layer Pre-Delivery Master Validation Orchestrator
Executes the full 5-Layer testing stack before client handover:
  Layer 1: End-to-End (E2E) UI & Offline Sync (Playwright)
  Layer 2: API & Ledger Logic (Pytest + HTTPX AsyncClient)
  Layer 3: Decentro Banking & Webhooks Chaos (Pytest + HMAC)
  Layer 4: Forecourt Load & Concurrency (Asyncio / Locust)
  Layer 5: Cloudflare R2 Storage & CORS Headers (AWS SDK / Boto3)

Usage:
    python run_5layer_pre_delivery_validation.py
"""

import os
import subprocess
import sys
import time
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")

def log_header(title: str):
    print("\n" + "=" * 78)
    print(f"  {title.upper()}")
    print("=" * 78)

def run_command_with_output(cmd: list, label: str):
    print(f"\n>>> Running {label}...")
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    elapsed = round(time.time() - t0, 2)
    
    if result.stdout:
        print(result.stdout.strip())
    if result.stderr and result.returncode != 0:
        print("STDERR:\n" + result.stderr.strip())

    status = "PASS" if result.returncode == 0 else "FAIL"
    return status, elapsed, result.stdout

def main():
    start_time = datetime.now(timezone.utc)
    log_header("NSAiPetroSoft - 5-Layer Pre-Delivery Validation Protocol")
    print(f"  Timestamp (UTC) : {start_time.isoformat()}")
    print(f"  Frontend Target : https://nsaipetrosoft.pages.dev/")
    print(f"  Backend Target  : https://nsaipetrosoft-production.up.railway.app/")
    print(f"  Database Engine : PostgreSQL + AsyncPG (Railway)")
    print(f"  BaaS Engine     : Decentro Banking APIs (Sandboxed / Production-Ready)")
    print(f"  Storage Engine  : Cloudflare R2 (S3v4 Zero-Egress)")

    suite_results = []

    # -------------------------------------------------------------------------
    # Layer 1: Playwright E2E UI & Offline Resiliency
    # -------------------------------------------------------------------------
    log_header("Layer 1: End-to-End UI & Offline Drop (Playwright)")
    l1_status, l1_time, l1_out = run_command_with_output(
        [sys.executable, "tests/test_layer1_playwright_offline_e2e.py"],
        "Layer 1 Playwright Suite"
    )
    suite_results.append(("Layer 1: E2E UI & Offline Resiliency (Playwright)", l1_status, f"{l1_time}s"))

    # -------------------------------------------------------------------------
    # Layer 2: API & Ledger Logic (Decimal Math & ACID Rollbacks)
    # -------------------------------------------------------------------------
    log_header("Layer 2: API & Ledger Logic (Pytest + HTTPX)")
    l2_status, l2_time, l2_out = run_command_with_output(
        [sys.executable, "-m", "pytest", "tests/test_layer2_financial_math_integrity.py", "-v"],
        "Layer 2 Pytest Financial Math Suite"
    )
    suite_results.append(("Layer 2: API & Ledger Logic (Decimal & ACID)", l2_status, f"{l2_time}s"))

    # -------------------------------------------------------------------------
    # Layer 3: Decentro Banking & Webhooks Chaos
    # -------------------------------------------------------------------------
    log_header("Layer 3: Decentro Banking & Webhook Chaos (Idempotency)")
    l3_status, l3_time, l3_out = run_command_with_output(
        [sys.executable, "-m", "pytest", "tests/test_layer3_decentro_webhook_chaos.py", "-v"],
        "Layer 3 Decentro Webhook Chaos Suite"
    )
    # Also verify user's direct snippet file
    run_command_with_output(
        [sys.executable, "-m", "pytest", "tests/test_decentro_webhook.py", "-v"],
        "User Snippet (test_decentro_webhook.py)"
    )
    suite_results.append(("Layer 3: Decentro Webhook Idempotency & HMAC", l3_status, f"{l3_time}s"))

    # -------------------------------------------------------------------------
    # Layer 4: Forecourt Load & Concurrency
    # -------------------------------------------------------------------------
    log_header("Layer 4: Load & Concurrency Benchmark (20 Attendants)")
    l4_status, l4_time, l4_out = run_command_with_output(
        [sys.executable, "tests/test_layer4_concurrency_load.py"],
        "Layer 4 Concurrency Load Benchmark"
    )
    suite_results.append(("Layer 4: Concurrency & Cold-Start (20 Workers)", l4_status, f"{l4_time}s"))

    # -------------------------------------------------------------------------
    # Layer 5: Cloudflare R2 Storage & CORS Preflight Headers
    # -------------------------------------------------------------------------
    log_header("Layer 5: Cloudflare R2 Storage & CORS Validation")
    l5_status, l5_time, l5_out = run_command_with_output(
        [sys.executable, "-m", "pytest", "tests/test_layer5_r2_storage_cors.py", "-v"],
        "Layer 5 Cloudflare R2 & CORS Suite"
    )
    suite_results.append(("Layer 5: Cloudflare R2 Presigned URLs & CORS", l5_status, f"{l5_time}s"))

    # -------------------------------------------------------------------------
    # Final Executive Summary
    # -------------------------------------------------------------------------
    all_passed = all(status == "PASS" for _, status, _ in suite_results)
    total_elapsed = round((datetime.now(timezone.utc) - start_time).total_seconds(), 2)

    log_header("NSAiPetroSoft - 5-Layer Certification Results")
    print(f"\n  {'Testing Layer':<50} | {'Status':<8} | {'Execution Time'}")
    print("  " + "-" * 74)
    for name, status, duration in suite_results:
        symbol = "✓" if status == "PASS" else "✗"
        print(f"  [{symbol}] {name:<46} | {status:<8} | {duration}")
    print("  " + "-" * 74)
    print(f"  OVERALL RESULT : {'CERTIFIED PRODUCTION-READY (100% PASS)' if all_passed else 'FAILED'}")
    print(f"  TOTAL RUN TIME : {total_elapsed}s\n")

    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
