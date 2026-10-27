from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    backup_endpoints,
    decentro_endpoints,
    health,
    items,
    petrol_pump_endpoints,
)
from app.routers import banking, storage

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication & Security"])
api_router.include_router(items.router, prefix="/items", tags=["Items"])
api_router.include_router(petrol_pump_endpoints.router, prefix="/pump", tags=["Petrol Pump ERP"])
api_router.include_router(backup_endpoints.router, prefix="/pump/backups", tags=["Cloudflare R2 Backups"])
api_router.include_router(storage.router, prefix="/storage", tags=["Cloudflare R2 Storage"])
api_router.include_router(decentro_endpoints.router, prefix="/decentro", tags=["Decentro Banking-as-a-Service"])
api_router.include_router(banking.router)
