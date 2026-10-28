import os
from typing import List, Optional, Union
from pydantic import computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "NSAIPETROSOFT API"
    ENVIRONMENT: str = "development"
    PORT: int = 8000
    API_V1_STR: str = "/api/v1"

    # Railway automatically supplies DATABASE_URL or DATABASE_PRIVATE_URL
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/nsaipetrosoft"
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: float = 30.0
    DB_POOL_RECYCLE: int = 1800

    # Security & JWT Auth (Overridden automatically by Railway environment variable SECRET_KEY)
    SECRET_KEY: str = "nsai-petrosoft-enterprise-secret-key-change-in-production-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # Access tokens expire in 30 minutes (#47)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # Revocable refresh token validity (#47)

    # Field-Level Encryption (#50)
    # 32-byte urlsafe base64 Fernet key. Required in production.
    DEV_FALLBACK_ENCRYPTION_KEY: str = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="
    ENCRYPTION_KEY: str = ""

    # Allowed CORS Origins - strictly locked to Cloudflare Pages production and local development (#18)
    CORS_ORIGINS: Union[str, List[str]] = [
        "https://nsaipetrosoft.pages.dev",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    # Cloudflare R2 Object Storage for Forecourt Documents, Invoices & Automated Backups
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "nsaipetrosoft-storage"
    R2_PUBLIC_DOMAIN: Optional[str] = None
    R2_ENDPOINT_URL: str = ""

    # Decentro Banking-as-a-Service (BaaS) Configurations
    DECENTRO_CLIENT_ID: str = "decentro_demo_client_id"
    DECENTRO_CLIENT_SECRET: str = "decentro_demo_client_secret"
    DECENTRO_MODULE_SECRET: str = "decentro_demo_module_secret"
    DECENTRO_ACCOUNTS_MODULE_SECRET: str = "sandbox_accounts_secret"
    DECENTRO_PAYMENTS_MODULE_SECRET: str = "sandbox_payments_secret"
    DECENTRO_KYC_MODULE_SECRET: str = "sandbox_kyc_secret"
    DECENTRO_PROVIDER_SECRET: str = "decentro_demo_provider_secret"
    DECENTRO_WEBHOOK_SECRET: str = "decentro_webhook_secret_nsai_2026"
    DECENTRO_BASE_URL: str = "https://in.staging.decentro.tech"
    DECENTRO_TIMEOUT_SECONDS: float = 30.0
    DECENTRO_MAX_RETRIES: int = 3
    DECENTRO_VAN_PREFIX: str = "NSAI"
    STATION_MASTER_VA_NUMBER: str = "46251000000012"
    STATION_MASTER_IFSC: str = "YESB0CMSNOC"
    DECENTRO_MASTER_ACCOUNT: str = "46251000000012"
    DECENTRO_MASTER_IFSC: str = "YESB0CMSNOC"
    DECENTRO_SIMULATION_MODE: bool = False

    @computed_field
    @property
    def EFFECTIVE_R2_ENDPOINT(self) -> str:
        if self.R2_ENDPOINT_URL:
            return self.R2_ENDPOINT_URL.strip().rstrip("/")
        if self.R2_ACCOUNT_ID:
            return f"https://{self.R2_ACCOUNT_ID.strip()}.r2.cloudflarestorage.com"
        return ""

    @computed_field
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        """
        Converts Railway's postgres:// or postgresql:// to postgresql+asyncpg://
        """
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @computed_field
    @property
    def ALL_CORS_ORIGINS(self) -> List[str]:
        if isinstance(self.CORS_ORIGINS, str):
            origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        else:
            origins = list(self.CORS_ORIGINS)
        return origins

    @computed_field
    @property
    def EFFECTIVE_ENCRYPTION_KEY(self) -> str:
        if self.ENCRYPTION_KEY and self.ENCRYPTION_KEY.strip():
            return self.ENCRYPTION_KEY.strip()
        return self.DEV_FALLBACK_ENCRYPTION_KEY

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        """
        Centralized startup validation (#19): Fails fast at startup if any required
        Railway production environment variable is missing or using insecure defaults.
        """
        is_prod = (
            self.ENVIRONMENT.lower() in ("production", "prod")
            or bool(os.getenv("RAILWAY_ENVIRONMENT"))
            or bool(os.getenv("RAILWAY_PROJECT_ID"))
        )

        # Allow explicit test bypass via environment variable
        if is_prod and os.getenv("BYPASS_PRODUCTION_SECRET_CHECK", "").lower() not in ("true", "1"):
            missing = []

            # 1. Database URL
            if not self.DATABASE_URL or ("localhost" in self.DATABASE_URL and not os.getenv("ALLOW_LOCALHOST_DB_IN_PROD")):
                missing.append("DATABASE_URL must be configured with a valid remote PostgreSQL database in production")

            # 2. JWT Secret Key
            if not self.SECRET_KEY or "change-in-production" in self.SECRET_KEY or len(self.SECRET_KEY) < 32:
                missing.append("SECRET_KEY must be a cryptographically secure string of at least 32 characters in production")

            # 3. Encryption Key
            if not self.ENCRYPTION_KEY or self.ENCRYPTION_KEY == self.DEV_FALLBACK_ENCRYPTION_KEY:
                missing.append("ENCRYPTION_KEY must be provided as a unique 32-byte urlsafe base64 Fernet key in production")
            else:
                try:
                    from cryptography.fernet import Fernet
                    Fernet(self.ENCRYPTION_KEY.encode("utf-8"))
                except Exception as exc:
                    missing.append(f"ENCRYPTION_KEY is invalid: {exc}")

            # 4. Decentro BaaS Keys
            decentro_keys = [
                ("DECENTRO_CLIENT_ID", self.DECENTRO_CLIENT_ID),
                ("DECENTRO_CLIENT_SECRET", self.DECENTRO_CLIENT_SECRET),
                ("DECENTRO_MODULE_SECRET", self.DECENTRO_MODULE_SECRET),
                ("DECENTRO_PROVIDER_SECRET", self.DECENTRO_PROVIDER_SECRET),
                ("DECENTRO_WEBHOOK_SECRET", self.DECENTRO_WEBHOOK_SECRET),
            ]
            for key_name, key_val in decentro_keys:
                if not key_val or "demo" in key_val.lower():
                    missing.append(f"{key_name} is required and cannot be empty or demo placeholder in production")

            # 5. Cloudflare R2 Keys
            r2_keys = [
                ("R2_ACCOUNT_ID", self.R2_ACCOUNT_ID),
                ("R2_ACCESS_KEY_ID", self.R2_ACCESS_KEY_ID),
                ("R2_SECRET_ACCESS_KEY", self.R2_SECRET_ACCESS_KEY),
                ("R2_BUCKET_NAME", self.R2_BUCKET_NAME),
            ]
            for key_name, key_val in r2_keys:
                if not key_val:
                    missing.append(f"{key_name} is required for Cloudflare R2 in production")

            if missing:
                error_msg = (
                    "CRITICAL RAILWAY STARTUP FAILURE: Server cannot start in production because "
                    "the following required environment secrets are missing or insecure:\n  - "
                    + "\n  - ".join(missing)
                )
                raise ValueError(error_msg)

        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
