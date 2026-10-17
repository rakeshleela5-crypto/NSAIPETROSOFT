from fastapi import APIRouter
from app.api.v1.endpoints import health, items, petrol_pump_endpoints, backup_endpoints, auth

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication & Security"])
api_router.include_router(items.router, prefix="/items", tags=["Items"])
api_router.include_router(petrol_pump_endpoints.router, prefix="/pump", tags=["Petrol Pump ERP"])
api_router.include_router(backup_endpoints.router, prefix="/pump/backups", tags=["Cloudflare R2 Backups"])
