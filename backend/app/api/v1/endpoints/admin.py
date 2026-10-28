import json
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import decentro_logger
from app.db.session import get_db
from app.models.audit import DeadLetterEvent
from app.routers.banking import (
    execute_collections_reconciliation,
    execute_payouts_reconciliation,
)

router = APIRouter()


class DeadLetterEventSummary(BaseModel):
    id: int
    event_type: str
    status: str
    retry_count: int
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    last_attempt_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DeadLetterEventDetail(DeadLetterEventSummary):
    payload: Optional[Any] = None
    headers: Optional[Any] = None
    traceback: Optional[str] = None


class DeadLetterReplayResponse(BaseModel):
    status: str
    event_id: int
    replayed: bool
    retry_count: int
    last_attempt_at: str
    reconciliation_result: Dict[str, Any]
    message: str


@router.post(
    "/dlq/{event_id}/replay",
    response_model=DeadLetterReplayResponse,
    summary="Replay Failed Webhook Event from Dead Letter Queue (#39)",
    description=(
        "Manually re-processes an incoming Decentro webhook or asynchronous event that failed. "
        "Enforces atomic balance updates, increments retry_count, and sets status to REPLAYED upon success."
    ),
)
async def replay_dead_letter_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Admin Dead Letter Queue Replay Endpoint (#39):
    1. Loads the stored event payload, headers, and failure context.
    2. Dispatches to the corresponding reconciliation pipeline.
    3. Persists status transition (REPLAYED or REPLAY_FAILED) with atomic timestamps.
    """
    event = await db.get(DeadLetterEvent, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"DeadLetterEvent #{event_id} was not found in the queue.",
        )

    # Normalize payload
    raw_payload = event.payload
    if isinstance(raw_payload, str):
        try:
            payload_dict = json.loads(raw_payload)
        except Exception:
            payload_dict = {"raw": raw_payload}
    elif isinstance(raw_payload, dict):
        payload_dict = raw_payload
    else:
        payload_dict = {}

    headers_dict = event.headers if isinstance(event.headers, dict) else {}

    decentro_logger.info(
        f"Admin initiating manual replay of DeadLetterEvent #{event_id} (type: {event.event_type})",
        extra={"event_id": event_id, "event_type": event.event_type, "retry_count": event.retry_count},
    )

    try:
        if event.event_type == "DECENTRO_COLLECTIONS_WEBHOOK" or "COLLECTIONS" in event.event_type.upper():
            result = await execute_collections_reconciliation(
                db=db,
                payload=payload_dict,
                headers=headers_dict,
                raw_str=json.dumps(payload_dict, default=str),
            )
        elif event.event_type == "DECENTRO_PAYOUTS_WEBHOOK" or "PAYOUT" in event.event_type.upper():
            result = await execute_payouts_reconciliation(
                db=db,
                payload=payload_dict,
                headers=headers_dict,
                raw_str=json.dumps(payload_dict, default=str),
            )
        else:
            # Polymorphic payload inference
            if payload_dict.get("payerVirtualAccountNumber") or payload_dict.get("payeeAccountNumber") or payload_dict.get("payer_upi"):
                result = await execute_collections_reconciliation(
                    db=db,
                    payload=payload_dict,
                    headers=headers_dict,
                )
            else:
                result = await execute_payouts_reconciliation(
                    db=db,
                    payload=payload_dict,
                    headers=headers_dict,
                )

        now = datetime.now(timezone.utc)
        event.status = "REPLAYED"
        event.retry_count = (event.retry_count or 0) + 1
        event.last_attempt_at = now
        await db.commit()
        await db.refresh(event)

        return DeadLetterReplayResponse(
            status="SUCCESS",
            event_id=event.id,
            replayed=True,
            retry_count=event.retry_count,
            last_attempt_at=now.isoformat(),
            reconciliation_result=result,
            message=f"DeadLetterEvent #{event_id} replayed successfully.",
        )

    except Exception as exc:
        await db.rollback()
        err_trace = traceback.format_exc()
        now = datetime.now(timezone.utc)
        event.status = "REPLAY_FAILED"
        event.retry_count = (event.retry_count or 0) + 1
        event.last_attempt_at = now
        event.error_message = str(exc)
        event.traceback = err_trace
        try:
            await db.commit()
        except Exception:
            await db.rollback()

        decentro_logger.error(
            f"Manual replay of DeadLetterEvent #{event_id} failed: {exc}",
            extra={"event_id": event_id, "error": str(exc), "traceback": err_trace},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Replay execution failed for DeadLetterEvent #{event_id}: {str(exc)}",
        )


@router.get(
    "/dlq",
    summary="List Dead Letter Queue Events",
    description="Retrieve all webhook failures captured in the DeadLetterEvent table with optional filtering.",
)
async def list_dead_letter_events(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status, e.g. PENDING_REPLAY, REPLAYED"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(DeadLetterEvent)
    if status_filter:
        query = query.where(DeadLetterEvent.status == status_filter.upper())
    if event_type:
        query = query.where(DeadLetterEvent.event_type.ilike(f"%{event_type}%"))

    # Count query
    count_query = select(func.count(DeadLetterEvent.id))
    if status_filter:
        count_query = count_query.where(DeadLetterEvent.status == status_filter.upper())
    if event_type:
        count_query = count_query.where(DeadLetterEvent.event_type.ilike(f"%{event_type}%"))

    total_count = (await db.execute(count_query)).scalar() or 0
    events = (
        await db.execute(
            query.order_by(desc(DeadLetterEvent.created_at)).offset(offset).limit(limit)
        )
    ).scalars().all()

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": ev.id,
                "event_type": ev.event_type,
                "status": ev.status,
                "retry_count": ev.retry_count,
                "error_message": ev.error_message,
                "created_at": ev.created_at.isoformat() if ev.created_at else None,
                "last_attempt_at": ev.last_attempt_at.isoformat() if ev.last_attempt_at else None,
            }
            for ev in events
        ],
    }


@router.get(
    "/dlq/{event_id}",
    response_model=DeadLetterEventDetail,
    summary="Get Detailed Dead Letter Event",
    description="Inspect raw payload, headers, and full Python traceback of a failed webhook event.",
)
async def get_dead_letter_event_detail(
    event_id: int,
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(DeadLetterEvent, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"DeadLetterEvent #{event_id} not found.",
        )
    return event
