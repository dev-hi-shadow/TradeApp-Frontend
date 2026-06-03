/**
 * "Discover" page — explore the curated NSE universe.
 *
 *  Tabs:
 *    • Gainers  — top movers by %change (desc)
 *    • Losers   — bottom movers by %change (asc)
 *    • Screener — filter by price / %change range, sort, see all matches
 *
 *  Data comes from `useUniverseQuery()` (GET /api/market/universe), which polls
 *  ~every 30s — hence the "Live · auto-refreshes" hint. Each row links to the
 *  stock detail page. No WebSocket / order logic touched.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUniverseQuery } from '../api/queries';
import type { UniverseStock } from '../api/discover';
import { fmtNum, fmtPct, classPnL } from '../utils/fmt';
import { StockLogo } from '../components/StockLogo';
import { Spinner } from '../components/Spinner';

type Tab = 'gainers' | 'losers' | 'screener';

const TOP_N = 15;

export function Discover() {
  const { data: stocks = [], isLoading, isError } = useUniverseQuery();
  const [tab, setTab] = useState<Tab>('gainers');

  const gainers = useMemo(
    () => [...stocks].sort((a, b) => b.changePercent - a.changePercent).slice(0, TOP_N),
    [stocks]
  );
  const losers = useMemo(
    () => [...stocks].sort((a, b) => a.changePercent - b.changePercent).slice(0, TOP_N),
    [stocks]
  );

  return (
    <div className="px-3 sm:px-0 pb-4">
      {/* Title + live hint */}
      <div className="border-b border-ink-100 dark:border-night-500/40">
        <div className="flex items-center gap-3 px-1 sm:px-4 py-2.5">
          <h1 className="text-lg font-bold tracking-tight shrink-0">Discover</h1>
          <LiveHint />
        </div>
        {/* Tabs */}
        <div className="px-1 sm:px-4 flex gap-5 overflow-x-auto">
          {([
            { id: 'gainers', label: 'Gainers' },
            { id: 'losers', label: 'Losers' },
            { id: 'screener', label: 'Screener' },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 relative pb-2.5 text-sm font-semibold transition ${
                tab === t.id
                  ? 'text-brand'
                  : 'text-ink-500 dark:text-night-200 hover:text-ink-700 dark:hover:text-night-50'
              }`}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand rounded" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="px-1 sm:px-4 pt-4">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <Message text="Couldn't load market data. Please try again shortly." />
        ) : stocks.length === 0 ? (
          <Message text="Market data is currently unavailable. Check back soon." />
        ) : tab === 'gainers' ? (
          <MoversList stocks={gainers} emptyText="No gainers right now." />
        ) : tab === 'losers' ? (
          <MoversList stocks={losers} emptyText="No losers right now." />
        ) : (
          <Screener stocks={stocks} />
        )}
      </div>
    </div>
  );
}

/* ---------- Tabs content ---------- */

function MoversList({ stocks, emptyText }: { stocks: UniverseStock[]; emptyText: string }) {
  if (stocks.length === 0) return <Message text={emptyText} />;
  return (
    <div className="card !p-0 overflow-hidden">
      {stocks.map((s) => (
        <StockRow key={s.symbol} stock={s} />
      ))}
    </div>
  );
}

type SortKey = 'pctDesc' | 'pctAsc' | 'priceDesc' | 'priceAsc';

interface Filters {
  minPrice: string;
  maxPrice: string;
  minPct: string;
  maxPct: string;
  sort: SortKey;
}

const EMPTY_FILTERS: Filters = {
  minPrice: '',
  maxPrice: '',
  minPct: '',
  maxPct: '',
  sort: 'pctDesc',
};

function Screener({ stocks }: { stocks: UniverseStock[] }) {
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);

  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }));

  const num = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const results = useMemo(() => {
    const minPrice = num(f.minPrice);
    const maxPrice = num(f.maxPrice);
    const minPct = num(f.minPct);
    const maxPct = num(f.maxPct);

    const filtered = stocks.filter((s) => {
      if (minPrice != null && s.price < minPrice) return false;
      if (maxPrice != null && s.price > maxPrice) return false;
      if (minPct != null && s.changePercent < minPct) return false;
      if (maxPct != null && s.changePercent > maxPct) return false;
      return true;
    });

    const sorted = [...filtered];
    switch (f.sort) {
      case 'pctDesc':
        sorted.sort((a, b) => b.changePercent - a.changePercent);
        break;
      case 'pctAsc':
        sorted.sort((a, b) => a.changePercent - b.changePercent);
        break;
      case 'priceDesc':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'priceAsc':
        sorted.sort((a, b) => a.price - b.price);
        break;
    }
    return sorted;
  }, [stocks, f]);

  const isDefault =
    f.minPrice === '' &&
    f.maxPrice === '' &&
    f.minPct === '' &&
    f.maxPct === '' &&
    f.sort === 'pctDesc';

  return (
    <div className="space-y-4">
      {/* Filter controls */}
      <div className="card space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Min price">
            <input
              type="number"
              inputMode="decimal"
              className="input"
              placeholder="₹ min"
              value={f.minPrice}
              onChange={set('minPrice')}
            />
          </Field>
          <Field label="Max price">
            <input
              type="number"
              inputMode="decimal"
              className="input"
              placeholder="₹ max"
              value={f.maxPrice}
              onChange={set('maxPrice')}
            />
          </Field>
          <Field label="Min %change">
            <input
              type="number"
              inputMode="decimal"
              className="input"
              placeholder="% min"
              value={f.minPct}
              onChange={set('minPct')}
            />
          </Field>
          <Field label="Max %change">
            <input
              type="number"
              inputMode="decimal"
              className="input"
              placeholder="% max"
              value={f.maxPct}
              onChange={set('maxPct')}
            />
          </Field>
        </div>
        <div className="flex items-end gap-3">
          <Field label="Sort by">
            <select className="input" value={f.sort} onChange={set('sort')}>
              <option value="pctDesc">Change % ↓</option>
              <option value="pctAsc">Change % ↑</option>
              <option value="priceDesc">Price ↓</option>
              <option value="priceAsc">Price ↑</option>
            </select>
          </Field>
          <button
            type="button"
            onClick={() => setF(EMPTY_FILTERS)}
            disabled={isDefault}
            className="btn-sm bg-ink-100 dark:bg-night-600 text-ink-700 dark:text-night-50
                       hover:bg-ink-200 dark:hover:bg-night-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Result count */}
      <div className="text-xs font-semibold text-ink-500 dark:text-night-200 px-1">
        {results.length} {results.length === 1 ? 'match' : 'matches'}
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <Message text="No stocks match these filters." />
      ) : (
        <div className="card !p-0 overflow-hidden">
          {results.map((s) => (
            <StockRow key={s.symbol} stock={s} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Shared row ---------- */

function StockRow({ stock }: { stock: UniverseStock }) {
  const up = stock.changePercent >= 0;
  return (
    <Link
      to={`/stock/${encodeURIComponent(stock.symbol)}`}
      className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-ink-100 dark:border-night-500/40 hover:bg-ink-50/60 dark:hover:bg-night-600/40 transition"
    >
      <StockLogo symbol={stock.symbol} size={36} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold tracking-tight truncate">{stock.symbol}</div>
        <div className="num text-xs text-ink-500 dark:text-night-200">₹{fmtNum(stock.price)}</div>
      </div>
      <div className="text-right">
        <div className={`num text-sm font-semibold ${classPnL(stock.change)}`}>
          {up ? '+' : '−'}
          {fmtNum(Math.abs(stock.change))}
        </div>
        <div className={`num text-xs font-semibold ${classPnL(stock.changePercent)}`}>
          {fmtPct(stock.changePercent)}
        </div>
      </div>
    </Link>
  );
}

/* ---------- Bits ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0 flex-1">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200">
        {label}
      </span>
      {children}
    </label>
  );
}

function LiveHint() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-500 dark:text-night-200">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-pos/60 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-pos" />
      </span>
      Live · auto-refreshes
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-500 dark:text-night-200">
      <span className="text-accent">
        <Spinner size={26} thickness={3.5} />
      </span>
      <span className="text-xs">Loading market…</span>
    </div>
  );
}

function Message({ text }: { text: string }) {
  return (
    <div className="card text-sm text-ink-500 dark:text-night-200 text-center py-8">{text}</div>
  );
}
