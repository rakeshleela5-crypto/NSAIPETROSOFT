"""Add Cloudflare R2 object key columns and tables

Revision ID: 0002_add_r2_storage
Revises: 0001_initial
Create Date: 2026-10-27 08:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0002_add_r2_storage'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add object_key columns to existing tables
    op.add_column('expenses', sa.Column('object_key', sa.String(length=500), nullable=True))
    op.add_column('shifts', sa.Column('handover_object_key', sa.String(length=500), nullable=True))
    op.add_column('shift_meter_readings', sa.Column('closing_photo_key', sa.String(length=500), nullable=True))
    op.add_column('shift_meter_readings', sa.Column('object_key', sa.String(length=500), nullable=True))
    op.add_column('credit_sales', sa.Column('indent_slip_key', sa.String(length=500), nullable=True))
    op.add_column('credit_sales', sa.Column('object_key', sa.String(length=500), nullable=True))
    op.add_column('tank_dip_entries', sa.Column('receipt_photo_key', sa.String(length=500), nullable=True))
    op.add_column('tank_dip_entries', sa.Column('object_key', sa.String(length=500), nullable=True))
    op.add_column('retail_cash_invoices', sa.Column('object_key', sa.String(length=500), nullable=True))

    # 2. Create shift_handovers table
    op.create_table(
        'shift_handovers',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('shift_id', sa.Integer(), sa.ForeignKey('shifts.id'), nullable=False, index=True),
        sa.Column('attendant_name', sa.String(length=100), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('shift_name', sa.String(length=50), server_default='First', nullable=False),
        sa.Column('closing_photo_key', sa.String(length=500), nullable=True),
        sa.Column('handover_pdf_key', sa.String(length=500), nullable=True),
        sa.Column('object_key', sa.String(length=500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # 3. Create tank_dip_logs table
    op.create_table(
        'tank_dip_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('tank_id', sa.Integer(), sa.ForeignKey('tanks.id'), nullable=False, index=True),
        sa.Column('shift_id', sa.Integer(), sa.ForeignKey('shifts.id'), nullable=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('dip_cm', sa.Numeric(12, 3), server_default='0.0', nullable=False),
        sa.Column('water_dip_cm', sa.Numeric(12, 3), server_default='0.0', nullable=False),
        sa.Column('stock_liters', sa.Numeric(12, 3), server_default='0.0', nullable=False),
        sa.Column('density_15c', sa.Numeric(12, 3), nullable=True),
        sa.Column('temp_c', sa.Numeric(12, 3), nullable=True),
        sa.Column('receipt_photo_key', sa.String(length=500), nullable=True),
        sa.Column('object_key', sa.String(length=500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # 4. Create fleet_invoices table
    op.create_table(
        'fleet_invoices',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('invoice_no', sa.String(length=50), unique=True, index=True, nullable=False),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id'), nullable=False, index=True),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('total_amount', sa.Numeric(12, 2), server_default='0.0', nullable=False),
        sa.Column('total_liters', sa.Numeric(12, 3), server_default='0.0', nullable=False),
        sa.Column('gst_amount', sa.Numeric(12, 2), server_default='0.0', nullable=False),
        sa.Column('pdf_object_key', sa.String(length=500), nullable=True),
        sa.Column('object_key', sa.String(length=500), nullable=True),
        sa.Column('status', sa.String(length=30), server_default='GENERATED', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
    )


def downgrade():
    op.drop_table('fleet_invoices')
    op.drop_table('tank_dip_logs')
    op.drop_table('shift_handovers')
    op.drop_column('retail_cash_invoices', 'object_key')
    op.drop_column('tank_dip_entries', 'object_key')
    op.drop_column('tank_dip_entries', 'receipt_photo_key')
    op.drop_column('credit_sales', 'object_key')
    op.drop_column('credit_sales', 'indent_slip_key')
    op.drop_column('shift_meter_readings', 'object_key')
    op.drop_column('shift_meter_readings', 'closing_photo_key')
    op.drop_column('shifts', 'handover_object_key')
    op.drop_column('expenses', 'object_key')
