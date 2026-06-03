import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useWebSocket, WSStatus } from '../hooks/useWebSocket';
import { useToast } from './ToastContext';
import type { OrderDTO, PortfolioSummary, Quote } from '../types';
import { invalidateTradeData, invalidate, QueryKey } from '../queryClient';
import { getWatchlist } from '../api/account';
import { exitPosition as restExitPosition, exitAllPositions as restExitAll, type ExitResult } from '../api/orders';
import { ensurePushSubscription } from '../utils/push';
import throttle from 'lodash/throttle';

export const INDICES = ['NIFTY', 'SENSEX', 'BANKNIFTY', 'GOLD', 'SILVER', 'CRUDEOIL'];

/** Symbols the user cannot remove from their watchlist or from the indices ticker. */
export const LOCKED_SYMBOLS = new Set([
  'NIFTY',
  'SENSEX',
  'BANKNIFTY',
  'GOLD',
  'SILVER',
  'CRUDEOIL',
]);

/** Commodity underlyings whose derivatives trade on MCX. A symbol is MCX if
 *  its uppercase name STARTS WITH one of these — so the friendly underlying
 *  (GOLD) and its futures/options (GOLD25JUNFUT, GOLDM…, CRUDEOIL25JUL5800CE)
 *  all map to MCX. Everything else (equities, indices, equity/index F&O) → NSE. */
const MCX_PREFIXES = [
  'GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS', 'COPPER', 'ZINC', 'LEAD', 'ALUMINIUM',
];

/** Which session/exchange a symbol belongs to (drives the Open/Closed badge). */
export function marketFor(symbol: string): 'NSE' | 'MCX' {
  const upper = symbol.toUpperCase();
  if (MCX_PREFIXES.some((p) => upper.startsWith(p))) return 'MCX';
  return 'NSE';
}

/** Is the given market currently open right now in IST? */
export function isMarketOpen(market: 'NSE' | 'MCX'): boolean {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istMinutes =
    now.getUTCHours() * 60 + now.getUTCMinutes() + 5 * 60 + 30;
  const minOfDay = istMinutes % (24 * 60);
  const day = (now.getUTCDay() + (istMinutes >= 24 * 60 ? 1 : 0)) % 7;
  if (day === 0 || day === 6) return false; // Sun / Sat
  if (market === 'NSE') {
    return minOfDay >= 9 * 60 + 15 && minOfDay <= 15 * 60 + 30; // 9:15 – 15:30
  }
  // MCX non-agri commodities (GOLD/SILVER/CRUDE) — 9:00 – 23:30
  return minOfDay >= 9 * 60 && minOfDay <= 23 * 60 + 30;
}

/**
 * Returns the [start, end] of the most recent trading session for `market`,
 * as unix seconds. After market hours / weekends → previous session.
 * Used to reserve x-axis space on the 1D chart so empty time appears on the
 * right while the session is still in progress.
 */
export function getTodaySessionRange(market: 'NSE' | 'MCX'): { from: number; to: number } {
  const now = new Date();
  // Convert to IST clock
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  let y = ist.getUTCFullYear();
  let m = ist.getUTCMonth();
  let d = ist.getUTCDate();
  let dow = ist.getUTCDay();
  const minOfDay = ist.getUTCHours() * 60 + ist.getUTCMinutes();

  const openH = market === 'MCX' ? 9 : 9;
  const openM = market === 'MCX' ? 0 : 15;
  const closeH = market === 'MCX' ? 23 : 15;
  const closeM = market === 'MCX' ? 30 : 30;
  const openMin = openH * 60 + openM;
  const closeMin = closeH * 60 + closeM;

  const beforeOpen = minOfDay < openMin;
  const afterClose = minOfDay > closeMin;
  const weekend = dow === 0 || dow === 6;

  // If before today's open, or weekend, walk back to most recent weekday.
  if (beforeOpen || weekend) {
    let cursor = new Date(Date.UTC(y, m, d));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    y = cursor.getUTCFullYear();
    m = cursor.getUTCMonth();
    d = cursor.getUTCDate();
  }
  // After close on a weekday: still use today's session range (now ended).
  void afterClose;

  // Build IST timestamps then convert to UTC unix seconds.
  const sessionStartIstUtc = Date.UTC(y, m, d, openH, openM);
  const sessionEndIstUtc   = Date.UTC(y, m, d, closeH, closeM);
  const offsetMs = 5.5 * 60 * 60 * 1000;
  return {
    from: Math.floor((sessionStartIstUtc - offsetMs) / 1000),
    to:   Math.floor((sessionEndIstUtc   - offsetMs) / 1000),
  };
}

export function isLockedSymbol(s: string): boolean {
  return LOCKED_SYMBOLS.has(s.toUpperCase());
}

interface PlaceOrderInput {
  symbol: string;
  type: 'market' | 'limit' | 'sl' | 'sl-m';
  side: 'buy' | 'sell';
  quantity: number;
  price?: number;
  triggerPrice?: number;
  validity?: 'DAY' | 'IOC' | 'GTT';
  product?: 'CNC' | 'MIS' | 'NRML';
  planId?: string;
  /** Bracket: auto-arm a stop-loss / target guard the moment this entry fills. */
  bracketStopLoss?: number;
  bracketTarget?: number;
}

/** Fields a resting (limit/SL) order can have changed in place. */
export interface ModifyOrderInput {
  price?: number;
  triggerPrice?: number;
  quantity?: number;
}

interface MarketCtx {
  status: WSStatus;
  quotes: Record<string, Quote>;
  prevPrice: Record<string, number>;
  portfolio: PortfolioSummary | null;
  watchlist: string[];
  setWatchlist: (s: string[]) => void;
  subscribe: (symbols: string[]) => void;
  unsubscribe: (symbols: string[]) => void;
  placeOrder: (input: PlaceOrderInput) => Promise<OrderDTO>;
  modifyOrder: (orderId: string, changes: ModifyOrderInput) => Promise<OrderDTO>;
  cancelOrder: (orderId: string) => Promise<void>;
  exitPosition: (symbol: string, product?: 'CNC' | 'MIS' | 'NRML') => Promise<ExitResult[]>;
  exitAll: () => Promise<ExitResult[]>;
  reconnect: () => void;
  onOrderFilled: (fn: (o: OrderDTO) => void) => () => void;
  onAlertTriggered: (fn: (payload: any) => void) => () => void;
}

const Ctx = createContext<MarketCtx | null>(null);

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const { token, refreshUser } = useAuth();
  const ws = useWebSocket(token);
  const toast = useToast();

  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [prevPrice, setPrevPrice] = useState<Record<string, number>>({});
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [watchlist, setWatchlistState] = useState<string[]>([]);

  // What the server currently believes we want. Cleared on disconnect so
  // the resubscribe effect re-runs after reconnect.
  const subscribedRef = useRef<Set<string>>(new Set());
  // Sticky union of every page-level subscribe() call this session. Used to
  // replay subscriptions after a reconnect so the OptionChain / StockDetail
  // pages keep ticking without needing to remount.
  const pageSubsRef = useRef<Set<string>>(new Set());
  const orderFilledListenersRef = useRef<Set<(o: OrderDTO) => void>>(new Set());
  const alertListenersRef = useRef<Set<(payload: any) => void>>(new Set());

  // Quote-batching machinery: incoming ticks are accumulated in a ref then
  // flushed in a single React state update at most once per 50 ms via
  // lodash.throttle. This collapses a burst of 30 quotes arriving in one
  // tick into ONE render instead of 30, and bounds re-renders to 20 fps
  // even if the backend ticks faster. We also preserve per-symbol object
  // identity for unchanged symbols so React's bailout still triggers in
  // consumers that destructure `quotes[X]`.
  const pendingQuotesRef = useRef<Map<string, Quote>>(new Map());
  const flushQuotesRef = useRef<() => void>();
  if (!flushQuotesRef.current) {
    const doFlush = () => {
      const pending = pendingQuotesRef.current;
      if (pending.size === 0) return;
      const updates = Array.from(pending.entries());
      pending.clear();
      setQuotes((cur) => {
        // Record the prior price for every key we're about to overwrite,
        // so the prev-price map stays in sync with the visible quote state.
        setPrevPrice((p) => {
          let changed = false;
          const np = { ...p };
          for (const [key] of updates) {
            const old = cur[key];
            if (old) {
              if (np[key] !== old.price) { np[key] = old.price; changed = true; }
            }
          }
          return changed ? np : p;
        });
        const next = { ...cur };
        for (const [key, q] of updates) next[key] = q;
        return next;
      });
    };
    // 50 ms = 20 fps — feels real-time without burning the React reconciler.
    flushQuotesRef.current = throttle(doFlush, 50, { leading: true, trailing: true });
  }

  // Load watchlist on auth
  useEffect(() => {
    if (!token) {
      setWatchlistState([]);
      setQuotes({});
      setPortfolio(null);
      subscribedRef.current.clear();
      return;
    }
    getWatchlist()
      .then((res) => setWatchlistState(res.symbols))
      .catch(() => {});
  }, [token]);

  // Reset subscription bookkeeping whenever the WS is NOT open. The server
  // forgets our subscriptions on disconnect, so the next time it comes back
  // up we need to re-subscribe everything — the easiest way to make the
  // "resubscribe new symbols" effect below replay is to clear our local
  // diff baseline here.
  useEffect(() => {
    if (ws.status !== 'open') {
      subscribedRef.current.clear();
    }
  }, [ws.status]);

  // Subscribe to indices + watchlist + any sticky page subs when WS is open.
  // Runs on every status flip to 'open' (i.e., also after reconnect) because
  // subscribedRef is cleared whenever status leaves 'open'.
  useEffect(() => {
    if (ws.status !== 'open') return;
    const all = Array.from(new Set([...INDICES, ...watchlist, ...pageSubsRef.current]));
    const toSub = all.filter((s) => !subscribedRef.current.has(s));
    if (toSub.length === 0) return;
    toSub.forEach((s) => subscribedRef.current.add(s));
    ws.send({ type: 'subscribe', symbols: toSub });
  }, [ws.status, watchlist, ws]);

  // Wire WS message listeners
  useEffect(() => {
    const offPrice = ws.on('priceUpdate', (msg) => {
      const incoming: Quote[] = msg.quotes || [];
      // Record prev-price BEFORE we overwrite, so the next flush has the
      // delta basis. We read straight from the live `quotes` ref to avoid
      // racing with React's batched setState.
      const currentPrev = pendingQuotesRef.current;
      for (const q of incoming) {
        const key = q.displaySymbol.toUpperCase();
        currentPrev.set(key, q);
      }
      flushQuotesRef.current?.();
    });

    const offFilled = ws.on('orderFilled', (msg) => {
      const order: OrderDTO = msg.order;
      toast.push({
        kind: 'success',
        title: 'Order filled',
        message: `${order.side.toUpperCase()} ${order.quantity} ${order.symbol} @ ₹${msg.fillPrice.toFixed(2)}`,
      });
      refreshUser().catch(() => {});
      invalidateTradeData(); // refetch positions/orders/guards once, fresh
      orderFilledListenersRef.current.forEach((fn) => fn(order));
    });

    const offRejected = ws.on('orderRejected', (msg) => {
      const reason = String(msg.reason || 'Unknown reason');
      const isMargin = /margin|balance/i.test(reason);
      toast.push({
        kind: 'error',
        title: isMargin ? '💸 Insufficient margin' : 'Order rejected',
        message: isMargin
          ? `${reason}. Top up from Profile → Admin if needed.`
          : reason,
      });
    });

    const offCancelled = ws.on('orderCancelled', (msg) => {
      const order: OrderDTO = msg.order;
      toast.push({
        kind: 'info',
        title: 'Order cancelled',
        message: `${order.symbol} ${order.side} x${order.quantity}`,
      });
      invalidateTradeData();
    });

    const offPortfolio = ws.on('portfolioUpdate', (msg) => {
      setPortfolio(msg.portfolio as PortfolioSummary);
    });

    const offWatchlist = ws.on('watchlistUpdated', (msg) => {
      if (Array.isArray(msg.symbols)) setWatchlistState(msg.symbols);
    });

    const offError = ws.on('error', (msg) => {
      toast.push({ kind: 'error', title: 'WS error', message: msg.message || 'Unknown' });
    });

    // Position guard (SL / Target / Trailing) auto-exit fired server-side.
    const offGuard = ws.on('guardTriggered', (msg) => {
      const pnl = typeof msg.realisedPnL === 'number' ? msg.realisedPnL : null;
      const win = pnl != null && pnl >= 0;
      toast.push({
        kind: win ? 'success' : 'warning',
        title: `${msg.reason} hit · ${msg.symbol}`,
        message: `Auto-exited @ ₹${Number(msg.fillPrice).toFixed(2)}${pnl != null ? ` · realised ${win ? '+' : ''}₹${pnl.toFixed(2)}` : ''}`,
      });
      invalidateTradeData(); // position closed by the guard
    });

    const offAlert = ws.on('alertTriggered', (msg) => {
      const { alert, event } = msg as any;
      invalidate(QueryKey.Alerts, QueryKey.AlertEvents); // alert status/history changed
      // Toast (visible inside the app, regardless of which page user is on)
      const arrow = alert.kind === 'above' || alert.kind === 'pctUp' ? '▲' : '▼';
      toast.push({
        kind: 'warning',
        title: `🔔 Alert · ${alert.symbol}`,
        message: `${arrow} crossed ${alert.kind.startsWith('pct') ? alert.value + '%' : '₹' + alert.value} @ ₹${event.triggerPrice.toFixed(2)}${alert.note ? ' · ' + alert.note : ''}`,
      });
      // Native browser notification (works even when tab is in background)
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`${alert.symbol} alert`, {
            body: `${arrow} ${alert.kind} ${alert.value} hit @ ₹${event.triggerPrice.toFixed(2)}`,
            icon: '/favicon.ico',
            tag: alert.id,
          });
        }
      } catch {
        /* ignored */
      }
      alertListenersRef.current.forEach((fn) => fn(msg));
    });

    return () => {
      offPrice();
      offFilled();
      offRejected();
      offCancelled();
      offPortfolio();
      offWatchlist();
      offError();
      offGuard();
      offAlert();
    };
  }, [ws, toast, refreshUser]);

  // After auth: request notification permission (once), then register the
  // service worker and subscribe to WEB PUSH so notifications arrive even when
  // the app/tab is closed. No-ops on insecure contexts (http LAN IP).
  useEffect(() => {
    if (!token) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    let cancelled = false;
    (async () => {
      if (Notification.permission === 'default') {
        // Defer ~2s so we don't blast the user immediately on login.
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelled) return;
        try { await Notification.requestPermission(); } catch { /* ignore */ }
      }
      if (!cancelled && Notification.permission === 'granted') {
        ensurePushSubscription().catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const subscribe = useCallback(
    (symbols: string[]) => {
      // Always remember the intent so reconnect can replay. Even if the
      // server already knows about the symbol on the current connection,
      // we want this in pageSubsRef for the next one.
      symbols
        .map((s) => s.toUpperCase().trim())
        .filter(Boolean)
        .forEach((s) => pageSubsRef.current.add(s));

      const newOnes = symbols
        .map((s) => s.toUpperCase().trim())
        .filter((s) => s && !subscribedRef.current.has(s));
      if (!newOnes.length) return;
      newOnes.forEach((s) => subscribedRef.current.add(s));
      ws.send({ type: 'subscribe', symbols: newOnes });
    },
    [ws]
  );

  const unsubscribe = useCallback(
    (symbols: string[]) => {
      const up = symbols.map((s) => s.toUpperCase());
      up.forEach((s) => {
        subscribedRef.current.delete(s);
        pageSubsRef.current.delete(s);
      });
      ws.send({ type: 'unsubscribe', symbols: up });
    },
    [ws]
  );

  const placeOrder = useCallback(
    async (input: PlaceOrderInput): Promise<OrderDTO> => {
      const res: any = await ws.request({ type: 'placeOrder', order: input });
      if (!res.ok) throw new Error(res.error || 'Order failed');
      invalidateTradeData(); // resting limit/SL won't emit a fill — refresh lists
      return res.order as OrderDTO;
    },
    [ws]
  );

  const modifyOrder = useCallback(
    async (orderId: string, changes: ModifyOrderInput): Promise<OrderDTO> => {
      const res: any = await ws.request({ type: 'modifyOrder', orderId, ...changes });
      if (!res.ok) throw new Error(res.error || 'Modify failed');
      invalidateTradeData();
      return res.order as OrderDTO;
    },
    [ws]
  );

  const cancelOrder = useCallback(
    async (orderId: string): Promise<void> => {
      const res: any = await ws.request({ type: 'cancelOrder', orderId });
      if (!res.ok) throw new Error(res.error || 'Cancel failed');
      invalidateTradeData();
    },
    [ws]
  );

  // Exit over the open socket — millisecond-fast (no HTTP). Falls back to the
  // REST endpoint if the socket isn't connected, so it never silently fails.
  const exitPosition = useCallback(
    async (symbol: string, product?: 'CNC' | 'MIS' | 'NRML'): Promise<ExitResult[]> => {
      try {
        if (ws.status === 'open') {
          const res: any = await ws.request({ type: 'exitPosition', symbol, product });
          if (!res.ok) throw new Error(res.error || 'Exit failed');
          return res.results as ExitResult[];
        }
        return (await restExitPosition(symbol, product)).results;
      } finally {
        invalidateTradeData();
      }
    },
    [ws]
  );
  const exitAll = useCallback(
    async (): Promise<ExitResult[]> => {
      try {
        if (ws.status === 'open') {
          const res: any = await ws.request({ type: 'exitAll' });
          if (!res.ok) throw new Error(res.error || 'Exit failed');
          return res.results as ExitResult[];
        }
        return (await restExitAll()).results;
      } finally {
        invalidateTradeData();
      }
    },
    [ws]
  );

  const setWatchlist = useCallback(
    (symbols: string[]) => {
      const cleaned = Array.from(
        new Set(symbols.map((s) => s.toUpperCase().trim()).filter(Boolean))
      );
      // Always keep locked symbols present
      for (const s of LOCKED_SYMBOLS) {
        if (!cleaned.includes(s)) cleaned.unshift(s);
      }
      setWatchlistState(cleaned);
      ws.send({ type: 'updateWatchlist', symbols: cleaned });
    },
    [ws]
  );

  const onOrderFilled = useCallback((fn: (o: OrderDTO) => void) => {
    orderFilledListenersRef.current.add(fn);
    return () => {
      orderFilledListenersRef.current.delete(fn);
    };
  }, []);

  const onAlertTriggered = useCallback((fn: (payload: any) => void) => {
    alertListenersRef.current.add(fn);
    return () => {
      alertListenersRef.current.delete(fn);
    };
  }, []);

  const value = useMemo<MarketCtx>(
    () => ({
      status: ws.status,
      quotes,
      prevPrice,
      portfolio,
      watchlist,
      setWatchlist,
      subscribe,
      unsubscribe,
      placeOrder,
      modifyOrder,
      cancelOrder,
      exitPosition,
      exitAll,
      reconnect: ws.reconnect,
      onOrderFilled,
      onAlertTriggered,
    }),
    [
      ws.status,
      ws.reconnect,
      quotes,
      prevPrice,
      portfolio,
      watchlist,
      setWatchlist,
      subscribe,
      unsubscribe,
      placeOrder,
      modifyOrder,
      cancelOrder,
      exitPosition,
      exitAll,
      onOrderFilled,
      onAlertTriggered,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarket() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMarket must be used within MarketProvider');
  return v;
}
