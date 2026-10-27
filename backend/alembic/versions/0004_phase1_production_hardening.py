"""Phase 1 Production Hardening: Concurrency Control, Optimistic Locking, Audit Tables, and Indexes

Revision ID: 0004_phase1_production_hardening
Revises: 0003_add_forecourt_cashdrop_compliance
Create Date: 2026-10-27 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0004_phase1_production_hardening'
down_revision = '0003_add_forecourt_cashdrop_compliance'
branch_labels = None
depends_on = None


def add_column_safe(table_name, column):
    try:
        op.add_column(table_name, column)
    except Exception:
        pass


def create_index_safe(index_name, table_name, columns, **kwargs):
    try:
        op.create_index(index_name, table_name, columns, **kwargs)
    except Exception:
        pass


def upgrade():
    # 1. Optimistic Locking (version_id) & Timezone standardization columns
    add_column_safe('rate_histories', sa.Column('version_id', sa.Integer(), server_default='1', nullable=False))
    
    add_column_safe('customers', sa.Column('version_id', sa.Integer(), server_default='1', nullable=False))
    add_column_safe('customers', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')))

    add_column_safe('fleet_customers', sa.Column('version_id', sa.Integer(), server_default='1', nullable=False))

    add_column_safe('tank_dip_entries', sa.Column('version_id', sa.Integer(), server_default='1', nullable=False))
    add_column_safe('tank_dip_entries', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')))

    add_column_safe('tank_dip_logs', sa.Column('version_id', sa.Integer(), server_default='1', nullable=False))

    add_column_safe('credit_sales', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')))

    add_column_safe('payment_receipts', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')))
    add_column_safe('payment_receipts', sa.Column('reference_no', sa.String(length=100), nullable=True))

    add_column_safe('expenses', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')))
    add_column_safe('purchase_entries', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')))

    # 2. Table: idempotency_keys (#1)
    try:
        op.create_table(
            'idempotency_keys',
            sa.Column('key', sa.String(length=128), primary_key=True),
            sa.Column('endpoint', sa.String(length=255), nullable=False),
            sa.Column('request_hash', sa.String(length=64), nullable=False),
            sa.Column('response_status', sa.Integer(), server_default='200', nullable=False),
            sa.Column('response_body', sa.JSON(), nullable=True),
            sa.Column('status', sa.String(length=50), server_default='PROCESSING', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        )
    except Exception:
        pass

    # 3. Table: dead_letter_events (#39)
    try:
        op.create_table(
            'dead_letter_events',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('event_type', sa.String(length=100), nullable=False),
            sa.Column('payload', sa.JSON(), nullable=True),
            sa.Column('headers', sa.JSON(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('traceback', sa.Text(), nullable=True),
            sa.Column('status', sa.String(length=50), server_default='PENDING_REPLAY', nullable=False),
            sa.Column('retry_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('last_attempt_at', sa.DateTime(timezone=True), nullable=True),
        )
    except Exception:
        pass

    # 4. Table: financial_audit_logs (#100, #105)
    try:
        op.create_table(
            'financial_audit_logs',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('actor_id', sa.String(length=100), nullable=True),
            sa.Column('role', sa.String(length=50), nullable=True),
            sa.Column('action', sa.String(length=100), nullable=False),
            sa.Column('entity_type', sa.String(length=100), nullable=False),
            sa.Column('entity_id', sa.String(length=100), nullable=True),
            sa.Column('before_state', sa.JSON(), nullable=True),
            sa.Column('after_state', sa.JSON(), nullable=True),
            sa.Column('ip_address', sa.String(length=50), nullable=True),
            sa.Column('request_id', sa.String(length=128), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        )
    except Exception:
        pass

    # 5. Composite & B-Tree Indexes (#20, #21)
    create_index_safe('ix_shifts_date_status', 'shifts', ['date', 'status'])
    create_index_safe('ix_credit_sales_customer_id_created_at', 'credit_sales', ['customer_id', 'created_at'])
    create_index_safe('ix_credit_sales_customer_id_date', 'credit_sales', ['customer_id', 'date'])
    create_index_safe('ix_payment_receipts_customer_id_created_at', 'payment_receipts', ['customer_id', 'created_at'])
    create_index_safe('ix_payment_receipts_reference_no', 'payment_receipts', ['reference_no'])
    create_index_safe('ix_tank_dip_entries_tank_id_created_at', 'tank_dip_entries', ['tank_id', 'created_at'])
    create_index_safe('ix_tank_dip_entries_tank_id_date', 'tank_dip_entries', ['tank_id', 'date'])
    create_index_safe('ix_tank_dip_logs_tank_id_created_at', 'tank_dip_logs', ['tank_id', 'created_at'])
    create_index_safe('ix_tank_dip_logs_tank_id_date', 'tank_dip_logs', ['tank_id', 'date'])
    create_index_safe('ix_idempotency_keys_status', 'idempotency_keys', ['status'])
    create_index_safe('ix_idempotency_keys_expires_at', 'idempotency_keys', ['expires_at'])
    create_index_safe('ix_dead_letter_events_status', 'dead_letter_events', ['status'])
    create_index_safe('ix_dead_letter_events_event_type', 'dead_letter_events', ['event_type'])
    create_index_safe('ix_financial_audit_logs_action_created_at', 'financial_audit_logs', ['action', 'created_at'])
    create_index_safe('ix_financial_audit_logs_entity', 'financial_audit_logs', ['entity_type', 'entity_id'])


def downgrade():
    try:
        op.drop_table('financial_audit_logs')
        op.drop_table('dead_letter_events')
        op.drop_table('idempotency_keys')
    except Exception:
        pass
