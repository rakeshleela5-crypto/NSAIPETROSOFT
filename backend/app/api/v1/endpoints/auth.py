from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
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
from app.models.petrol_pump import User

router = APIRouter()


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


@router.post("/verify-pin", summary="Manager PIN Verification (Tamper-Proof)")
async def verify_manager_pin(payload: VerifyPinRequest, db: AsyncSession = Depends(get_db)):
    pin_input = payload.pin.strip()
    if not pin_input:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PIN is required")

    # Fetch active managers and administrators
    stmt = select(User).where(
        User.role.in_(["admin", "manager"]),
        User.is_active.is_(True),
    )
    result = await db.execute(stmt)
    authorized_users = result.scalars().all()

    for u in authorized_users:
        if u.pin_code_hash and verify_pin(pin_input, u.pin_code_hash):
            temp_token = create_access_token(
                data={"sub": u.username, "role": u.role, "user_id": u.id, "scope": "manager_override"}
            )
            return {
                "authorized": True,
                "message": f"Operation approved by {u.full_name} ({u.role.upper()})",
                "authorized_by": u.full_name,
                "role": u.role,
                "token": temp_token,
            }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Access Denied: Invalid Manager PIN.",
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
