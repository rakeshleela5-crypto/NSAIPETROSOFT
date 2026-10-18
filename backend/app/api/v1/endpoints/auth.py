from datetime import datetime, timezone
import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    get_current_user,
    get_password_hash,
    get_pin_hash,
    require_roles,
    verify_password,
    verify_pin,
)
from app.db.session import get_db
from app.models.petrol_pump import User, StationProfileSetting

router = APIRouter()

# ---------------------------------------------------------------------------
# In-Memory Anti Brute-Force Throttle for Manager 4-Digit PIN
# ---------------------------------------------------------------------------
_PIN_ATTEMPTS: Dict[str, Dict[str, Any]] = {}
MAX_FAILED_PIN_ATTEMPTS = 5
PIN_LOCKOUT_SECONDS = 300  # 5 minutes lockout
PIN_WINDOW_SECONDS = 60  # Failure window in seconds


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"



# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class VerifyPinRequest(BaseModel):
    pin: str
    action_title: Optional[str] = Field(default=None, description="Action requiring authorization")


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class CreateUserRequest(BaseModel):
    username: str
    full_name: str
    password: str
    pin: Optional[str] = "1234"
    role: str = "cashier"  # admin, manager, cashier, attendant


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("/login", response_model=TokenResponse, summary="Station User Login")
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.username == credentials.username.strip())
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Contact Station Administrator.",
        )

    token = create_access_token(
        data={"sub": user.username, "role": user.role, "user_id": user.id}
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
        },
    }


@router.post("/verify-pin", summary="Manager PIN Verification (Tamper-Proof & Brute-Force Throttled)")
async def verify_manager_pin(
    payload: VerifyPinRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = _get_client_ip(request)
    now = time.time()

    record = _PIN_ATTEMPTS.get(client_ip)
    if record:
        # Check active lockout
        if record.get("locked_until", 0) > now:
            remaining = int(record["locked_until"] - now)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Security Lockout: Too many failed PIN attempts. Terminal locked for {remaining} seconds. Contact Station Manager.",
            )
        # Reset window if older than 60s
        if now - record.get("first_ts", 0) > PIN_WINDOW_SECONDS:
            record["count"] = 0
            record["first_ts"] = now

    pin_input = payload.pin.strip()
    if not pin_input:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIN is required")

    is_authorized = False
    authorized_by = "Station Manager"
    role = "manager"

    # 1. Check against Station Outlet Profile Setting (owner configured PIN)
    try:
        prof_stmt = select(StationProfileSetting).order_by(StationProfileSetting.id.asc()).limit(1)
        prof_res = await db.execute(prof_stmt)
        station_prof = prof_res.scalar_one_or_none()
        if station_prof and station_prof.manager_pin and pin_input == station_prof.manager_pin.strip():
            is_authorized = True
            authorized_by = f"{station_prof.station_name} Duty Manager"
    except Exception:
        station_prof = None

    # 2. Check active managers and administrators in User table
    if not is_authorized:
        stmt = select(User).where(
            User.role.in_(["admin", "manager"]),
            User.is_active.is_(True),
        )
        result = await db.execute(stmt)
        authorized_users = result.scalars().all()

        for u in authorized_users:
            if u.pin_code_hash and verify_pin(pin_input, u.pin_code_hash):
                is_authorized = True
                authorized_by = u.full_name
                role = u.role
                break

    # 3. Fallback to standard factory default 1234
    if not is_authorized and not station_prof and pin_input == "1234":
        is_authorized = True

    if is_authorized:
        # Successful authentication: clear failure count for this terminal
        _PIN_ATTEMPTS.pop(client_ip, None)
        temp_token = create_access_token(
            data={"sub": authorized_by, "role": role, "scope": "manager_override"}
        )
        return {
            "authorized": True,
            "message": f"Operation approved by {authorized_by} ({role.upper()})",
            "authorized_by": authorized_by,
            "role": role,
            "token": temp_token,
        }

    # Failed attempt: record and track
    if client_ip not in _PIN_ATTEMPTS:
        _PIN_ATTEMPTS[client_ip] = {"count": 1, "first_ts": now, "locked_until": 0}
    else:
        _PIN_ATTEMPTS[client_ip]["count"] += 1

    current_fails = _PIN_ATTEMPTS[client_ip]["count"]
    if current_fails >= MAX_FAILED_PIN_ATTEMPTS:
        _PIN_ATTEMPTS[client_ip]["locked_until"] = now + PIN_LOCKOUT_SECONDS
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Security Alert: 5 consecutive invalid PIN attempts! Terminal temporarily locked for 5 minutes.",
        )

    remaining = MAX_FAILED_PIN_ATTEMPTS - current_fails
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Access Denied: Invalid Manager PIN. ({remaining} attempt{'s' if remaining != 1 else ''} remaining before 5-minute lockout)",
    )


@router.get("/me", response_model=UserResponse, summary="Get Current Session User")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "is_active": current_user.is_active,
    }


@router.get("/users", response_model=List[UserResponse], summary="List Station Staff Users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "manager")),
):
    result = await db.execute(select(User).order_by(desc(User.id)))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
        }
        for u in users
    ]


@router.post("/users", response_model=UserResponse, summary="Create New Station Staff User")
async def create_user(
    data: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    existing = await db.execute(select(User).where(User.username == data.username.strip()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username '{data.username}' already exists.",
        )

    new_user = User(
        username=data.username.strip(),
        full_name=data.full_name.strip(),
        hashed_password=get_password_hash(data.password),
        pin_code_hash=get_pin_hash(data.pin) if data.pin else None,
        role=data.role.strip().lower(),
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return {
        "id": new_user.id,
        "username": new_user.username,
        "full_name": new_user.full_name,
        "role": new_user.role,
        "is_active": new_user.is_active,
    }
