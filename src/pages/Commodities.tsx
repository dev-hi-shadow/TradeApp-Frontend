/**
 * Commodities (MCX) explorer.
 *
 *   • Hero cards for the three most-traded MCX contracts (GOLD/SILVER/CRUDEOIL)
 *   • Session-open badge — MCX 09:00–23:30 IST Mon-Fri
 *   • Scrollable list of every commodity we support, with live price + chg %
 *   • Each row → /stock/<symbol> detail page where order modal opens NRML/MIS
 */
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isMarketOpen, useMarket } from '../context/MarketContext';
import { fmtNum, fmtPct, classPnL } from '../utils/fmt';
import { IconArrowDown, IconArrowUp, IconList } from '../components/icons';
import { StockLogo } from '../components/StockLogo';
import { MarketClosedBanner } from '../components/MarketClosedBanner';

const HERO = ['GOLD', 'SILVER', 'CRUDEOIL'] as const;
const ALL  = ['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS', 'COPPER'] as const;

const META: Record<string, { name: string; unit: string; lot: number; emoji: string }> = {
  GOLD:       { name: 'Gold',        unit: '₹ / 10 g',     lot: 100,  emoji: '🥇' },
  SILVER:     { name: 'Silver',      unit: '₹ / kg',       lot: 30,   emoji: '🥈' },
  CRUDEOIL:   { name: 'Crude Oil',   unit: '₹ / barrel',   lot: 100,  emoji: '🛢️' },
  NATURALGAS: { name: 'Natural Gas', unit: '₹ / mmBtu',    lot: 1250, emoji: '🔥' },
  COPPER:     { name: 'Copper',      unit: '₹ / kg',       lot: 2500, emoji: '🟤' },
};

export function Commodities() {
  const navigate = useNavigate();
  const { quotes, subscribe } = useMarket();
  const live = isMarketOpen('MCX');

  useEffect(() => { subscribe([...ALL]); }, [subscribe]);

  return (
    <div className="space-y-4 lg:space-y-5 px-3 sm:px-0">
      {/* MCX-closed banner — Commodities trade on MCX. */}
      <MarketClosedBanner symbol="GOLD" />

      {/* Title + session badge */}
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">Commodities</h1>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
              live ? 'bg-pos/15 text-pos' : 'bg-ink-100 dark:bg-night-500 text-ink-500 dark:text-night-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-pos animate-pulse' : 'bg-ink-300 dark:bg-night-400'}`} />
            MCX {live ? 'LIVE' : 'CLOSED'}
          </span>
        </div>
        <p className="text-xs text-ink-500 dark:text-night-200 mt-0.5">
          MCX session 09:00 – 23:30 IST · Mon–Fri
        </p>
      </header>

      {/* Hero grid */}
      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        {HERO.map((s) => <HeroTile key={s} symbol={s} />)}
      </section>

      {/* All-commodities list */}
      <section className="card !p-0 overflow-hidden">
        <header className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200 border-b border-ink-100 dark:border-night-500/40">
          All MCX contracts
        </header>
        {ALL.map((s) => {
          const q = quotes[s];
          const change = q?.change ?? 0;
          const up = change >= 0;
          const m = META[s];
          return (
            <Link
              key={s}
              to={`/stock/${encodeURIComponent(s)}`}
              className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-ink-100 dark:border-night-500/40 hover:bg-ink-50/60 dark:hover:bg-night-600/40 transition"
            >
              <StockLogo symbol={s} size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold tracking-tight">{m.name}</div>
                <div className="text-[11px] text-ink-500 dark:text-night-200">
                  {m.unit} · lot {m.lot}
                </div>
              </div>
              <div className="text-right">
                <div className="num text-sm font-bold">
                  {q?.price != null ? `₹${fmtNum(q.price)}` : '—'}
                </div>
                <div className={`num text-[11px] font-semibold flex items-center justify-end gap-0.5 ${classPnL(change)}`}>
                  {q?.change != null && (up ? <IconArrowUp size={10} /> : <IconArrowDown size={10} />)}
                  {q?.change != null
                    ? `${up ? '+' : '−'}${fmtNum(Math.abs(change))} (${fmtPct(q.changePercent)})`
                    : '—'}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/options/${encodeURIComponent(s)}`); }}
                className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center text-accent bg-brand/10 hover:bg-brand/20"
                title="Option chain"
                aria-label={`${s} option chain`}
              >
                <IconList size={14} />
              </button>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

function HeroTile({ symbol }: { symbol: string }) {
  const { quotes } = useMarket();
  const q = quotes[symbol];
  const m = META[symbol];
  const up = (q?.change ?? 0) >= 0;
  return (
    <Link
      to={`/stock/${encodeURIComponent(symbol)}`}
      className="card !p-3 hover:shadow-cardHover transition"
    >
      <div className="flex items-center gap-1 text-lg">{m?.emoji}</div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200 mt-1">
        {symbol}
      </div>
      <div className="num text-sm font-bold tracking-tight">
        {q?.price != null ? fmtNum(q.price) : '—'}
      </div>
      <div className={`num text-[10px] font-semibold ${classPnL(q?.change ?? 0)}`}>
        {q?.changePercent != null
          ? `${up ? '+' : '−'}${Math.abs(q.changePercent).toFixed(2)}%`
          : '—'}
      </div>
    </Link>
  );
}
