from datetime import datetime
import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class UpiQrGenerateRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Amount in INR to collect via UPI Dynamic QR")
    purpose_message: str = Field(
        default="NSAI PetroSoft Fuel Dispense",
        max_length=255,
        description="Transaction narration for customer banking display",
    )
    lane_id: Optional[str] = Field(None, description="Forecourt Fuel Lane identifier e.g. 'LANE-1'")
    bill_no: Optional[str] = Field(None, description="ERP Bill or Slip Number e.g. 'BILL-1049'")
    nozzle_id: Optional[int] = Field(None, description="Dispensing Nozzle ID")
    customer_id: Optional[int] = Field(None, description="Fleet Customer ID if credit billing")
    shift_id: Optional[int] = Field(None, description="Active Shift ID")
    expiry_minutes: int = Field(default=10, ge=1, le=60, description="QR Expiry in minutes")
    reference_id: Optional[str] = Field(None, description="Client-side unique reference ID")


class UpiQrGenerateResponse(BaseModel):
    reference_id: str
    decentro_txn_id: Optional[str] = None
    amount: float
    upi_uri: str
    qr_code_base64: Optional[str] = None
    status: str
    expires_at: datetime
    lane_id: Optional[str] = None
    bill_no: Optional[str] = None
    message: str = "Dynamic UPI QR generated successfully"


class UpiStatusResponse(BaseModel):
    reference_id: str
    decentro_txn_id: Optional[str] = None
    status: str
    amount: float
    bank_reference_number: Optional[str] = None
    payer_vpa: Optional[str] = None
    transaction_timestamp: Optional[str] = None
    message: str


class VirtualAccountCreateRequest(BaseModel):
    customer_id: int = Field(..., description="ERP Customer ID to map dedicated virtual account")
    bank_code: str = Field(default="YESB", description="Bank partner code e.g. 'YESB', 'ICIC', 'AXIS'")
    custom_vpa: Optional[str] = Field(None, description="Optional custom UPI handle alias")


class VirtualAccountResponse(BaseModel):
    customer_id: int
    customer_name: str
    virtual_account_number: str
    ifsc: str
    bank_name: str
    upi_id: Optional[str] = None
    status: str
    created_at: datetime


class DecentroWebhookPayload(BaseModel):
    attempt: Optional[int] = None
    decentroTxnId: Optional[str] = Field(None, alias="decentro_txn_id")
    bankReferenceNumber: Optional[str] = Field(None, alias="bank_reference_number")
    amount: Optional[float] = None
    transactionType: Optional[str] = Field(None, alias="transaction_type")
    transferType: Optional[str] = Field(None, alias="transfer_type")
    payerVirtualAccountNumber: Optional[str] = Field(None, alias="payer_virtual_account_number")
    payeeAccountNumber: Optional[str] = Field(None, alias="payee_account_number")
    payerAccountNumber: Optional[str] = Field(None, alias="payer_account_number")
    payerName: Optional[str] = Field(None, alias="payer_name")
    payerIfsc: Optional[str] = Field(None, alias="payer_ifsc")
    payerVpa: Optional[str] = Field(None, alias="payer_vpa")
    timestamp: Optional[str] = None
    transactionStatus: Optional[str] = Field(None, alias="transaction_status")
    referenceId: Optional[str] = Field(None, alias="reference_id")
    eventType: Optional[str] = Field(None, alias="event_type")

    model_config = ConfigDict(populate_by_name=True, extra="allow")


class WebhookReconciliationResponse(BaseModel):
    status: str
    decentro_txn_id: Optional[str] = None
    utr: Optional[str] = None
    reconciled: bool
    customer_id: Optional[int] = None
    customer_code: Optional[str] = None
    receipt_no: Optional[str] = None
    updated_outstanding: Optional[float] = None
    message: str


class SupplierPayoutRequest(BaseModel):
    vendor_name: str = Field(..., min_length=2, max_length=150, description="Vendor or Oil Company Name (e.g. 'BPCL')")
    account_number: str = Field(..., min_length=6, max_length=35, description="Beneficiary Bank Account Number")
    ifsc: str = Field(..., min_length=11, max_length=11, description="Beneficiary Bank IFSC Code (11 alphanumeric)")
    amount: float = Field(..., gt=0, description="Disbursement amount in INR")
    transfer_type: str = Field(default="IMPS", description="IMPS, NEFT, RTGS, or UPI")
    purpose_message: str = Field(..., max_length=255, description="Purpose (e.g. 'Tanker Decantation Indent #48821')")
    idempotency_key: str = Field(
        ...,
        min_length=8,
        max_length=100,
        description="Client-generated unique idempotency token to prevent double-disbursement",
    )
    vendor_id: Optional[int] = None

    @field_validator("ifsc")
    @classmethod
    def validate_ifsc(cls, v: str) -> str:
        clean = v.strip().upper()
        if not re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", clean):
            raise ValueError("Invalid IFSC format. Expected 4 letters, '0', then 6 alphanumeric characters.")
        return clean

    @field_validator("transfer_type")
    @classmethod
    def validate_transfer_type(cls, v: str) -> str:
        clean = v.strip().upper()
        if clean not in {"IMPS", "NEFT", "RTGS", "UPI"}:
            raise ValueError("transfer_type must be one of IMPS, NEFT, RTGS, or UPI")
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


class GstinVerifyRequest(BaseModel):
    gstin: str = Field(..., description="15-character Indian Goods & Services Tax Identification Number")
    customer_id: Optional[int] = Field(None, description="Optional Customer ID to auto-populate master ledger")
    update_customer: bool = Field(default=False, description="Whether to update Customer record with verified data")

    @field_validator("gstin")
    @classmethod
    def validate_gstin_format(cls, v: str) -> str:
        clean = v.strip().upper()
        # Regex: 2 digits (state code), 5 letters (PAN), 4 digits, 1 letter, 1 entity code, 'Z', 1 checksum char
        pattern = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
        if not re.match(pattern, clean):
            raise ValueError(
                "Invalid GSTIN format. Expected 15 characters: 2-digit state code + 10-character PAN + 1 entity + 'Z' + 1 checksum (e.g. 24AAACB2233M1Z5)"
            )
        return clean


class GstinVerifyResponse(BaseModel):
    gstin: str
    is_valid: bool
    legal_name: Optional[str] = None
    trade_name: Optional[str] = None
    taxpayer_type: Optional[str] = None
    gstin_status: str = "ACTIVE"
    state_code: Optional[str] = None
    address: Optional[str] = None
    registration_date: Optional[str] = None
    customer_updated: bool = False
    message: str
