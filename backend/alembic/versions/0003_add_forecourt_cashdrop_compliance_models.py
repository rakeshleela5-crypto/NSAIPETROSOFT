"""Add Forecourt Controller Logs, Shift Cash Drops, Employee Attendance, Statutory Compliance Licenses, Lube Inward Entries, and water_dip_cm

Revision ID: 0003_add_forecourt_cashdrop_compliance
Revises: 0002_add_r2_storage
Create Date: 2026-10-27 09:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0003_add_forecourt_cashdrop_compliance'
down_revision = '0002_add_r2_storage'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add water_dip_cm to tank_dip_entries if not present
    try:
        op.add_column('tank_dip_entries', sa.Column('water_dip_cm', sa.Numeric(12, 3), server_default='0.0', nullable=True))
    except Exception:
        pass

    # 2. Create forecourt_controller_logs table
    op.create_table(
        'forecourt_controller_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('tx_id', sa.String(length=50), unique=True, index=True, nullable=False),
        sa.Column('event_time', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('pump_id', sa.Integer(), nullable=False),
        sa.Column('nozzle_name', sa.String(length=50), nullable=False),
        sa.Column('product_name', sa.String(length=100), nullable=False),
        sa.Column('product_code', sa.String(length=20), server_default='MS', nullable=False),
        sa.Column('liters', sa.Numeric(12, 3), nullable=False),
        sa.Column('rate', sa.Numeric(12, 2), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('protocol', sa.String(length=100), server_default='DOMS PSS 5000 (Ethernet TCP/IP)', nullable=False),
        sa.Column('controller_ip', sa.String(length=100), server_default='192.168.1.150:4001', nullable=False),
        sa.Column('status', sa.String(length=30), server_default='PENDING', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # 3. Create shift_cash_drops table
    op.create_table(
        'shift_cash_drops',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('shift_id', sa.Integer(), sa.ForeignKey('shifts.id'), nullable=True, index=True),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=True, index=True),
        sa.Column('drop_time', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('vault_account_id', sa.Integer(), sa.ForeignKey('bank_accounts.id'), server_default='1', nullable=False),
        sa.Column('witness_name', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # 4. Create employee_attendance table
    op.create_table(
        'employee_attendance',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False, index=True),
        sa.Column('shift_id', sa.Integer(), sa.ForeignKey('shifts.id'), nullable=True, index=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=30), server_default='PRESENT', nullable=False),
        sa.Column('in_time', sa.String(length=20), nullable=True),
        sa.Column('out_time', sa.String(length=20), nullable=True),
        sa.Column('opening_cash_float', sa.Numeric(12, 2), server_default='0.0', nullable=False),
        sa.Column('remarks', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # 5. Create statutory_compliance_licenses table
    op.create_table(
        'statutory_compliance_licenses',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('license_name', sa.String(length=150), nullable=False, index=True),
        sa.Column('license_number', sa.String(length=100), unique=True, nullable=False, index=True),
        sa.Column('issuing_authority', sa.String(length=150), server_default='PESO / Govt of Gujarat', nullable=False),
        sa.Column('issue_date', sa.Date(), nullable=False),
        sa.Column('expiry_date', sa.Date(), nullable=False, index=True),
        sa.Column('reminder_days_before', sa.Integer(), server_default='30', nullable=False),
        sa.Column('document_key', sa.String(length=500), nullable=True),
        sa.Column('status', sa.String(length=30), server_default='ACTIVE', nullable=False),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # 6. Create lube_inward_entries table
    op.create_table(
        'lube_inward_entries',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('invoice_no', sa.String(length=100), nullable=False, index=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('supplier_name', sa.String(length=150), server_default='BHARAT PETROLEUM CORP LTD (LUBE DIV)', nullable=False),
        sa.Column('lube_product_id', sa.Integer(), sa.ForeignKey('lube_products.id'), nullable=False, index=True),
        sa.Column('qty_units', sa.Integer(), nullable=False),
        sa.Column('cost_price', sa.Numeric(12, 2), nullable=False),
        sa.Column('total_amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('batch_no', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
    )


def downgrade():
    op.drop_table('lube_inward_entries')
    op.drop_table('statutory_compliance_licenses')
    op.drop_table('employee_attendance')
    op.drop_table('shift_cash_drops')
    op.drop_table('forecourt_controller_logs')
    try:
        op.drop_column('tank_dip_entries', 'water_dip_cm')
    except Exception:
        pass
