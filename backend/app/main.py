from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.api import api_router
from app.api.v1.endpoints.health import router as health_router
from app.core.config import settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    try:
        await init_db()
    except Exception as exc:
        print(f"Warning: Database initialization skipped or deferred: {exc}")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Backend API powered by FastAPI and PostgreSQL on Railway",
    lifespan=lifespan,
)

# CORS configuration allowing Cloudflare Pages, custom domains, and local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://nsaipetrosoft.pages.dev",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*pages\.dev$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Direct root & health endpoints (convenient for Railway health checks)
@app.get("/", tags=["Root"])
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "docs": "/docs",
        "health": "/health",
        "environment": settings.ENVIRONMENT,
    }


app.include_router(health_router)
app.include_router(api_router, prefix=settings.API_V1_STR)
