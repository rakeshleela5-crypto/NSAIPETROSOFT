from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base import Base

DECIMAL_CURRENCY = Numeric(12, 2, asdecimal=False)


class DecentroTransaction(Base):
    """
    Master audit log for every Decentro API transaction (Dynamic UPI, VA Inbound, Payout, GSTIN).
    Enforces reference_id uniqueness and tracks UTR (bank reference number) for reconciliation.
    """
    __tablename__ = "decentro_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reference_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    decentro_txn_id: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    transaction_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # UPI_QR, VA_CREDIT, PAYOUT, GSTIN_VERIFY
    amount: Mapped[float] = mapped_column(DECIMAL_CURRENCY, default=0.0)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    status: Mapped[str] = mapped_column(String(50), default="PENDING", index=True)  # PENDING, SUCCESS, FAILURE, RECONCILED, REVERSED
    bank_reference_number: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)  # Bank UTR
    
    payer_account: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payer_vpa: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payer_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    payee_account: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payee_vpa: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    upi_uri: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    qr_code_base64: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    customer_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("customers.id"), nullable=True, index=True)
    shift_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("shifts.id"), nullable=True)
    nozzle_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("nozzles.id"), nullable=True)
    bill_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    lane_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vendor_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    
    error_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    request_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=lambda: datetime.now(timezone.utc), onupdate=func.now()
    )

    customer = relationship("Customer")
    shift = relationship("Shift")
    nozzle = relationship("Nozzle")


class CustomerVirtualAccount(Base):
    """
    Virtual Account Number (VAN) mapped to commercial fleet operators / corporate buyers.
    Inbound RTGS/NEFT/IMPS transfers to this VAN are reconciled to the customer's ledger automatically.
    """
    __tablename__ = "customer_virtual_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    virtual_account_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    ifsc: Mapped[str] = mapped_column(String(20), nullable=False, default="YESB0CMSNOC")
    bank_name: Mapped[str] = mapped_column(String(100), default="YES BANK")
    upi_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    decentro_account_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=lambda: datetime.now(timezone.utc)
    )

    customer = relationship("Customer")


class SupplierPayout(Base):
    """
    Outbound vendor/oil-company payment orders (IMPS/NEFT/RTGS) with strict idempotency keys
    to eliminate duplicate disbursements.
    """
    __tablename__ = "decentro_supplier_payouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reference_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(150), nullable=False)
    beneficiary_account: Mapped[str] = mapped_column(String(50), nullable=False)
    beneficiary_ifsc: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float] = mapped_column(DECIMAL_CURRENCY, nullable=False)
    transfer_type: Mapped[str] = mapped_column(String(20), default="IMPS")  # IMPS, NEFT, RTGS, UPI
    purpose_message: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="INITIATED", index=True)  # INITIATED, PENDING, SUCCESS, FAILED, REVERSED
    decentro_txn_id: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    bank_reference_number: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)  # UTR
    debit_account: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=lambda: datetime.now(timezone.utc)
    )
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class DecentroWebhookLog(Base):
    """
    Immutable audit trail of all incoming Decentro webhooks, payload dumps, and reconciliation results.
    """
    __tablename__ = "decentro_webhook_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=lambda: datetime.now(timezone.utc)
    )
    event_type: Mapped[str] = mapped_column(String(100), default="UNKNOWN")
    decentro_txn_id: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    signature: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    signature_valid: Mapped[bool] = mapped_column(Boolean, default=False)
    processing_status: Mapped[str] = mapped_column(String(50), default="PROCESSED")  # PROCESSED, DUPLICATE, FAILED, REJECTED
    headers_dump: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload_dump: Mapped[str] = mapped_column(Text, nullable=False)
    reconciliation_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class GstinVerificationAudit(Base):
    """
    Historical log of GSTIN validations performed for fleets and vendors.
    """
    __tablename__ = "gstin_verification_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    gstin: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    legal_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    trade_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    taxpayer_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    gstin_status: Mapped[str] = mapped_column(String(50), default="ACTIVE")
    state_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decentro_txn_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    customer_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("customers.id"), nullable=True)
    verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=lambda: datetime.now(timezone.utc)
    )

    customer = relationship("Customer")
