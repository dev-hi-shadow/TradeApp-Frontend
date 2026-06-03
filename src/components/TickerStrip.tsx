import { Link } from 'react-router-dom';
import { INDICES, isMarketOpen, marketFor, useMarket } from '../context/MarketContext';
import { fmtNum } from '../utils/fmt';
import { IconArrowDown, IconArrowUp } from './icons';

export function TickerStrip() {
  const { quotes } = useMarket();
  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-1">
      <div className="flex gap-2.5 min-w-max">
        {INDICES.map((sym) => {
          const q = quotes[sym.toUpperCase()];
          return (
            <TickerCard
              key={sym}
              symbol={sym}
              price={q?.price}
              change={q?.change}
              changePercent={q?.changePercent}
            />
          );
        })}
      </div>
    </div>
  );
}

function TickerCard({
  symbol,
  price,
  change,
  changePercent,
}: {
  symbol: string;
  price?: number;
  change?: number;
  changePercent?: number;
}) {
  const up = (change ?? 0) >= 0;
  const market = marketFor(symbol);
  const live = isMarketOpen(market);
  return (
    <Link
      to={`/stock/${encodeURIComponent(symbol)}`}
      className="relative min-w-[148px] rounded-2xl bg-white dark:bg-night-700
                  border border-ink-100 dark:border-night-500/40 px-3 py-2.5 block
                  hover:shadow-cardHover transition"
    >
      <div className="flex items-center justify-between mb-0.5 gap-1">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200 truncate">
          {symbol}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${live ? 'bg-pos' : 'bg-ink-300 dark:bg-night-400'}`}
            title={live ? `${market} open` : `${market} closed`}
          />
          {price != null && (
            <span className={up ? 'text-pos' : 'text-neg'}>
              {up ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
            </span>
          )}
        </div>
      </div>
      <div className="num text-[15px] font-semibold tracking-tight">
        {price != null ? fmtNum(price) : '—'}
      </div>
      <div className={`text-[11px] num ${up ? 'text-pos' : 'text-neg'}`}>
        {change != null ? `${up ? '+' : '−'}${fmtNum(Math.abs(change))}` : '—'}{' '}
        {changePercent != null && (
          <span className="opacity-80">
            ({up ? '+' : '−'}
            {Math.abs(changePercent).toFixed(2)}%)
          </span>
        )}
      </div>
    </Link>
  );
}
