# NSAIPETROSOFT Backend (FastAPI + PostgreSQL on Railway)

Production-ready asynchronous FastAPI service with SQLAlchemy 2.0 and PostgreSQL, designed to be deployed on **Railway** and consumed by a **Cloudflare Pages** frontend.

---

## 🚀 Features

- **FastAPI** with async endpoints and OpenAPI auto-documentation (`/docs`).
- **PostgreSQL Integration**: Asynchronous database interaction using `SQLAlchemy 2.0` and `asyncpg`.
- **Railway Ready**: Pre-configured `Dockerfile`, `railway.json`, and dynamic `$PORT` handling.
- **Auto-Healthcheck**: `/health` endpoint actively verifies PostgreSQL database connection.
- **CORS Support**: Pre-configured to accept requests from localhost and `*.pages.dev` (Cloudflare Pages).

---

## 🛠 Railway Deployment Guide

### Step 1: Create a Project & Add PostgreSQL on Railway
1. Go to [Railway](https://railway.com) and create a **New Project**.
2. Click **+ New** -> **Database** -> **Add PostgreSQL**.
3. Railway will provision a managed PostgreSQL instance and provide variables like `DATABASE_URL`, `PGUSER`, `PGPASSWORD`, etc.

### Step 2: Deploy the FastAPI Service
1. Click **+ New** -> **GitHub Repo**.
2. Select your repository (`NSAIPETROSOFT`).
3. In **Settings**:
   - Set **Root Directory** to `backend`.
   - Set **Builder** to **Dockerfile** (or let Railway auto-detect `backend/Dockerfile` / `backend/railway.json`).
4. In **Variables**:
   - Railway can automatically reference the PostgreSQL database:
     Click **Add Reference** -> select `Postgres` -> `DATABASE_URL`.
   - Add `CORS_ORIGINS`:
     ```env
     CORS_ORIGINS="https://your-frontend.pages.dev,http://localhost:5173"
     ```
   - Add `ENVIRONMENT`:
     ```env
     ENVIRONMENT="production"
     ```
5. In **Settings** -> **Networking**:
   - Click **Generate Domain** (e.g. `https://nsaipetrosoft-backend.up.railway.app`).

### Step 3: Verify Health
Once Railway finishes deploying, open:
```
https://<your-railway-domain>.up.railway.app/health
```
You should receive:
```json
{
  "status": "healthy",
  "database": "connected",
  "environment": "production",
  "service": "NSAIPETROSOFT API"
}
```

---

## 💻 Local Development

1. Create a Python virtual environment:
   ```bash
   cd backend
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS/Linux:
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up `.env`:
   ```bash
   cp .env.example .env
   ```

4. Start the server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   Open [http://localhost:8000/docs](http://localhost:8000/docs) in your browser.
