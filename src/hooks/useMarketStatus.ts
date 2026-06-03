import { useEffect, useState } from 'react';
import { isMarketOpen, marketFor } from '../context/MarketContext';

export interface MarketStatus {
  open: boolean;
  market: 'NSE' | 'MCX';
  /** Human-friendly session open time for the symbol's market. */
  opensAt: string;
  /** Compact label e.g. "NSE open" or "NSE closed · opens 9:15 AM". */
  label: string;
}

function openTimeFor(market: 'NSE' | 'MCX'): string {
  return market === 'MCX' ? '9:00 AM' : '9:15 AM';
}

function compute(symbol?: string): MarketStatus {
  const market = marketFor(symbol ?? '');
  const open = isMarketOpen(market);
  const opensAt = openTimeFor(market);
  return {
    open,
    market,
    opensAt,
    label: open ? `${market} open` : `${market} closed · opens ${opensAt}`,
  };
}

/**
 * Live "is this symbol's market open" status. Re-evaluates every 15s on a
 * timer so the UI flips automatically at the open/close boundary without a
 * reload (e.g. a disabled BUY button re-enables at 9:15 AM). The interval is
 * torn down on unmount.
 */
export function useMarketStatus(symbol?: string): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(() => compute(symbol));

  useEffect(() => {
    // Recompute immediately when the symbol changes...
    setStatus(compute(symbol));
    // ...and then on a 15s cadence so we cross the open/close edge promptly.
    const id = setInterval(() => setStatus(compute(symbol)), 15000);
    return () => clearInterval(id);
  }, [symbol]);

  return status;
}
