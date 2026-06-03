/**
 * Aggregate option-chain analytics derived from open interest:
 *   • PCR (Put-Call Ratio) = ΣPut OI / ΣCall OI   (>1 bearish-positioning, <1 bullish)
 *   • Max Pain = the expiry strike that minimises total payout to option holders
 *     (i.e. where option WRITERS lose the least) — a common gravity level.
 */
import type { OptionRow } from '../api/market';

export interface ChainAnalytics {
  pcr: number | null;
  maxPain: number | null;
  totalCeOi: number;
  totalPeOi: number;
}

export function computeChainAnalytics(rows: OptionRow[]): ChainAnalytics {
  let totalCeOi = 0;
  let totalPeOi = 0;
  for (const r of rows) {
    totalCeOi += r.ce?.oi ?? 0;
    totalPeOi += r.pe?.oi ?? 0;
  }
  const pcr = totalCeOi > 0 ? totalPeOi / totalCeOi : null;

  // For each candidate expiry price (each listed strike), total intrinsic
  // payout writers owe = ITM calls (px−K)·OI + ITM puts (K−px)·OI. Max pain is
  // the price that MINIMISES this.
  let maxPain: number | null = null;
  let minPayout = Infinity;
  for (const candidate of rows) {
    const expiryPx = candidate.strike;
    let payout = 0;
    for (const r of rows) {
      if (r.ce && expiryPx > r.strike) payout += (expiryPx - r.strike) * r.ce.oi;
      if (r.pe && expiryPx < r.strike) payout += (r.strike - expiryPx) * r.pe.oi;
    }
    if (payout < minPayout) {
      minPayout = payout;
      maxPain = expiryPx;
    }
  }
  if (totalCeOi === 0 && totalPeOi === 0) maxPain = null;

  return { pcr, maxPain, totalCeOi, totalPeOi };
}
