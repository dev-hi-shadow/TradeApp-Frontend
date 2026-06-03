import { useMarketStatus } from '../hooks/useMarketStatus';

/**
 * Slim amber banner shown at the top of a market-scoped page (Trade / Stocks /
 * FnO use NSE, Commodities uses MCX) while that market is closed. Renders
 * nothing when the market is open. Re-evaluates automatically via
 * useMarketStatus so it disappears the moment the session opens.
 *
 * `market` is selected by passing a representative symbol:
 *   • NSE → undefined / any equity (marketFor → 'NSE')
 *   • MCX → a commodity symbol like 'GOLD'
 */
export function MarketClosedBanner({ symbol }: { symbol?: string }) {
  const { open, market, opensAt } = useMarketStatus(symbol);
  if (open) return null;
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg
                 bg-amber-500/10 text-amber-700 dark:text-amber-400
                 text-xs font-medium"
      role="status"
    >
      <span aria-hidden>🔒</span>
      <span>
        <span className="font-semibold">{market}</span> is closed — opens {opensAt}. Orders resume at open.
      </span>
    </div>
  );
}
