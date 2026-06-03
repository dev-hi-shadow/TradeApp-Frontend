import { api } from './client';
import type { Candle } from '../types';

export type Period = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL';

/** Supported terminal timeframes — drives the candle interval selector. */
export type Interval =
  | '1m' | '2m' | '3m' | '5m' | '10m' | '15m' | '20m' | '30m' | '1h' | '2h';

export function fetchHistory(symbol: string, period: Period) {
  return api<{ symbol: string; period: Period; candles: Candle[] }>(
    `/api/market/history?symbol=${encodeURIComponent(symbol)}&period=${period}`
  );
}

export function fetchCandles(symbol: string, interval: Interval) {
  return api<{ symbol: string; interval: Interval; bucketSeconds: number; candles: Candle[] }>(
    `/api/market/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}`
  );
}

export function searchSymbols(q: string) {
  return api<{ results: { symbol: string; name: string; exchange?: string }[] }>(
    `/api/market/search?q=${encodeURIComponent(q)}`
  );
}

export interface Snapshot {
  symbol: string;
  displaySymbol: string;
  tradingSymbol?: string;
  exchange?: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  previousClose: number;
  volume?: number;
  weekHigh52?: number;
  weekLow52?: number;
  upperCircuit?: number;
  lowerCircuit?: number;
  totalBuyQty?: number;
  totalSellQty?: number;
  avgPrice?: number;
  openInterest?: number;
  feedTime?: string;
  depth?: { buy: any[]; sell: any[] };
  fallback?: 'yahoo';
}

export function fetchSnapshot(symbol: string) {
  return api<{ snapshot: Snapshot }>(
    `/api/market/snapshot/${encodeURIComponent(symbol)}`
  );
}

export interface OptionLeg {
  symbol: string;
  token: string;
  lotsize?: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi: number;
}

export interface OptionRow {
  strike: number;
  ce: OptionLeg | null;
  pe: OptionLeg | null;
}

export interface OptionChainResp {
  underlying: string;
  expiry: string;
  expiries: string[];
  spot: number;
  lotSize?: string | null;
  rows: OptionRow[];
}

export function fetchOptionChain(symbol: string, opts?: { expiry?: string; radius?: number }) {
  const q = new URLSearchParams();
  if (opts?.expiry) q.set('expiry', opts.expiry);
  if (opts?.radius) q.set('radius', String(opts.radius));
  const qs = q.toString();
  return api<OptionChainResp>(
    `/api/market/options/${encodeURIComponent(symbol)}${qs ? '?' + qs : ''}`
  );
}
