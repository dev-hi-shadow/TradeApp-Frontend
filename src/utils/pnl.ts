/**
 * Pure-frontend P&L engine.
 *
 * All numbers derived from data already in browser memory:
 *   • positions   — from `/api/positions` (avgEntryPrice = VWAP cost basis, realisedPnL persisted)
 *   • quotes      — live from WS `priceUpdate` (price = LTP, previousClose = day-open ref)
 *
 * No additional HTTP calls. Recomputes on every tick the consumer re-renders.
 *
 * Formulas (industry-standard MTM accounting):
 *   invested   = Σ |netQty_i| × avg_i
 *   marketVal  = Σ |netQty_i| × ltp_i                                    (sign-aware below)
 *   unrealised = Σ (ltp_i − avg_i) × netQty_i                            (long: +ve when ltp>avg)
 *   day's PnL  = Σ (ltp_i − prevClose_i) × netQty_i                      (since last EOD close)
 *   totalPnL   = unrealised + realisedPnL (already booked on close trades)
 *
 * Short positions: netQuantity is negative; the formulas naturally give
 * +ve unrealised when LTP < avg (price dropped, short profits).
 *
 * Day's P&L for a position OPENED INTRADAY: avgEntryPrice replaces prevClose
 * as the day's reference price, because nothing was held overnight. We detect
 * this by comparing `position.openedToday` flag (caller passes if known) or
 * by falling back to entry price when prevClose is missing.
 */

import type { PositionDTO, Quote } from '../types';

export interface PositionPnL {
  symbol: string;
  product?: 'CNC' | 'MIS' | 'NRML';
  netQuantity: number;
  /** Volume-weighted average entry — what was paid per unit on aggregate. */
  avgEntryPrice: number;
  /** Live last traded price, or 0 if no quote yet (UI should render "—"). */
  ltp: number;
  /** Previous EOD close (day's P&L reference). Falls back to avg when missing. */
  prevClose: number;
  /** What the position cost — always positive: |qty| × avg. */
  invested: number;
  /** Current MTM value — always positive: |qty| × ltp. */
  marketValue: number;
  /** Mark-to-market P&L on the still-open quantity. Sign-aware (handles shorts). */
  unrealised: number;
  /** Same as `unrealised` but expressed as % of cost basis. */
  unrealisedPct: number;
  /** Today's change × qty (LTP − prevClose) × netQty. */
  daysPnL: number;
  /** Already-booked P&L from partial closes / flips on this row. */
  realised: number;
  /** unrealised + realised — total P&L attributable to this position lifetime. */
  totalPnL: number;
  /** True when no live quote was available; UI should grey-out and show "—". */
  stale: boolean;
}

export interface PortfolioPnL {
  invested: number;
  marketValue: number;
  unrealised: number;
  unrealisedPct: number;
  realised: number;
  daysPnL: number;
  daysPnLPct: number;
  totalPnL: number;
  positions: PositionPnL[];
}

/** IST midnight today (UTC ms). Used to detect intraday-opened positions. */
export function todayIstStartMs(now = Date.now()): number {
  // IST = UTC+5:30. Add the offset, floor to midnight UTC, subtract the offset.
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now + istOffsetMs);
  ist.setUTCHours(0, 0, 0, 0);
  return ist.getTime() - istOffsetMs;
}

/**
 * Compute per-position and aggregate P&L from a snapshot of positions and
 * a quote-by-symbol map. Caller is responsible for filtering closed positions
 * (netQuantity === 0) BEFORE passing — closed rows skew "invested" toward 0
 * but their realisedPnL still contributes; this engine only handles OPEN rows
 * and accepts a separate `bookedRealised` for already-closed-out rows.
 */
export function computePortfolioPnL(
  openPositions: PositionDTO[],
  quotes: Record<string, Quote | undefined>,
  bookedRealisedFromClosed = 0,
  /**
   * Realised P&L BOOKED TODAY from positions closed today. Counts toward
   * "Today's P&L" — a trade you opened and closed today for a loss is a loss
   * you took today, exactly like Groww/Zerodha's day P&L. (Distinct from
   * `bookedRealisedFromClosed`, which is lifetime realised and feeds totalPnL.)
   */
  realisedTodayFromClosed = 0,
  /** Cost basis of those closed-today positions, so the day's % has a real denominator. */
  dayBaselineExtraFromClosed = 0,
): PortfolioPnL {
  let invested = 0;
  let marketValue = 0;
  let unrealised = 0;
  let realised = bookedRealisedFromClosed;
  let daysPnL = 0;

  const todayStart = todayIstStartMs();

  const positions: PositionPnL[] = openPositions.map((p) => {
    const q = quotes[p.symbol.toUpperCase()];
    const ltp = q?.price ?? 0;
    const rawPrevClose = q?.previousClose && q.previousClose > 0 ? q.previousClose : p.avgEntryPrice;
    const qty = p.netQuantity;
    const absQty = Math.abs(qty);

    // ── DAY'S P&L REFERENCE PRICE ──
    // If the position was OPENED today (createdAt >= IST midnight) we treat
    // avgEntryPrice as the day-zero reference instead of the broker-reported
    // previousClose. Options/futures often have wildly different previous
    // session closes vs today's entry — a NIFTY OTM call you buy today at
    // ₹1.90 might have closed yesterday at ₹87. Using ₹87 as today's
    // baseline produces a fake −97% loss; using your entry (₹1.90) gives
    // the actual intraday change.
    const openedToday = p.createdAt ? new Date(p.createdAt).getTime() >= todayStart : false;
    const dayRef = openedToday ? p.avgEntryPrice : rawPrevClose;

    const posInvested = absQty * p.avgEntryPrice;
    // Long: marketValue = qty × ltp (positive). Short: still positive notional.
    const posMarketValue = absQty * ltp;
    // (LTP − avg) × signed qty handles longs (+ when ltp↑) AND shorts (+ when ltp↓).
    const posUnrealised = ltp > 0 ? (ltp - p.avgEntryPrice) * qty : 0;
    const posUnrealisedPct =
      posInvested > 0 && ltp > 0
        ? (posUnrealised / posInvested) * 100
        : 0;
    const posDaysPnL = ltp > 0 ? (ltp - dayRef) * qty : 0;

    invested += posInvested;
    marketValue += posMarketValue;
    unrealised += posUnrealised;
    realised += p.realisedPnL || 0;
    daysPnL += posDaysPnL;

    return {
      symbol: p.symbol,
      product: p.product,
      netQuantity: qty,
      avgEntryPrice: p.avgEntryPrice,
      ltp,
      prevClose: dayRef,
      invested: posInvested,
      marketValue: posMarketValue,
      unrealised: posUnrealised,
      unrealisedPct: posUnrealisedPct,
      daysPnL: posDaysPnL,
      realised: p.realisedPnL || 0,
      totalPnL: posUnrealised + (p.realisedPnL || 0),
      stale: !(ltp > 0),
    };
  });

  // Booked-today P&L is part of today's P&L (closed trades you took today).
  daysPnL += realisedTodayFromClosed;

  const unrealisedPct = invested > 0 ? (unrealised / invested) * 100 : 0;
  // Day's P&L %: against the same dayRef notional used to compute each
  // position's day P&L — so the percentage stays consistent with the rupee
  // number above it. For an intraday-opened position the baseline is
  // |qty|×avg (same as invested); for held-overnight it's |qty|×prevClose.
  // Plus the cost basis of positions closed today, so the % denominator
  // reflects ALL capital that was at risk today, not just what's still open.
  const dayBaseline =
    positions.reduce(
      (acc, p) => acc + Math.abs(p.netQuantity) * (p.prevClose || p.avgEntryPrice),
      0,
    ) + dayBaselineExtraFromClosed;
  const daysPnLPct = dayBaseline > 0 ? (daysPnL / dayBaseline) * 100 : 0;

  return {
    invested,
    marketValue,
    unrealised,
    unrealisedPct,
    realised,
    daysPnL,
    daysPnLPct,
    totalPnL: unrealised + realised,
    positions,
  };
}

/**
 * Quick per-position helper for components that only need one row's numbers
 * (e.g., the floating P&L pill on the order modal). Same math as the
 * aggregator above but skipping the reduction.
 */
export function computePositionPnL(
  position: PositionDTO,
  quote: Quote | undefined,
): PositionPnL {
  return computePortfolioPnL([position], quote ? { [position.symbol.toUpperCase()]: quote } : {}).positions[0];
}
