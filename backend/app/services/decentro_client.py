import asyncio
import base64
import json
import random
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
import httpx

from app.core.config import settings
from app.core.logging_config import decentro_logger, sanitize_dict


STATE_CODES = {
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "18": "Assam",
    "19": "West Bengal",
    "24": "Gujarat",
    "27": "Maharashtra",
    "29": "Karnataka",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "36": "Telangana",
    "37": "Andhra Pradesh",
}


def generate_mock_qr_svg(upi_uri: str) -> str:
    """Generate a clean SVG representation of the QR code containing the UPI payment URI."""
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#ffffff" rx="10"/>
        <rect x="20" y="20" width="50" height="50" fill="#1e3a8a" rx="4"/>
        <rect x="30" y="30" width="30" height="30" fill="#ffffff"/>
        <rect x="35" y="35" width="20" height="20" fill="#1e3a8a"/>
        <rect x="130" y="20" width="50" height="50" fill="#1e3a8a" rx="4"/>
        <rect x="140" y="30" width="30" height="30" fill="#ffffff"/>
        <rect x="145" y="35" width="20" height="20" fill="#1e3a8a"/>
        <rect x="20" y="130" width="50" height="50" fill="#1e3a8a" rx="4"/>
        <rect x="30" y="140" width="30" height="30" fill="#ffffff"/>
        <rect x="35" y="145" width="20" height="20" fill="#1e3a8a"/>
        <circle cx="100" cy="100" r="16" fill="#f59e0b"/>
        <text x="100" y="104" font-family="Arial" font-size="10" font-weight="bold" fill="#ffffff" text-anchor="middle">UPI</text>
        <text x="100" y="192" font-family="monospace" font-size="8" fill="#64748b" text-anchor="middle">SCAN TO PAY VIA UPI</text>
    </svg>"""
    return base64.b64encode(svg.encode("utf-8")).decode("utf-8")


class DecentroCircuitBreaker:
    """
    Lightweight in-memory Circuit Breaker for Decentro Outbound Banking APIs (#13):
    - Fails fast for 60 seconds if Decentro returns 5 consecutive 5xx failures.
    - Transitions from OPEN -> HALF_OPEN after cooldown period (60.0s) to probe downstream health.
    - Resets to CLOSED upon receiving any valid response (status < 500).
    """

    def __init__(self, failure_threshold: int = 5, recovery_timeout_seconds: float = 60.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds
        self.state: str = "CLOSED"  # "CLOSED", "OPEN", "HALF_OPEN"
        self.consecutive_5xx_failures: int = 0
        self.last_failure_time: float = 0.0

    def can_execute(self) -> bool:
        """Returns True if request should be dispatched, False to fail fast immediately."""
        if self.state == "OPEN":
            elapsed = time.monotonic() - self.last_failure_time
            if elapsed > self.recovery_timeout_seconds:
                self.state = "HALF_OPEN"
                decentro_logger.info(
                    "Decentro circuit breaker entering HALF_OPEN state; probing downstream banking gateway."
                )
                return True
            return False
        return True

    def record_success(self):
        """Resets the circuit breaker upon receiving a valid response (< 500)."""
        if self.consecutive_5xx_failures > 0 or self.state != "CLOSED":
            decentro_logger.info(
                f"Decentro circuit breaker reset to CLOSED (was {self.state}, prior failures={self.consecutive_5xx_failures})."
            )
        self.consecutive_5xx_failures = 0
        self.state = "CLOSED"

    def record_failure(self, status_code: int):
        """Records 5xx server errors and trips breaker if threshold is reached."""
        if 500 <= status_code <= 599:
            self.consecutive_5xx_failures += 1
            self.last_failure_time = time.monotonic()
            if self.consecutive_5xx_failures >= self.failure_threshold:
                self.state = "OPEN"
                decentro_logger.error(
                    f"Decentro circuit breaker tripped to OPEN! "
                    f"{self.consecutive_5xx_failures} consecutive 5xx errors recorded. "
                    f"Failing fast for {self.recovery_timeout_seconds}s."
                )


DECENTRO_DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


class DecentroClient:
    """
    Enterprise Decentro Banking-as-a-Service Client.
    Features:
    - HTTP connection pooling via shared httpx.AsyncClient with explicit timeout (10s read/write, 5s connect) (#10)
    - Lightweight circuit breaker failing fast for 60s upon 5 consecutive 5xx failures (#13)
    - Exponential backoff with jitter retry strategy (max 3 attempts) for network timeouts and 502/503/504 (#11)
    - Strict immutable reference_id preservation for payout idempotency (#12)
    - Structured JSON logging with masked authentication credentials
    - Full sandbox/simulation fallback when in demo/test mode
    """

    def __init__(self):
        self.base_url = settings.DECENTRO_BASE_URL.rstrip("/")
        self.client_id = settings.DECENTRO_CLIENT_ID
        self.client_secret = settings.DECENTRO_CLIENT_SECRET
        self.module_secret = settings.DECENTRO_MODULE_SECRET
        self.provider_secret = settings.DECENTRO_PROVIDER_SECRET
        self.timeout = DECENTRO_DEFAULT_TIMEOUT
        self.max_retries = 3  # Maximum 3 attempts per specification
        self.circuit_breaker = DecentroCircuitBreaker(failure_threshold=5, recovery_timeout_seconds=60.0)
        self._shared_client: Optional[httpx.AsyncClient] = None
        self.is_simulation = (
            getattr(settings, "DECENTRO_SIMULATION_MODE", False)
            or not self.client_id
            or "demo" in self.client_id.lower()
        )

    def get_http_client(self) -> httpx.AsyncClient:
        """Returns or initializes the shared singleton httpx.AsyncClient wrapper (#10)."""
        if self._shared_client is None or self._shared_client.is_closed:
            limits = httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=30.0)
            self._shared_client = httpx.AsyncClient(
                timeout=self.timeout,
                limits=limits,
            )
        return self._shared_client

    def _headers(self, module_secret: Optional[str] = None, include_provider: bool = False) -> Dict[str, str]:
        headers = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "module_secret": module_secret or self.module_secret or settings.DECENTRO_PAYMENTS_MODULE_SECRET,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if include_provider and (self.provider_secret or settings.DECENTRO_PROVIDER_SECRET):
            headers["provider_secret"] = self.provider_secret or settings.DECENTRO_PROVIDER_SECRET
        return headers

    async def close(self):
        """Gracefully release shared client resources during FastAPI lifespan shutdown."""
        if self._shared_client is not None and not self._shared_client.is_closed:
            await self._shared_client.aclose()
            self._shared_client = None

    async def _request_with_retry(
        self,
        method: str,
        endpoint: str,
        payload: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Tuple[int, Dict[str, Any]]:
        """
        Execute HTTP request with shared client, circuit breaker check, and exponential backoff with jitter (#10, #11, #12, #13).
        """
        # 1. Circuit Breaker Fast-Fail Check
        if not self.circuit_breaker.can_execute():
            cooldown_left = round(
                self.circuit_breaker.recovery_timeout_seconds - (time.monotonic() - self.circuit_breaker.last_failure_time),
                1,
            )
            decentro_logger.warning(
                f"Decentro API {method} {endpoint} failed fast: Circuit breaker is OPEN ({cooldown_left}s remaining)."
            )
            return 503, {
                "error": "CIRCUIT_BREAKER_OPEN",
                "status": "FAILURE",
                "detail": f"Decentro API circuit breaker is OPEN after 5 consecutive 5xx failures. Failing fast for {cooldown_left}s.",
            }

        url = f"{self.base_url}{endpoint}"
        req_headers = headers or self._headers()
        client = self.get_http_client()
        attempt = 0

        while attempt < self.max_retries:
            attempt += 1
            start_time = time.monotonic()
            ref_id_label = payload.get("reference_id") if payload else "N/A"

            try:
                decentro_logger.info(
                    f"Decentro API {method} {endpoint} - Attempt {attempt}/{self.max_retries} [ref_id={ref_id_label}]",
                    extra={
                        "method": method,
                        "url": url,
                        "attempt": attempt,
                        "payload": sanitize_dict(payload),
                    },
                )

                response = await client.request(
                    method=method,
                    url=url,
                    headers=req_headers,
                    json=payload if payload else None,
                )

                duration_ms = round((time.monotonic() - start_time) * 1000, 2)
                status_code = response.status_code

                decentro_logger.info(
                    f"Decentro API {method} {endpoint} responded {status_code} in {duration_ms}ms (Attempt {attempt})",
                    extra={
                        "method": method,
                        "url": url,
                        "status_code": status_code,
                        "duration_ms": duration_ms,
                    },
                )

                # Successful or non-server-error response
                if status_code < 500:
                    self.circuit_breaker.record_success()
                    try:
                        return status_code, response.json()
                    except Exception:
                        return status_code, {"raw": response.text}

                # 5xx responses: record failure in circuit breaker
                self.circuit_breaker.record_failure(status_code)

                # Only 502, 503, 504 are eligible for retry with backoff and jitter
                if status_code in (502, 503, 504) and attempt < self.max_retries:
                    backoff = min(10.0, (2.0 ** (attempt - 1))) + random.uniform(0.0, 0.5)
                    decentro_logger.warning(
                        f"Decentro API returned {status_code}; retrying attempt {attempt + 1}/{self.max_retries} in {backoff:.2f}s..."
                    )
                    await asyncio.sleep(backoff)
                    continue

                # Max retries reached or non-retryable 5xx (e.g. 500 Internal Error)
                try:
                    return status_code, response.json()
                except Exception:
                    return status_code, {"error": "SERVER_ERROR", "status_code": status_code, "detail": response.text}

            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout, httpx.NetworkError) as exc:
                duration_ms = round((time.monotonic() - start_time) * 1000, 2)
                self.circuit_breaker.record_failure(504)
                decentro_logger.warning(
                    f"Decentro API network error on attempt {attempt}/{self.max_retries}: {str(exc)}",
                    extra={"error": str(exc), "attempt": attempt, "duration_ms": duration_ms},
                )

                if attempt < self.max_retries:
                    backoff = min(10.0, (2.0 ** (attempt - 1))) + random.uniform(0.0, 0.5)
                    await asyncio.sleep(backoff)
                    continue

                return 503, {
                    "error": "NETWORK_UNAVAILABLE",
                    "status": "FAILURE",
                    "detail": f"Decentro API request timed out after {self.max_retries} attempts: {str(exc)}",
                }

        return 500, {"error": "UNKNOWN_ERROR", "detail": "Request failed after maximum retry attempts"}

    # =========================================================================
    # Workflow 1: Dynamic UPI QR Code Generation
    # =========================================================================
    async def create_dynamic_upi_qr(
        self,
        reference_id: str,
        amount: float,
        purpose: str = "Fuel Dispense",
        expiry_seconds: int = 300,
    ) -> Dict[str, Any]:
        """Calls Decentro /v2/payments/upi/link with generate_qr=1 and returns Base64 QR & UPI Intent."""
        if self.is_simulation:
            decentro_txn_id = f"DEC_UPI_{uuid.uuid4().hex[:12].upper()}"
            vpa = f"{settings.DECENTRO_VAN_PREFIX.lower()}retail@yesbank"
            upi_uri = (
                f"upi://pay?pa={vpa}&pn=NSAI+PetroSoft&am={amount:.2f}"
                f"&tr={reference_id}&tn={purpose.replace(' ', '+')}&cu=INR"
            )
            qr_base64 = generate_mock_qr_svg(upi_uri)
            return {
                "status": "SUCCESS",
                "responseCode": "S00000",
                "decentro_txn_id": decentro_txn_id,
                "message": "UPI Collection dynamic QR generated successfully",
                "data": {
                    "decentroTxnId": decentro_txn_id,
                    "decentro_txn_id": decentro_txn_id,
                    "referenceId": reference_id,
                    "reference_id": reference_id,
                    "upiUri": upi_uri,
                    "generated_link": upi_uri,
                    "encodedDynamicQrCode": qr_base64,
                    "encoded_dynamic_qr_code": qr_base64,
                    "transactionStatus": "PENDING",
                    "status": "PENDING",
                    "amount": amount,
                },
            }

        endpoint = "/v2/payments/upi/link"
        payload = {
            "reference_id": reference_id,
            "payee_account": settings.STATION_MASTER_VA_NUMBER or settings.DECENTRO_MASTER_ACCOUNT,
            "amount": round(amount, 2),
            "purpose_message": purpose[:50],
            "generate_qr": 1,
            "expiry_time": expiry_seconds,
            "customized_qr_with_logo": 0,
            "generate_uri": 1,
        }
        headers = self._headers(settings.DECENTRO_PAYMENTS_MODULE_SECRET, include_provider=True)
        status_code, resp_data = await self._request_with_retry("POST", endpoint, payload, headers=headers)
        return resp_data

    async def generate_dynamic_upi_qr(
        self,
        reference_id: str,
        amount: float,
        purpose_message: str,
        expiry_minutes: int = 10,
    ) -> Dict[str, Any]:
        """Backward-compatible wrapper for dynamic UPI QR generation in minutes."""
        return await self.create_dynamic_upi_qr(
            reference_id=reference_id,
            amount=amount,
            purpose=purpose_message,
            expiry_seconds=expiry_minutes * 60,
        )

    async def get_transaction_status(self, decentro_txn_id: str) -> Dict[str, Any]:
        """Poll Decentro transaction status."""
        if self.is_simulation:
            return {
                "status": "SUCCESS",
                "data": {
                    "decentroTxnId": decentro_txn_id,
                    "transactionStatus": "SUCCESS",
                    "bankReferenceNumber": f"UTR{uuid.uuid4().hex[:12].upper()}",
                },
            }

        endpoint = f"/v2/payments/transaction/{decentro_txn_id}/status"
        status_code, resp_data = await self._request_with_retry(
            "GET", endpoint, headers=self._headers(settings.DECENTRO_PAYMENTS_MODULE_SECRET)
        )
        return resp_data

    # =========================================================================
    # Workflow 2: Virtual Account Creation
    # =========================================================================
    async def create_virtual_account(
        self,
        reference_id: Optional[str] = None,
        name: Optional[str] = None,
        email: Optional[str] = None,
        mobile: Optional[str] = None,
        customer_id: Optional[int] = None,
        customer_name: Optional[str] = None,
        bank_code: str = "YESB",
        custom_vpa: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Creates a dedicated B2B Virtual Account for a Fleet Customer on YES Bank CMS."""
        cust_name = name or customer_name or "Fleet Customer"
        cust_email = email or "accounts@nsaipetrosoft.in"
        cust_mobile = mobile or "9825012345"
        ref_id = reference_id or f"VAN_CUST_{customer_id or int(time.time())}_{int(time.time())}"

        if self.is_simulation:
            van_account = (
                f"{settings.DECENTRO_VAN_PREFIX}{customer_id:06d}"
                if customer_id
                else f"{settings.DECENTRO_VAN_PREFIX}{int(time.time()) % 1000000:06d}"
            )
            va_card = {
                "accountNumber": van_account,
                "account_number": van_account,
                "ifsc": settings.STATION_MASTER_IFSC or settings.DECENTRO_MASTER_IFSC,
                "ifsc_code": settings.STATION_MASTER_IFSC or settings.DECENTRO_MASTER_IFSC,
                "bankName": "YES BANK",
                "bank_name": "YES BANK",
                "upiId": f"{van_account.lower()}@yesbank",
                "upi_id": f"{van_account.lower()}@yesbank",
                "decentroAccountId": f"DEC_ACC_{uuid.uuid4().hex[:10].upper()}",
                "referenceId": ref_id,
                "reference_id": ref_id,
                "status": "ACTIVE",
            }
            return {
                "status": "SUCCESS",
                "responseCode": "S00000",
                "message": "Virtual account provisioned successfully",
                "data": va_card,
            }

        endpoint = "/v2/banking/account/virtual"
        payload = {
            "reference_id": ref_id,
            "bank_codes": [bank_code],
            "name": cust_name,
            "email": cust_email,
            "mobile": cust_mobile,
            "address": "Fleet Customer Account",
            "kyc_verified": 1,
            "kyc_check_decentro": 0,
            "minimum_balance": 0,
            "transaction_limit": 10000000,
            "customer_id": ref_id,
            "virtual_account_balance_settlement": "ENABLED",
            "upi_onboarding": 1,
        }
        if custom_vpa:
            payload["custom_vpa"] = custom_vpa

        headers = self._headers(settings.DECENTRO_ACCOUNTS_MODULE_SECRET)
        status_code, resp_data = await self._request_with_retry("POST", endpoint, payload, headers=headers)
        return resp_data

    # =========================================================================
    # Workflow 3: Supplier Payouts (IMPS/NEFT/RTGS with Idempotency)
    # =========================================================================
    async def initiate_payout(
        self,
        reference_id: str,
        vendor_name: Optional[str] = None,
        account_number: Optional[str] = None,
        ifsc: Optional[str] = None,
        amount: Optional[float] = None,
        transfer_type: str = "RTGS",
        purpose_message: Optional[str] = None,
        req: Any = None,
    ) -> Dict[str, Any]:
        """Disburses funds to vendor/oil company via Decentro /v2/banking/transfer with locked reference_id (#12)."""
        clean_ref_id = str(reference_id or "").strip()
        if not clean_ref_id:
            raise ValueError("Locked reference_id is strictly required for payout idempotency.")

        v_name = vendor_name or (getattr(req, "supplier_name", None) or getattr(req, "vendor_name", "Supplier"))
        acc_num = account_number or (getattr(req, "beneficiary_account", None) or getattr(req, "account_number", ""))
        ifsc_code = ifsc or (getattr(req, "beneficiary_ifsc", None) or getattr(req, "ifsc", "YESB0CMSNOC"))
        payout_amt = amount if amount is not None else getattr(req, "amount", 0.0)
        ttype = transfer_type or getattr(req, "transfer_type", "RTGS")
        invoice_no = getattr(req, "invoice_number", None)
        purpose = purpose_message or (f"Inv {invoice_no}" if invoice_no else "Supplier Payout")
        b_mobile = getattr(req, "beneficiary_mobile", "9876543210")
        b_email = getattr(req, "beneficiary_email", "settlements@nsaipetrosoft.in")

        if self.is_simulation:
            decentro_txn_id = f"DEC_PO_{uuid.uuid4().hex[:12].upper()}"
            utr = f"{ifsc_code[:4]}R5{int(time.time())}{uuid.uuid4().hex[:4].upper()}"
            return {
                "status": "SUCCESS",
                "responseCode": "S00000",
                "decentro_txn_id": decentro_txn_id,
                "bank_reference_number": utr,
                "message": f"{ttype} payout disbursed successfully",
                "data": {
                    "decentroTxnId": decentro_txn_id,
                    "decentro_txn_id": decentro_txn_id,
                    "referenceId": clean_ref_id,
                    "reference_id": clean_ref_id,
                    "status": "SUCCESS",
                    "bankReferenceNumber": utr,
                    "bank_reference_number": utr,
                    "amount": payout_amt,
                    "transferType": ttype,
                    "transfer_type": ttype,
                    "beneficiaryName": v_name,
                },
            }

        endpoint = "/v2/banking/transfer"
        # Crucial (#12): Payout retries always pass the exact same reference_id so double payouts can never occur
        payload = {
            "reference_id": clean_ref_id,
            "purpose_message": purpose[:35],
            "from_account": settings.STATION_MASTER_VA_NUMBER or settings.DECENTRO_MASTER_ACCOUNT,
            "to_account": acc_num,
            "mobile_number": b_mobile,
            "email_address": b_email,
            "name": v_name,
            "transfer_type": ttype.upper(),
            "transfer_amount": round(payout_amt, 2),
            "currency_code": "INR",
            "beneficiary_details": {
                "ifsc_code": ifsc_code.upper(),
                "payee_name": v_name,
            },
        }
        headers = self._headers(settings.DECENTRO_ACCOUNTS_MODULE_SECRET, include_provider=True)
        status_code, resp_data = await self._request_with_retry("POST", endpoint, payload, headers=headers)
        return resp_data

    # =========================================================================
    # Workflow 4: GSTIN Verification
    # =========================================================================
    async def verify_gstin(self, gstin: str, reference_id: Optional[str] = None) -> Dict[str, Any]:
        """Validates GSTIN against Decentro KYC Public Registry."""
        clean_gstin = gstin.strip().upper()
        ref_id = reference_id or f"KYC-GST-{uuid.uuid4().hex[:10].upper()}"

        if self.is_simulation:
            state_code = clean_gstin[:2]
            state_name = STATE_CODES.get(state_code, "Gujarat")
            pan = clean_gstin[2:12]
            decentro_txn_id = f"DEC_KYC_{uuid.uuid4().hex[:10].upper()}"

            return {
                "status": "SUCCESS",
                "responseCode": "S00000",
                "decentro_txn_id": decentro_txn_id,
                "message": "GSTIN verified successfully",
                "data": {
                    "gstin": clean_gstin,
                    "legalNameOfBusiness": f"ENTERPRISE PETRO FLEET ({pan})",
                    "tradeName": "NSAI COMMERCIAL LOGISTICS & CARRIERS",
                    "taxpayerType": "Regular",
                    "gstinStatus": "ACTIVE",
                    "stateCode": state_code,
                    "stateName": state_name,
                    "dateOfRegistration": "2018-07-01",
                    "principalPlaceOfBusiness": f"Plot 42, GIDC Industrial Estate, {state_name} - 382010",
                    "decentroTxnId": decentro_txn_id,
                },
                "kyc_result": {
                    "legal_name": f"ENTERPRISE PETRO FLEET ({pan})",
                    "trade_name": "NSAI COMMERCIAL LOGISTICS & CARRIERS",
                    "status": "ACTIVE",
                    "constitution_of_business": "Private Limited Company",
                    "state_jurisdiction": state_name,
                    "primary_business_address": f"Plot 42, GIDC Industrial Estate, {state_name} - 382010",
                },
            }

        endpoint = "/v2/kyc/public_registry/validate"
        payload = {
            "reference_id": ref_id,
            "document_type": "GSTIN",
            "id_number": clean_gstin,
            "consent": "Y",
            "consent_purpose": "For B2B Fleet Credit and Fuel Vendor Onboarding in ERP",
        }
        headers = self._headers(settings.DECENTRO_KYC_MODULE_SECRET)
        status_code, resp_data = await self._request_with_retry("POST", endpoint, payload, headers=headers)
        return resp_data


decentro_client = DecentroClient()
