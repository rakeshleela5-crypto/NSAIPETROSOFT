"""
NSAiPetroSoft - "Zero-Bottleneck" Master Pre-Delivery Validation Protocol
Executes the comprehensive production testing blueprint across all 8 specialized layers:

  Layer 1: Financial Precision & Hypothesis Property-Based Testing (5,000+ tests, ASTM 53B, Zero Paisa Drift)
  Layer 2: Database Model Integrity (All 31 Tables, Foreign Keys, NUMERIC Precision)
  Layer 3: Decentro Banking & Webhook Chaos (10 Concurrent UTR Storm, Out-of-Order Webhooks, HMAC Tamper Defense)
  Layer 4: FastAPI OpenAPI Schema & Boundary Fuzzing (Negative Quantities, Buffer Overflows, SQLi Injection)
  Layer 5: Forecourt Concurrency & Cold-Start Benchmark (20 Concurrent Attendants on Railway)
  Layer 6: Cloudflare R2 Storage & Zero-Egress CORS Presigned URLs (900s Expiry, Tenant Isolation)
  Layer 7: Playwright Full-DOM Button & Modal Crawler (Monkey Testing on nsaipetrosoft.pages.dev)
  Layer 8: Golden 24-Hour Forecourt Operational Lifecycle E2E (Rates -> Dip -> R2 Invoice -> Shift -> Ledger -> Zero Variance)

Usage:
    python run_5layer_pre_delivery_validation.py
"""

import os
import subprocess
import sys
import time
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
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
    log_header("NSAiPetroSoft - 'Zero-Bottleneck' Pre-Delivery Certification Protocol")
    print(f"  Timestamp (UTC) : {start_time.isoformat()}")
    print(f"  Frontend Target : https://nsaipetrosoft.pages.dev/")
    print(f"  Backend Target  : https://nsaipetrosoft-production.up.railway.app/")
    print(f"  Database Engine : PostgreSQL + AsyncPG (Railway Connection Pooled)")
    print(f"  BaaS Engine     : Decentro Banking APIs (Sandboxed / Production-Ready)")
    print(f"  Storage Engine  : Cloudflare R2 (S3v4 Zero-Egress Storage)")

    suite_results = []

    # -------------------------------------------------------------------------
    # Layer 1: Financial Precision & Hypothesis Property-Based Testing
    # -------------------------------------------------------------------------
    log_header("Layer 1: Financial Precision & Hypothesis Property-Based Testing")
    l1_status, l1_time, _ = run_command_with_output(
        [sys.executable, "-m", "pytest", "tests/test_financial_precision_hypothesis.py", "tests/test_layer2_financial_math_integrity.py", "-v"],
        "Layer 1 Financial Precision & Hypothesis Suite"
    )
    suite_results.append(("Layer 1: Financial Precision & Hypothesis (5,000+ Tests)", l1_status, f"{l1_time}s"))

    # -------------------------------------------------------------------------
    # Layer 2: Complete 31-Table Database Model Integrity
    # -------------------------------------------------------------------------
    log_header("Layer 2: Database Model Integrity (All 31 Tables & Foreign Keys)")
    l2_status, l2_time, _ = run_command_with_output(
        [sys.executable, "-m", "pytest", "tests/test_model_integrity.py", "-v"],
        "Layer 2 Database Model Integrity Suite"
    )
    suite_results.append(("Layer 2: DB Model Integrity (31 Tables & NUMERIC)", l2_status, f"{l2_time}s"))

    # -------------------------------------------------------------------------
    # Layer 3: Decentro Banking & Webhook Chaos Testing
    # -------------------------------------------------------------------------
    log_header("Layer 3: Decentro Banking & Webhook Chaos (Idempotency Replay)")
    l3_status, l3_time, _ = run_command_with_output(
        [sys.executable, "-m", "pytest", "tests/test_decentro_webhook_chaos_extended.py", "tests/test_layer3_decentro_webhook_chaos.py", "-v"],
        "Layer 3 Decentro Webhook Chaos Suite"
    )
    suite_results.append(("Layer 3: Decentro Webhook Chaos & Idempotency", l3_status, f"{l3_time}s"))

    # -------------------------------------------------------------------------
    # Layer 4: FastAPI OpenAPI Schema Validation & Boundary Fuzzing
    # -------------------------------------------------------------------------
    log_header("Layer 4: FastAPI OpenAPI Schema & Boundary Fuzzing")
    l4_status, l4_time, _ = run_command_with_output(
        [sys.executable, "-m", "pytest", "tests/test_schemathesis_fuzz.py", "-v"],
        "Layer 4 OpenAPI Schema & Boundary Fuzzing"
    )
    suite_results.append(("Layer 4: OpenAPI Schema & Fuzzing (0 500 Errors)", l4_status, f"{l4_time}s"))

    # -------------------------------------------------------------------------
    # Layer 5: Forecourt Concurrency & Cold-Start Benchmark
    # -------------------------------------------------------------------------
    log_header("Layer 5: Forecourt Concurrency Benchmark (20 Parallel Attendants)")
    l5_status, l5_time, _ = run_command_with_output(
        [sys.executable, "tests/test_layer4_concurrency_load.py"],
        "Layer 5 Concurrency Load Benchmark"
    )
    suite_results.append(("Layer 5: Railway Concurrency (20 Attendants)", l5_status, f"{l5_time}s"))

    # -------------------------------------------------------------------------
    # Layer 6: Cloudflare R2 Storage & Zero-Egress CORS
    # -------------------------------------------------------------------------
    log_header("Layer 6: Cloudflare R2 Storage & CORS Presigned URLs")
    l6_status, l6_time, _ = run_command_with_output(
        [sys.executable, "-m", "pytest", "tests/test_layer5_r2_storage_cors.py", "-v"],
        "Layer 6 Cloudflare R2 & CORS Suite"
    )
    suite_results.append(("Layer 6: Cloudflare R2 Storage & Presigned URLs", l6_status, f"{l6_time}s"))

    # -------------------------------------------------------------------------
    # Layer 7: Playwright Full-DOM Button & Modal Crawler
    # -------------------------------------------------------------------------
    log_header("Layer 7: Playwright Full-DOM Button & Modal Crawler")
    l7_status, l7_time, _ = run_command_with_output(
        [sys.executable, "tests/test_full_dom_crawler.py"],
        "Layer 7 Playwright Full-DOM Crawler"
    )
    suite_results.append(("Layer 7: Playwright Full-DOM Crawler (Live UI)", l7_status, f"{l7_time}s"))

    # -------------------------------------------------------------------------
    # Layer 8: Golden 24-Hour Forecourt Operational Lifecycle E2E
    # -------------------------------------------------------------------------
    log_header("Layer 8: Golden 24-Hour Forecourt Lifecycle E2E Certification")
    l8_status, l8_time, _ = run_command_with_output(
        [sys.executable, "-m", "pytest", "tests/test_full_day_lifecycle_e2e.py", "-v"],
        "Layer 8 Golden Lifecycle E2E Suite"
    )
    suite_results.append(("Layer 8: Golden 24-Hour Forecourt Lifecycle (ACID)", l8_status, f"{l8_time}s"))

    # -------------------------------------------------------------------------
    # Final Executive Summary
    # -------------------------------------------------------------------------
    all_passed = all(status == "PASS" for _, status, _ in suite_results)
    total_elapsed = round((datetime.now(timezone.utc) - start_time).total_seconds(), 2)

    log_header("NSAiPetroSoft - 'Zero-Bottleneck' Certification Results")
    print(f"\n  {'Testing Layer':<54} | {'Status':<8} | {'Execution Time'}")
    print("  " + "-" * 80)
    for name, status, duration in suite_results:
        symbol = "✓" if status == "PASS" else "✗"
        print(f"  [{symbol}] {name:<50} | {status:<8} | {duration}")
    print("  " + "-" * 80)
    print(f"  OVERALL RESULT : {'CERTIFIED PRODUCTION-READY (100% PASS)' if all_passed else 'FAILED'}")
    print(f"  TOTAL RUN TIME : {total_elapsed}s\n")

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
