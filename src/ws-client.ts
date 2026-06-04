import type { ServerMessage } from '@/shared/protocol';
import type { AppendLog } from '@/src/client-types';

const MAX_RECONNECT = 8;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 16000;
const HEARTBEAT_INTERVAL = 20000;
const HEARTBEAT_TIMEOUT = 5000;

interface PythaSocketOptions {
  url: string;
  appendLog: AppendLog;
  onMessage: (msg: ServerMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function createPythaSocket({ url, appendLog, onMessage, onConnect, onDisconnect }: PythaSocketOptions) {
  let ws: WebSocket | undefined;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatReplyTimer: ReturnType<typeof setTimeout> | undefined;
  let isIntentionalClose = false;
  let wasEverConnected = false;

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          heartbeatReplyTimer = setTimeout(() => {
            appendLog('Heartbeat timeout, reconnecting...', 'error');
            ws?.close();
          }, HEARTBEAT_TIMEOUT);
        } catch {
          stopHeartbeat();
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  function stopHeartbeat() {
    if (heartbeatTimer !== undefined) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
    if (heartbeatReplyTimer !== undefined) {
      clearTimeout(heartbeatReplyTimer);
      heartbeatReplyTimer = undefined;
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer !== undefined) return;
    if (reconnectAttempts >= MAX_RECONNECT) {
      appendLog(`Could not connect after ${MAX_RECONNECT} attempts. Check server is running.`, 'error');
      return;
    }
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    appendLog(`Retrying in ${delay / 1000}s... (${reconnectAttempts + 1}/${MAX_RECONNECT})`, 'info');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      reconnectAttempts++;
      connect();
    }, delay);
  }

  function connect() {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    appendLog(`Connecting to Pytha server at ${url}...`, 'info');
    isIntentionalClose = false;

    try {
      ws = new WebSocket(url);
    } catch (err) {
      appendLog(`WebSocket construction failed: ${err}`, 'error');
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      appendLog('Connected to Pytha server', 'info');
      console.log('[Client] WebSocket OPEN, readyState:', ws?.readyState);
      reconnectAttempts = 0;
      wasEverConnected = true;
      onConnect?.();
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      try {
        const raw = event.data.toString();
        if (raw === 'pong' || raw.startsWith('{"type":"pong"')) {
          if (heartbeatReplyTimer !== undefined) {
            clearTimeout(heartbeatReplyTimer);
            heartbeatReplyTimer = undefined;
          }
          return;
        }
        appendLog('Received: ' + raw.substring(0, 100), 'debug');
        onMessage(JSON.parse(raw) as ServerMessage);
      } catch (err) {
        appendLog(`Failed to parse message: ${err}`, 'error');
      }
    };

    ws.onclose = (event) => {
      stopHeartbeat();
      const code = event?.code ?? 'unknown';
      const reason = event?.reason ?? 'none';
      appendLog(`WebSocket closed [code: ${code}, reason: ${reason}]`, 'error');

      if (isIntentionalClose) {
        onDisconnect?.();
        return;
      }

      if (wasEverConnected && reconnectAttempts === 0) {
        appendLog('Connection lost. Attempting to reconnect...', 'error');
      }

      onDisconnect?.();
      scheduleReconnect();
    };

    ws.onerror = (event) => {
      const msg = event?.type ?? 'unknown';
      appendLog(`WebSocket error: ${msg}`, 'error');
      console.error('[Client] WebSocket error event:', event);
    };
  }

  function send(msg: object): boolean {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    appendLog(`Cannot send — WebSocket state: ${ws?.readyState ?? 'null'}`, 'error');
    return false;
  }

  function disconnect() {
    isIntentionalClose = true;
    stopHeartbeat();
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    ws?.close();
  }

  return {
    connect,
    send,
    disconnect,
    isOpen: () => Boolean(ws && ws.readyState === WebSocket.OPEN),
    readyState: () => ws?.readyState,
    isConnected: () => ws?.readyState === WebSocket.OPEN,
  };
}
