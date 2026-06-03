/**
 * Standard technical-analysis indicators, computed entirely on the client
 * from candle arrays already in memory. No backend calls. Numbers used here
 * are textbook formulas (Wilder, Bollinger, Appel, etc.) that pre-date any
 * specific product implementation by decades.
 *
 * Conventions:
 *   • Input candles are time-ascending (oldest first), same shape as the
 *     `Candle` type returned by /api/market/history.
 *   • Output series are aligned 1:1 to the input array. Periods before the
 *     indicator can be computed are filled with NaN — consumers should
 *     skip those when rendering.
 */

import type { Candle } from '../types';

export type Series = (number | typeof NaN)[];

/** Simple moving average over `period`. */
export function sma(values: number[], period: number): Series {
  if (period <= 0) throw new Error('period must be > 0');
  const out: Series = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average (Wilder-style, seeded with the SMA of the
 * first `period` values to avoid the cold-start bias).
 */
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  // Seed with SMA(period) at index `period - 1`
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * RSI (Relative Strength Index) — Wilder smoothing, period default 14.
 * Output range 0–100. >70 conventionally overbought, <30 oversold.
 */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    // Wilder smoothing: weight the new period as 1/period of the prior avg.
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * MACD — Moving Average Convergence Divergence. Returns three series:
 *   macd      = EMA(fast) − EMA(slow)
 *   signal    = EMA(macd, signalPeriod)
 *   histogram = macd − signal
 * Defaults are Appel's original 12 / 26 / 9.
 */
export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: Series; signal: Series; histogram: Series } {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine: Series = values.map((_, i) =>
    Number.isFinite(emaFast[i] as number) && Number.isFinite(emaSlow[i] as number)
      ? (emaFast[i] as number) - (emaSlow[i] as number)
      : NaN,
  );
  // Signal EMA must skip leading NaNs to avoid poisoning the seed.
  const firstReal = macdLine.findIndex((v) => Number.isFinite(v));
  const tail = firstReal >= 0 ? (macdLine.slice(firstReal) as number[]) : [];
  const sigTail = ema(tail.filter(Number.isFinite) as number[], signalPeriod);
  const signal: Series = new Array(values.length).fill(NaN);
  for (let i = 0; i < sigTail.length; i++) signal[firstReal + i] = sigTail[i];
  const histogram: Series = values.map((_, i) =>
    Number.isFinite(macdLine[i] as number) && Number.isFinite(signal[i] as number)
      ? (macdLine[i] as number) - (signal[i] as number)
      : NaN,
  );
  return { macd: macdLine, signal, histogram };
}

/**
 * Bollinger Bands — SMA ± k×σ. Defaults: period 20, stdDev multiplier 2.
 * `mid` is the SMA, `upper`/`lower` are the bands.
 */
export function bollinger(
  values: number[],
  period = 20,
  k = 2,
): { mid: Series; upper: Series; lower: Series } {
  const mid = sma(values, period);
  const upper: Series = new Array(values.length).fill(NaN);
  const lower: Series = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sumSq = 0;
    const m = mid[i] as number;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - m;
      sumSq += d * d;
    }
    const sd = Math.sqrt(sumSq / period);
    upper[i] = m + k * sd;
    lower[i] = m - k * sd;
  }
  return { mid, upper, lower };
}

/**
 * VWAP — Volume Weighted Average Price. Resets daily (per UTC date by
 * default; pass `sessionResetIndex` to force a different boundary, e.g.,
 * IST 09:15 open). Uses the typical-price ((H+L+C)/3) per textbook.
 */
export function vwap(candles: Candle[]): Series {
  const out: Series = new Array(candles.length).fill(NaN);
  let cumPV = 0;
  let cumV = 0;
  let curDay = -1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const day = Math.floor(c.time / 86400);
    if (day !== curDay) {
      curDay = day;
      cumPV = 0;
      cumV = 0;
    }
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * (c.volume || 0);
    cumV += c.volume || 0;
    out[i] = cumV > 0 ? cumPV / cumV : NaN;
  }
  return out;
}

/** Convenience: pull the close-price array out of candles. */
export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}
