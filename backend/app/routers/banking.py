import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging_config import decentro_logger
from app.core.security_decentro import verify_decentro_webhook_signature
from app.db.session import get_db
from app.models.banking import (
    CollectionLedgerEntry,
    DecentroWebhookAudit,
    FleetCustomer,
    FleetVirtualAccount,
    GstinVerificationRecord,
    NozzleUPITransaction,
    SupplierPayout,
    SupplierPayoutOrder,
    TxnStatus,
    UpiQrTransaction,
    VirtualAccountWebhookLog,
)
from app.models.decentro import DecentroTransaction
from app.models.petrol_pump import BankAccount, CreditSale, Customer, PaymentReceipt
from app.services.decentro_client import decentro_client

banking_router = APIRouter(prefix="/banking", tags=["Decentro API Banking V2"])
webhooks_router = APIRouter(prefix="/webhooks/decentro", tags=["Decentro Banking Webhooks"])
router = APIRouter()


# =============================================================================
# Request & Response Schemas
# =============================================================================
class DynamicUpiQrRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Amount in INR to collect via Dynamic UPI QR")
    shift_id: Optional[Any] = Field(None, description="Active shift ID or code e.g. 'SHIFT-20261020-A'")
    nozzle_id: Optional[Any] = Field(None, description="Dispenser nozzle ID or code e.g. 'NOZZLE-MPD1-HSD2'")
    attendant_id: Optional[str] = Field("EMP-101", description="Forecourt Attendant ID")
    fuel_type: Optional[str] = Field("HSD", description="Dispensed Fuel Type (MS, HSD, CNG, XP95)")
    liters_dispensed: Optional[float] = Field(None, description="Dispensed volume in Liters")
    lane_id: Optional[str] = Field(None, description="Forecourt Lane/Island identifier e.g. 'LANE-1'")
    bill_no: Optional[str] = Field(None, description="ERP Bill or Slip Number")
    purpose_message: Optional[str] = Field(None, max_length=255)
    expiry_minutes: Optional[int] = Field(default=10, ge=1, le=60)
    expiry_seconds: Optional[int] = Field(default=None, ge=60, le=1800)
    reference_id: Optional[str] = Field(None, description="Custom reference ID")


class DynamicUpiQrResponse(BaseModel):
    reference_id: str
    decentro_txn_id: Optional[str] = None
    amount: float
    status: str
    upi_uri: str
    qr_base64: Optional[str] = None
    qr_code_base64: Optional[str] = None
    shift_id: Optional[Any] = None
    nozzle_id: Optional[Any] = None
    lane_id: Optional[str] = None
    bill_no: Optional[str] = None
    created_at: datetime
    message: str = "Dynamic UPI QR generated successfully"


GenerateNozzleQRRequest = DynamicUpiQrRequest
NozzleQRResponse = DynamicUpiQrResponse


class FleetVirtualAccountCreateRequest(BaseModel):
    customer_id: Optional[int] = Field(None, description="ERP Customer ID to map dedicated virtual account")
    business_name: Optional[str] = Field(None, description="Fleet commercial entity name")
    gstin: Optional[str] = Field(None, min_length=15, max_length=15)
    contact_phone: Optional[str] = Field(None)
    contact_email: Optional[str] = Field(None)
    credit_limit: Optional[float] = Field(default=500000.0, ge=0)
    bank_code: str = Field(default="YESB", description="Bank partner code e.g. 'YESB', 'ICIC'")
    custom_vpa: Optional[str] = Field(None, description="Optional custom UPI alias")


class FleetVirtualAccountResponse(BaseModel):
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    business_name: Optional[str] = None
    account_number: str
    virtual_account_number: Optional[str] = None
    ifsc: str
    virtual_account_ifsc: Optional[str] = None
    bank_name: str
    upi_id: Optional[str] = None
    virtual_account_upi_id: Optional[str] = None
    credit_limit: Optional[float] = 0.0
    status: str
    created_at: datetime


CreateFleetVARequest = FleetVirtualAccountCreateRequest


class SupplierPayoutCreateRequest(BaseModel):
    supplier_name: Optional[str] = Field(None, description="Supplier / OMC Name (e.g. 'IOCL')")
    vendor_name: Optional[str] = Field(None, description="Vendor Name")
    supplier_gstin: Optional[str] = Field(None)
    invoice_number: Optional[str] = Field(None)
    beneficiary_account: Optional[str] = Field(None, description="Beneficiary Bank Account Number")
    account_number: Optional[str] = Field(None, description="Beneficiary Bank Account Number")
    beneficiary_ifsc: Optional[str] = Field(None, description="Beneficiary Bank IFSC Code")
    ifsc: Optional[str] = Field(None, description="Beneficiary Bank IFSC Code")
    beneficiary_email: Optional[str] = Field(default="settlements@nsaipetrosoft.in")
    beneficiary_mobile: Optional[str] = Field(default="9876543210")
    amount: float = Field(..., gt=0, description="Payout amount in INR")
    transfer_type: str = Field(default="RTGS", description="RTGS, NEFT, or IMPS")
    purpose_message: Optional[str] = Field(None, max_length=255)
    idempotency_key: Optional[str] = Field(
        None,
        max_length=100,
        description="Client-generated unique idempotency token to eliminate duplicate transfers",
    )

    @field_validator("transfer_type")
    @classmethod
    def validate_transfer_type(cls, v: str) -> str:
        clean = v.strip().upper()
        if clean not in {"RTGS", "NEFT", "IMPS", "UPI"}:
            raise ValueError("transfer_type must be RTGS, NEFT, IMPS, or UPI")
        return clean


class SupplierPayoutResponse(BaseModel):
    reference_id: str
    idempotency_key: Optional[str] = None
    decentro_txn_id: Optional[str] = None
    vendor_name: Optional[str] = None
    supplier_name: Optional[str] = None
    amount: float
    transfer_type: str
    status: str
    bank_reference_number: Optional[str] = None
    bank_utr: Optional[str] = None
    created_at: datetime
    message: str


SupplierPayoutRequest = SupplierPayoutCreateRequest


class GstinKycRequest(BaseModel):
    gstin: str = Field(..., min_length=15, max_length=15, description="15-character GSTIN")
    consent: bool = Field(default=True, description="Explicit user consent for KYC lookup")
    customer_id: Optional[int] = Field(None, description="Optional customer ID to auto-populate")
    auto_populate: bool = Field(default=True, description="Whether to update customer profile with verified details")


class GstinKycResponse(BaseModel):
    gstin: str
    legal_name: Optional[str] = None
    trade_name: Optional[str] = None
    taxpayer_type: Optional[str] = None
    constitution_of_business: Optional[str] = None
    state_jurisdiction: Optional[str] = None
    state_code: Optional[str] = None
    registration_status: str = "ACTIVE"
    address: Optional[str] = None
    primary_address: Optional[str] = None
    customer_updated: bool = False
    decentro_txn_id: Optional[str] = None
    message: str


GSTINVerifyRequest = GstinKycRequest


# =============================================================================
# 1. Nozzle & Shift Dynamic UPI QR Code Generation & SSE
# =============================================================================
@banking_router.post(
    "/upi-qr",
    response_model=DynamicUpiQrResponse,
    summary="Generate Nozzle/Shift Dynamic UPI QR Code",
    description="Generates a unique dynamic UPI QR code linked to the station collection virtual account.",
)
async def create_dynamic_upi_qr(
    req: DynamicUpiQrRequest,
    db: AsyncSession = Depends(get_db),
):
    lane_slug = (req.lane_id or "LANE").replace(" ", "_").upper()
    nozzle_slug = str(req.nozzle_id or lane_slug).replace(" ", "_").upper()
    ref_id = req.reference_id or f"NOZ-{nozzle_slug}-{uuid.uuid4().hex[:8].upper()}"

    expiry_seconds = req.expiry_seconds or ((req.expiry_minutes or 10) * 60)
    shift_str = str(req.shift_id or "SHIFT-A")
    nozzle_str = str(req.nozzle_id or "NOZZLE-01")
    attendant_str = str(req.attendant_id or "EMP-101")
    fuel_str = str(req.fuel_type or "HSD")
    purpose = req.purpose_message or f"Fuel {fuel_str} {nozzle_str} Shift {shift_str}"

    # Call Decentro API
    api_resp = await decentro_client.create_dynamic_upi_qr(
        reference_id=ref_id,
        amount=req.amount,
        purpose=purpose,
        expiry_seconds=expiry_seconds,
    )

    data = api_resp.get("data", {})
    decentro_txn_id = api_resp.get("decentro_txn_id") or data.get("decentroTxnId") or data.get("decentro_txn_id")
    upi_uri = data.get("upiUri") or data.get("generated_link") or ""
    qr_code_base64 = data.get("encodedDynamicQrCode") or data.get("encoded_dynamic_qr_code")
    txn_status = data.get("transactionStatus") or data.get("status") or "PENDING"

    # Persist in SQLModel NozzleUPITransaction table
    noz_txn = NozzleUPITransaction(
        reference_id=ref_id,
        decentro_txn_id=decentro_txn_id,
        shift_id=shift_str,
        nozzle_id=nozzle_str,
        attendant_id=attendant_str,
        fuel_type=fuel_str,
        liters_dispensed=req.liters_dispensed,
        amount=req.amount,
        qr_base64=qr_code_base64,
        upi_uri=upi_uri,
        status=TxnStatus.PENDING,
    )
    db.add(noz_txn)

    # Persist in SQLModel UpiQrTransaction table (backward compatibility)
    txn = UpiQrTransaction(
        reference_id=ref_id,
        decentro_txn_id=decentro_txn_id,
        shift_id=int(req.shift_id) if str(req.shift_id).isdigit() else None,
        nozzle_id=int(req.nozzle_id) if str(req.nozzle_id).isdigit() else None,
        lane_id=req.lane_id or nozzle_str,
        bill_no=req.bill_no,
        amount=req.amount,
        status=txn_status,
        upi_uri=upi_uri,
        qr_code_base64=qr_code_base64,
    )
    db.add(txn)

    # Master audit log
    master_txn = DecentroTransaction(
        reference_id=ref_id,
        decentro_txn_id=decentro_txn_id,
        transaction_type="UPI_QR",
        amount=req.amount,
        status=txn_status,
        upi_uri=upi_uri,
        qr_code_base64=qr_code_base64,
        shift_id=shift_str,
        nozzle_id=nozzle_str,
        lane_id=req.lane_id or nozzle_str,
        bill_no=req.bill_no,
        request_payload=json.dumps(req.model_dump(), default=str),
        response_payload=json.dumps(api_resp, default=str),
    )
    db.add(master_txn)
    await db.commit()
    await db.refresh(noz_txn)
    await db.refresh(txn)

    decentro_logger.info(
        f"Forecourt Dynamic UPI QR generated: {ref_id} - INR {req.amount:.2f}",
        extra={"reference_id": ref_id, "amount": req.amount, "nozzle_id": nozzle_str},
    )

    return DynamicUpiQrResponse(
        reference_id=noz_txn.reference_id,
        decentro_txn_id=noz_txn.decentro_txn_id,
        amount=noz_txn.amount,
        status=noz_txn.status.value if hasattr(noz_txn.status, "value") else str(noz_txn.status),
        upi_uri=noz_txn.upi_uri or "",
        qr_base64=noz_txn.qr_base64,
        qr_code_base64=noz_txn.qr_base64,
        shift_id=noz_txn.shift_id,
        nozzle_id=noz_txn.nozzle_id,
        lane_id=req.lane_id,
        bill_no=req.bill_no,
        created_at=noz_txn.created_at,
        message="Dynamic UPI QR generated successfully",
    )


@banking_router.get(
    "/upi-qr/{reference_id}/status",
    summary="Poll Nozzle Dynamic UPI QR Status",
)
async def get_upi_qr_status(
    reference_id: str,
    db: AsyncSession = Depends(get_db),
):
    query_noz = select(NozzleUPITransaction).where(NozzleUPITransaction.reference_id == reference_id)
    noz_txn = (await db.execute(query_noz)).scalar_one_or_none()

    query_upi = select(UpiQrTransaction).where(UpiQrTransaction.reference_id == reference_id)
    upi_txn = (await db.execute(query_upi)).scalar_one_or_none()

    if not noz_txn and not upi_txn:
        raise HTTPException(status_code=404, detail=f"Transaction '{reference_id}' not found.")

    status_noz = (noz_txn.status.value if hasattr(noz_txn.status, "value") else str(noz_txn.status)) if noz_txn else None
    status_upi = upi_txn.status if upi_txn else None

    if status_noz in {"SUCCESS", "PAID"} or status_upi in {"SUCCESS", "PAID"}:
        status_val = "SUCCESS"
    elif status_noz in {"FAILURE", "FAILED"} or status_upi in {"FAILURE", "FAILED"}:
        status_val = "FAILURE"
    elif status_noz == "EXPIRED" or status_upi == "EXPIRED":
        status_val = "EXPIRED"
    else:
        status_val = status_noz or status_upi or "PENDING"

    amount_val = noz_txn.amount if noz_txn else upi_txn.amount
    utr_val = (noz_txn.bank_utr if noz_txn else None) or (upi_txn.bank_reference_number if upi_txn else None)
    vpa_val = (noz_txn.payer_vpa if noz_txn else None) or (upi_txn.payer_vpa if upi_txn else None)
    paid_at_val = (noz_txn.paid_at.isoformat() if noz_txn and noz_txn.paid_at else None) or (upi_txn.paid_at.isoformat() if upi_txn and upi_txn.paid_at else None)
    dec_id = (noz_txn.decentro_txn_id if noz_txn else None) or (upi_txn.decentro_txn_id if upi_txn else None)

    return {
        "reference_id": reference_id,
        "decentro_txn_id": dec_id,
        "status": status_val,
        "amount": amount_val,
        "bank_utr": utr_val,
        "bank_reference_number": utr_val,
        "payer_vpa": vpa_val,
        "paid_at": paid_at_val,
    }


@banking_router.get(
    "/upi-qr/{reference_id}/stream",
    summary="Real-Time Server-Sent Events (SSE) Stream for Dispenser Screen",
    description="Lightweight SSE connection that pushes payment confirmation instantly, turning the forecourt screen green.",
)
async def stream_upi_qr_status(
    reference_id: str,
    db: AsyncSession = Depends(get_db),
):
    async def event_generator() -> AsyncGenerator[str, None]:
        # Stream status checks every 1 second for up to 60 seconds
        for _ in range(60):
            query_noz = select(NozzleUPITransaction).where(NozzleUPITransaction.reference_id == reference_id)
            noz_txn = (await db.execute(query_noz)).scalar_one_or_none()

            query_upi = select(UpiQrTransaction).where(UpiQrTransaction.reference_id == reference_id)
            upi_txn = (await db.execute(query_upi)).scalar_one_or_none()

            if noz_txn or upi_txn:
                status_noz = (noz_txn.status.value if hasattr(noz_txn.status, "value") else str(noz_txn.status)) if noz_txn else None
                status_upi = upi_txn.status if upi_txn else None

                if status_noz in {"SUCCESS", "PAID"} or status_upi in {"SUCCESS", "PAID"}:
                    status_val = "SUCCESS"
                elif status_noz in {"FAILURE", "FAILED"} or status_upi in {"FAILURE", "FAILED"}:
                    status_val = "FAILURE"
                elif status_noz == "EXPIRED" or status_upi == "EXPIRED":
                    status_val = "EXPIRED"
                else:
                    status_val = status_noz or status_upi or "PENDING"

                utr_val = (noz_txn.bank_utr if noz_txn else None) or (upi_txn.bank_reference_number if upi_txn else None)
                vpa_val = (noz_txn.payer_vpa if noz_txn else None) or (upi_txn.payer_vpa if upi_txn else None)
                amount_val = noz_txn.amount if noz_txn else upi_txn.amount
                paid_at_val = (noz_txn.paid_at.isoformat() if noz_txn and noz_txn.paid_at else None) or (upi_txn.paid_at.isoformat() if upi_txn and upi_txn.paid_at else None)

                event_data = {
                    "reference_id": reference_id,
                    "status": status_val,
                    "amount": amount_val,
                    "utr": utr_val,
                    "bank_utr": utr_val,
                    "payer_vpa": vpa_val,
                    "paid_at": paid_at_val,
                }
                yield f"data: {json.dumps(event_data)}\n\n"

                if status_val in {"SUCCESS", "PAID", "FAILURE", "EXPIRED"}:
                    break

            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# 2. B2B Fleet Dedicated Virtual Accounts & Inbound RTGS/NEFT Webhooks
# =============================================================================
@banking_router.post(
    "/virtual-accounts",
    response_model=FleetVirtualAccountResponse,
    summary="Create B2B Dedicated Virtual Account for Fleet Customer",
)
async def create_fleet_virtual_account(
    req: FleetVirtualAccountCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    customer = None
    if req.customer_id:
        customer = await db.get(Customer, req.customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found.")
    elif req.business_name:
        # Check if customer with this business name exists or create one
        cust_query = select(Customer).where(Customer.name == req.business_name)
        customer = (await db.execute(cust_query)).scalar_one_or_none()
        if not customer:
            customer = Customer(
                code=f"CUST-{uuid.uuid4().hex[:6].upper()}",
                name=req.business_name,
                mobile=req.contact_phone or "9876543210",
                gst_no=req.gstin.upper() if req.gstin else None,
                credit_limit=req.credit_limit or 500000.0,
                current_outstanding=0.0,
            )
            db.add(customer)
            await db.commit()
            await db.refresh(customer)

    # Check existing active virtual account
    if customer:
        query = select(FleetVirtualAccount).where(
            FleetVirtualAccount.customer_id == customer.id,
            FleetVirtualAccount.status == "ACTIVE",
        )
        existing_fva = (await db.execute(query)).scalar_one_or_none()
        if existing_fva:
            return FleetVirtualAccountResponse(
                customer_id=customer.id,
                customer_name=customer.name,
                business_name=customer.name,
                account_number=existing_fva.account_number,
                virtual_account_number=existing_fva.account_number,
                ifsc=existing_fva.ifsc,
                virtual_account_ifsc=existing_fva.ifsc,
                bank_name=existing_fva.bank_name,
                upi_id=existing_fva.upi_id,
                virtual_account_upi_id=existing_fva.upi_id,
                credit_limit=customer.credit_limit,
                status=existing_fva.status,
                created_at=existing_fva.created_at,
            )

    biz_name = req.business_name or (customer.name if customer else "Fleet Commercial Logistics")
    email_addr = req.contact_email or "accounts@nsaipetrosoft.in"
    phone_num = req.contact_phone or "9876543210"
    ref_id = f"FLT-{uuid.uuid4().hex[:10].upper()}"

    # Call Decentro BaaS
    api_resp = await decentro_client.create_virtual_account(
        reference_id=ref_id,
        name=biz_name,
        email=email_addr,
        mobile=phone_num,
        customer_id=customer.id if customer else None,
        customer_name=biz_name,
        bank_code=req.bank_code,
        custom_vpa=req.custom_vpa,
    )
    data = api_resp.get("data", {})
    primary_va = data[0] if isinstance(data, list) and data else (data or {})
    account_number = primary_va.get("account_number") or primary_va.get("accountNumber") or f"{settings.DECENTRO_VAN_PREFIX}{uuid.uuid4().hex[:6].upper()}"
    ifsc = primary_va.get("ifsc_code") or primary_va.get("ifsc") or settings.STATION_MASTER_IFSC or settings.DECENTRO_MASTER_IFSC
    bank_name = primary_va.get("bank_name") or primary_va.get("bankName", "YES BANK")
    upi_id = primary_va.get("upi_id") or primary_va.get("upiId")

    # Persist in FleetCustomer
    fleet_cust = FleetCustomer(
        business_name=biz_name,
        gstin=req.gstin.upper() if req.gstin else (customer.gst_no if customer else None),
        gstin_verified=bool(req.gstin or (customer and customer.gst_no)),
        contact_phone=phone_num,
        contact_email=email_addr,
        virtual_account_number=account_number,
        virtual_account_ifsc=ifsc,
        virtual_account_upi_id=upi_id,
        credit_limit=req.credit_limit if req.credit_limit is not None else (customer.credit_limit if customer else 500000.0),
        current_outstanding=customer.current_outstanding if customer else 0.0,
    )
    db.add(fleet_cust)

    # Persist in FleetVirtualAccount for ERP reconciliation
    fva = None
    if customer:
        fva = FleetVirtualAccount(
            customer_id=customer.id,
            account_number=account_number,
            ifsc=ifsc,
            bank_name=bank_name,
            upi_id=upi_id,
            status="ACTIVE",
            reference_id=ref_id,
        )
        db.add(fva)

    await db.commit()
    await db.refresh(fleet_cust)
    if fva:
        await db.refresh(fva)

    decentro_logger.info(
        f"Provisioned Fleet Virtual Account: {account_number} for {biz_name}",
        extra={"account_number": account_number, "business_name": biz_name},
    )

    return FleetVirtualAccountResponse(
        customer_id=customer.id if customer else fleet_cust.id,
        customer_name=biz_name,
        business_name=biz_name,
        account_number=account_number,
        virtual_account_number=account_number,
        ifsc=ifsc,
        virtual_account_ifsc=ifsc,
        bank_name=bank_name,
        upi_id=upi_id,
        virtual_account_upi_id=upi_id,
        credit_limit=fleet_cust.credit_limit,
        status="ACTIVE",
        created_at=fleet_cust.created_at,
    )


# Webhook Collections Endpoint: /api/v1/webhooks/decentro/collections
@webhooks_router.post(
    "/collections",
    summary="Decentro Collection & Inbound RTGS/NEFT Webhook",
    description="HMAC-verified, idempotent listener that allocates B2B fleet deposits to oldest pending fuel invoices (FIFO).",
    dependencies=[Depends(verify_decentro_webhook_signature)],
)
async def decentro_collections_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    raw_body = await request.body()
    raw_str = raw_body.decode("utf-8", errors="replace")
    signature = request.headers.get("x-decentro-signature") or request.headers.get("X-Decentro-Signature")

    try:
        payload = json.loads(raw_str)
    except Exception:
        payload = {}

    decentro_txn_id = (
        payload.get("decentro_txn_id")
        or payload.get("decentroTxnId")
        or f"WH-{uuid.uuid4().hex[:10]}"
    )
    bank_utr = (
        payload.get("bank_reference_number")
        or payload.get("bankReferenceNumber")
        or decentro_txn_id
    )
    txn_status = (
        payload.get("transaction_status")
        or payload.get("status")
        or "SUCCESS"
    ).upper()
    amount = float(payload.get("amount") or payload.get("transfer_amount") or 0.0)
    payee_account = (
        payload.get("payee_account_number")
        or payload.get("payeeAccountNumber")
        or payload.get("account_number")
        or payload.get("payerVirtualAccountNumber")
        or payload.get("payer_virtual_account_number")
        or ""
    )
    transfer_type = (
        payload.get("transfer_type")
        or payload.get("transferType")
        or "UPI"
    ).upper()
    reference_id = payload.get("reference_id") or payload.get("referenceId") or ""

    # 1. Audit log
    audit = DecentroWebhookAudit(
        endpoint_type="COLLECTIONS",
        decentro_txn_id=decentro_txn_id,
        bank_reference_number=bank_utr,
        signature=signature,
        signature_valid=True,
        status="PROCESSING",
        payload_json=raw_str,
    )
    db.add(audit)
    await db.flush()

    # 2. Idempotency Check: Ensure UTR hasn't already been processed
    if bank_utr:
        dup_va_log = (
            await db.execute(
                select(VirtualAccountWebhookLog).where(VirtualAccountWebhookLog.bank_utr == bank_utr)
            )
        ).scalar_one_or_none()
        dup_ledger = (
            await db.execute(
                select(CollectionLedgerEntry).where(CollectionLedgerEntry.bank_reference_number == bank_utr)
            )
        ).scalar_one_or_none()

        if dup_va_log or dup_ledger:
            audit.status = "DUPLICATE"
            audit.result_summary = f"Duplicate UTR {bank_utr} ignored idempotently."
            await db.commit()
            return {
                "response_code": "CB_S00000",
                "status": "ALREADY_PROCESSED",
                "utr": bank_utr,
                "message": "Webhook already processed",
            }

    # 3. Check if this matches a Pending Nozzle Dynamic UPI QR Transaction
    nozzle_txn = None
    if reference_id:
        nozzle_txn = (
            await db.execute(
                select(NozzleUPITransaction).where(NozzleUPITransaction.reference_id == reference_id)
            )
        ).scalar_one_or_none()
    if not nozzle_txn and decentro_txn_id:
        nozzle_txn = (
            await db.execute(
                select(NozzleUPITransaction).where(NozzleUPITransaction.decentro_txn_id == decentro_txn_id)
            )
        ).scalar_one_or_none()

    upi_txn = None
    if reference_id:
        upi_txn = (
            await db.execute(
                select(UpiQrTransaction).where(UpiQrTransaction.reference_id == reference_id)
            )
        ).scalar_one_or_none()
    if not upi_txn and decentro_txn_id:
        upi_txn = (
            await db.execute(
                select(UpiQrTransaction).where(UpiQrTransaction.decentro_txn_id == decentro_txn_id)
            )
        ).scalar_one_or_none()

    payer_vpa = payload.get("payer_upi") or payload.get("payerVpa") or payload.get("payer_vpa")

    if nozzle_txn:
        if txn_status in ("SUCCESS", "COMPLETED", "PAID"):
            nozzle_txn.status = TxnStatus.SUCCESS
            nozzle_txn.bank_utr = bank_utr
            nozzle_txn.payer_vpa = payer_vpa
            nozzle_txn.paid_at = datetime.now(timezone.utc)
        elif txn_status in ("FAILURE", "FAILED", "EXPIRED"):
            nozzle_txn.status = TxnStatus.FAILURE
        db.add(nozzle_txn)

    if upi_txn:
        if txn_status in ("SUCCESS", "COMPLETED", "PAID"):
            upi_txn.status = "SUCCESS"
            upi_txn.bank_reference_number = bank_utr
            upi_txn.payer_vpa = payer_vpa
            upi_txn.paid_at = datetime.now(timezone.utc)
        elif txn_status in ("FAILURE", "FAILED", "EXPIRED"):
            upi_txn.status = "FAILURE"
        db.add(upi_txn)

    # 4. Check if this is an RTGS/NEFT/IMPS/UPI Deposit into a Dedicated Fleet Virtual Account
    if payee_account and txn_status in ("SUCCESS", "COMPLETED"):
        fleet = (
            await db.execute(
                select(FleetCustomer).where(FleetCustomer.virtual_account_number == payee_account)
            )
        ).scalar_one_or_none()
        if fleet:
            fleet.current_outstanding = round(fleet.current_outstanding - amount, 2)
            db.add(fleet)

    # 5. Resolve Fleet Customer in ERP and execute FIFO Fuel Indent Clearing
    customer: Optional[Customer] = None
    if payee_account:
        fva = (
            await db.execute(
                select(FleetVirtualAccount).where(FleetVirtualAccount.account_number == payee_account.strip().upper())
            )
        ).scalar_one_or_none()
        if fva:
            customer = await db.get(Customer, fva.customer_id)

        # Fallback to customer code extraction
        if not customer and payee_account.startswith(settings.DECENTRO_VAN_PREFIX):
            van_digits = payee_account.replace(settings.DECENTRO_VAN_PREFIX, "").lstrip("0")
            if van_digits.isdigit():
                customer = await db.get(Customer, int(van_digits))

    cleared_invoices = []
    receipt_no = None
    if customer and amount > 0 and txn_status in ("SUCCESS", "COMPLETED"):
        prev_outstanding = float(customer.current_outstanding)
        remaining_payment = amount

        credit_query = (
            select(CreditSale)
            .where(CreditSale.customer_id == customer.id, CreditSale.credit_amount > 0)
            .order_by(CreditSale.date.asc(), CreditSale.id.asc())
        )
        pending_invoices = (await db.execute(credit_query)).scalars().all()

        for inv in pending_invoices:
            if remaining_payment <= 0:
                break
            inv_balance = float(inv.credit_amount)
            if inv_balance <= remaining_payment:
                cleared_invoices.append({
                    "sale_id": inv.id,
                    "bill_no": inv.bill_no,
                    "date": str(inv.date),
                    "cleared_amount": inv_balance,
                    "fully_cleared": True,
                })
                remaining_payment -= inv_balance
                inv.credit_amount = 0.0
                inv.remarks = (inv.remarks or "") + f" [Paid in full via Decentro UTR: {bank_utr}]"
            else:
                cleared_invoices.append({
                    "sale_id": inv.id,
                    "bill_no": inv.bill_no,
                    "date": str(inv.date),
                    "cleared_amount": remaining_payment,
                    "fully_cleared": False,
                })
                inv.credit_amount = inv_balance - remaining_payment
                inv.remarks = (inv.remarks or "") + f" [Partially paid INR {remaining_payment:.2f} via Decentro UTR: {bank_utr}]"
                remaining_payment = 0.0

        receipt_suffix = (bank_utr[-4:] if bank_utr else uuid.uuid4().hex[:4]).upper()
        receipt_no = f"VR-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{receipt_suffix}"
        receipt = PaymentReceipt(
            receipt_no=receipt_no,
            customer_id=customer.id,
            amount=amount,
            payment_mode="NEFT/RTGS",
            bank_name=payload.get("payerIfsc") or "Decentro / YES Bank VAN",
            receiving_account=payee_account or "DECENTRO ESCROW",
            cheque_no=bank_utr or "DEC-AUTO",
            remarks=f"Decentro BaaS Real-Time FIFO Auto-Recon | UTR: {bank_utr or 'N/A'}",
        )
        db.add(receipt)

        new_outstanding = round(prev_outstanding - amount, 2)
        customer.current_outstanding = new_outstanding

        bank_query = select(BankAccount).where(
            BankAccount.account_name.ilike("%DECENTRO%")
            | BankAccount.account_name.ilike("%ESCROW%")
            | BankAccount.account_name.ilike("%PRIMARY%")
        )
        bank_acc = (await db.execute(bank_query)).scalars().first()
        if not bank_acc:
            bank_acc = BankAccount(account_name="DECENTRO ESCROW / NODAL", account_type="BANK", balance=amount)
            db.add(bank_acc)
        else:
            bank_acc.balance = round(float(bank_acc.balance) + amount, 2)

        collection_entry = CollectionLedgerEntry(
            bank_reference_number=bank_utr or f"UTR_{uuid.uuid4().hex[:10]}",
            decentro_txn_id=decentro_txn_id,
            customer_id=customer.id,
            virtual_account_number=payee_account or "N/A",
            amount=amount,
            transfer_type=transfer_type,
            payer_name=payload.get("payer_name") or payload.get("payerName"),
            payer_account=payload.get("payer_account_number") or payload.get("payerAccountNumber"),
            receipt_no=receipt_no,
            invoices_cleared_json=json.dumps(cleared_invoices),
            previous_outstanding=prev_outstanding,
            new_outstanding=new_outstanding,
        )
        db.add(collection_entry)

    # 6. Save Immutable VirtualAccountWebhookLog
    webhook_log = VirtualAccountWebhookLog(
        decentro_txn_id=decentro_txn_id,
        bank_utr=bank_utr,
        virtual_account_number=payee_account or settings.STATION_MASTER_VA_NUMBER,
        transfer_type=transfer_type,
        amount=amount,
        payer_name=payload.get("payer_name") or payload.get("payerName"),
        payer_account=payload.get("payer_account_number") or payload.get("payerAccountNumber"),
        payer_ifsc=payload.get("payer_account_ifsc") or payload.get("payerIfsc"),
        raw_payload=raw_str,
    )
    db.add(webhook_log)

    audit.status = "PROCESSED"
    audit.result_summary = f"Callback processed: UTR {bank_utr}, Status: {txn_status}"
    await db.commit()

    # Decentro expects CB_S00000 or HTTP 200 to acknowledge callback
    return {
        "response_code": "CB_S00000",
        "status": "SUCCESS",
        "utr": bank_utr,
        "reconciled": bool(customer or nozzle_txn or upi_txn),
        "customer_id": customer.id if customer else None,
        "receipt_no": receipt_no,
        "cleared_invoices_count": len(cleared_invoices),
        "message": "Callback recorded successfully",
    }


# =============================================================================
# 3. OMC & Fuel Tanker Supplier Payouts & Webhook
# =============================================================================
@banking_router.post(
    "/payouts",
    response_model=SupplierPayoutResponse,
    summary="OMC & Fuel Tanker Supplier Payout with Idempotency",
    description="Disburses high-value RTGS/NEFT/IMPS payments to oil marketing companies with idempotency keys.",
)
async def create_supplier_payout(
    req: SupplierPayoutCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Supplier payout amount must be greater than zero")
    supplier_name = req.supplier_name or req.vendor_name or "Supplier"
    beneficiary_account = req.beneficiary_account or req.account_number or ""
    if not beneficiary_account or len(beneficiary_account.strip()) < 6:
        raise HTTPException(status_code=400, detail="Invalid beneficiary bank account number format")
    beneficiary_ifsc = (req.beneficiary_ifsc or req.ifsc or "YESB0CMSNOC").upper()
    invoice_number = req.invoice_number or f"INV-{int(time.time())}"
    clean_idemp = (req.idempotency_key or f"IDEMP-{uuid.uuid4().hex[:10].upper()}").strip()

    # Idempotency guard at DB level
    query = select(SupplierPayoutOrder).where(SupplierPayoutOrder.idempotency_key == clean_idemp)
    existing = (await db.execute(query)).scalar_one_or_none()
    if existing:
        return SupplierPayoutResponse(
            reference_id=existing.reference_id,
            idempotency_key=existing.idempotency_key,
            decentro_txn_id=existing.decentro_txn_id,
            vendor_name=existing.vendor_name,
            supplier_name=existing.vendor_name,
            amount=existing.amount,
            transfer_type=existing.transfer_type,
            status=existing.status,
            bank_reference_number=existing.bank_reference_number,
            bank_utr=existing.bank_reference_number,
            created_at=existing.created_at,
            message=f"Idempotent return: Payout already exists with status {existing.status}.",
        )

    ref_id = f"PAY-{invoice_number}-{uuid.uuid4().hex[:6].upper()}"

    # Call Decentro Payouts API
    api_resp = await decentro_client.initiate_payout(
        reference_id=ref_id,
        vendor_name=supplier_name,
        account_number=beneficiary_account,
        ifsc=beneficiary_ifsc,
        amount=req.amount,
        transfer_type=req.transfer_type,
        purpose_message=req.purpose_message or f"Inv {invoice_number}",
        req=req,
    )
    data = api_resp.get("data", {})
    decentro_txn_id = api_resp.get("decentro_txn_id") or data.get("decentroTxnId") or data.get("decentro_txn_id")
    raw_status = (api_resp.get("status") or data.get("status") or "SUCCESS").upper()
    status_str = "SUCCESS" if raw_status == "SUCCESS" else raw_status
    utr = api_resp.get("bank_reference_number") or data.get("bankReferenceNumber") or data.get("bank_reference_number")

    # Persist in SupplierPayout
    payout = SupplierPayout(
        reference_id=ref_id,
        supplier_name=supplier_name,
        supplier_gstin=req.supplier_gstin,
        invoice_number=invoice_number,
        beneficiary_account=beneficiary_account,
        beneficiary_ifsc=beneficiary_ifsc,
        transfer_type=req.transfer_type.upper(),
        amount=req.amount,
        decentro_txn_id=decentro_txn_id,
        bank_utr=utr,
        status=TxnStatus.SUCCESS if status_str == "SUCCESS" else (TxnStatus.FAILURE if status_str == "FAILURE" else TxnStatus.PENDING),
    )
    db.add(payout)

    # Persist in SupplierPayoutOrder
    order = SupplierPayoutOrder(
        reference_id=ref_id,
        idempotency_key=clean_idemp,
        vendor_name=supplier_name,
        account_number=beneficiary_account,
        ifsc=beneficiary_ifsc,
        amount=req.amount,
        transfer_type=req.transfer_type,
        purpose_message=req.purpose_message or f"Inv {invoice_number}",
        status=status_str,
        decentro_txn_id=decentro_txn_id,
        bank_reference_number=utr,
        settled_at=datetime.now(timezone.utc) if status_str == "SUCCESS" else None,
    )
    db.add(order)

    # Deduct from station bank ledger
    if status_str == "SUCCESS":
        bank_query = select(BankAccount).where(
            BankAccount.account_name.ilike("%DECENTRO%")
            | BankAccount.account_name.ilike("%PRIMARY%")
        )
        bank_acc = (await db.execute(bank_query)).scalars().first()
        if bank_acc:
            bank_acc.balance = round(float(bank_acc.balance) - req.amount, 2)

    await db.commit()
    await db.refresh(payout)
    await db.refresh(order)

    decentro_logger.info(
        f"Supplier payout initiated: INR {req.amount:.2f} to {supplier_name} (UTR: {utr})",
        extra={"reference_id": ref_id, "idempotency_key": clean_idemp, "amount": req.amount},
    )

    return SupplierPayoutResponse(
        reference_id=order.reference_id,
        idempotency_key=order.idempotency_key,
        decentro_txn_id=order.decentro_txn_id,
        vendor_name=order.vendor_name,
        supplier_name=order.vendor_name,
        amount=order.amount,
        transfer_type=order.transfer_type,
        status=order.status,
        bank_reference_number=order.bank_reference_number,
        bank_utr=order.bank_reference_number,
        created_at=order.created_at,
        message=f"{req.transfer_type} disbursement to {supplier_name} processed with status {status_str}.",
    )


# Webhook Payouts Endpoint: /api/v1/webhooks/decentro/payouts
@webhooks_router.post(
    "/payouts",
    summary="Decentro Asynchronous Payout Status Webhook",
    description="Handles SUCCESS, FAILURE, and REVERSED status callbacks. Automatically restores station bank ledger balance if payout fails.",
    dependencies=[Depends(verify_decentro_webhook_signature)],
)
async def decentro_payouts_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    raw_body = await request.body()
    raw_str = raw_body.decode("utf-8", errors="replace")
    signature = request.headers.get("x-decentro-signature") or request.headers.get("X-Decentro-Signature")

    try:
        payload = json.loads(raw_str)
    except Exception:
        payload = {}

    decentro_txn_id = payload.get("decentroTxnId") or payload.get("decentro_txn_id")
    ref_id = payload.get("referenceId") or payload.get("reference_id")
    utr = payload.get("bankReferenceNumber") or payload.get("bank_reference_number")
    payout_status = (payload.get("status") or payload.get("transactionStatus") or "SUCCESS").upper()
    failure_reason = payload.get("failureReason") or payload.get("provider_message") or payload.get("message")

    # 1. Audit
    audit = DecentroWebhookAudit(
        endpoint_type="PAYOUTS",
        decentro_txn_id=decentro_txn_id,
        bank_reference_number=utr,
        signature=signature,
        signature_valid=True,
        status="PROCESSING",
        payload_json=raw_str,
    )
    db.add(audit)
    await db.flush()

    # 2. Match SupplierPayout
    payout = None
    if ref_id:
        payout = (
            await db.execute(select(SupplierPayout).where(SupplierPayout.reference_id == ref_id))
        ).scalar_one_or_none()
    if not payout and decentro_txn_id:
        payout = (
            await db.execute(select(SupplierPayout).where(SupplierPayout.decentro_txn_id == decentro_txn_id))
        ).scalar_one_or_none()

    if payout:
        payout.bank_utr = utr or payout.bank_utr
        if payout_status in ("SUCCESS", "COMPLETED"):
            payout.status = TxnStatus.SUCCESS
        elif payout_status in ("FAILURE", "FAILED"):
            payout.status = TxnStatus.FAILURE
            payout.failure_reason = failure_reason
        elif payout_status == "REVERSED":
            payout.status = TxnStatus.REVERSED
            payout.failure_reason = "Bank reversed transaction"
        payout.updated_at = datetime.now(timezone.utc)
        db.add(payout)

    # 3. Match SupplierPayoutOrder
    query = select(SupplierPayoutOrder).where(
        (SupplierPayoutOrder.decentro_txn_id == decentro_txn_id)
        if decentro_txn_id
        else (SupplierPayoutOrder.reference_id == ref_id)
    )
    order = (await db.execute(query)).scalar_one_or_none()

    if order:
        old_status = order.status
        order.status = payout_status
        if utr and not order.bank_reference_number:
            order.bank_reference_number = utr

        # Handle FAILURE / REVERSED: Restore Station Bank Ledger!
        if payout_status in {"FAILURE", "FAILED", "REVERSED"} and old_status in {"SUCCESS", "INITIATED", "PENDING"}:
            order.is_reversed = True
            order.reversal_reason = failure_reason or "Bank transfer failed or reversed"

            # Restore station bank balance
            bank_query = select(BankAccount).where(
                BankAccount.account_name.ilike("%DECENTRO%")
                | BankAccount.account_name.ilike("%PRIMARY%")
            )
            bank_acc = (await db.execute(bank_query)).scalars().first()
            if bank_acc:
                bank_acc.balance = round(float(bank_acc.balance) + float(order.amount), 2)
                decentro_logger.warning(
                    f"Restored station bank balance by INR {order.amount:.2f} due to payout reversal (Order #{order.id})",
                    extra={"order_id": order.id, "amount": order.amount, "reason": order.reversal_reason},
                )

    audit.status = "PROCESSED"
    audit.result_summary = f"Payout updated to {payout_status}."
    await db.commit()

    return {
        "response_code": "CB_S00000",
        "status": "SUCCESS",
        "order_id": order.id if order else None,
        "payout_status": payout_status,
        "message": "Payout status updated",
    }


# =============================================================================
# 4. B2B Fleet & Vendor GSTIN Verification
# =============================================================================
@banking_router.post(
    "/kyc/gstin",
    response_model=GstinKycResponse,
    summary="Validate Fleet / Vendor GSTIN via Decentro KYC Registry",
)
async def verify_gstin_kyc(
    req: GstinKycRequest,
    db: AsyncSession = Depends(get_db),
):
    clean_gstin = req.gstin.strip().upper()

    # Call Decentro KYC API
    api_resp = await decentro_client.verify_gstin(clean_gstin)
    data = api_resp.get("data", {})
    kyc_result = api_resp.get("kyc_result") or data

    legal_name = kyc_result.get("legal_name") or data.get("legalNameOfBusiness") or kyc_result.get("lgnm")
    trade_name = kyc_result.get("trade_name") or data.get("tradeName") or kyc_result.get("tradeNam")
    taxpayer_type = data.get("taxpayerType") or "Regular"
    constitution = kyc_result.get("constitution_of_business") or data.get("constitutionOfBusiness") or kyc_result.get("ctb") or "Private Limited Company"
    state_code = data.get("stateCode") or clean_gstin[:2]
    state_jurisdiction = kyc_result.get("state_jurisdiction") or data.get("stateName") or kyc_result.get("stj") or "Gujarat"
    status_str = (kyc_result.get("registration_status") or kyc_result.get("status") or data.get("gstinStatus") or kyc_result.get("sts") or "ACTIVE").upper()
    address = kyc_result.get("primary_business_address") or data.get("principalPlaceOfBusiness") or kyc_result.get("pradr")
    decentro_txn_id = api_resp.get("decentro_txn_id") or data.get("decentroTxnId")

    # Save verification audit record
    record = GstinVerificationRecord(
        gstin=clean_gstin,
        legal_name=legal_name,
        trade_name=trade_name,
        taxpayer_type=taxpayer_type,
        constitution_of_business=constitution,
        state_jurisdiction=state_jurisdiction,
        state_code=state_code,
        registration_status=status_str,
        address=address,
        customer_id=req.customer_id,
    )
    db.add(record)

    customer_updated = False
    if req.auto_populate and req.customer_id:
        cust = await db.get(Customer, req.customer_id)
        if cust:
            cust.gst_no = clean_gstin
            cust.pan_no = clean_gstin[2:12]
            if address and not cust.address:
                cust.address = address
            customer_updated = True

    await db.commit()

    return GstinKycResponse(
        gstin=clean_gstin,
        legal_name=legal_name,
        trade_name=trade_name,
        taxpayer_type=taxpayer_type,
        constitution_of_business=constitution,
        state_jurisdiction=state_jurisdiction,
        state_code=state_code,
        registration_status=status_str,
        address=address,
        primary_address=address,
        customer_updated=customer_updated,
        decentro_txn_id=decentro_txn_id,
        message=f"GSTIN verified for '{legal_name}'. Status: {status_str}",
    )


# Mount sub-routers into main router
router.include_router(banking_router)
router.include_router(webhooks_router)

