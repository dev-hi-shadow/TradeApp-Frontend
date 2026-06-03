/**
 * Options-strategy payoff math — pure, side-effect-free helpers used by the
 * Strategy Builder. Everything is P&L-at-expiry: we ignore time value and IV,
 * which is exactly what a classic payoff diagram shows.
 *
 * Conventions:
 *   • CE intrinsic value at expiry = max(0, S − strike)
 *   • PE intrinsic value at expiry = max(0, strike − S)
 *   • buy  leg P&L/unit = intrinsic − premium   (you paid the premium)
 *   • sell leg P&L/unit = premium − intrinsic   (you received the premium)
 *   • scale every leg by lots × lotSize to get rupee P&L.
 */

export interface StrategyLeg {
  id: string;
  type: 'CE' | 'PE';
  side: 'buy' | 'sell';
  strike: number;
  premium: number;
  lots: number;
  lotSize: number;
  symbol: string;
}

export interface PayoffPoint {
  s: number;
  pnl: number;
}

export interface PayoffResult {
  points: PayoffPoint[];
  maxProfit: number;
  maxLoss: number;
  breakevens: number[];
  /** Sell credits (+) minus buy debits (−), already × lots × lotSize. */
  netPremium: number;
  /** True when the payoff is still climbing at the right edge of the sample. */
  profitUnlimited: boolean;
  /** True when the payoff is still falling at the left/right edge of the sample. */
  lossUnlimited: boolean;
}

/** Per-leg P&L (in rupees) at a given expiry underlying price `S`. */
export function legPayoffAt(leg: StrategyLeg, S: number): number {
  const intrinsic =
    leg.type === 'CE' ? Math.max(0, S - leg.strike) : Math.max(0, leg.strike - S);
  const perUnit =
    leg.side === 'buy' ? intrinsic - leg.premium : leg.premium - intrinsic;
  return perUnit * leg.lots * leg.lotSize;
}

/** Combined strategy P&L (in rupees) at expiry underlying price `S`. */
export function payoffAt(legs: StrategyLeg[], S: number): number {
  let total = 0;
  for (const leg of legs) total += legPayoffAt(leg, S);
  return total;
}

/** Net premium of the basket: sell credits (+), buy debits (−), × lots × lotSize. */
export function netPremiumOf(legs: StrategyLeg[]): number {
  let net = 0;
  for (const leg of legs) {
    const sign = leg.side === 'sell' ? 1 : -1;
    net += sign * leg.premium * leg.lots * leg.lotSize;
  }
  return net;
}

const SAMPLES = 161; // ≥ 120 points, odd so the spot tends to land on a sample

/**
 * Derive the payoff diagram + headline stats over the REAL underlying domain
 * [0, ∞):
 *   • The downside is bounded — price can't go below 0 — so max loss/profit on
 *     the left is the value at S=0 (a long PUT's profit is finite, NOT unlimited).
 *   • The upside is unbounded — only the far-right slope (S→∞) decides whether
 *     profit/loss is truly unlimited (e.g. long call/straddle profit, naked
 *     short call loss).
 *   • Finite extremes live at the payoff KINKS (S=0 and every strike) plus the
 *     high-S plateau, so we evaluate exactly those instead of guessing from a
 *     narrow window.
 * `points` are sampled over a focused window (around spot + the strikes) just
 * for a readable chart; the stats use the full domain.
 */
export function computePayoff(legs: StrategyLeg[], spot: number): PayoffResult {
  const empty: PayoffResult = {
    points: [], maxProfit: 0, maxLoss: 0, breakevens: [], netPremium: 0,
    profitUnlimited: false, lossUnlimited: false,
  };
  if (!legs.length || !(spot > 0)) return empty;

  const strikes = legs.map((l) => l.strike);
  // Focused chart window: span spot + all strikes with a buffer, clamped ≥ 0.
  const lo = Math.max(0, Math.min(spot, ...strikes) * 0.8);
  const hi = Math.max(spot, ...strikes) * 1.2;
  const step = (hi - lo) / (SAMPLES - 1);
  const points: PayoffPoint[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const s = lo + step * i;
    points.push({ s, pnl: payoffAt(legs, s) });
  }

  // ── Unlimited flags from the far-right slope (S → ∞) only ──
  const big = Math.max(hi, ...strikes) * 4 + 1000;
  const eps = 1e-6;
  const rightSlope = payoffAt(legs, big) - payoffAt(legs, big - Math.max(1, big * 0.001));
  const profitUnlimited = rightSlope > eps;
  const lossUnlimited = rightSlope < -eps;

  // ── Finite extremes at the kinks (0, each strike) + the high-S plateau ──
  const kinkValues = [0, ...strikes].map((s) => payoffAt(legs, s));
  kinkValues.push(payoffAt(legs, big)); // plateau / far-right value
  const maxProfit = Math.max(...kinkValues);
  const maxLoss = Math.min(...kinkValues);

  // ── Breakevens: scan the whole [0, big] domain for sign changes ──
  const breakevens: number[] = [];
  const beSamples = 600;
  let prevS = 0;
  let prevP = payoffAt(legs, 0);
  if (prevP === 0) breakevens.push(0);
  for (let i = 1; i <= beSamples; i++) {
    const s = (big * i) / beSamples;
    const p = payoffAt(legs, s);
    if ((prevP < 0 && p > 0) || (prevP > 0 && p < 0)) {
      const t = prevP / (prevP - p);
      breakevens.push(prevS + t * (s - prevS));
    } else if (p === 0) {
      breakevens.push(s);
    }
    prevS = s;
    prevP = p;
  }

  return {
    points,
    maxProfit,
    maxLoss,
    breakevens: dedupeNearby(breakevens),
    netPremium: netPremiumOf(legs),
    profitUnlimited,
    lossUnlimited,
  };
}

/** Collapse breakevens that are within a hair of each other into one. */
function dedupeNearby(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) > 0.5) out.push(v);
  }
  return out;
}
