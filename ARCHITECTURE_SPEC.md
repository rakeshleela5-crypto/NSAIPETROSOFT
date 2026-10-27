# NSAIPETROSOFT — Production Architecture & Hardening Specification (8 Modules)
## Project: NSAIPETROSOFT Cloud Petrol Pump ERP & Fuel Management System
## Production URLs:
- **Frontend (Cloudflare Pages)**: `https://nsaipetrosoft.pages.dev`
- **Backend (Railway)**: `https://nsaipetrosoft-production.up.railway.app`
- **Database (Railway Managed PostgreSQL)**: Relational Engine with asyncpg driver
- **Object Storage (Cloudflare R2)**: Forecourt documents, invoices, density receipts & automated database dumps

---

## Architectural Principles & Strict Constraints
1. **Clean Stack Isolation**: Keep all services strictly within **FastAPI + SQLAlchemy Async + PostgreSQL (Railway) | Cloudflare R2 | React (Vite / Cloudflare Pages)**.
2. **Zero Bloat**: Do NOT introduce external infrastructure bloat such as Kubernetes, Redis clusters, Apache Kafka, RabbitMQ, or multi-database sharding. Keep asynchronous queuing and caching lightweight, in-memory, or PostgreSQL table-backed.
3. **Financial & Regulatory Integrity**: Zero data loss, zero negative stock glitches on fuel tanks, zero un-reconciled meter jumps, and strict audit trails for all tank dip variances, cash shortages, and fleet credit billing.
4. **Zero Placeholder Code**: Every phase must contain 100% production-ready code with complete error handling and zero `TODO` or `pass` placeholders.

---

## 8 Production Hardening Modules

### MODULE 1: Banking-as-a-Service, Decentro Webhooks & Financial Integrity
1. **Idempotency Keys**:
   - PostgreSQL table `idempotency_keys` (`key VARCHAR(128) PRIMARY KEY`, `endpoint VARCHAR`, `request_hash VARCHAR`, `response_status INT`, `response_body JSONB`, `status VARCHAR(50)`, `created_at TIMESTAMPTZ`, `expires_at TIMESTAMPTZ`).
   - Enforce `X-Idempotency-Key` on all fleet credit sale invoices, Decentro dynamic UPI QR generations, payout disbursements, and UTR reconciliations.
   - Pass deterministic `reference_id` (e.g. `NSAI-SHIFT-{shift_id}-{timestamp}` or `NSAI-FLEET-{invoice_id}`) to prevent double-charges.
2. **Timeouts, Retries, Exponential Backoff & Circuit Breaker**:
   - Wrap outbound Decentro API calls with explicit timeouts (`connect=5.0s`, `read=10.0s`).
   - Use `tenacity` exponential backoff retries strictly on idempotent queries and safe reads.
   - Implement an in-process Circuit Breaker: trips to `OPEN` if 5 consecutive 5xx/timeout errors occur within 60s, holds for 120s, and returns fallback flag (`decentro_degraded: true`) so forecourt POS gracefully defaults to Static UPI QR / Cash settlement.
3. **HMAC Webhook Verification & Dead Letter Events**:
   - Verify HMAC-SHA256 signature headers on `/api/v1/banking/webhook` against `DECENTRO_WEBHOOK_SECRET`.
   - Prevent duplicate credits via row locking and transaction deduplication.
   - Capture invalid or unhandled webhooks into `dead_letter_events` (`status = 'PENDING_REPLAY'`) with admin replay endpoints.

---

### MODULE 2: Nozzle Totalizers, Underground Fuel Stock & Concurrency Control
1. **Pessimistic Row Locking (`with_for_update()`)**:
   - Wrap shift finalization, nozzle meter closure, and tank dip adjustments inside `async with db.begin():` and acquire row-level locks on affected `Tank`, `Nozzle`, and `Customer` credit balances.
2. **Deterministic Lock Ordering**:
   - Sort nozzle IDs and tank IDs in ascending order (`sorted(tank_ids)`) prior to acquiring locks to completely eliminate circular wait PostgreSQL deadlocks.
3. **Optimistic Locking (`version_id`)**:
   - Implement `version_id = Column(Integer, nullable=False, default=1)` on `RateHistory` (Fuel Rates), `TankDipEntry` / `TankDipLog` (Tank Stock & Dips), and `Customer` / `FleetCustomer` (Ledgers). Check version upon update and raise `409 Conflict` if modified concurrently.
4. **N+1 Query Elimination**:
   - Enforce eager loading (`selectinload`) across shifts, nozzle meter readings, tank dip entries, and fleet sales to prevent query cascades.

---

### MODULE 3: Database Performance, Connection Pooling & Migrations
1. **SQLAlchemy Async Connection Pooling**:
   - Configure async engine with `pool_size=20`, `max_overflow=10`, `pool_timeout=30`, `pool_recycle=1800`, and `pool_pre_ping=True` to withstand Railway PostgreSQL idle connection drops.
   - Ensure `get_db` yields an isolated session per request and always closes it in a `finally` block.
2. **Timezone Standardization & Server-Side Timestamps**:
   - Standardize all timestamp columns across all models to `DateTime(timezone=True)` with `server_default=func.now()` and convert to `Asia/Kolkata` (IST) at UI serialization layer to prevent client clock skew.
3. **Strategic Composite & B-Tree Indexing**:
   - Index high-frequency queries:
     - `shifts(date, status)`
     - `credit_sales(customer_id, created_at DESC)`
     - `payment_receipts(customer_id, created_at DESC)`
     - `payment_receipts(reference_no)`
     - `tank_dip_entries(tank_id, created_at DESC)`
     - `tank_dip_entries(date)`
4. **Version-Controlled Alembic Migrations**:
   - Maintain clean, sequential Alembic migrations for all schema adjustments and integrate programmatic check into startup.

---

### MODULE 4: Cloudflare R2 Storage, Edge Caching & Offline-First POS
1. **Cloudflare R2 Direct Archival & Pre-Signed URLs**:
   - Stream density hydrometer photos, attendant shift closing meter slips, tanker delivery challans, and customer fleet invoices directly to Cloudflare R2 using AWS S3v4 signatures.
   - Use short-lived Pre-Signed GET URLs (15-60 mins) for confidential financial slips and long-lived immutable cache headers for static assets.
2. **Offline-First Forecourt POS (Dexie.js)**:
   - Cache active nozzles, fuel rates, and fleet customers in client IndexedDB.
   - Provide `/api/v1/catalog/sync?since={timestamp}` delta sync endpoint so cashier devices can continue printing vehicle slips during broadband dropouts and auto-sync when back online.
3. **Real-Time WebSockets**:
   - Broadcast `PAYMENT_SUCCESS`, `METER_UPDATE`, and `TANK_ALERT` events across active cashier terminals.

---

### MODULE 5: Thermal Slips, Meter Reading Studio & Memory Safety
1. **Zero Memory Leaks & Buffer Lifecycle**:
   - Explicitly manage `io.BytesIO()`, PDF generation buffers, and image transformations inside `try...finally` blocks calling `.close()`.
2. **Backpressure & Batch Limits**:
   - Enforce backpressure caps on bulk vehicle slip printing (max 100 thermal slips per synchronous call) and offload larger monthly statements to asynchronous background tasks saving to R2.

---

### MODULE 6: Security, RBAC & API Hygiene
1. **JWT Rotation & Role-Based Access Control**:
   - Short-lived JWT Access Tokens (30 mins) + database-backed Refresh Token rotation (7 days) with instant revocation.
   - Strict RBAC: `STATION_OWNER`, `MANAGER`, `CASHIER`, `FORECOURT_ATTENDANT`.
   - Restrict purchase invoice cost rates, manual meter resets, and credit limit overrides strictly to `STATION_OWNER` and `MANAGER`.
2. **Input Sanitization, Rate Limiting & CORS**:
   - Lock CORS strictly to `https://nsaipetrosoft.pages.dev` and local dev hosts.
   - Apply `slowapi` rate limits on login routes and webhook receivers.
   - Validate and sanitize all text inputs against XSS and restrict outbound requests strictly to whitelisted domains (`*.decentro.tech`, `*.r2.cloudflarestorage.com`).

---

### MODULE 7: Automated Backups, Cron Jobs & Disaster Recovery
1. **Automated Daily R2 Database Backups**:
   - Nightly scheduled cron at 02:30 AM IST: executes `pg_dump --format=custom`, compresses and uploads to `backups/db/nsai_backup_YYYY_MM_DD.dump` on Cloudflare R2, automatically pruning backups older than 30 days.
   - Provide disaster recovery restore script `scripts/restore_from_r2.py` capable of complete database restoration in under 5 minutes.
2. **Health Probe & Dynamic Feature Flags**:
   - Implement `GET /api/v1/health` verifying PostgreSQL connection (`SELECT 1`) and Cloudflare R2 bucket accessibility, returning 200 OK with latency metrics.
   - Dynamic `feature_flags` table to toggle Decentro live mode, automatic meter totalizer sync, and strict density checks without redeploying.

---

### MODULE 8: Forecourt Audit Trail, Structured Logging & Incident Alerts
1. **Immutable Financial & Variance Audit Logs**:
   - Append-only `financial_audit_logs` recording actor ID, role, action, entity, before/after JSON states, IP address, and request ID.
   - Log all rate revisions, pump meter roll-overs, cash shortage write-offs, and tank dip adjustments.
2. **Structured JSON Tracing & Real-time Alerts**:
   - Middleware assigning `X-Request-ID` and `X-Execution-Time-Ms` to all requests.
   - Flag any forecourt query taking >500ms as `[SLOW_REQUEST]`.
   - Outbound alert dispatcher triggering notifications upon unhandled 500 exceptions, failed fuel payouts, or critical underground tank water contamination alerts.
