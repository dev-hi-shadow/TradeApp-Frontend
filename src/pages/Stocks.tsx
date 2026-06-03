/**
 * "Stocks" home page (Groww-inspired).
 *
 *  Layout:
 *    • Sticky title row with NIFTY / SENSEX live ticker strip
 *    • Sub-tabs: Explore · Holdings · Positions · Orders
 *    • Explore: Recently viewed (mini icons) + Popular F&O equities grid
 *    • Holdings / Positions / Orders: pulled from existing REST endpoints
 *
 *  Recently-viewed is tracked client-side (localStorage) every time the user
 *  opens a stock detail page.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarket } from '../context/MarketContext';
import { useOrdersQuery, usePositionsQuery } from '../api/queries';
import { fmtINR, fmtNum, fmtPct, classPnL } from '../utils/fmt';
import { getRecentlyViewed } from '../utils/recentlyViewed';
import { StockLogo } from '../components/StockLogo';
import { MarketClosedBanner } from '../components/MarketClosedBanner';
import type { OrderDTO, PositionDTO } from '../types';

type Tab = 'explore' | 'holdings' | 'positions' | 'orders';

// "Popular F&O equities" grid — same list our F&O dashboard uses.
const POPULAR = [
  'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'INFY', 'TCS', 'AXISBANK',
  'KOTAKBANK', 'BHARTIARTL', 'ITC', 'LT', 'BAJFINANCE', 'WIPRO', 'HCLTECH',
  'MARUTI', 'TITAN', 'ASIANPAINT', 'ADANIENT', 'TATAMOTORS', 'HINDUNILVR',
];

const TICKER = ['NIFTY', 'SENSEX', 'BANKNIFTY'];

export function Stocks() {
  const { quotes, subscribe } = useMarket();

  const [tab, setTab] = useState<Tab>('explore');
  const [recent, setRecent] = useState<string[]>(getRecentlyViewed());

  // Cached REST reads — load once, served from cache on revisit.
  const { data: allPositions = [] } = usePositionsQuery();
  const { data: pendingOrders = [] } = useOrdersQuery('pending');
  const { data: allOrders = [] } = useOrdersQuery();

  // Per-tab/filtered views derived from the cached hook data.
  const positions = useMemo(
    () => allPositions.filter((p) => p.netQuantity !== 0),
    [allPositions]
  );
  const pending = pendingOrders;
  const orders = useMemo(() => allOrders.slice(0, 50), [allOrders]);

  // Subscribe to ticker + popular + recently-viewed for live prices
  useEffect(() => {
    subscribe([...TICKER, ...POPULAR, ...recent]);
  }, [subscribe, recent]);

  // Refresh recently-viewed when user navigates back (storage might've updated)
  useEffect(() => {
    const handler = () => setRecent(getRecentlyViewed());
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, []);

  return (
    <div className="pb-4">
      {/* Title + live ticker on ONE row — title is fixed-width, ticker
          horizontally scrolls in the remaining space. No empty band above. */}
      <div className="border-b border-ink-100 dark:border-night-500/40">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <h1 className="text-lg font-bold tracking-tight shrink-0">Stocks</h1>
          <span className="w-px h-5 bg-ink-200 dark:bg-night-500/60 shrink-0" />
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex gap-4 min-w-max items-center">
              {TICKER.map((s) => <TickerMini key={s} symbol={s} />)}
            </div>
          </div>
        </div>
        {/* Sub-tabs */}
        <div className="px-4 flex gap-5 overflow-x-auto">
          {([
            { id: 'explore',   label: 'Explore' },
            { id: 'holdings',  label: 'Holdings' },
            { id: 'positions', label: 'Positions' },
            { id: 'orders',    label: 'Orders' },
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
              {tab === t.id && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand rounded" />}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 pt-4 space-y-5">
        {/* NSE-closed banner — Stocks trade on NSE/BSE equity. */}
        <MarketClosedBanner />
        {tab === 'explore' && (
          <ExploreTab recent={recent} />
        )}
        {tab === 'holdings' && (
          <HoldingsTab positions={positions} />
        )}
        {tab === 'positions' && (
          <PositionsTab positions={positions} />
        )}
        {tab === 'orders' && (
          <OrdersTab pending={pending} history={orders} />
        )}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function TickerMini({ symbol }: { symbol: string }) {
  const { quotes } = useMarket();
  const q = quotes[symbol];
  const change = q?.change ?? 0;
  const up = change >= 0;
  return (
    <Link
      to={`/stock/${encodeURIComponent(symbol)}`}
      className="flex items-baseline gap-2 shrink-0"
    >
      <span className="text-[11px] uppercase tracking-wider font-bold text-ink-700 dark:text-night-50">
        {symbol}
      </span>
      <span className="num text-sm font-semibold">
        {q?.price != null ? fmtNum(q.price) : '—'}
      </span>
      <span
        className={`num text-[11px] font-semibold px-1.5 py-0.5 rounded ${
          up ? 'bg-pos/15 text-pos' : 'bg-neg/15 text-neg'
        }`}
      >
        {up ? '+' : '−'}{fmtNum(Math.abs(change))}
      </span>
    </Link>
  );
}

function ExploreTab({ recent }: { recent: string[] }) {
  const { quotes } = useMarket();
  return (
    <>
      {recent.length > 0 && (
        <section>
          <h2 className="text-base font-bold tracking-tight mb-3">Recently viewed</h2>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {recent.slice(0, 8).map((s) => {
              const q = quotes[s];
              const pct = q?.changePercent ?? 0;
              return (
                <Link
                  key={s}
                  to={`/stock/${encodeURIComponent(s)}`}
                  className="flex flex-col items-center gap-1.5 hover:opacity-80"
                >
                  <StockLogo symbol={s} size={48} />
                  <span className="text-[10px] font-semibold tracking-wider text-ink-700 dark:text-night-50 uppercase truncate w-full text-center">
                    {s}
                  </span>
                  <span className={`text-[10px] num font-semibold ${classPnL(pct)}`}>
                    {q?.price != null ? `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%` : '—'}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-base font-bold tracking-tight mb-3">Most traded</h2>
        <div className="grid grid-cols-2 gap-3">
          {POPULAR.slice(0, 6).map((s) => <StockTile key={s} symbol={s} />)}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold tracking-tight mb-3">All F&amp;O equities</h2>
        <div className="card !p-0 overflow-hidden">
          {POPULAR.map((s) => <StockRow key={s} symbol={s} />)}
        </div>
      </section>
    </>
  );
}

function StockTile({ symbol }: { symbol: string }) {
  const { quotes } = useMarket();
  const q = quotes[symbol];
  const up = (q?.change ?? 0) >= 0;
  return (
    <Link
      to={`/stock/${encodeURIComponent(symbol)}`}
      className="card !p-3 hover:shadow-cardHover transition"
    >
      <div className="flex items-center gap-2 mb-2">
        <StockLogo symbol={symbol} size={32} />
        <div className="text-sm font-semibold truncate">{symbol}</div>
      </div>
      <div className="num text-base font-bold tracking-tight">
        {q?.price != null ? `₹${fmtNum(q.price)}` : '—'}
      </div>
      <div className={`num text-[11px] font-semibold ${up ? 'text-pos' : 'text-neg'}`}>
        {q?.change != null
          ? `${up ? '+' : '−'}${fmtNum(Math.abs(q.change))} (${up ? '+' : '−'}${Math.abs(q.changePercent).toFixed(2)}%)`
          : '—'}
      </div>
    </Link>
  );
}

function StockRow({ symbol }: { symbol: string }) {
  const { quotes } = useMarket();
  const q = quotes[symbol];
  const up = (q?.change ?? 0) >= 0;
  return (
    <Link
      to={`/stock/${encodeURIComponent(symbol)}`}
      className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-ink-100 dark:border-night-500/40 hover:bg-ink-50/60 dark:hover:bg-night-600/40 transition"
    >
      <StockLogo symbol={symbol} size={36} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold tracking-tight truncate">{symbol}</div>
        <div className={`text-xs num ${up ? 'text-pos' : 'text-neg'}`}>
          {q?.price != null
            ? `${fmtNum(q.price)}  ${up ? '+' : '−'}${fmtNum(Math.abs(q.change))} (${Math.abs(q.changePercent).toFixed(2)}%)`
            : 'Loading…'}
        </div>
      </div>
    </Link>
  );
}

function HoldingsTab({ positions }: { positions: PositionDTO[] }) {
  const { quotes } = useMarket();
  if (positions.length === 0) {
    return <EmptyState message="You don't have any holdings yet." />;
  }
  const invested = positions.reduce((s, p) => s + p.avgEntryPrice * p.netQuantity, 0);
  const current = positions.reduce((s, p) => {
    const live = quotes[p.symbol.toUpperCase()]?.price ?? p.avgEntryPrice;
    return s + live * p.netQuantity;
  }, 0);
  const ret = current - invested;
  const retPct = invested ? (ret / invested) * 100 : 0;
  return (
    <>
      <section className="card">
        <div className="grid grid-cols-3 gap-2">
          <Mini label="Invested"      value={fmtINR(invested)} />
          <Mini label="Current value" value={fmtINR(current)} />
          <Mini label="Returns"       value={fmtINR(ret)} sub={fmtPct(retPct)} tone={ret >= 0 ? 'pos' : 'neg'} />
        </div>
      </section>
      <section className="card !p-0 overflow-hidden">
        {positions.map((p) => {
          const live = quotes[p.symbol.toUpperCase()]?.price ?? p.avgEntryPrice;
          const upl = (live - p.avgEntryPrice) * p.netQuantity;
          const uplPct = p.avgEntryPrice ? ((live - p.avgEntryPrice) / p.avgEntryPrice) * 100 : 0;
          return (
            <Link
              key={p.symbol}
              to={`/stock/${encodeURIComponent(p.symbol)}`}
              className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-ink-100 dark:border-night-500/40 hover:bg-ink-50/60 dark:hover:bg-night-600/40 transition"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold tracking-tight truncate">{p.symbol}</div>
                <div className="text-xs text-ink-500 dark:text-night-200 num">
                  {p.netQuantity} shares · avg {p.avgEntryPrice.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="num text-sm font-semibold">{fmtINR(live * p.netQuantity)}</div>
                <div className={`text-xs num font-semibold ${classPnL(upl)}`}>
                  {upl >= 0 ? '+' : '−'}{fmtINR(Math.abs(upl)).replace('₹','₹')} · {fmtPct(uplPct)}
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    </>
  );
}

function PositionsTab({ positions }: { positions: PositionDTO[] }) {
  return <HoldingsTab positions={positions} />;
}

function OrdersTab({ pending, history }: { pending: OrderDTO[]; history: OrderDTO[] }) {
  return (
    <>
      {pending.length > 0 && (
        <section>
          <h3 className="section-title">Pending</h3>
          <div className="card !p-0 overflow-hidden">
            {pending.map((o) => <OrderRow key={o.id} order={o} />)}
          </div>
        </section>
      )}
      <section>
        <h3 className="section-title">Recent orders</h3>
        {history.length === 0 ? (
          <EmptyState message="No orders yet." />
        ) : (
          <div className="card !p-0 overflow-hidden">
            {history.map((o) => <OrderRow key={o.id} order={o} />)}
          </div>
        )}
      </section>
    </>
  );
}

function OrderRow({ order }: { order: OrderDTO }) {
  return (
    <Link
      to={`/stock/${encodeURIComponent(order.symbol)}`}
      className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-ink-100 dark:border-night-500/40 hover:bg-ink-50/60 dark:hover:bg-night-600/40 transition"
    >
      <div className="min-w-0 flex-1">
        <div className="font-semibold tracking-tight truncate">{order.symbol}</div>
        <div className="text-xs text-ink-500 dark:text-night-200">
          {order.quantity} · {order.type} · {new Date(order.createdAt).toLocaleString()}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-xs font-bold ${order.side === 'buy' ? 'text-pos' : 'text-neg'}`}>
          {order.side.toUpperCase()}
        </div>
        <div className="num text-xs">
          {order.filledPrice != null ? order.filledPrice.toFixed(2) : order.price?.toFixed(2) ?? '—'}
        </div>
        <StatusTag status={order.status} />
      </div>
    </Link>
  );
}

function StatusTag({ status }: { status: string }) {
  if (status === 'filled') return <span className="tag-pos">FILLED</span>;
  if (status === 'rejected') return <span className="tag-neg">REJECTED</span>;
  if (status === 'cancelled') return <span className="tag-mute">CANCELLED</span>;
  return <span className="tag-info">PENDING</span>;
}

function Mini({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200">
        {label}
      </div>
      <div className={`num text-base font-bold ${tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : ''}`}>
        {value}
      </div>
      {sub && (
        <div className={`text-[11px] num font-semibold ${tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : ''}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="card text-sm text-ink-500 dark:text-night-200 text-center py-8">
      {message}
    </div>
  );
}
