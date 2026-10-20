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
    FleetVirtualAccount,
    GstinVerificationRecord,
    SupplierPayoutOrder,
    UpiQrTransaction,
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
    shift_id: Optional[int] = Field(None, description="Active shift ID")
    nozzle_id: Optional[int] = Field(None, description="Dispenser nozzle ID")
    lane_id: Optional[str] = Field(None, description="Forecourt Lane/Island identifier e.g. 'LANE-1'")
    bill_no: Optional[str] = Field(None, description="ERP Bill or Slip Number")
    purpose_message: str = Field(default="NSAI PetroSoft Fuel Dispense", max_length=255)
    expiry_minutes: int = Field(default=10, ge=1, le=60)
    reference_id: Optional[str] = Field(None, description="Custom reference ID")


class DynamicUpiQrResponse(BaseModel):
    reference_id: str
    decentro_txn_id: Optional[str] = None
    amount: float
    status: str
    upi_uri: str
    qr_code_base64: Optional[str] = None
    shift_id: Optional[int] = None
    nozzle_id: Optional[int] = None
    lane_id: Optional[str] = None
    bill_no: Optional[str] = None
    created_at: datetime
    message: str = "Dynamic UPI QR generated successfully"


class FleetVirtualAccountCreateRequest(BaseModel):
    customer_id: int = Field(..., description="ERP Customer ID to map dedicated virtual account")
    bank_code: str = Field(default="YESB", description="Bank partner code e.g. 'YESB', 'ICIC'")
    custom_vpa: Optional[str] = Field(None, description="Optional custom UPI alias")


class FleetVirtualAccountResponse(BaseModel):
    customer_id: int
    customer_name: str
    account_number: str
    ifsc: str
    bank_name: str
    upi_id: Optional[str] = None
    status: str
    created_at: datetime


class SupplierPayoutCreateRequest(BaseModel):
    vendor_name: str = Field(..., min_length=2, max_length=150, description="Vendor or OMC Name (e.g. 'IOCL')")
    account_number: str = Field(..., min_length=6, max_length=35, description="Beneficiary Bank Account Number")
    ifsc: str = Field(..., min_length=11, max_length=11, description="Beneficiary Bank IFSC Code (11 alphanumeric)")
    amount: float = Field(..., gt=0, description="Payout amount in INR")
    transfer_type: str = Field(default="RTGS", description="RTGS, NEFT, or IMPS")
    purpose_message: str = Field(..., max_length=255, description="Payment Purpose (e.g. 'Tanker Indent MS 12KL')")
    idempotency_key: str = Field(
        ...,
        min_length=8,
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
    idempotency_key: str
    decentro_txn_id: Optional[str] = None
    vendor_name: str
    amount: float
    transfer_type: str
    status: str
    bank_reference_number: Optional[str] = None
    created_at: datetime
    message: str


class GstinKycRequest(BaseModel):
    gstin: str = Field(..., min_length=15, max_length=15, description="15-character GSTIN")
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
    customer_updated: bool = False
    message: str


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
    ref_id = req.reference_id or f"UPI_{lane_slug}_{int(time.time())}_{uuid.uuid4().hex[:6].upper()}"

    # Call Decentro API
    api_resp = await decentro_client.generate_dynamic_upi_qr(
        reference_id=ref_id,
        amount=req.amount,
        purpose_message=req.purpose_message,
        expiry_minutes=req.expiry_minutes,
    )

    data = api_resp.get("data", {})
    decentro_txn_id = data.get("decentroTxnId")
    upi_uri = data.get("upiUri", "")
    qr_code_base64 = data.get("encodedDynamicQrCode")
    txn_status = data.get("transactionStatus", "PENDING")

    # Persist in SQLModel UpiQrTransaction table
    txn = UpiQrTransaction(
        reference_id=ref_id,
        decentro_txn_id=decentro_txn_id,
        shift_id=req.shift_id,
        nozzle_id=req.nozzle_id,
        lane_id=req.lane_id,
        bill_no=req.bill_no,
        amount=req.amount,
        status=txn_status,
        upi_uri=upi_uri,
        qr_code_base64=qr_code_base64,
    )
    db.add(txn)

    # Also log in master DecentroTransaction audit table
    master_txn = DecentroTransaction(
        reference_id=ref_id,
        decentro_txn_id=decentro_txn_id,
        transaction_type="UPI_QR",
        amount=req.amount,
        status=txn_status,
        upi_uri=upi_uri,
        qr_code_base64=qr_code_base64,
        shift_id=req.shift_id,
        nozzle_id=req.nozzle_id,
        lane_id=req.lane_id,
        bill_no=req.bill_no,
        request_payload=json.dumps(req.model_dump(), default=str),
        response_payload=json.dumps(api_resp, default=str),
    )
    db.add(master_txn)
    await db.commit()
    await db.refresh(txn)

    decentro_logger.info(
        f"Forecourt Dynamic UPI QR generated: {ref_id} - INR {req.amount:.2f}",
        extra={"reference_id": ref_id, "amount": req.amount, "lane_id": req.lane_id},
    )

    return DynamicUpiQrResponse(
        reference_id=txn.reference_id,
        decentro_txn_id=txn.decentro_txn_id,
        amount=txn.amount,
        status=txn.status,
        upi_uri=txn.upi_uri or "",
        qr_code_base64=txn.qr_code_base64,
        shift_id=txn.shift_id,
        nozzle_id=txn.nozzle_id,
        lane_id=txn.lane_id,
        bill_no=txn.bill_no,
        created_at=txn.created_at,
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
    query = select(UpiQrTransaction).where(UpiQrTransaction.reference_id == reference_id)
    txn = (await db.execute(query)).scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail=f"Transaction '{reference_id}' not found.")

    return {
        "reference_id": txn.reference_id,
        "decentro_txn_id": txn.decentro_txn_id,
        "status": txn.status,
        "amount": txn.amount,
        "bank_reference_number": txn.bank_reference_number,
        "payer_vpa": txn.payer_vpa,
        "paid_at": txn.paid_at.isoformat() if txn.paid_at else None,
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
            query = select(UpiQrTransaction).where(UpiQrTransaction.reference_id == reference_id)
            txn = (await db.execute(query)).scalar_one_or_none()

            if txn:
                event_data = {
                    "reference_id": txn.reference_id,
                    "status": txn.status,
                    "amount": txn.amount,
                    "utr": txn.bank_reference_number,
                    "payer_vpa": txn.payer_vpa,
                    "paid_at": txn.paid_at.isoformat() if txn.paid_at else None,
                }
                yield f"data: {json.dumps(event_data)}\n\n"

                if txn.status in {"SUCCESS", "PAID", "FAILURE", "EXPIRED"}:
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
    customer = await db.get(Customer, req.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")

    # Check existing active virtual account
    query = select(FleetVirtualAccount).where(
        FleetVirtualAccount.customer_id == req.customer_id,
        FleetVirtualAccount.status == "ACTIVE",
    )
    existing_fva = (await db.execute(query)).scalar_one_or_none()
    if existing_fva:
        return FleetVirtualAccountResponse(
            customer_id=customer.id,
            customer_name=customer.name,
            account_number=existing_fva.account_number,
            ifsc=existing_fva.ifsc,
            bank_name=existing_fva.bank_name,
            upi_id=existing_fva.upi_id,
            status=existing_fva.status,
            created_at=existing_fva.created_at,
        )

    # Call Decentro BaaS
    api_resp = await decentro_client.create_virtual_account(
        customer_id=customer.id,
        customer_name=customer.name,
        bank_code=req.bank_code,
        custom_vpa=req.custom_vpa,
    )
    data = api_resp.get("data", {})
    account_number = data.get("accountNumber") or f"{settings.DECENTRO_VAN_PREFIX}{customer.id:06d}"
    ifsc = data.get("ifsc") or settings.DECENTRO_MASTER_IFSC
    bank_name = data.get("bankName", "YES BANK")
    upi_id = data.get("upiId")
    ref_id = data.get("referenceId")

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
    await db.refresh(fva)

    decentro_logger.info(
        f"Provisioned Fleet Virtual Account: {account_number} for customer {customer.name}",
        extra={"customer_id": customer.id, "account_number": account_number},
    )

    return FleetVirtualAccountResponse(
        customer_id=customer.id,
        customer_name=customer.name,
        account_number=fva.account_number,
        ifsc=fva.ifsc,
        bank_name=fva.bank_name,
        upi_id=fva.upi_id,
        status=fva.status,
        created_at=fva.created_at,
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
    headers_dict = dict(request.headers)
    signature = request.headers.get("x-decentro-signature") or request.headers.get("X-Decentro-Signature")

    try:
        payload = json.loads(raw_str)
    except Exception:
        payload = {}

    decentro_txn_id = payload.get("decentroTxnId") or payload.get("decentro_txn_id") or f"DEC_{int(time.time())}"
    utr = payload.get("bankReferenceNumber") or payload.get("bank_reference_number")
    amount = float(payload.get("amount") or 0.0)
    transfer_type = payload.get("transferType") or payload.get("transfer_type") or "RTGS"
    payer_van = (
        payload.get("payerVirtualAccountNumber")
        or payload.get("payeeAccountNumber")
        or payload.get("payer_virtual_account_number")
        or payload.get("payee_account_number")
    )
    payer_name = payload.get("payerName") or payload.get("payer_name")
    payer_account = payload.get("payerAccountNumber") or payload.get("payer_account_number")

    # 1. Audit log
    audit = DecentroWebhookAudit(
        endpoint_type="COLLECTIONS",
        decentro_txn_id=decentro_txn_id,
        bank_reference_number=utr,
        signature=signature,
        signature_valid=True,
        status="PROCESSING",
        payload_json=raw_str,
    )
    db.add(audit)
    await db.flush()

    # 2. Idempotency Guard: Check if UTR has already been recorded
    if utr:
        dup_query = select(CollectionLedgerEntry).where(CollectionLedgerEntry.bank_reference_number == utr)
        existing_entry = (await db.execute(dup_query)).scalar_one_or_none()
        if existing_entry:
            audit.status = "DUPLICATE"
            audit.result_summary = f"Duplicate UTR {utr} ignored idempotently."
            await db.commit()
            return {"status": "ALREADY_PROCESSED", "utr": utr, "message": "Transaction already reconciled."}

    # 3. Check if this is a Dynamic UPI QR payment confirmation
    ref_id = payload.get("referenceId") or payload.get("reference_id")
    if ref_id and ref_id.startswith("UPI_"):
        upi_query = select(UpiQrTransaction).where(UpiQrTransaction.reference_id == ref_id)
        upi_txn = (await db.execute(upi_query)).scalar_one_or_none()
        if upi_txn:
            upi_txn.status = "SUCCESS"
            upi_txn.bank_reference_number = utr
            upi_txn.paid_at = datetime.now(timezone.utc)
            upi_txn.payer_vpa = payload.get("payerVpa") or payload.get("payer_vpa")
            audit.status = "PROCESSED"
            audit.result_summary = f"Dynamic UPI QR {ref_id} reconciled successfully."
            await db.commit()
            return {"status": "SUCCESS", "reference_id": ref_id, "utr": utr, "message": "UPI QR marked SUCCESS"}

    # 4. Resolve Fleet Customer from Virtual Account
    customer: Optional[Customer] = None
    if payer_van:
        va_query = select(FleetVirtualAccount).where(
            FleetVirtualAccount.account_number == payer_van.strip().upper()
        )
        fva = (await db.execute(va_query)).scalar_one_or_none()
        if fva:
            customer = await db.get(Customer, fva.customer_id)

        # Fallback to customer code extraction
        if not customer and payer_van.startswith(settings.DECENTRO_VAN_PREFIX):
            van_digits = payer_van.replace(settings.DECENTRO_VAN_PREFIX, "").lstrip("0")
            if van_digits.isdigit():
                customer = await db.get(Customer, int(van_digits))

    # 5. FIFO Fuel Indent Clearing
    cleared_invoices = []
    if customer and amount > 0:
        prev_outstanding = float(customer.current_outstanding)
        remaining_payment = amount

        # Query pending credit sales (oldest first: FIFO)
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
                inv.remarks = (inv.remarks or "") + f" [Paid in full via Decentro UTR: {utr}]"
            else:
                cleared_invoices.append({
                    "sale_id": inv.id,
                    "bill_no": inv.bill_no,
                    "date": str(inv.date),
                    "cleared_amount": remaining_payment,
                    "fully_cleared": False,
                })
                inv.credit_amount = inv_balance - remaining_payment
                inv.remarks = (inv.remarks or "") + f" [Partially paid INR {remaining_payment:.2f} via Decentro UTR: {utr}]"
                remaining_payment = 0.0

        # Create PaymentReceipt
        receipt_suffix = (utr[-4:] if utr else uuid.uuid4().hex[:4]).upper()
        receipt_no = f"VR-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{receipt_suffix}"
        receipt = PaymentReceipt(
            receipt_no=receipt_no,
            customer_id=customer.id,
            amount=amount,
            payment_mode="NEFT/RTGS",
            bank_name=payload.get("payerIfsc") or "Decentro / YES Bank VAN",
            receiving_account=payer_van or "DECENTRO ESCROW",
            cheque_no=utr or "DEC-AUTO",
            remarks=f"Decentro BaaS Real-Time FIFO Auto-Recon | UTR: {utr or 'N/A'}",
        )
        db.add(receipt)

        # Update customer ledger
        new_outstanding = round(prev_outstanding - amount, 2)
        customer.current_outstanding = new_outstanding

        # Credit station bank ledger
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

        # Record CollectionLedgerEntry
        collection_entry = CollectionLedgerEntry(
            bank_reference_number=utr or f"UTR_{uuid.uuid4().hex[:10]}",
            decentro_txn_id=decentro_txn_id,
            customer_id=customer.id,
            virtual_account_number=payer_van or "N/A",
            amount=amount,
            transfer_type=transfer_type,
            payer_name=payer_name,
            payer_account=payer_account,
            receipt_no=receipt_no,
            invoices_cleared_json=json.dumps(cleared_invoices),
            previous_outstanding=prev_outstanding,
            new_outstanding=new_outstanding,
        )
        db.add(collection_entry)

        audit.status = "PROCESSED"
        audit.result_summary = f"Reconciled INR {amount:.2f} for {customer.name}. {len(cleared_invoices)} invoices cleared (FIFO)."
        await db.commit()

        decentro_logger.info(
            f"Decentro B2B Collection: INR {amount:.2f} credited for {customer.name} (UTR: {utr})",
            extra={"customer_id": customer.id, "amount": amount, "utr": utr, "cleared_invoices": len(cleared_invoices)},
        )

        return {
            "status": "SUCCESS",
            "utr": utr,
            "reconciled": True,
            "customer_id": customer.id,
            "receipt_no": receipt_no,
            "cleared_invoices_count": len(cleared_invoices),
            "updated_outstanding": new_outstanding,
            "message": f"Successfully cleared invoices and updated balance for {customer.name}",
        }

    # Unmatched
    audit.status = "UNMATCHED"
    audit.result_summary = "Payer VAN did not match any active fleet customer."
    await db.commit()
    return {"status": "ACKNOWLEDGED", "reconciled": False, "message": "Payer VAN unmatched, pending manual review."}


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
    clean_idemp = req.idempotency_key.strip()

    # Idempotency guard at DB level
    query = select(SupplierPayoutOrder).where(SupplierPayoutOrder.idempotency_key == clean_idemp)
    existing = (await db.execute(query)).scalar_one_or_none()
    if existing:
        return SupplierPayoutResponse(
            reference_id=existing.reference_id,
            idempotency_key=existing.idempotency_key,
            decentro_txn_id=existing.decentro_txn_id,
            vendor_name=existing.vendor_name,
            amount=existing.amount,
            transfer_type=existing.transfer_type,
            status=existing.status,
            bank_reference_number=existing.bank_reference_number,
            created_at=existing.created_at,
            message=f"Idempotent return: Payout already exists with status {existing.status}.",
        )

    ref_id = f"PO_{int(time.time())}_{uuid.uuid4().hex[:6].upper()}"

    # Call Decentro Payouts API
    api_resp = await decentro_client.initiate_payout(
        reference_id=ref_id,
        vendor_name=req.vendor_name,
        account_number=req.account_number,
        ifsc=req.ifsc,
        amount=req.amount,
        transfer_type=req.transfer_type,
        purpose_message=req.purpose_message,
    )
    data = api_resp.get("data", {})
    decentro_txn_id = data.get("decentroTxnId")
    status_str = data.get("status", "SUCCESS")
    utr = data.get("bankReferenceNumber")

    order = SupplierPayoutOrder(
        reference_id=ref_id,
        idempotency_key=clean_idemp,
        vendor_name=req.vendor_name,
        account_number=req.account_number,
        ifsc=req.ifsc,
        amount=req.amount,
        transfer_type=req.transfer_type,
        purpose_message=req.purpose_message,
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
    await db.refresh(order)

    decentro_logger.info(
        f"Supplier payout initiated: INR {req.amount:.2f} to {req.vendor_name} (UTR: {utr})",
        extra={"reference_id": ref_id, "idempotency_key": clean_idemp, "amount": req.amount},
    )

    return SupplierPayoutResponse(
        reference_id=order.reference_id,
        idempotency_key=order.idempotency_key,
        decentro_txn_id=order.decentro_txn_id,
        vendor_name=order.vendor_name,
        amount=order.amount,
        transfer_type=order.transfer_type,
        status=order.status,
        bank_reference_number=order.bank_reference_number,
        created_at=order.created_at,
        message=f"{req.transfer_type} disbursement to {req.vendor_name} processed with status {status_str}.",
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
    failure_reason = payload.get("failureReason") or payload.get("message")

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

    # 2. Match SupplierPayoutOrder
    query = select(SupplierPayoutOrder).where(
        (SupplierPayoutOrder.decentro_txn_id == decentro_txn_id)
        if decentro_txn_id
        else (SupplierPayoutOrder.reference_id == ref_id)
    )
    order = (await db.execute(query)).scalar_one_or_none()

    if not order:
        audit.status = "NOT_FOUND"
        audit.result_summary = f"Payout order not found for txn {decentro_txn_id} / ref {ref_id}"
        await db.commit()
        return {"status": "ACKNOWLEDGED", "message": "Payout order not found"}

    old_status = order.status
    order.status = payout_status
    if utr and not order.bank_reference_number:
        order.bank_reference_number = utr

    # 3. Handle FAILURE / REVERSED: Restore Station Bank Ledger!
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
    audit.result_summary = f"Payout order #{order.id} updated from {old_status} to {payout_status}."
    await db.commit()

    return {"status": "SUCCESS", "order_id": order.id, "payout_status": payout_status}


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

    legal_name = data.get("legalNameOfBusiness")
    trade_name = data.get("tradeName")
    taxpayer_type = data.get("taxpayerType")
    constitution = data.get("constitutionOfBusiness", "Private Limited Company")
    state_code = data.get("stateCode") or clean_gstin[:2]
    state_jurisdiction = data.get("stateName", "Gujarat")
    status_str = (data.get("gstinStatus") or "ACTIVE").upper()
    address = data.get("principalPlaceOfBusiness")

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
        customer_updated=customer_updated,
        message=f"GSTIN verified for '{legal_name}'. Status: {status_str}",
    )


# Mount sub-routers into main router
router.include_router(banking_router)
router.include_router(webhooks_router)
