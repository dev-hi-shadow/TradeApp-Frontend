import { api } from './client';
import type { ChargeBreakup, OrderDTO, PositionDTO } from '../types';

export const listOrders = (status?: string) =>
  api<{ orders: OrderDTO[] }>(`/api/orders${status ? `?status=${status}` : ''}`);

/** Orders for a single IST calendar day (filters `createdAt`). `date` = 'YYYY-MM-DD'. */
export const listOrdersByDate = (date: string) =>
  api<{ orders: OrderDTO[] }>(`/api/orders?date=${date}`);

/** Orders within an epoch-ms range [from, to) (inclusive IST day range). */
export const listOrdersByRange = (from: number, to: number) =>
  api<{ orders: OrderDTO[] }>(`/api/orders?from=${from}&to=${to}&limit=500`);

/** Per-IST-day trade summary (count, turnover, realised P&L, …). */
export interface TradeSummary {
  count: number;
  buys: number;
  sells: number;
  turnover: number;
  charges: number;
  realisedPnL: number;
  from: number;
  to: number;
}

/** Defaults to today (IST) when `date` is omitted. `date` = 'YYYY-MM-DD'. */
export const fetchTradeSummary = (date?: string) =>
  api<TradeSummary>(`/api/trades/summary${date ? `?date=${date}` : ''}`);

/** Trade summary aggregated over an epoch-ms range [from, to). */
export const fetchTradeSummaryRange = (from: number, to: number) =>
  api<TradeSummary>(`/api/trades/summary?from=${from}&to=${to}`);

export const listPositions = () => api<{ positions: PositionDTO[] }>('/api/positions');

export const listTransactions = () =>
  api<{ transactions: any[] }>('/api/transactions');

export type ExitResult = {
  ok: boolean;
  symbol: string;
  product?: 'CNC' | 'MIS' | 'NRML';
  fillPrice?: number;
  newBalance?: number;
  realisedPnL?: number | null;
  error?: string;
};

export const exitPosition = (symbol: string, product?: 'CNC' | 'MIS' | 'NRML') =>
  api<{ results: ExitResult[] }>(
    `/api/positions/${encodeURIComponent(symbol)}/exit${product ? `?product=${product}` : ''}`,
    { method: 'POST' },
  );

export const exitAllPositions = () =>
  api<{ results: ExitResult[]; message?: string }>('/api/positions/exit-all', { method: 'POST' });

/** Convert an open position's product (MIS↔CNC equity, MIS↔NRML F&O). */
export const convertPosition = (
  symbol: string,
  toProduct: 'CNC' | 'MIS' | 'NRML',
  fromProduct?: 'CNC' | 'MIS' | 'NRML',
) =>
  api<{ ok: boolean; product?: string; newBalance?: number; error?: string }>(
    `/api/positions/${encodeURIComponent(symbol)}/convert`,
    { method: 'POST', body: JSON.stringify({ toProduct, fromProduct }) },
  );

/* ── Position guards (SL / Target / Trailing auto-exit) ── */

export interface PositionGuardDTO {
  _id: string;
  symbol: string;
  product: 'CNC' | 'MIS' | 'NRML';
  stopLossPrice?: number;
  targetPrice?: number;
  trailingAmount?: number;
  trailAnchor?: number;
}

export const listGuards = () =>
  api<{ guards: PositionGuardDTO[] }>('/api/positions/guards');

export interface GuardInput {
  product?: 'CNC' | 'MIS' | 'NRML';
  /** Pass a positive number to set, or null/0 to clear that level. */
  stopLossPrice?: number | null;
  targetPrice?: number | null;
  trailingAmount?: number | null;
}

export const setGuard = (symbol: string, input: GuardInput) =>
  api<{ guard: PositionGuardDTO | null; cleared?: boolean }>(
    `/api/positions/${encodeURIComponent(symbol)}/guard`,
    { method: 'PUT', body: JSON.stringify(input) },
  );

export const clearGuard = (symbol: string, product?: 'CNC' | 'MIS' | 'NRML') =>
  api<{ ok: boolean }>(
    `/api/positions/${encodeURIComponent(symbol)}/guard${product ? `?product=${product}` : ''}`,
    { method: 'DELETE' },
  );

export const previewCharges = (params: {
  symbol: string;
  side: 'buy' | 'sell';
  product: 'CNC' | 'MIS' | 'NRML';
  price: number;
  quantity: number;
}) => {
  const q = new URLSearchParams({
    symbol:   params.symbol,
    side:     params.side,
    product:  params.product,
    price:    String(params.price),
    quantity: String(params.quantity),
  });
  return api<{
    charges: ChargeBreakup;
    turnover: number;
    margin: { marginBlocked: number; cashImpact: number; underlyingSpot: number };
    lotSize: number | null;
    available: { balance: number; marginUsed: number; availableMargin: number };
    /** Live LTP at the time of preview — used to seed the modal's price
        display so the user never sees a "—" while waiting for the WS tick. */
    ltp: number;
    /** Estimated MARKET fill price (real order-book VWAP, incl. spread/impact). */
    estFill: number | null;
    /** 'book' = priced off the real order book; 'synthetic' = spread+impact model. */
    estFillMode: 'book' | 'synthetic' | null;
    /** Real volume consumable from the visible book at the estimate. */
    estFillBookQty: number;
  }>(`/api/charges/preview?${q.toString()}`);
};
