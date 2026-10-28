from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import secrets
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.petrol_pump import RefreshToken, User

# OAuth2 scheme - allows optional header so existing unauthenticated calls don't crash
# while enforcing strict validation on protected routes
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False,
)

PBKDF2_ITERATIONS = 100_000

# ---------------------------------------------------------------------------
# Canonical Role Definitions & Hierarchical Capabilities (#48)
# ---------------------------------------------------------------------------
ROLE_ALIASES: Dict[str, str] = {
    "ADMIN": "OWNER",
    "OWNER": "OWNER",
    "MANAGER": "MANAGER",
    "ACCOUNTANT": "ACCOUNTANT",
    "CASHIER": "ACCOUNTANT",
    "ATTENDANT": "ATTENDANT",
}

ROLE_HIERARCHY_LEVELS: Dict[str, int] = {
    "OWNER": 40,
    "MANAGER": 30,
    "ACCOUNTANT": 20,
    "ATTENDANT": 10,
}


def normalize_role(role: str) -> str:
    """
    Normalizes a role string into one of the 4 canonical roles:
    OWNER, MANAGER, ACCOUNTANT, ATTENDANT.
    """
    clean_role = role.strip().upper() if role else "ATTENDANT"
    return ROLE_ALIASES.get(clean_role, clean_role)


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
# JWT Access Token Helpers (#47)
# ---------------------------------------------------------------------------
def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Creates a signed JWT access token expiring strictly in 30 minutes (#47).
    """
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
# Revocable Refresh Token Rotation Logic (#47)
# ---------------------------------------------------------------------------
def hash_refresh_token(token: str) -> str:
    """Computes SHA-256 hash of a raw refresh token so plaintext tokens are not stored in DB."""
    return hashlib.sha256(token.strip().encode("utf-8")).hexdigest()


async def issue_refresh_token(db: AsyncSession, user_id: int) -> str:
    """
    Issues a cryptographically secure revocable refresh token, persists its SHA-256
    hash in PostgreSQL, and returns the raw token string for the client.
    """
    raw_token = secrets.token_urlsafe(64)
    token_hash = hash_refresh_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    token_record = RefreshToken(
        token_hash=token_hash,
        user_id=user_id,
        expires_at=expires_at,
        revoked=False,
    )
    db.add(token_record)
    await db.commit()
    return raw_token


async def rotate_refresh_token(db: AsyncSession, raw_token: str) -> Tuple[User, str]:
    """
    Validates the provided refresh token and performs atomic one-time rotation:
    1. Revokes the consumed refresh token immediately to prevent replay attacks.
    2. Issues a brand new refresh token.
    3. Returns the associated User and new raw refresh token.
    """
    if not raw_token or not raw_token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_hash = hash_refresh_token(raw_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or unrecognized refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if record.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has already been revoked. Please re-authenticate.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check expiration with timezone awareness
    now = datetime.now(timezone.utc)
    record_expiry = record.expires_at
    if record_expiry.tzinfo is None:
        record_expiry = record_expiry.replace(tzinfo=timezone.utc)

    if record_expiry < now:
        record.revoked = True
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired. Please login again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Revoke consumed token
    record.revoked = True

    # Retrieve and verify user
    user_stmt = select(User).where(User.id == record.user_id)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()

    if not user or not user.is_active:
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Issue fresh rotated token
    new_raw_token = secrets.token_urlsafe(64)
    new_record = RefreshToken(
        token_hash=hash_refresh_token(new_raw_token),
        user_id=user.id,
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        revoked=False,
    )
    db.add(new_record)
    await db.commit()

    return user, new_raw_token


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> bool:
    """
    Explicitly revokes a refresh token on user logout.
    """
    if not raw_token or not raw_token.strip():
        return False
    token_hash = hash_refresh_token(raw_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if record:
        record.revoked = True
        await db.commit()
        return True
    return False


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
    username: Optional[str] = payload.get("sub") or payload.get("username")
    user_id_val = payload.get("user_id")
    if not username and not user_id_val:
        return None

    conditions = []
    if username:
        conditions.append(User.username == str(username))
        if str(username).isdigit():
            conditions.append(User.id == int(username))
    if user_id_val is not None:
        try:
            conditions.append(User.id == int(user_id_val))
        except (ValueError, TypeError):
            pass

    stmt = select(User).where(or_(*conditions), User.is_active.is_(True))
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

    username: Optional[str] = payload.get("sub") or payload.get("username")
    user_id_val = payload.get("user_id")
    if not username and not user_id_val:
        raise credentials_exception

    conditions = []
    if username:
        conditions.append(User.username == str(username))
        if str(username).isdigit():
            conditions.append(User.id == int(username))
    if user_id_val is not None:
        try:
            conditions.append(User.id == int(user_id_val))
        except (ValueError, TypeError):
            pass

    stmt = select(User).where(or_(*conditions))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user account")
    return user


def require_roles(*allowed_roles: str):
    """
    Reusable role guard dependency supporting canonical roles (#48):
    OWNER, MANAGER, ACCOUNTANT, and ATTENDANT.
    - Case-insensitive (e.g. 'owner', 'OWNER', 'admin' all map to OWNER).
    - Incorporates role hierarchy: higher privilege roles satisfy requirements of lower roles.
      (e.g. An OWNER or MANAGER can execute any endpoint requiring ATTENDANT or ACCOUNTANT).
    """
    normalized_allowed: Set[str] = {normalize_role(r) for r in allowed_roles}
    min_required_level = min(
        (ROLE_HIERARCHY_LEVELS.get(r, 10) for r in normalized_allowed),
        default=10,
    )

    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role = normalize_role(current_user.role)
        user_level = ROLE_HIERARCHY_LEVELS.get(user_role, 0)

        # Allow if role matches directly or user's hierarchy level meets/exceeds requirement
        if user_role in normalized_allowed or user_level >= min_required_level:
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Forbidden: Operation requires one of the following roles: {', '.join(sorted(normalized_allowed))}. "
                f"Your assigned role is '{current_user.role}'."
            ),
        )

    return role_checker
