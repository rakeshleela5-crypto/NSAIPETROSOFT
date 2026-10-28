"""Phase 4 Application Security, RBAC & Field-Level Encryption

Revision ID: 0005_phase4_application_security_and_rbac
Revises: 0004_phase1_production_hardening
Create Date: 2026-10-28 08:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '0005_phase4_application_security_and_rbac'
down_revision = '0004_phase1_production_hardening'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Create refresh_tokens table for revocable JWT token rotation (#47)
    op.execute("""
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id SERIAL PRIMARY KEY,
            token_hash VARCHAR(64) NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            revoked BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_refresh_tokens_token_hash ON refresh_tokens (token_hash)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON refresh_tokens (user_id)
    """)

    # 2. Create system_credentials table for encrypted sensitive credentials at rest (#50)
    op.execute("""
        CREATE TABLE IF NOT EXISTS system_credentials (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            service VARCHAR(50) NOT NULL,
            encrypted_secret TEXT NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_system_credentials_name ON system_credentials (name)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_system_credentials_service ON system_credentials (service)
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS system_credentials CASCADE")
    op.execute("DROP TABLE IF EXISTS refresh_tokens CASCADE")
