import asyncio
import json
import logging
from typing import Any, Dict, List, Optional, Set
from fastapi import WebSocket, status

from app.core.security import decode_access_token

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Real-Time WebSocket Connection Manager (#54).
    Maintains authenticated WebSocket channels grouped by station_id.
    Broadcasts real-time events (UPI payments, shift handovers, tank shortages)
    to connected frontend browser dashboards with zero polling.
    """

    def __init__(self):
        # Map of station_id -> set of active WebSockets
        self._active_connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        station_id: str,
        token: Optional[str] = None,
    ) -> bool:
        """
        Authenticates connection via JWT token from query param ?token=... or cookies.
        Accepts the WebSocket if valid, or rejects with 1008 Policy Violation.
        """
        # Validate authentication token
        if not token or not token.strip():
            # Check cookies if available on websocket
            token = websocket.cookies.get("nsai_access_token")

        payload = decode_access_token(token) if token else None
        if not payload or not payload.get("sub"):
            logger.warning(f"Unauthorized WebSocket connection attempt to station {station_id}")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized: Valid JWT token required")
            return False

        await websocket.accept()
        async with self._lock:
            if station_id not in self._active_connections:
                self._active_connections[station_id] = set()
            self._active_connections[station_id].add(websocket)

        logger.info(
            f"WebSocket client connected to station {station_id} (user: {payload.get('sub')}, role: {payload.get('role')})"
        )
        # Send initial connection handshake confirmation
        try:
            await websocket.send_json({
                "event": "CONNECTED",
                "station_id": station_id,
                "user": payload.get("sub"),
                "role": payload.get("role"),
                "message": f"Connected to Real-Time Forecourt Stream for Station #{station_id}",
            })
        except Exception:
            pass

        return True

    async def disconnect(self, websocket: WebSocket, station_id: str) -> None:
        """
        Removes a disconnected WebSocket cleanly from tracking.
        """
        async with self._lock:
            if station_id in self._active_connections:
                self._active_connections[station_id].discard(websocket)
                if not self._active_connections[station_id]:
                    self._active_connections.pop(station_id, None)
        logger.info(f"WebSocket client disconnected from station {station_id}")

    async def broadcast_to_station(self, station_id: str, message: Dict[str, Any]) -> int:
        """
        Broadcasts a JSON event payload to all clients connected to a specific station.
        Automatically cleans up any broken/dead connections.
        Returns count of clients notified.
        """
        st_id = str(station_id)
        async with self._lock:
            connections = list(self._active_connections.get(st_id, set()))

        if not connections:
            return 0

        dead_connections = []
        sent_count = 0

        for ws in connections:
            try:
                await ws.send_json(message)
                sent_count += 1
            except Exception as exc:
                logger.debug(f"Failed to send to WebSocket client: {exc}")
                dead_connections.append(ws)

        if dead_connections:
            async with self._lock:
                for ws in dead_connections:
                    if st_id in self._active_connections:
                        self._active_connections[st_id].discard(ws)

        return sent_count

    async def broadcast_all(self, message: Dict[str, Any]) -> int:
        """
        Broadcasts a JSON event to every connected client across all stations.
        """
        async with self._lock:
            all_stations = list(self._active_connections.keys())

        total_sent = 0
        for st_id in all_stations:
            total_sent += await self.broadcast_to_station(st_id, message)
        return total_sent

    def active_count(self, station_id: Optional[str] = None) -> int:
        if station_id:
            return len(self._active_connections.get(str(station_id), set()))
        return sum(len(s) for s in self._active_connections.values())


# Global singleton instance
ws_manager = ConnectionManager()
