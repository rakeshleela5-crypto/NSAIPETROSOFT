import logging
from typing import Optional
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.core.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Real-Time WebSockets"])


@router.websocket("/ws/station/{station_id}")
async def station_websocket_endpoint(
    websocket: WebSocket,
    station_id: str,
    token: Optional[str] = Query(None),
):
    """
    Authenticated WebSocket Stream per Station Outlet (#54).
    Authenticates via query param ?token=<jwt_access_token> or cookie nsai_access_token.
    Receives real-time broadcast events:
    - Decentro UPI QR payment callbacks (PAYMENT_RECEIVED)
    - Shift Handover submissions (SHIFT_HANDOVER)
    - Underground tank dip shortages & excess evaporation alerts (TANK_VARIANCE_ALERT)
    """
    connected = await ws_manager.connect(websocket, station_id=station_id, token=token)
    if not connected:
        return

    try:
        while True:
            # Keep socket alive and handle client heartbeat pings
            data = await websocket.receive_text()
            if data.strip().lower() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, station_id=station_id)
    except Exception as exc:
        logger.debug(f"WebSocket connection error on station {station_id}: {exc}")
        await ws_manager.disconnect(websocket, station_id=station_id)
