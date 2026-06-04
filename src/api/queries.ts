/**
 * TanStack Query hooks for all REST reads.
 *
 * Each page uses these instead of `useEffect(() => fetchX().then(setState))`.
 * Result: the data loads ONCE and is served from cache on every revisit (no
 * repeat network call), until something invalidates it (see queryClient.ts /
 * MarketContext for the invalidation triggers).
 *
 * Live market data is NOT here — it stays on the WebSocket via MarketContext.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { qk, queryClient } from '../queryClient';
import {
  listOrders,
  listOrdersByDate,
  listOrdersByRange,
  fetchTradeSummary,
  fetchTradeSummaryRange,
  listPositions,
  listGuards,
  listTransactions,
  type PositionGuardDTO,
  type TradeSummary,
} from './orders';
import { listPlans } from './plans';
import { listAlerts, listAlertEvents } from './alerts';
import { listUsers } from './admin';
import { fetchSnapshot, fetchHistory, type Period } from './market';
import { fetchPerformance, type PerformanceResp } from './analytics';
import { fetchUniverse, type UniverseStock } from './discover';
import { listWatchlists, type WatchlistGroup } from './watchlists';
import type { OrderDTO, PositionDTO, TradingPlan, AlertDTO, AlertEventDTO } from '../types';

export function useOrdersQuery(status?: string) {
  return useQuery({
    queryKey: qk.orders(status),
    queryFn: () => listOrders(status),
    select: (r): OrderDTO[] => r.orders,
  });
}

/** Orders for one IST calendar day (e.g. the History tab's date picker). */
export function useOrdersByDateQuery(date: string) {
  return useQuery({
    queryKey: qk.ordersByDate(date),
    queryFn: () => listOrdersByDate(date),
    select: (r): OrderDTO[] => r.orders,
    enabled: !!date,
  });
}

/** Per-IST-day trade summary (count, turnover, realised P&L, …). */
export function useTradeSummaryQuery(date: string) {
  return useQuery({
    queryKey: qk.tradeSummary(date),
    queryFn: () => fetchTradeSummary(date),
    select: (r): TradeSummary => r,
    enabled: !!date,
  });
}

/** Orders within an inclusive IST date range (epoch-ms [from, to)). */
export function useOrdersByRangeQuery(from: number, to: number) {
  return useQuery({
    queryKey: qk.ordersByRange(from, to),
    queryFn: () => listOrdersByRange(from, to),
    select: (r): OrderDTO[] => r.orders,
    enabled: from > 0 && to > from,
  });
}

/** Trade summary aggregated over an inclusive IST date range. */
export function useTradeSummaryRangeQuery(from: number, to: number) {
  return useQuery({
    queryKey: qk.tradeSummaryRange(from, to),
    queryFn: () => fetchTradeSummaryRange(from, to),
    select: (r): TradeSummary => r,
    enabled: from > 0 && to > from,
  });
}

export function usePositionsQuery() {
  return useQuery({
    queryKey: qk.positions(),
    queryFn: () => listPositions(),
    select: (r): PositionDTO[] => r.positions,
  });
}

export function usePlansQuery() {
  return useQuery({
    queryKey: qk.plans(),
    queryFn: () => listPlans(),
    select: (r): TradingPlan[] => r.plans,
  });
}

export function useGuardsQuery() {
  return useQuery({
    queryKey: qk.guards(),
    queryFn: () => listGuards(),
    select: (r): PositionGuardDTO[] => r.guards,
  });
}

export function useAlertsQuery() {
  return useQuery({
    queryKey: qk.alerts(),
    queryFn: () => listAlerts(),
    select: (r): AlertDTO[] => r.alerts,
  });
}

export function useAlertEventsQuery() {
  return useQuery({
    queryKey: qk.alertEvents(),
    queryFn: () => listAlertEvents(100),
    select: (r): AlertEventDTO[] => r.events,
  });
}

export function useTransactionsQuery() {
  return useQuery({
    queryKey: qk.transactions(),
    queryFn: () => listTransactions(),
    select: (r): any[] => r.transactions,
  });
}

export function useAdminUsersQuery(q: string, enabled = true) {
  return useQuery({
    queryKey: qk.adminUsers(q),
    queryFn: () => listUsers(q),
    enabled,
  });
}

export function useSnapshotQuery(symbol: string) {
  return useQuery({
    queryKey: qk.snapshot(symbol),
    queryFn: () => fetchSnapshot(symbol),
    select: (r) => r.snapshot,
    enabled: !!symbol,
    // Revisits paint INSTANTLY from cache, then refresh in the background
    // once the data is older than 30s. (Live price/change still stream in
    // over the WS ticker on top of this.)
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useHistoryQuery(symbol: string, period: Period, opts?: { enabled?: boolean }) {
  const intraday = period === '1D';
  return useQuery({
    queryKey: qk.history(symbol, period),
    queryFn: async () => {
      const r = await fetchHistory(symbol, period);
      // A background refetch can come back EMPTY during an upstream
      // rate-limit window. Never let that wipe good cached candles — the
      // chart would flip to the 1W fallback dataset under a "1D" label.
      // (A genuinely-empty FIRST load still flows through, so the
      // 1D-empty → 1W fallback keeps working for fresh symbols.)
      if (!r.candles.length) {
        const prev = queryClient.getQueryData<typeof r>(qk.history(symbol, period));
        if (prev?.candles?.length) return prev;
      }
      return r;
    },
    select: (r) => r.candles,
    enabled: (opts?.enabled ?? true) && !!symbol,
    // 1D grows new bars through the session → keep it fresh-ish and poll
    // lightly while mounted. Longer ranges are effectively immutable history,
    // so cache them for the whole session (instant period flips/revisits).
    staleTime: intraday ? 60_000 : Infinity,
    refetchInterval: intraday ? 120_000 : false,
    // Keep showing the previous chart while the next period/symbol loads —
    // no blank flash, the new line just replaces the old when ready.
    placeholderData: keepPreviousData,
  });
}

/**
 * Aggregated trading performance for the Analytics page. Pass epoch-ms
 * `from`/`to` for a date range, or omit BOTH for the all-time view.
 */
export function usePerformanceQuery(from?: number, to?: number) {
  return useQuery({
    queryKey: qk.performance(from, to),
    queryFn: () => fetchPerformance(from, to),
    select: (r): PerformanceResp => r,
  });
}

/**
 * All of the user's named watchlists (Groww/Dhan-style multi-list feature).
 * Server auto-seeds a default "My Watchlist", so this is never empty.
 */
export function useWatchlistsQuery() {
  return useQuery({
    queryKey: qk.watchlists(),
    queryFn: () => listWatchlists(),
    select: (r): WatchlistGroup[] => r.watchlists,
  });
}

/**
 * Curated NSE universe for the Discover page (gainers / losers / screener).
 *
 * Unlike the rest of these hooks, this is live-ish movers data — so we override
 * the app's default `staleTime: Infinity` and poll: data is considered fresh for
 * 20s and auto-refetches every 30s while the page is mounted.
 */
export function useUniverseQuery() {
  return useQuery({
    queryKey: qk.universe(),
    queryFn: () => fetchUniverse(),
    select: (r): UniverseStock[] => r.stocks,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}
