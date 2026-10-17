from typing import List, Union
from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "NSAIPETROSOFT API"
    ENVIRONMENT: str = "development"
    PORT: int = 8000
    API_V1_STR: str = "/api/v1"

    # Railway automatically supplies DATABASE_URL or DATABASE_PRIVATE_URL
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/nsaipetrosoft"
    DB_ECHO: bool = False

    # Security & JWT Auth
    SECRET_KEY: str = "nsai-petrosoft-enterprise-secret-key-change-in-production-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 Hours

    # Allowed CORS Origins (comma-separated or list)
    # Examples: http://localhost:5173,https://your-project.pages.dev
    CORS_ORIGINS: Union[str, List[str]] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
    ]

    # Cloudflare R2 Object Storage for Automated Database Backups
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "nsaipetrosoft-backups"
    R2_ENDPOINT_URL: str = ""

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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
