/**
 * F&O dashboard — modelled on Groww's F&O tab.
 *
 * • Hero index cards (NIFTY 50, SENSEX) with live price + change %.
 * • Sub-tabs: Explore / Positions / Orders
 * • Equity / Commodities filter
 * • Scrollable list of F&O underlyings (popular Indian stocks) — tap any row →
 *   /stock/SYMBOL detail page where Option Chain is one click away.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMarket } from '../context/MarketContext';
import { useOrdersQuery, usePositionsQuery } from '../api/queries';
import { fmtNum, fmtPct, classPnL, fmtINR } from '../utils/fmt';
import { IconArrowDown, IconArrowUp, IconList } from '../components/icons';
import { StockLogo } from '../components/StockLogo';
import { MarketClosedBanner } from '../components/MarketClosedBanner';

type SubTab = 'explore' | 'positions' | 'orders';
type Segment = 'equity' | 'commodities';

const HERO = ['NIFTY', 'SENSEX'] as const;

// Top F&O-eligible equities (most-traded NSE underlyings).
const F_AND_O_EQUITY = [
  'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'INFY', 'TCS', 'AXISBANK',
  'KOTAKBANK', 'BHARTIARTL', 'ITC', 'LT', 'BAJFINANCE', 'WIPRO', 'HCLTECH',
  'MARUTI', 'TITAN', 'ASIANPAINT', 'ADANIENT', 'TATAMOTORS', 'HINDUNILVR',
];
const F_AND_O_COMMODITIES = ['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS', 'COPPER'];

const F_AND_O_INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'];

export function FnO() {
  const navigate = useNavigate();
  const { quotes, subscribe } = useMarket();

  const [tab, setTab] = useState<SubTab>('explore');
  const [segment, setSegment] = useState<Segment>('equity');

  // Cached REST reads — load once, served from cache on revisit.
  const { data: allPositions = [] } = usePositionsQuery();
  const { data: allOrders = [] } = useOrdersQuery();

  // Open F&O positions + recent orders, derived from the cached hook data.
  const positions = useMemo(
    () => allPositions.filter((x) => x.netQuantity !== 0),
    [allPositions]
  );
  const orders = useMemo(() => allOrders.slice(0, 30), [allOrders]);

  const list = useMemo(
    () => (segment === 'equity'
      ? [...F_AND_O_INDICES, ...F_AND_O_EQUITY]
      : F_AND_O_COMMODITIES
    ),
    [segment]
  );

  useEffect(() => { subscribe([...HERO, ...list]); }, [list, subscribe]);

  return (
    <div className="space-y-4 lg:space-y-5 px-3 sm:px-0">
      {/* Market-closed banner — NSE for the equity segment, MCX for commodities. */}
      <MarketClosedBanner symbol={segment === 'commodities' ? 'GOLD' : undefined} />

      {/* Hero index cards */}
      <section className="grid grid-cols-2 gap-3 lg:gap-4">
        {HERO.map((s, idx) => (
          <HeroIndexCard key={s} symbol={s} expiryBadge={idx === 1} />
        ))}
      </section>

      {/* Sub-tabs */}
      <div className="flex gap-5 border-b border-ink-100 dark:border-night-500/40 overflow-x-auto">
        {([
          { id: 'explore',   label: 'Explore' },
          { id: 'positions', label: `Positions (${positions.length})` },
          { id: 'orders',    label: `Orders (${orders.filter(o => o.status === 'pending').length})` },
        ] as { id: SubTab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative shrink-0 pb-2.5 text-sm font-semibold transition ${
              tab === t.id
                ? 'text-accent'
                : 'text-ink-500 dark:text-night-200 hover:text-ink-700 dark:hover:text-night-50'
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand rounded" />}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'explore' && (
        <>
          {/* Segment filter pill */}
          <div className="inline-flex gap-1 p-1 rounded-full bg-ink-50 dark:bg-night-600/60">
            {([
              { id: 'equity',      label: 'Equity' },
              { id: 'commodities', label: 'Commodities' },
            ] as { id: Segment; label: string }[]).map((s) => (
              <button
                key={s.id}
                onClick={() => setSegment(s.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                  segment === s.id
                    ? 'bg-brand text-white'
                    : 'text-ink-500 dark:text-night-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Underlyings list */}
          <section className="card !p-0 overflow-hidden">
            {list.map((sym) => {
              const q = quotes[sym.toUpperCase()];
              const change = q?.change ?? 0;
              const pct = q?.changePercent ?? 0;
              const up = change >= 0;
              return (
                <Link
                  key={sym}
                  to={`/stock/${encodeURIComponent(sym)}`}
                  className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-ink-100 dark:border-night-500/40 hover:bg-ink-50/60 dark:hover:bg-night-600/40 transition"
                >
                  <StockLogo symbol={sym} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold tracking-tight truncate">{sym}</div>
                    <div className={`text-xs num ${classPnL(change)}`}>
                      {q?.price != null
                        ? `${fmtNum(q.price)} ${up ? '+' : ''}${fmtNum(change)} (${fmtPct(pct)})`
                        : 'Loading…'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/options/${encodeURIComponent(sym)}`); }}
                    className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center text-accent bg-brand/10 hover:bg-brand/20"
                    aria-label={`${sym} option chain`}
                    title="Option chain"
                  >
                    <IconList size={16} />
                  </button>
                </Link>
              );
            })}
          </section>
        </>
      )}

      {tab === 'positions' && (
        <section className="card !p-0 overflow-hidden">
          {positions.length === 0 ? (
            <p className="p-5 text-sm text-ink-500 dark:text-night-200">
              No open F&amp;O positions.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pl-4">Symbol</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Avg</th>
                    <th className="text-right">LTP</th>
                    <th className="text-right pr-4">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const live = quotes[p.symbol.toUpperCase()]?.price;
                    const upl = live != null ? (live - p.avgEntryPrice) * p.netQuantity : 0;
                    return (
                      <tr key={p.symbol}>
                        <td className="pl-4 font-semibold">
                          <Link to={`/stock/${encodeURIComponent(p.symbol)}`} className="text-accent">
                            {p.symbol}
                          </Link>
                        </td>
                        <td className="text-right num">{p.netQuantity}</td>
                        <td className="text-right num">{p.avgEntryPrice.toFixed(2)}</td>
                        <td className="text-right num">{live != null ? fmtNum(live) : '—'}</td>
                        <td className={`text-right pr-4 num ${classPnL(upl)}`}>{fmtINR(upl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'orders' && (
        <section className="card !p-0 overflow-hidden">
          {orders.length === 0 ? (
            <p className="p-5 text-sm text-ink-500 dark:text-night-200">No orders.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pl-4">Time</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right pr-4">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="pl-4 text-xs text-ink-500 dark:text-night-200 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleString()}
                      </td>
                      <td className="font-semibold">{o.symbol}</td>
                      <td>
                        <span className={o.side === 'buy' ? 'tag-pos' : 'tag-neg'}>
                          {o.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right num">{o.quantity}</td>
                      <td className="text-right pr-4 num">
                        {o.filledPrice != null ? o.filledPrice.toFixed(2) : o.price?.toFixed(2) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function HeroIndexCard({ symbol, expiryBadge }: { symbol: string; expiryBadge?: boolean }) {
  const { quotes } = useMarket();
  const q = quotes[symbol.toUpperCase()];
  const change = q?.change ?? 0;
  const pct = q?.changePercent ?? 0;
  const up = change >= 0;
  return (
    <Link
      to={`/stock/${encodeURIComponent(symbol)}`}
      className="card !p-4 relative hover:shadow-cardHover transition"
    >
      {expiryBadge && (
        <span className="absolute top-3 right-3 tag-mute !text-[9px]">Expiry</span>
      )}
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200">
        {symbol}
      </div>
      <div className="num text-lg sm:text-xl font-bold tracking-tight mt-1">
        {q?.price != null ? fmtNum(q.price) : '—'}
      </div>
      <div className={`text-xs num font-semibold flex items-center gap-1 ${classPnL(change)}`}>
        {up ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
        {up ? '+' : ''}{fmtNum(change)} ({fmtPct(pct)})
      </div>
    </Link>
  );
}
