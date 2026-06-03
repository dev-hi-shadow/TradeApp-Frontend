import { api } from './client';

/** One IST trading day's aggregated P&L row (ascending by date). */
export interface PerformanceDay {
  date: string; // 'YYYY-MM-DD' (IST)
  realised: number;
  charges: number;
  trades: number;
  turnover: number;
  net: number;
}

/** Running cumulative net P&L point for the equity curve (ascending). */
export interface EquityPoint {
  date: string; // 'YYYY-MM-DD' (IST)
  cumulative: number;
}

/** A single best/worst day reference. */
export interface DayRef {
  date: string;
  net: number;
}

/** Headline performance stats over the selected range (or all-time). */
export interface PerformanceStats {
  netPnL: number;
  realisedPnL: number;
  charges: number;
  turnover: number;
  totalTrades: number;
  closingTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  maxDrawdown: number;
  activeDays: number;
  bestDay: DayRef | null;
  worstDay: DayRef | null;
}

export interface PerformanceResp {
  days: PerformanceDay[];
  equityCurve: EquityPoint[];
  stats: PerformanceStats;
}

/**
 * Fetch aggregated trading performance.
 *
 * `from` / `to` are epoch-ms bounds for an IST date range. Omit BOTH for the
 * all-time view (no query params sent). Pass an undefined for either and it is
 * simply not appended.
 */
export function fetchPerformance(from?: number, to?: number): Promise<PerformanceResp> {
  const params = new URLSearchParams();
  if (from != null) params.set('from', String(from));
  if (to != null) params.set('to', String(to));
  const qs = params.toString();
  return api<PerformanceResp>(`/api/analytics/performance${qs ? `?${qs}` : ''}`);
}
