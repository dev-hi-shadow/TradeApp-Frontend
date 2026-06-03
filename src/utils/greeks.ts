/**
 * Black-Scholes option greeks + implied-volatility solver.
 *
 * The chain gives us the market premium (LTP) but not IV/greeks, so we back IV
 * out of the premium (bisection) and derive the greeks from it. All pure math,
 * runs client-side and recomputes whenever the chain ticks.
 *
 * Conventions:
 *   • delta  — per ₹1 move in the underlying (calls 0..1, puts -1..0)
 *   • gamma  — change in delta per ₹1 move
 *   • theta  — premium decay per CALENDAR DAY (negative for long options)
 *   • vega   — premium change per 1% (absolute) change in IV
 *   • iv     — annualised implied volatility as a fraction (0.14 = 14%)
 */

const R_DEFAULT = 0.065; // India ~risk-free rate

/** Standard normal CDF (Abramowitz-Stegun 7.1.26). */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Standard normal PDF. */
function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp(-0.5 * x * x);
}

export type OptType = 'CE' | 'PE';

/** Theoretical Black-Scholes price. */
export function bsPrice(
  S: number, K: number, T: number, sigma: number, type: OptType, r = R_DEFAULT,
): number {
  if (T <= 0 || sigma <= 0) {
    // At/!past expiry → intrinsic value only.
    return type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === 'CE') return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

/** Solve for implied volatility via bisection. Returns null if no sane root. */
export function impliedVol(
  price: number, S: number, K: number, T: number, type: OptType, r = R_DEFAULT,
): number | null {
  if (!(price > 0) || !(S > 0) || !(K > 0) || !(T > 0)) return null;
  const intrinsic = type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
  if (price < intrinsic - 0.01) return null; // below intrinsic → no valid IV
  let lo = 0.0001;
  let hi = 5; // 500% vol upper bound
  if (bsPrice(S, K, T, hi, type, r) < price) return null; // price beyond model
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const diff = bsPrice(S, K, T, mid, type, r) - price;
    if (Math.abs(diff) < 0.001) return mid;
    if (diff > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface Greeks {
  iv: number;     // fraction (0.14 = 14%)
  delta: number;
  gamma: number;
  theta: number;  // per calendar day
  vega: number;   // per 1% IV
}

/**
 * Full greeks for one contract, backing IV out of the market premium.
 * Returns null when IV can't be solved (premium below intrinsic / no data).
 */
export function computeGreeks(args: {
  spot: number; strike: number; premium: number; tYears: number; type: OptType; r?: number;
}): Greeks | null {
  const { spot: S, strike: K, premium, tYears: T, type } = args;
  const r = args.r ?? R_DEFAULT;
  const sigma = impliedVol(premium, S, K, T, type, r);
  if (sigma == null || T <= 0) return null;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdf = normPdf(d1);
  const delta = type === 'CE' ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = pdf / (S * sigma * sqrtT);
  const vega = (S * pdf * sqrtT) / 100; // per 1% vol
  const thetaYr =
    type === 'CE'
      ? -(S * pdf * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normCdf(d2)
      : -(S * pdf * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normCdf(-d2);
  return { iv: sigma, delta, gamma, theta: thetaYr / 365, vega };
}

/**
 * Years to expiry for an Angel-style expiry key ("04JUN2026" / "04JUN26"),
 * measured to 15:30 IST (10:00 UTC) on expiry day. Floored at a tiny positive
 * so same-day options still produce finite greeks.
 */
export function yearsToExpiry(expiry: string, now = Date.now()): number {
  const m = expiry.toUpperCase().match(/(\d{1,2})([A-Z]{3})(\d{2,4})/);
  if (!m) return 0;
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const day = parseInt(m[1], 10);
  const mon = months[m[2]];
  if (mon == null) return 0;
  let yr = parseInt(m[3], 10);
  if (yr < 100) yr += 2000;
  // 15:30 IST == 10:00 UTC.
  const expiryMs = Date.UTC(yr, mon, day, 10, 0, 0);
  const years = (expiryMs - now) / (365 * 24 * 3600 * 1000);
  return Math.max(years, 1 / (365 * 24)); // floor ~1 hour
}
