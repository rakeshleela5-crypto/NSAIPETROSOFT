from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.petrol_pump import User

# OAuth2 scheme - allows optional header so existing unauthenticated calls don't crash
# while enforcing strict validation on protected routes
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False,
)

PBKDF2_ITERATIONS = 100_000


# ---------------------------------------------------------------------------
# Password & PIN Cryptographic Helpers
# ---------------------------------------------------------------------------
def get_password_hash(password: str) -> str:
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        parts = hashed_password.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = bytes.fromhex(parts[2])
        expected_key = bytes.fromhex(parts[3])
        computed_key = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(expected_key, computed_key)
    except Exception:
        return False


def get_pin_hash(pin: str) -> str:
    return get_password_hash(pin.strip())


def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    return verify_password(plain_pin.strip(), hashed_pin)


# ---------------------------------------------------------------------------
# JWT Helpers
# ---------------------------------------------------------------------------
def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


# ---------------------------------------------------------------------------
# FastAPI Authentication Dependencies
# ---------------------------------------------------------------------------
async def get_current_user_optional(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    actual_token = token or request.cookies.get("nsai_access_token") or request.cookies.get("nsai_manager_token")
    if not actual_token:
        return None
    payload = decode_access_token(actual_token)
    if not payload:
        return None
    username: Optional[str] = payload.get("sub")
    if not username:
        return None

    stmt = select(User).where(User.username == username, User.is_active.is_(True))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or session expired",
        headers={"WWW-Authenticate": "Bearer"},
    )
    actual_token = token or request.cookies.get("nsai_access_token") or request.cookies.get("nsai_manager_token")
    if not actual_token:
        raise credentials_exception

    payload = decode_access_token(actual_token)
    if payload is None:
        raise credentials_exception

    username: Optional[str] = payload.get("sub")
    if username is None:
        raise credentials_exception

    stmt = select(User).where(User.username == username)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user account")
    return user


def require_roles(*allowed_roles: str):
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        # admin has super-role permission across all operations
        if current_user.role == "admin" or current_user.role in allowed_roles:
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Operation requires one of the following roles: {', '.join(allowed_roles)}. Your role is '{current_user.role}'.",
        )

    return role_checker
