import json
import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional, Union
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import FinancialAuditLog
from app.models.petrol_pump import User

logger = logging.getLogger(__name__)


def _sanitize_for_audit_json(obj: Any) -> Any:
    """
    Recursively converts SQLAlchemy models, Pydantic objects, datetimes,
    Decimals, and primitives into JSON-compatible dictionaries/primitives.
    """
    if obj is None:
        return None
    if isinstance(obj, (int, float, bool, str)):
        return obj
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if hasattr(obj, "model_dump"):
        return _sanitize_for_audit_json(obj.model_dump())
    if hasattr(obj, "dict"):
        return _sanitize_for_audit_json(obj.dict())
    if hasattr(obj, "__table__"):
        # SQLAlchemy model instance
        res: Dict[str, Any] = {}
        for col in obj.__table__.columns:
            val = getattr(obj, col.name, None)
            res[col.name] = _sanitize_for_audit_json(val)
        return res
    if isinstance(obj, dict):
        return {str(k): _sanitize_for_audit_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_sanitize_for_audit_json(item) for item in obj]
    return str(obj)


async def log_audit_event(
    db: AsyncSession,
    actor: Union[User, str, int, None],
    action: str,
    entity_type: str,
    entity_id: Union[str, int, None] = None,
    old_val: Any = None,
    new_val: Any = None,
    request_ip: Optional[str] = None,
    request_id: Optional[str] = None,
    role: Optional[str] = None,
) -> Optional[FinancialAuditLog]:
    """
    Immutable Financial & Forecourt Audit Trail Helper (#100, #105):
    Writes an append-only audit event record to FinancialAuditLog.
    Hooked into fuel price updates, tank dip edits, credit limit changes,
    shift approvals, and Decentro payouts.
    """
    actor_id: Optional[str] = None
    actor_role: Optional[str] = role

    if isinstance(actor, User):
        actor_id = str(actor.id)
        if not actor_role:
            actor_role = getattr(actor, "role", "USER")
    elif actor is not None:
        actor_id = str(actor)
        if not actor_role:
            actor_role = "SYSTEM" if actor_id.upper() == "SYSTEM" else "USER"
    else:
        actor_id = "SYSTEM"
        actor_role = actor_role or "SYSTEM"

    clean_old = _sanitize_for_audit_json(old_val)
    clean_new = _sanitize_for_audit_json(new_val)
    str_entity_id = str(entity_id) if entity_id is not None else None

    try:
        audit_entry = FinancialAuditLog(
            actor_id=actor_id,
            role=actor_role,
            action=action.strip().upper(),
            entity_type=entity_type.strip(),
            entity_id=str_entity_id,
            before_state=clean_old,
            after_state=clean_new,
            ip_address=request_ip,
            request_id=request_id,
            created_at=datetime.now(timezone.utc),
        )
        db.add(audit_entry)
        await db.flush()
        logger.info(
            f"FinancialAuditLog: {action} on {entity_type} #{str_entity_id} by actor {actor_id} ({actor_role})",
            extra={
                "action": action,
                "entity_type": entity_type,
                "entity_id": str_entity_id,
                "actor_id": actor_id,
                "role": actor_role,
            },
        )
        return audit_entry
    except Exception as exc:
        logger.error(f"Failed to write FinancialAuditLog: {exc}", exc_info=True)
        return None
