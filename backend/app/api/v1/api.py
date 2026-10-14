from fastapi import APIRouter
from app.api.v1.endpoints import health, items, petrol_pump_endpoints

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(items.router, prefix="/items", tags=["Items"])
api_router.include_router(petrol_pump_endpoints.router, prefix="/pump", tags=["Petrol Pump ERP"])
