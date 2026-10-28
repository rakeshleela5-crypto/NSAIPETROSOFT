import logging
from typing import Any, Optional
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import String, Text, TypeDecorator

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_fernet() -> Fernet:
    """
    Returns the configured Fernet cipher instance using settings.EFFECTIVE_ENCRYPTION_KEY.
    """
    key = settings.EFFECTIVE_ENCRYPTION_KEY
    if isinstance(key, str):
        key = key.encode("utf-8")
    return Fernet(key)


def encrypt_field(value: Optional[str]) -> Optional[str]:
    """
    Encrypts a plaintext string into a Fernet ciphertext token.
    If the value is already a valid Fernet token, returns it as-is to prevent double encryption.
    """
    if value is None:
        return None
    val_str = str(value)
    if not val_str:
        return ""

    fernet = get_fernet()
    # Check if already encrypted to avoid double encryption
    if val_str.startswith("gAAAAA"):
        try:
            fernet.decrypt(val_str.encode("utf-8"))
            return val_str
        except Exception:
            pass

    token = fernet.encrypt(val_str.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_field(value: Optional[str]) -> Optional[str]:
    """
    Decrypts a Fernet ciphertext token back into plaintext.
    Gracefully handles legacy unencrypted plaintext or invalid tokens by returning the raw string.
    """
    if value is None:
        return None
    val_str = str(value)
    if not val_str:
        return ""

    try:
        fernet = get_fernet()
        decrypted = fernet.decrypt(val_str.encode("utf-8"))
        return decrypted.decode("utf-8")
    except (InvalidToken, Exception) as exc:
        # Gracefully return legacy plaintext stored prior to encryption rollout (#50)
        logger.debug("Field value not encrypted or invalid Fernet token; returning raw: %s", exc)
        return val_str


class EncryptedString(TypeDecorator):
    """
    SQLAlchemy TypeDecorator for transparent field-level encryption at rest (#50).
    - Writes: Transparently encrypts plaintext strings using AES-128-CBC + HMAC-SHA256 (Fernet).
    - Reads: Transparently decrypts ciphertexts.
    - Legacy fallback: If reading pre-existing plaintext, returns the unencrypted value without crashing.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Optional[str], dialect: Any) -> Optional[str]:
        return encrypt_field(value)

    def process_result_value(self, value: Optional[str], dialect: Any) -> Optional[str]:
        return decrypt_field(value)
