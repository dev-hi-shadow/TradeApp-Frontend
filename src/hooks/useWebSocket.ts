import { useEffect, useRef, useState, useCallback } from 'react';
import { refreshAccessToken } from '../api/client';

// If VITE_WS_URL is unset, derive from window.location so the same build works
// behind any reverse proxy (Vite dev proxy, ngrok, nginx, Render, etc).
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export type WSStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface WSMessage {
  type: string;
  [k: string]: any;
}

type Listener = (msg: WSMessage) => void;

export interface WSController {
  status: WSStatus;
  send: (msg: WSMessage) => void;
  request: <T = any>(msg: WSMessage, timeoutMs?: number) => Promise<T>;
  on: (type: string, fn: Listener) => () => void;
  reconnect: () => void;
}

export function useWebSocket(token: string | null): WSController {
  const [status, setStatus] = useState<WSStatus>('idle');
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<Listener>>>(new Map());
  const queueRef = useRef<WSMessage[]>([]);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  // Tracks whether the current WS connection has had authResult.ok. Until
  // true, every non-auth send is QUEUED — this fixes the race where a
  // page (OptionChain, Trade, etc.) calls subscribe() in the gap between
  // ws.onopen and authResult arriving, which the server correctly rejects
  // with "Not authenticated".
  const authedRef = useRef(false);
  const authResolverRef = useRef<{ resolve: (v: any) => void; reject: (e: any) => void } | null>(
    null
  );
  const pendingRequestsRef = useRef<Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: number }>>(
    new Map()
  );
  const reqIdCounter = useRef(1);
  // Heartbeat machinery. We send a ping every 25s; if the server doesn't
  // respond with a pong within 10s of expected, we treat the connection as
  // half-open (TCP can sit dead behind a proxy that never sends FIN) and
  // force a close → reconnect.
  const pingTimer = useRef<number | null>(null);
  const pongTimeoutTimer = useRef<number | null>(null);
  const lastPongAt = useRef<number>(Date.now());

  const emit = useCallback((msg: WSMessage) => {
    // request/response correlation FIRST. A reply correlated to a pending
    // request belongs to the awaiting caller — resolve/reject it and STOP.
    // Broadcasting it to type listeners too would, for an error reply, fire the
    // generic "WS error" toast on top of the caller's own error handling
    // (double toast on a failed order/exit).
    if (msg.reqId && pendingRequestsRef.current.has(msg.reqId)) {
      const entry = pendingRequestsRef.current.get(msg.reqId)!;
      clearTimeout(entry.timer);
      pendingRequestsRef.current.delete(msg.reqId);
      if (msg.type === 'error' || (msg as any).ok === false) {
        entry.reject(new Error(msg.message || (msg as any).error || 'Request failed'));
      } else {
        entry.resolve(msg);
      }
      return;
    }

    const set = listenersRef.current.get(msg.type);
    if (set) set.forEach((fn) => fn(msg));
    const wild = listenersRef.current.get('*');
    if (wild) wild.forEach((fn) => fn(msg));
  }, []);

  const send = useCallback((msg: WSMessage) => {
    const ws = wsRef.current;
    // Only the `auth` frame is allowed to bypass the auth gate — everything
    // else waits until the server has confirmed authResult.ok, otherwise
    // the server (correctly) replies with "Not authenticated".
    if (ws && ws.readyState === WebSocket.OPEN && (authedRef.current || msg.type === 'auth')) {
      ws.send(JSON.stringify(msg));
    } else {
      queueRef.current.push(msg);
    }
  }, []);

  const request = useCallback(
    <T = any>(msg: WSMessage, timeoutMs = 10_000): Promise<T> => {
      return new Promise((resolve, reject) => {
        const reqId = `r${reqIdCounter.current++}`;
        const timer = window.setTimeout(() => {
          pendingRequestsRef.current.delete(reqId);
          reject(new Error('Request timeout'));
        }, timeoutMs);
        pendingRequestsRef.current.set(reqId, { resolve: resolve as any, reject, timer });
        send({ ...msg, reqId });
      });
    },
    [send]
  );

  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      authedRef.current = false;
      // authenticate first — this is the ONE frame allowed before authedRef
      // flips true. Everything else stays queued.
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (e) => {
      try {
        const msg: WSMessage = JSON.parse(e.data);

        if (msg.type === 'authResult') {
          if (msg.ok) {
            authedRef.current = true;
            setStatus('open');
            lastPongAt.current = Date.now();
            startHeartbeat();
            // flush queue — safe now that the server considers us authed
            const q = queueRef.current;
            queueRef.current = [];
            q.forEach((m) => ws.send(JSON.stringify(m)));
            if (authResolverRef.current) {
              authResolverRef.current.resolve(msg);
              authResolverRef.current = null;
            }
          } else {
            // Auth rejected — almost always an expired access token on
            // reconnect. Try a transparent token refresh: on success it fires
            // 'auth:token-refreshed', AuthContext swaps in the new token, and
            // this hook reconnects with a valid one (live data resumes). On
            // failure the session is genuinely gone → client emits
            // 'auth:session-expired' and AuthContext signs out.
            authedRef.current = false;
            setStatus('error');
            void refreshAccessToken();
            ws.close();
          }
        }
        // Any inbound traffic counts as proof the link is alive — not just
        // pongs. priceUpdate alone arrives every 500 ms when subscribed.
        lastPongAt.current = Date.now();
        emit(msg);
      } catch (err) {
        console.error('[ws] parse error', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[ws] error', err);
      setStatus('error');
    };

    ws.onclose = () => {
      authedRef.current = false;
      stopHeartbeat();
      setStatus('closed');
      wsRef.current = null;
      // exponential backoff reconnect (cap at 30s)
      if (!token) return;
      const attempt = ++reconnectAttempts.current;
      const delay = Math.min(30_000, 1000 * Math.pow(2, attempt));
      reconnectTimer.current = window.setTimeout(connect, delay);
    };
  }, [token, emit]);

  // --- heartbeat (defined after `connect` would be cleaner but hoisted refs
  // make this safe to declare here) ---
  function startHeartbeat() {
    stopHeartbeat();
    pingTimer.current = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      // Liveness probe. The backend handles { type: 'ping' } → pong reply.
      try { ws.send(JSON.stringify({ type: 'ping' })); } catch { /* ignore */ }
      // If nothing has come back for ~35s, declare the link dead. This
      // matters behind corporate proxies that swallow FIN packets — the
      // socket sits OPEN forever on our side while no data flows.
      if (Date.now() - lastPongAt.current > 35_000) {
        console.warn('[ws] no traffic for 35s, forcing reconnect');
        try { ws.close(); } catch { /* ignore */ }
      }
    }, 25_000);
  }
  function stopHeartbeat() {
    if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }
    if (pongTimeoutTimer.current) { clearTimeout(pongTimeoutTimer.current); pongTimeoutTimer.current = null; }
  }

  useEffect(() => {
    if (token) {
      connect();
    } else {
      // logged out: close
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
      stopHeartbeat();
      setStatus('idle');
    }
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      stopHeartbeat();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [token, connect]);

  // When the tab comes back into the foreground, kick a reconnect immediately
  // if the socket isn't already open. Mobile browsers commonly suspend WS
  // after a few minutes hidden — without this, the user sees stale prices
  // until the next exponential-backoff tick.
  useEffect(() => {
    if (!token) return;
    function onVis() {
      if (document.visibilityState !== 'visible') return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
        reconnectAttempts.current = 0;
        connect();
      }
    }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [token, connect]);

  const on = useCallback((type: string, fn: Listener) => {
    let set = listenersRef.current.get(type);
    if (!set) {
      set = new Set();
      listenersRef.current.set(type, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
    };
  }, []);

  const reconnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    wsRef.current = null;
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return { status, send, request, on, reconnect };
}
