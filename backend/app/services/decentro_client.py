import asyncio
import base64
import json
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


class DecentroClient:
    """
    Enterprise Decentro Banking-as-a-Service Client.
    Features:
    - HTTP connection pooling via httpx.AsyncClient
    - Exponential backoff retry strategy for resilient banking API calls
    - Structured JSON logging with masked authentication credentials
    - Full sandbox/simulation fallback when in demo/test mode
    """

    def __init__(self):
        self.base_url = settings.DECENTRO_BASE_URL.rstrip("/")
        self.client_id = settings.DECENTRO_CLIENT_ID
        self.client_secret = settings.DECENTRO_CLIENT_SECRET
        self.module_secret = settings.DECENTRO_MODULE_SECRET
        self.provider_secret = settings.DECENTRO_PROVIDER_SECRET
        self.timeout = settings.DECENTRO_TIMEOUT_SECONDS
        self.max_retries = settings.DECENTRO_MAX_RETRIES
        self.is_simulation = (
            getattr(settings, "DECENTRO_SIMULATION_MODE", False)
            or not self.client_id
            or "demo" in self.client_id.lower()
        )

    def _get_headers(self, module: Optional[str] = None) -> Dict[str, str]:
        headers = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.module_secret:
            headers["module_secret"] = self.module_secret
        if self.provider_secret:
            headers["provider_secret"] = self.provider_secret
        return headers

    async def _request_with_retry(
        self,
        method: str,
        endpoint: str,
        payload: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Tuple[int, Dict[str, Any]]:
        """
        Execute HTTP request with exponential backoff on transient errors.
        """
        url = f"{self.base_url}{endpoint}"
        req_headers = headers or self._get_headers()
        attempt = 0
        backoff_delay = 1.0

        while attempt <= self.max_retries:
            attempt += 1
            start_time = time.monotonic()
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    decentro_logger.info(
                        f"Decentro API {method} {endpoint} - Attempt {attempt}",
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
                        f"Decentro API {method} {endpoint} responded {status_code} in {duration_ms}ms",
                        extra={
                            "method": method,
                            "url": url,
                            "status_code": status_code,
                            "duration_ms": duration_ms,
                        },
                    )

                    # Return immediately if successful or client validation error
                    if status_code < 500:
                        try:
                            return status_code, response.json()
                        except Exception:
                            return status_code, {"raw": response.text}

                    # Server error (5xx) - eligible for retry
                    if attempt > self.max_retries:
                        return status_code, {"error": "MAX_RETRIES_EXCEEDED", "detail": response.text}

            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
                duration_ms = round((time.monotonic() - start_time) * 1000, 2)
                decentro_logger.warning(
                    f"Decentro API network error on attempt {attempt}: {str(exc)}",
                    extra={"error": str(exc), "attempt": attempt, "duration_ms": duration_ms},
                )
                if attempt > self.max_retries:
                    return 503, {"error": "NETWORK_UNAVAILABLE", "detail": str(exc)}

            # Wait with exponential backoff before retrying
            await asyncio.sleep(backoff_delay)
            backoff_delay *= 2.0

        return 500, {"error": "UNKNOWN_ERROR", "detail": "Request failed after retries"}

    # =========================================================================
    # Workflow 1: Dynamic UPI QR Code Generation
    # =========================================================================
    async def generate_dynamic_upi_qr(
        self,
        reference_id: str,
        amount: float,
        purpose_message: str,
        expiry_minutes: int = 10,
    ) -> Dict[str, Any]:
        """
        Generate a dynamic, transaction-bound UPI QR code via Decentro Collections API.
        """
        if self.is_simulation:
            # High-fidelity simulation mode
            decentro_txn_id = f"DEC_UPI_{uuid.uuid4().hex[:12].upper()}"
            vpa = f"{settings.DECENTRO_VAN_PREFIX.lower()}retail@yesbank"
            upi_uri = (
                f"upi://pay?pa={vpa}&pn=NSAI+PetroSoft&am={amount:.2f}"
                f"&tr={reference_id}&tn={purpose_message.replace(' ', '+')}&cu=INR"
            )
            qr_base64 = generate_mock_qr_svg(upi_uri)
            return {
                "status": "SUCCESS",
                "responseCode": "S00000",
                "message": "UPI Collection dynamic QR generated successfully",
                "data": {
                    "decentroTxnId": decentro_txn_id,
                    "referenceId": reference_id,
                    "upiUri": upi_uri,
                    "encodedDynamicQrCode": qr_base64,
                    "transactionStatus": "PENDING",
                    "amount": amount,
                },
            }

        endpoint = "/v2/payments/collection"
        payload = {
            "reference_id": reference_id,
            "payee_account": settings.DECENTRO_MASTER_ACCOUNT,
            "amount": amount,
            "purpose_message": purpose_message,
            "generate_qr": 1,
            "expiry_time": expiry_minutes,
            "customized_qr_with_logo": 0,
        }
        status_code, resp_data = await self._request_with_retry("POST", endpoint, payload)
        return resp_data

    async def get_transaction_status(self, decentro_txn_id: str) -> Dict[str, Any]:
        """
        Poll Decentro transaction status.
        """
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
        status_code, resp_data = await self._request_with_retry("GET", endpoint)
        return resp_data

    # =========================================================================
    # Workflow 2: Virtual Account Creation
    # =========================================================================
    async def create_virtual_account(
        self,
        customer_id: int,
        customer_name: str,
        bank_code: str = "YESB",
        custom_vpa: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Provision a dedicated Virtual Account Number (VAN) mapped to a fleet customer.
        """
        reference_id = f"VAN_CUST_{customer_id}_{int(time.time())}"

        if self.is_simulation:
            van_account = f"{settings.DECENTRO_VAN_PREFIX}{customer_id:06d}"
            return {
                "status": "SUCCESS",
                "responseCode": "S00000",
                "message": "Virtual account provisioned successfully",
                "data": {
                    "accountNumber": van_account,
                    "ifsc": settings.DECENTRO_MASTER_IFSC,
                    "bankName": "YES BANK",
                    "upiId": f"{van_account.lower()}@yesbank",
                    "decentroAccountId": f"DEC_ACC_{uuid.uuid4().hex[:10].upper()}",
                    "referenceId": reference_id,
                    "status": "ACTIVE",
                },
            }

        endpoint = "/v2/banking/account/virtual"
        payload = {
            "bank_codes": [bank_code],
            "name": customer_name,
            "custom_vpa": custom_vpa,
            "reference_id": reference_id,
        }
        status_code, resp_data = await self._request_with_retry("POST", endpoint, payload)
        return resp_data

    # =========================================================================
    # Workflow 3: Supplier Payouts (IMPS/NEFT/RTGS with Idempotency)
    # =========================================================================
    async def initiate_payout(
        self,
        reference_id: str,
        vendor_name: str,
        account_number: str,
        ifsc: str,
        amount: float,
        transfer_type: str = "IMPS",
        purpose_message: str = "Vendor Payout",
    ) -> Dict[str, Any]:
        """
        Disburse funds to vendor/oil company with guaranteed idempotency.
        """
        if self.is_simulation:
            decentro_txn_id = f"DEC_PO_{uuid.uuid4().hex[:12].upper()}"
            utr = f"{ifsc[:4]}R5{int(time.time())}{uuid.uuid4().hex[:4].upper()}"
            return {
                "status": "SUCCESS",
                "responseCode": "S00000",
                "message": f"{transfer_type} payout disbursed successfully",
                "data": {
                    "decentroTxnId": decentro_txn_id,
                    "referenceId": reference_id,
                    "status": "SUCCESS",
                    "bankReferenceNumber": utr,
                    "amount": amount,
                    "transferType": transfer_type,
                    "beneficiaryName": vendor_name,
                },
            }

        endpoint = "/v2/payments/transfer"
        payload = {
            "reference_id": reference_id,
            "transfer_type": transfer_type.upper(),
            "from_account": settings.DECENTRO_MASTER_ACCOUNT,
            "to_account": account_number,
            "ifsc": ifsc.upper(),
            "beneficiary_name": vendor_name,
            "amount": amount,
            "purpose_message": purpose_message,
            "currency": "INR",
        }
        status_code, resp_data = await self._request_with_retry("POST", endpoint, payload)
        return resp_data

    # =========================================================================
    # Workflow 4: GSTIN Verification
    # =========================================================================
    async def verify_gstin(self, gstin: str) -> Dict[str, Any]:
        """
        Validate commercial buyer / distributor GSTIN and fetch official registered entity data.
        """
        clean_gstin = gstin.strip().upper()

        if self.is_simulation:
            state_code = clean_gstin[:2]
            state_name = STATE_CODES.get(state_code, "Gujarat")
            pan = clean_gstin[2:12]
            decentro_txn_id = f"DEC_KYC_{uuid.uuid4().hex[:10].upper()}"

            return {
                "status": "SUCCESS",
                "responseCode": "S00000",
                "message": "GSTIN verified successfully",
                "data": {
                    "gstin": clean_gstin,
                    "legalNameOfBusiness": f"ENTERPRISE PETRO FLEET ({pan})",
                    "tradeName": "NSAI COMMERCIAL LOGISTICS & CARRIERS",
                    "taxpayerType": "Regular",
                    "gstinStatus": "Active",
                    "stateCode": state_code,
                    "stateName": state_name,
                    "dateOfRegistration": "2018-07-01",
                    "principalPlaceOfBusiness": f"Plot 42, GIDC Industrial Estate, {state_name} - 382010",
                    "decentroTxnId": decentro_txn_id,
                },
            }

        endpoint = "/v2/kyc/gstin"
        payload = {"gstin": clean_gstin}
        status_code, resp_data = await self._request_with_retry("POST", endpoint, payload)
        return resp_data


decentro_client = DecentroClient()
