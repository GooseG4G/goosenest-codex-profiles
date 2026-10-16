import { onUnmounted, readonly, shallowRef } from "vue";

interface StreamEnvelope {
  stream_id: string;
}

interface EventStreamOptions<T extends StreamEnvelope> {
  path: string;
  storageKey: string;
  onEvent: (event: T) => void;
}

export type EventStreamState = "idle" | "connecting" | "open" | "closed";

export function useEventStream<T extends StreamEnvelope>(
  options: EventStreamOptions<T>,
) {
  const state = shallowRef<EventStreamState>("idle");
  let socket: WebSocket | undefined,
    reconnectTimer: number | undefined,
    heartbeatTimer: number | undefined,
    reconnectAttempt = 0,
    enabled = false,
    lastStreamId = readCursor(options.storageKey);

  function clearReconnectTimer() {
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }

  function clearHeartbeatTimer() {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }

  function closeSocket() {
    clearHeartbeatTimer();
    const active = socket;
    socket = undefined;
    if (active && active.readyState < WebSocket.CLOSING) active.close(1000);
  }

  function scheduleReconnect() {
    if (!enabled || document.hidden || reconnectTimer) return;
    const delay = Math.min(1_000 * 2 ** reconnectAttempt, 15_000);
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
  }

  function connect() {
    enabled = true;
    if (document.hidden || socket) return;
    clearReconnectTimer();
    state.value = "connecting";
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}${options.path}?after=${encodeURIComponent(lastStreamId)}`;
    const next = new WebSocket(url);
    socket = next;
    next.addEventListener("open", () => {
      if (socket !== next) return;
      reconnectAttempt = 0;
      state.value = "open";
      clearHeartbeatTimer();
      heartbeatTimer = window.setInterval(() => {
        if (next.readyState === WebSocket.OPEN) next.send('{"type":"ping"}');
      }, 25_000);
    });
    next.addEventListener("message", (message) => {
      try {
        const envelope = JSON.parse(String(message.data)) as T;
        if (!envelope.stream_id) return;
        lastStreamId = envelope.stream_id;
        writeCursor(options.storageKey, lastStreamId);
        options.onEvent(envelope);
      } catch {
        // Invalid events are ignored; REST remains the authoritative snapshot.
      }
    });
    next.addEventListener("close", () => {
      if (socket !== next) return;
      socket = undefined;
      clearHeartbeatTimer();
      state.value = "closed";
      scheduleReconnect();
    });
  }

  function disconnect() {
    enabled = false;
    clearReconnectTimer();
    closeSocket();
    state.value = "idle";
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      clearReconnectTimer();
      closeSocket();
      state.value = "closed";
    } else if (enabled) {
      connect();
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  onUnmounted(() => {
    disconnect();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  return { state: readonly(state), connect, disconnect };
}

function readCursor(key: string): string {
  try {
    return sessionStorage.getItem(key) || "$";
  } catch {
    return "$";
  }
}

function writeCursor(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage can be disabled; the in-memory cursor still prevents duplicates.
  }
}
