import { useEffect, useRef, useState } from "react";
import { tokenStore, WS_BASE } from "../api/client";
import type { WsEvent } from "../types";

/**
 * Subscribe to the backend fleet WebSocket. The backend is the single source of
 * truth for vehicle movement; this hook only relays events to the UI.
 */
export function useFleetSocket(onEvent: (e: WsEvent) => void) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let closed = false;

    const connect = () => {
      // The backend rejects unauthenticated sockets, so don't open one without
      // a token — the retry loop re-checks and connects once login provides one.
      const token = tokenStore.get();
      if (!token) {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
        return;
      }
      ws = new WebSocket(`${WS_BASE}/ws/fleet?token=${encodeURIComponent(token)}`);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onmessage = (msg) => {
        try {
          handlerRef.current(JSON.parse(msg.data) as WsEvent);
        } catch {
          /* ignore malformed */
        }
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return { connected };
}
