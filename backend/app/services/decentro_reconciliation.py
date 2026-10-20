import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging_config import decentro_logger
from app.models.decentro import (
    CustomerVirtualAccount,
    DecentroTransaction,
    DecentroWebhookLog,
)
from app.models.petrol_pump import BankAccount, Customer, PaymentReceipt
from app.schemas.decentro import DecentroWebhookPayload, WebhookReconciliationResponse


async def process_decentro_webhook_event(
    session: AsyncSession,
    payload: DecentroWebhookPayload,
    raw_payload_str: str,
    headers_dict: Dict[str, str],
    signature: Optional[str] = None,
    signature_valid: bool = True,
) -> WebhookReconciliationResponse:
    """
    Real-time atomic reconciliation engine for incoming Decentro webhooks:
    1. Idempotency guard: Prevents double-processing via UTR and Decentro Txn ID checks.
    2. Virtual Account matching: Resolves the customer and credit ledger.
    3. Ledger Updates: Inserts PaymentReceipt, updates customer outstanding, and credits station bank ledger.
    4. Comprehensive Audit Trail: Updates DecentroTransaction and DecentroWebhookLog.
    """
    decentro_txn_id = payload.decentroTxnId
    utr = payload.bankReferenceNumber
    amount = float(payload.amount or 0.0)
    event_type = payload.eventType or payload.transactionType or "CREDIT_NOTIFICATION"
    payer_van = payload.payerVirtualAccountNumber or payload.payeeAccountNumber

    # 1. Audit Log: Store raw webhook attempt
    webhook_log = DecentroWebhookLog(
        event_type=str(event_type),
        decentro_txn_id=decentro_txn_id,
        signature=signature,
        signature_valid=signature_valid,
        processing_status="PROCESSING",
        headers_dump=json.dumps(headers_dict, default=str),
        payload_dump=raw_payload_str,
    )
    session.add(webhook_log)
    await session.flush()

    # 2. Idempotency Check: Have we already processed this UTR / decentro_txn_id?
    if utr or decentro_txn_id:
        query = select(DecentroTransaction).where(
            (DecentroTransaction.bank_reference_number == utr)
            if utr
            else (DecentroTransaction.decentro_txn_id == decentro_txn_id)
        )
        existing_txn = (await session.execute(query)).scalar_one_or_none()
        if existing_txn and existing_txn.status in {"RECONCILED", "SUCCESS"}:
            webhook_log.processing_status = "DUPLICATE"
            webhook_log.reconciliation_result = f"Ignored duplicate event for UTR {utr}"
            await session.commit()
            decentro_logger.info(
                f"Ignored duplicate Decentro webhook event for UTR {utr}",
                extra={"utr": utr, "decentro_txn_id": decentro_txn_id},
            )
            return WebhookReconciliationResponse(
                status="ALREADY_PROCESSED",
                decentro_txn_id=decentro_txn_id,
                utr=utr,
                reconciled=True,
                customer_id=existing_txn.customer_id,
                message="Transaction already processed and reconciled idempotently.",
            )

    # 3. Check if this is a Dynamic UPI QR payment confirmation
    if event_type in {"UPI", "COLLECTION_REQUEST_STATUS", "UPI_STATUS"} or (
        payload.referenceId and payload.referenceId.startswith("UPI_")
    ):
        ref_id = payload.referenceId
        if ref_id:
            query = select(DecentroTransaction).where(DecentroTransaction.reference_id == ref_id)
            upi_txn = (await session.execute(query)).scalar_one_or_none()
            if upi_txn:
                upi_txn.status = "SUCCESS"
                upi_txn.bank_reference_number = utr
                upi_txn.payer_vpa = payload.payerVpa
                upi_txn.response_payload = raw_payload_str
                webhook_log.processing_status = "PROCESSED"
                webhook_log.reconciliation_result = f"Dynamic UPI QR {ref_id} reconciled successfully."
                await session.commit()
                return WebhookReconciliationResponse(
                    status="SUCCESS",
                    decentro_txn_id=decentro_txn_id,
                    utr=utr,
                    reconciled=True,
                    message=f"Dynamic UPI QR {ref_id} verified and updated to SUCCESS.",
                )

    # 4. Virtual Account RTGS/NEFT/IMPS Inbound Reconciliation
    customer: Optional[Customer] = None
    if payer_van:
        # Match via dedicated CustomerVirtualAccount table
        va_query = select(CustomerVirtualAccount).where(
            CustomerVirtualAccount.virtual_account_number == payer_van.strip().upper()
        )
        cva = (await session.execute(va_query)).scalar_one_or_none()
        if cva:
            customer = await session.get(Customer, cva.customer_id)

        # Fallback: Extract numeric customer code from VAN prefix e.g. NSAI000042
        if not customer and payer_van.startswith(settings.DECENTRO_VAN_PREFIX):
            van_digits = payer_van.replace(settings.DECENTRO_VAN_PREFIX, "").lstrip("0")
            if van_digits.isdigit():
                customer = await session.get(Customer, int(van_digits))

    # 5. Process matched customer ledger
    if customer and amount > 0:
        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        receipt_suffix = (utr[-4:] if utr else uuid.uuid4().hex[:4]).upper()
        receipt_no = f"VR-{timestamp_str}-{receipt_suffix}"

        # Insert atomic PaymentReceipt
        payment_receipt = PaymentReceipt(
            receipt_no=receipt_no,
            customer_id=customer.id,
            amount=amount,
            payment_mode="NEFT/RTGS",
            bank_name=payload.payerIfsc or "Decentro / YES Bank VAN",
            receiving_account=payer_van or "DECENTRO ESCROW",
            cheque_no=utr or "DEC-AUTO",
            remarks=(
                f"Decentro BaaS Real-Time Auto-Recon | Payer: {payload.payerName or customer.name} "
                f"| UTR: {utr or 'N/A'}"
            ),
        )
        session.add(payment_receipt)

        # Update customer ledger (reduce outstanding)
        new_outstanding = round(float(customer.current_outstanding) - amount, 2)
        customer.current_outstanding = new_outstanding

        # Update Bank Account Ledger (Decentro Nodal / Primary)
        bank_query = select(BankAccount).where(
            BankAccount.account_name.ilike("%DECENTRO%")
            | BankAccount.account_name.ilike("%ESCROW%")
            | BankAccount.account_name.ilike("%PRIMARY%")
        )
        bank_acc = (await session.execute(bank_query)).scalars().first()
        if not bank_acc:
            bank_acc = BankAccount(
                account_name="DECENTRO ESCROW / NODAL",
                account_type="BANK",
                balance=amount,
            )
            session.add(bank_acc)
        else:
            bank_acc.balance = round(float(bank_acc.balance) + amount, 2)

        # Create/Update DecentroTransaction record
        ref_id = payload.referenceId or f"VA_REC_{utr or timestamp_str}"
        decentro_txn = DecentroTransaction(
            reference_id=ref_id,
            decentro_txn_id=decentro_txn_id,
            transaction_type="VA_CREDIT",
            amount=amount,
            status="RECONCILED",
            bank_reference_number=utr,
            customer_id=customer.id,
            payer_account=payload.payerAccountNumber,
            payer_name=payload.payerName,
            payee_account=payer_van,
            response_payload=raw_payload_str,
        )
        session.add(decentro_txn)

        webhook_log.processing_status = "PROCESSED"
        webhook_log.reconciliation_result = (
            f"Successfully reconciled ₹{amount:.2f} to Customer #{customer.id} ({customer.name}). "
            f"Receipt #{receipt_no} generated. New Outstanding: ₹{new_outstanding:.2f}"
        )
        await session.commit()

        decentro_logger.info(
            f"Reconciled ₹{amount:.2f} to customer {customer.name} via Decentro VAN {payer_van}",
            extra={
                "customer_id": customer.id,
                "amount": amount,
                "utr": utr,
                "receipt_no": receipt_no,
                "new_outstanding": new_outstanding,
            },
        )

        return WebhookReconciliationResponse(
            status="SUCCESS",
            decentro_txn_id=decentro_txn_id,
            utr=utr,
            reconciled=True,
            customer_id=customer.id,
            customer_code=customer.code,
            receipt_no=receipt_no,
            updated_outstanding=new_outstanding,
            message=f"Reconciled ₹{amount:.2f} to {customer.name}. Receipt #{receipt_no} generated.",
        )

    # 6. Unmatched customer or non-credit event
    ref_id = payload.referenceId or f"DEC_UNMATCHED_{int(datetime.now(timezone.utc).timestamp())}"
    unmatched_txn = DecentroTransaction(
        reference_id=ref_id,
        decentro_txn_id=decentro_txn_id,
        transaction_type=event_type,
        amount=amount,
        status="PENDING_MANUAL_REVIEW" if amount > 0 else "ACKNOWLEDGED",
        bank_reference_number=utr,
        payee_account=payer_van,
        payer_account=payload.payerAccountNumber,
        payer_name=payload.payerName,
        response_payload=raw_payload_str,
        error_message="No matching customer found for virtual account" if amount > 0 else None,
    )
    session.add(unmatched_txn)
    webhook_log.processing_status = "UNMATCHED" if amount > 0 else "PROCESSED"
    webhook_log.reconciliation_result = "No matching customer found for VAN" if amount > 0 else "Acknowledged"
    await session.commit()

    return WebhookReconciliationResponse(
        status="ACKNOWLEDGED",
        decentro_txn_id=decentro_txn_id,
        utr=utr,
        reconciled=False,
        message="Webhook acknowledged; customer mapping pending manual review.",
    )
