import { QueryClient, type QueryKey as RQKey } from '@tanstack/react-query';

/**
 * App-wide REST cache (TanStack Query).
 *
 * Goal: a page's REST data loads ONCE; revisiting the page serves it instantly
 * from cache with NO new network call. Freshness comes from explicit
 * invalidation when something actually changes (an order fills, a plan/alert is
 * created, etc.) — wired in MarketContext + the mutation helpers.
 *
 * IMPORTANT: this only caches REST reads. Live market data (prices, portfolio,
 * order fills) flows over the WebSocket via MarketContext and is untouched.
 */

/** Strongly-typed root for every cache entry. Use these — never raw strings. */
export enum QueryKey {
  Orders = 'orders',
  OrdersByDate = 'ordersByDate',
  TradeSummary = 'tradeSummary',
  Positions = 'positions',
  Plans = 'plans',
  Guards = 'guards',
  Alerts = 'alerts',
  AlertEvents = 'alertEvents',
  Transactions = 'transactions',
  AdminUsers = 'adminUsers',
  Snapshot = 'snapshot',
  History = 'history',
  Watchlist = 'watchlist',
  Watchlists = 'watchlists',
  Performance = 'performance',
  Universe = 'universe',
}

/**
 * Typed query-key factory. Every key is a readonly tuple beginning with a
 * `QueryKey` root, so invalidation and hooks can never drift apart.
 */
export const qk = {
  orders: (status?: string) => [QueryKey.Orders, status ?? 'all'] as const,
  ordersByDate: (date: string) => [QueryKey.OrdersByDate, date] as const,
  ordersByRange: (from: number, to: number) => [QueryKey.OrdersByDate, 'range', from, to] as const,
  tradeSummary: (date: string) => [QueryKey.TradeSummary, date] as const,
  tradeSummaryRange: (from: number, to: number) => [QueryKey.TradeSummary, 'range', from, to] as const,
  positions: () => [QueryKey.Positions] as const,
  plans: () => [QueryKey.Plans] as const,
  guards: () => [QueryKey.Guards] as const,
  alerts: () => [QueryKey.Alerts] as const,
  alertEvents: () => [QueryKey.AlertEvents] as const,
  transactions: () => [QueryKey.Transactions] as const,
  adminUsers: (q: string) => [QueryKey.AdminUsers, q] as const,
  snapshot: (symbol: string) => [QueryKey.Snapshot, symbol.toUpperCase()] as const,
  history: (symbol: string, period: string) =>
    [QueryKey.History, symbol.toUpperCase(), period] as const,
  watchlists: () => [QueryKey.Watchlists] as const,
  performance: (from?: number, to?: number) =>
    [QueryKey.Performance, from ?? 'all', to ?? 'all'] as const,
  universe: () => [QueryKey.Universe] as const,
} satisfies Record<string, (...args: any[]) => RQKey>;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never auto-refetch just because a component remounted / you navigated
      // back. Data stays "fresh" until we explicitly invalidate it.
      staleTime: Infinity,
      // Keep cached data for the whole session even when unused, so revisits
      // are instant.
      gcTime: 1000 * 60 * 60, // 1 hour
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

/** Invalidate one or more query roots (forces a single refetch next render). */
export function invalidate(...roots: QueryKey[]): void {
  for (const root of roots) queryClient.invalidateQueries({ queryKey: [root] });
}

/** The trade-data set that changes whenever an order fills / exits / cancels. */
export function invalidateTradeData(): void {
  invalidate(
    QueryKey.Positions,
    QueryKey.Orders,
    QueryKey.Guards,
    // A new fill must also refresh today's date-filtered history + summary strip.
    QueryKey.OrdersByDate,
    QueryKey.TradeSummary,
  );
}
