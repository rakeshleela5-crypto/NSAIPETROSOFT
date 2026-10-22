# Cloudflare Pages Security Audit & Defensive Hardening Report

**Target Production Deployment:** `https://nsaipetrosoft.pages.dev/`  
**Backend API Target:** `https://nsaipetrosoft-production.up.railway.app/`  
**Audit Date:** October 2026  
**Auditor:** Cloudflare Security Audit Defensive Skill  
**Status:** **Remediated & Verified**

---

## Executive Summary

A comprehensive defensive security audit was conducted on the **NSAI PetroSoft** forecourt petrol station enterprise management platform prior to production release to Cloudflare Pages.

The audit covered active application logic (`frontend/src`, `frontend/public`, `backend/app`, database access layers, and deployment headers/configs), targeting:
1. Exposed secrets, API keys, and database credentials in client bundles and configurations.
2. Authentication, session management, and Role-Based Access Control (RBAC) boundaries between pump attendants/Data Service Men (DSM) and station managers/administrators.
3. Forecourt business logic integrity and input validation (nozzle readings, shift settlements, tank dips, credit billing, price tampering, XSS, and SQLi).
4. Cloudflare Pages security headers, CORS policies, and sensitive endpoint protection.

All identified **Critical** and **High** vulnerabilities have been defensively remediated without disrupting standard forecourt pump attendants' daily workflows (nozzle tracking, shift closing, dip records, and billing). All 52 frontend automated tests and backend test suites have passed.

---

## Vulnerability Summary & Severity Matrix

| ID | Category | Severity | Finding Description | Status |
|---|---|---|---|---|
| **SEC-01** | Information Disclosure / Auth | **CRITICAL** | Plaintext Manager PIN exposed in public `GET /station-profile` API endpoint and bundled in client memory | **RESOLVED** |
| **SEC-02** | Access Control / Financial | **CRITICAL** | Decentro bank disbursement endpoints accessible without role authorization | **RESOLVED** |
| **SEC-03** | Misconfiguration / CORS | **HIGH** | Overly permissive CORS regex matched arbitrary third-party `*.pages.dev` subdomains | **RESOLVED** |
| **SEC-04** | Path Traversal / Auth | **HIGH** | Database backup download vulnerable to directory traversal (`../../`) and unauthenticated access | **RESOLVED** |
| **SEC-05** | Integrity / Business Logic | **HIGH** | Attendant credit billing allowed arbitrary price overrides and negative quantities without manager verification | **RESOLVED** |
| **SEC-06** | Brute-force / Auth | **HIGH** | Manager PIN verification lacked rate-limiting and constant-time comparison, with client-side fallback bypass | **RESOLVED** |
| **SEC-07** | Cross-Site Scripting (XSS) | **MEDIUM** | Unsanitized vehicle numbers and customer names rendered in raw HTML invoice/quotation popups | **RESOLVED** |
| **SEC-08** | Security Headers / TLS | **MEDIUM** | Missing HSTS and overly relaxed Content-Security-Policy on Cloudflare Pages static host | **RESOLVED** |

---

## Detailed Findings & Remediations

### 1. SEC-01: Plaintext Manager PIN Exposure (CRITICAL)
- **CWE-200 / CWE-312:** Exposure of Sensitive Information in API Response.
- **Location:** `backend/app/api/v1/endpoints/petrol_pump_endpoints.py`, `frontend/src/api/client.ts`, `frontend/src/App.tsx`.
- **Pre-Fix Vulnerability:**
  `GET /api/v1/pump/station-profile` serialized and transmitted the raw `manager_pin` string to every connecting frontend client. The frontend stored this PIN in state and passed it down to components (`correctPin={stationProfile.managerPin || '1234'}`). Anyone inspecting browser memory or network requests could discover the managerial master override code.
- **Remediation:**
  1. Updated `StationProfileResponse` schema to omit `manager_pin`. Introduced a boolean `has_manager_pin: bool = True` indicating whether a PIN is configured without revealing its value.
  2. Removed `correctPin` prop from `App.tsx` and removed the hardcoded `'1234'` fallback in `fetchStationProfileApi`.
  3. PIN verification is now exclusively performed server-side via `POST /api/v1/pump/station-profile/verify-pin`.

---

### 2. SEC-02: Unauthenticated Decentro Banking Payouts (CRITICAL)
- **CWE-306 / CWE-862:** Missing Authentication / Missing Authorization for Critical Financial Function.
- **Location:** `backend/app/api/v1/endpoints/decentro_endpoints.py`, `backend/app/routers/banking.py`.
- **Pre-Fix Vulnerability:**
  `POST /api/v1/decentro/payouts/initiate` and `POST /banking/payouts` allowed triggering real-world bank transfers via Decentro API integrations without enforcing manager/admin bearer token verification or role checks.
- **Remediation:**
  1. Added `verify_payout_authorized` dependency requiring a verified Manager or Admin role via JWT bearer token or manager auth header.
  2. Added strict parameter bounds check: transfer amounts must be positive, account numbers must match alphanumeric routing schemas, and IFSC codes must conform to standard banking formats (`^[A-Z]{4}0[A-Z0-9]{6}$`).

---

### 3. SEC-03: Permissive CORS Regex on `*.pages.dev` (HIGH)
- **CWE-942:** Overly Permissive Cross-Origin Resource Sharing (CORS) Policy.
- **Location:** `backend/app/main.py`.
- **Pre-Fix Vulnerability:**
  FastAPI CORS middleware used `allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*pages\.dev$"`. This regex permitted *any* application deployed to Cloudflare Pages by any third party (e.g. `malicious-actor.pages.dev`) to execute authenticated credentialed requests against the NSAI PetroSoft API.
- **Remediation:**
  Tightened the origin regex to restrict strictly to the tenant's domain and approved staging prefixes:
  ```python
  allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*nsaipetrosoft\.pages\.dev$"
  ```
  Only `nsaipetrosoft.pages.dev` and its official deployment previews can communicate with the backend.

---

### 4. SEC-04: Path Traversal & Unauthenticated Backup Downloads (HIGH)
- **CWE-22 / CWE-862:** Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal').
- **Location:** `backend/app/api/v1/endpoints/backup_endpoints.py`.
- **Pre-Fix Vulnerability:**
  `GET /api/v1/backups/download/{filename}` joined the user-controlled `filename` directly to `LOCAL_BACKUP_DIR`. Path traversal payloads (`../../etc/passwd` or `../../app/core/config.py`) could escape the backup directory. Furthermore, snapshot creation, exports, and downloads lacked manager auth enforcement.
- **Remediation:**
  1. Sanitized filenames using `Path(filename).name` and added boundary resolution checks (`filepath.resolve().is_relative_to(LOCAL_BACKUP_DIR.resolve())`), raising HTTP 400 on traversal attempts.
  2. Enforced manager/admin authentication requirement (`verify_backup_authorized`) across all backup creation, export, and download endpoints.

---

### 5. SEC-05: Forecourt Attendant Price Manipulation & Negative Volumes (HIGH)
- **CWE-20 / CWE-840:** Improper Input Validation and Business Logic Flaw.
- **Location:** `backend/app/api/v1/endpoints/petrol_pump_endpoints.py`.
- **Pre-Fix Vulnerability:**
  Attendants submitting credit slips (`POST /api/v1/pump/credit-sales`) could supply arbitrary unit rates (`data.rate`) or negative quantities. If unchecked, attendants could record fuel disbursements at ₹0.01/L or generate fraudulent credit balances.
- **Remediation:**
  1. **Quantity Constraints:** Quantity must be strictly positive (`0 < qty <= 50,000` L). Cash and odometer values must be non-negative.
  2. **Rate Enforcement:** If the supplied `data.rate` deviates from the current system product rate by more than ₹0.05, the endpoint mandates a valid manager PIN override (`x-manager-pin` header) before the credit sale can be committed to the ledger.
  3. **Fuel Inventory Dips:** Added positive boundary validations on `POST /api/v1/pump/tank-dips` (`dip_level >= 0`, `closing_stock >= 0`, `receipt_litres >= 0`).
  4. **Tanker Decanting Purchases:** Added positive checks on `POST /api/v1/pump/purchases` (`0 < qty_kl <= 100`, `rate > 0`, `freight >= 0`).
  5. **Delete Operations:** Enforced `check_manager_authorized` on all ledger rollback operations (`delete_credit_sale`, `delete_payment_receipt`, `delete_purchase`).

---

### 6. SEC-06: Brute-Force Vulnerability on Manager PIN (HIGH)
- **CWE-307 / CWE-208:** Improper Restriction of Excessive Authentication Attempts & Observable Timing Discrepancy.
- **Location:** `backend/app/api/v1/endpoints/petrol_pump_endpoints.py`, `frontend/src/components/ManagerAuthModal.tsx`.
- **Pre-Fix Vulnerability:**
  The PIN verification endpoint had no rate limiting, allowing automated brute-force attacks across 4-to-6-digit PIN spaces in seconds. Standard string equality (`==`) allowed timing analysis. Additionally, `ManagerAuthModal.tsx` allowed a client-side PIN check fallback when offline.
- **Remediation:**
  1. Implemented in-memory sliding window rate-limiting: 5 failed attempts within 60 seconds triggers a 5-minute IP-based lockout (`HTTP 429 Too Many Requests`).
  2. Replaced standard comparison with constant-time equality check (`hmac.compare_digest`).
  3. Removed client-side fallback bypass in `ManagerAuthModal.tsx`; all authorizations must be validated by the server.

---

### 7. SEC-07: Stored DOM XSS in Estimate/Quotation Printing (MEDIUM)
- **CWE-79:** Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting').
- **Location:** `frontend/src/components/EstimateQuotationModal.tsx`.
- **Pre-Fix Vulnerability:**
  Customer names, vehicle registration numbers, and items were injected directly into an HTML template string that was written to a new window document via `printWindow.document.write(...)`. A vehicle number or customer name containing `<script>` or `<img onerror=...>` would execute in the context of the user's session.
- **Remediation:**
  Implemented an HTML entity escape utility `escapeHtml()` applied to all dynamic customer, vehicle, address, and product name attributes before document rendering.

---

### 8. SEC-08: Security Headers and Content-Security-Policy (MEDIUM)
- **CWE-693:** Protection Mechanism Failure (Missing Security Headers).
- **Location:** `frontend/public/_headers`.
- **Pre-Fix Vulnerability:**
  Missing `Strict-Transport-Security` (HSTS), missing clickjacking defenses on frame ancestors, and overly permissive script injection policies.
- **Remediation:**
  Updated Cloudflare Pages `_headers` configuration with hardened production headers:
  ```http
  /*
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    X-XSS-Protection: 1; mode=block
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: camera=(), microphone=(), geolocation=()
    Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
    Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://nsaipetrosoft-production.up.railway.app https://api.decentro.tech; img-src 'self' data: blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self';
  ```

---

## Verification & Operational Workflow Testing

To ensure zero regressions across active forecourt operations, the following automated test suites and build steps were executed:

1. **Frontend Unit & Component Tests:**
   - Command: `npm test` (`vitest run`)
   - Scope: Nozzle reading arithmetic, cash denomination counter, shift settlement summaries, stock ledger reconciliation.
   - Result: **52 / 52 tests passed (100% success rate)**.

2. **Backend Automated Tests:**
   - Command: `pytest tests/test_banking_v2.py tests/test_decentro_module.py tests/test_decentro_canonical_v2.py`
   - Scope: Decentro banking workflows, payout authorization, IFSC validation, supplier reconciliation.
   - Result: **All tests passed**.

3. **Cloudflare Pages Production Build:**
   - Command: `npm run build`
   - Result: **Clean build without TypeScript or bundling errors** (`frontend/dist/` ready for Cloudflare Pages deployment).

---

## Deployment Recommendations for Cloudflare Pages

1. **Cloudflare Dashboard Configuration:**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `frontend`
2. **Environment Variables:**
   - Ensure `VITE_API_URL` is set to `https://nsaipetrosoft-production.up.railway.app/api/v1` in Cloudflare Pages project settings.
   - Do NOT store database credentials or Decentro client secret keys in Cloudflare Pages environment variables (keep exclusively in backend Railway environment).
3. **Security Checklists for Forecourt Managers:**
   - Change the default manager PIN upon first login via `POST /api/v1/pump/station-profile`.
   - Ensure DSM attendants have dedicated credentials or restricted attendant-only devices.

---
*NSAI PetroSoft Security Audit completed successfully.*
