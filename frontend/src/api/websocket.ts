import { API_BASE_URL, getManagerToken } from './client';

export type StationEventType =
  | 'CONNECTED'
  | 'PAYMENT_RECEIVED'
  | 'SHIFT_HANDOVER'
  | 'TANK_VARIANCE_ALERT';

export interface StationWebSocketEvent {
  event: StationEventType | string;
  data?: any;
  station_id?: string;
  user?: string;
  role?: string;
  message?: string;
  timestamp?: string;
}

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

export interface StationWebSocketOptions {
  stationId?: string;
  onEvent: (event: StationWebSocketEvent) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

/**
 * Builds the authenticated WebSocket URL for the given station ID.
 * Maps http: -> ws: and https: -> wss: for local and production Railway environments.
 */
export function getStationWebSocketUrl(stationId: string = '1'): string {
  const base = API_BASE_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  const token = getManagerToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${base}/ws/station/${stationId}${tokenParam}`;
}

/**
 * Connects to the station WebSocket stream with automatic reconnection and heartbeat keepalive (#54).
 * Returns a cleanup unsubscribe function.
 */
export function connectStationWebSocket(options: StationWebSocketOptions): () => void {
  const { stationId = '1', onEvent, onStatusChange } = options;
  let socket: WebSocket | null = null;
  let pingInterval: any = null;
  let reconnectTimeout: any = null;
  let isUnmounted = false;
  let retryCount = 0;

  function connect() {
    if (isUnmounted) return;

    onStatusChange?.('CONNECTING');
    const wsUrl = getStationWebSocketUrl(stationId);

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (isUnmounted) {
          socket?.close();
          return;
        }
        retryCount = 0;
        onStatusChange?.('CONNECTED');

        // Setup 25-second heartbeat ping to prevent proxy/Cloudflare timeout
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send('ping');
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        if (isUnmounted) return;
        if (typeof event.data === 'string') {
          if (event.data.trim().toLowerCase() === 'pong') {
            return; // Heartbeat response
          }
          try {
            const parsed = JSON.parse(event.data);
            onEvent(parsed);
          } catch {
            // Non-JSON textual message
          }
        }
      };

      socket.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        onStatusChange?.('DISCONNECTED');

        if (!isUnmounted) {
          // Exponential backoff reconnect: 1s, 2s, 4s, 8s, up to 15s max
          const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 15000);
          retryCount++;
          reconnectTimeout = setTimeout(connect, backoffDelay);
        }
      };

      socket.onerror = () => {
        try {
          socket?.close();
        } catch {}
      };
    } catch {
      if (!isUnmounted) {
        reconnectTimeout = setTimeout(connect, 3000);
      }
    }
  }

  connect();

  return () => {
    isUnmounted = true;
    if (pingInterval) clearInterval(pingInterval);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (socket) {
      try {
        socket.close();
      } catch {}
      socket = null;
    }
  };
}
