FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BYPASS_PRODUCTION_SECRET_CHECK=1 \
    STRICT_PRODUCTION_SECRETS_ENFORCEMENT=0 \
    SECRET_KEY=nsai-petrosoft-enterprise-secret-key-change-in-production-2026 \
    ENCRYPTION_KEY=MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE= \
    DECENTRO_CLIENT_ID=decentro_demo_client_id \
    DECENTRO_CLIENT_SECRET=decentro_demo_client_secret \
    DECENTRO_MODULE_SECRET=decentro_demo_module_secret \
    DECENTRO_PROVIDER_SECRET=decentro_demo_provider_secret \
    DECENTRO_WEBHOOK_SECRET=decentro_webhook_secret_nsai_2026 \
    R2_ACCOUNT_ID=dummy_r2_account_id \
    R2_ACCESS_KEY_ID=dummy_r2_access_key_id \
    R2_SECRET_ACCESS_KEY=dummy_r2_secret_access_key \
    R2_BUCKET_NAME=nsaipetrosoft-storage

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies from backend/requirements.txt
COPY backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY backend/ .

# Railway dynamically assigns $PORT at runtime (defaults to 8000)
ENV PORT=8000
EXPOSE ${PORT}

# Run FastAPI with uvicorn bound to Railway dynamic PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
