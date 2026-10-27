from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel


class UpiQrTransaction(SQLModel, table=True):
    """
    Forecourt Nozzle / Dispenser dynamic UPI QR code transaction.
    Attendant initiates fuel dispense; customer scans QR; real-time SSE turns screen green.
    """
    __tablename__ = "banking_upi_qr_transactions"

    id: Optional[int] = Field(default=None, primary_key=True)
    reference_id: str = Field(index=True, unique=True, nullable=False)
    decentro_txn_id: Optional[str] = Field(default=None, index=True)
    shift_id: Optional[int] = Field(default=None, index=True)
    nozzle_id: Optional[int] = Field(default=None, index=True)
    lane_id: Optional[str] = Field(default=None)
    bill_no: Optional[str] = Field(default=None)
    amount: float = Field(default=0.0)
    status: str = Field(default="PENDING", index=True)  # PENDING, SUCCESS, FAILURE, EXPIRED
    upi_uri: Optional[str] = Field(default=None)
    qr_code_base64: Optional[str] = Field(default=None)
    payer_vpa: Optional[str] = Field(default=None)
    bank_reference_number: Optional[str] = Field(default=None, index=True)  # UTR
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    paid_at: Optional[datetime] = Field(default=None)


class FleetVirtualAccount(SQLModel, table=True):
    """
    Dedicated Virtual Account mapped to commercial transport/fleet customer.
    Enables B2B credit payments via RTGS, NEFT, IMPS, and UPI without payment gateways.
    """
    __tablename__ = "banking_fleet_virtual_accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: int = Field(index=True, nullable=False)
    account_number: str = Field(index=True, unique=True, nullable=False)
    ifsc: str = Field(default="YESB0CMSNOC")
    bank_name: str = Field(default="YES BANK")
    upi_id: Optional[str] = Field(default=None)
    status: str = Field(default="ACTIVE")
    reference_id: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CollectionLedgerEntry(SQLModel, table=True):
    """
    Immutable audit ledger for B2B fleet virtual account inbound collections.
    Unique constraint on bank_reference_number (UTR) prevents duplicate crediting.
    """
    __tablename__ = "banking_collection_ledger_entries"

    id: Optional[int] = Field(default=None, primary_key=True)
    bank_reference_number: str = Field(index=True, unique=True, nullable=False)  # UTR unique at DB level
    decentro_txn_id: str = Field(index=True, nullable=False)
    customer_id: int = Field(index=True, nullable=False)
    virtual_account_number: str = Field(index=True, nullable=False)
    amount: float = Field(default=0.0)
    transfer_type: str = Field(default="RTGS")  # RTGS, NEFT, IMPS, UPI
    payer_name: Optional[str] = Field(default=None)
    payer_account: Optional[str] = Field(default=None)
    receipt_no: str = Field(index=True, unique=True, nullable=False)
    invoices_cleared_json: Optional[str] = Field(default="[]")  # FIFO invoice settlements
    previous_outstanding: float = Field(default=0.0)
    new_outstanding: float = Field(default=0.0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SupplierPayoutOrder(SQLModel, table=True):
    """
    Outbound high-value disbursement order for OMCs (IOCL, BPCL, HPCL) and distributors.
    Strictly enforced idempotency_key prevents duplicate bank payouts.
    """
    __tablename__ = "banking_supplier_payout_orders"

    id: Optional[int] = Field(default=None, primary_key=True)
    reference_id: str = Field(index=True, unique=True, nullable=False)
    idempotency_key: str = Field(index=True, unique=True, nullable=False)  # Unique DB constraint
    vendor_name: str = Field(nullable=False)
    account_number: str = Field(nullable=False)
    ifsc: str = Field(nullable=False)
    amount: float = Field(nullable=False)
    transfer_type: str = Field(default="RTGS")  # RTGS, NEFT, IMPS
    purpose_message: str = Field(nullable=False)
    status: str = Field(default="INITIATED", index=True)  # INITIATED, PENDING, SUCCESS, FAILURE, REVERSED
    decentro_txn_id: Optional[str] = Field(default=None, index=True)
    bank_reference_number: Optional[str] = Field(default=None, index=True)  # UTR
    is_reversed: bool = Field(default=False)
    reversal_reason: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    settled_at: Optional[datetime] = Field(default=None)


class GstinVerificationRecord(SQLModel, table=True):
    """
    Audit record of Decentro KYC V2 Public Registry GSTIN checks.
    """
    __tablename__ = "banking_gstin_verification_records"

    id: Optional[int] = Field(default=None, primary_key=True)
    gstin: str = Field(index=True, nullable=False)
    legal_name: Optional[str] = Field(default=None)
    trade_name: Optional[str] = Field(default=None)
    taxpayer_type: Optional[str] = Field(default=None)
    constitution_of_business: Optional[str] = Field(default=None)
    state_jurisdiction: Optional[str] = Field(default=None)
    state_code: Optional[str] = Field(default=None)
    registration_status: str = Field(default="ACTIVE")
    address: Optional[str] = Field(default=None)
    customer_id: Optional[int] = Field(default=None)
    verified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DecentroWebhookAudit(SQLModel, table=True):
    """
    Immutable raw webhook audit log for both collections and payout callbacks.
    """
    __tablename__ = "banking_decentro_webhook_audits"

    id: Optional[int] = Field(default=None, primary_key=True)
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    endpoint_type: str = Field(default="COLLECTIONS")  # COLLECTIONS or PAYOUTS
    decentro_txn_id: Optional[str] = Field(default=None, index=True)
    bank_reference_number: Optional[str] = Field(default=None, index=True)
    signature: Optional[str] = Field(default=None)
    signature_valid: bool = Field(default=False)
    status: str = Field(default="PROCESSED")
    payload_json: str = Field(default="{}")
    result_summary: Optional[str] = Field(default=None)


# =============================================================================
# Canonical Direct Models (User Specification Alignment)
# =============================================================================
from enum import Enum


class TxnStatus(str, Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    EXPIRED = "EXPIRED"
    REVERSED = "REVERSED"


class FleetCustomer(SQLModel, table=True):
    """B2B Commercial Fleet / Credit Customers with Dedicated Virtual Accounts"""
    __tablename__ = "fleet_customers"

    id: Optional[int] = Field(default=None, primary_key=True)
    business_name: str = Field(index=True)
    gstin: Optional[str] = Field(default=None, unique=True, index=True)
    gstin_verified: bool = Field(default=False)
    contact_phone: str
    contact_email: str
    virtual_account_number: Optional[str] = Field(default=None, unique=True, index=True)
    virtual_account_ifsc: Optional[str] = Field(default=None)
    virtual_account_upi_id: Optional[str] = Field(default=None)
    credit_limit: float = Field(default=0.0)
    current_outstanding: float = Field(default=0.0)
    version_id: int = Field(default=1, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NozzleUPITransaction(SQLModel, table=True):
    """Dynamic UPI QR collections per Nozzle / Attendant Shift"""
    __tablename__ = "nozzle_upi_transactions"

    id: Optional[int] = Field(default=None, primary_key=True)
    reference_id: str = Field(unique=True, index=True)
    decentro_txn_id: Optional[str] = Field(default=None, index=True)
    shift_id: str = Field(index=True)
    nozzle_id: str = Field(index=True)
    attendant_id: str
    fuel_type: str  # MS (Petrol), HSD (Diesel), CNG
    liters_dispensed: Optional[float] = Field(default=None)
    amount: float
    qr_base64: Optional[str] = Field(default=None)
    upi_uri: Optional[str] = Field(default=None)
    payer_vpa: Optional[str] = Field(default=None)
    bank_utr: Optional[str] = Field(default=None, unique=True, index=True)
    status: TxnStatus = Field(default=TxnStatus.PENDING)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    paid_at: Optional[datetime] = Field(default=None)


class VirtualAccountWebhookLog(SQLModel, table=True):
    """Idempotent ledger for inbound RTGS/NEFT/IMPS/UPI Virtual Account credits"""
    __tablename__ = "va_webhook_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    decentro_txn_id: str = Field(unique=True, index=True)
    bank_utr: str = Field(unique=True, index=True)
    virtual_account_number: str = Field(index=True)
    transfer_type: str  # RTGS, NEFT, IMPS, UPI
    amount: float
    payer_name: Optional[str] = Field(default=None)
    payer_account: Optional[str] = Field(default=None)
    payer_ifsc: Optional[str] = Field(default=None)
    raw_payload: str
    processed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SupplierPayout(SQLModel, table=True):
    """Outbound disbursements to Oil Marketing Companies (IOCL/BPCL/HPCL) & Tankers"""
    __tablename__ = "supplier_payouts"

    id: Optional[int] = Field(default=None, primary_key=True)
    reference_id: str = Field(unique=True, index=True)
    decentro_txn_id: Optional[str] = Field(default=None, index=True)
    supplier_name: str
    supplier_gstin: Optional[str] = Field(default=None)
    invoice_number: str  # e.g., IOCL Tanker Load Invoice
    beneficiary_account: str
    beneficiary_ifsc: str
    transfer_type: str  # RTGS, NEFT, IMPS
    amount: float
    bank_utr: Optional[str] = Field(default=None, index=True)
    status: TxnStatus = Field(default=TxnStatus.PENDING)
    failure_reason: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
