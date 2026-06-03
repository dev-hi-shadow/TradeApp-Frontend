import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarket, isMarketOpen, marketFor, type ModifyOrderInput } from '../context/MarketContext';
import { useMarketStatus } from '../hooks/useMarketStatus';
import { useToast } from '../context/ToastContext';
import { OrderModal } from '../components/OrderModal';
import { RiskModal } from '../components/RiskModal';
import { MarketClosedBanner } from '../components/MarketClosedBanner';
import { type PositionGuardDTO, convertPosition } from '../api/orders';
import {
  useOrdersQuery,
  usePositionsQuery,
  useGuardsQuery,
  useTradeSummaryQuery,
} from '../api/queries';
import { invalidate, invalidateTradeData, QueryKey } from '../queryClient';
import { displaySymbol } from '../utils/symbol';
import { istToday } from '../utils/istDate';
import type { OrderDTO, PositionDTO, TradingPlan } from '../types';
import { classPnL, fmtINR, fmtNum, fmtPct } from '../utils/fmt';
import { computePortfolioPnL, todayIstStartMs } from '../utils/pnl';
import { IconMinus, IconPlus } from '../components/icons';

/** Stable key for a (symbol, product) position. */
const posKey = (symbol: string, product?: string) => `${symbol}|${product ?? ''}`;

type Tab = 'positions' | 'holdings' | 'pending';

export function Trade() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSymbol, setModalSymbol] = useState<string | undefined>();
  const [modalSide, setModalSide] = useState<'buy' | 'sell'>('buy');
  const [tab, setTab] = useState<Tab>('positions');
  const [exiting, setExiting] = useState<Record<string, boolean>>({});
  const [exitingAll, setExitingAll] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [riskPos, setRiskPos] = useState<ReturnType<typeof computePortfolioPnL>['positions'][number] | null>(null);
  const [modifyTarget, setModifyTarget] = useState<OrderDTO | null>(null);
  // 15s tick so "Exit all" re-enables / disables at the market open/close edge.
  const [marketTick, setMarketTick] = useState(0);

  const { cancelOrder, modifyOrder, subscribe, quotes, exitPosition, portfolio } = useMarket();
  const toast = useToast();

  // Cached REST reads — load once, instant on revisit, and refetched ONCE
  // (via MarketContext invalidation) whenever an order fills / exits / cancels.
  const { data: pending = [] } = useOrdersQuery('pending');
  const { data: allOrders = [] } = useOrdersQuery();
  const { data: allPositions = [] } = usePositionsQuery();
  const { data: guardsList = [] } = useGuardsQuery();

  const positions = useMemo(
    () => allPositions.filter((x) => x.netQuantity !== 0),
    [allPositions],
  );
  // Closed rows with booked P&L worth showing, newest-first.
  const closedPositions = useMemo(
    () =>
      allPositions
        .filter((x) => x.netQuantity === 0 && Math.abs(x.realisedPnL || 0) > 0.01)
        .sort((a, b) =>
          (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) -
          (a.updatedAt ? new Date(a.updatedAt).getTime() : 0),
        ),
    [allPositions],
  );
  const guards = useMemo(() => {
    const map: Record<string, PositionGuardDTO> = {};
    for (const g of guardsList) map[posKey(g.symbol, g.product)] = g;
    return map;
  }, [guardsList]);
  const closedRealised = useMemo(
    () => closedPositions.reduce((acc, p) => acc + (p.realisedPnL || 0), 0),
    [closedPositions],
  );

  // Today's REALISED P&L — taken from the transaction ledger (same source as
  // the History tab / Analytics) so the hero matches them exactly. Summing
  // each closed position's cumulative `realisedPnL` would double-count prior
  // days for any symbol traded across multiple sessions, so we DON'T do that.
  const { data: todaySummary } = useTradeSummaryQuery(istToday());
  const realisedToday = todaySummary?.realisedPnL ?? 0;

  // Positions CLOSED TODAY — used only to size the day's-% denominator below.
  const closedToday = useMemo(() => {
    const dayStart = todayIstStartMs();
    return closedPositions.filter(
      (c) => c.updatedAt && new Date(c.updatedAt).getTime() >= dayStart,
    );
  }, [closedPositions]);
  // Cost basis of those closed-today trades (from their buy fills) — gives the
  // day's % a real denominator instead of dividing only by what's still open.
  const closedTodayBase = useMemo(() => {
    let base = 0;
    for (const c of closedToday) {
      base += allOrders
        .filter(
          (o) =>
            o.symbol.toUpperCase() === c.symbol.toUpperCase() &&
            (o.product ?? '') === (c.product ?? '') &&
            o.side === 'buy',
        )
        .reduce(
          (a, o) => a + (o.avgFillPrice ?? o.filledPrice ?? o.price ?? 0) * (o.filledQuantity ?? 0),
          0,
        );
    }
    return base;
  }, [closedToday, allOrders]);

  // Booked P&L from positions CLOSED TODAY (drives the Positions-tab "Closed
  // today" section + its total, so the tab shows only today's activity).
  const closedTodayRealised = useMemo(
    () => closedToday.reduce((acc, c) => acc + (c.realisedPnL || 0), 0),
    [closedToday],
  );

  // Single source of truth for P&L. Recomputes on every `quotes` tick (live
  // WS prices) — positions come from the cache, prices from the socket.
  const pnl = useMemo(
    () => computePortfolioPnL(positions, quotes, closedRealised, realisedToday, closedTodayBase),
    [positions, quotes, closedRealised, realisedToday, closedTodayBase],
  );

  // Groww/Dhan split: CNC = delivery HOLDINGS; MIS + NRML = intraday/F&O POSITIONS.
  const pnlIntraday = useMemo(
    () => pnl.positions.filter((p) => (p.product ?? 'CNC') !== 'CNC'),
    [pnl.positions],
  );
  const pnlHoldings = useMemo(
    () => pnl.positions.filter((p) => (p.product ?? 'CNC') === 'CNC'),
    [pnl.positions],
  );

  useEffect(() => {
    const syms = positions.map((p) => p.symbol);
    if (syms.length) subscribe(syms);
  }, [positions, subscribe]);

  // Drive the open/close re-evaluation for the "Exit all" button.
  useEffect(() => {
    const id = setInterval(() => setMarketTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  // "Exit all" exits every open position at market — only meaningful while at
  // least one position's market is open. Recomputes on the 15s tick.
  const anyMarketOpen = useMemo(
    () => positions.some((p) => isMarketOpen(marketFor(p.symbol))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positions, marketTick],
  );

  async function onCancel(id: string) {
    try {
      await cancelOrder(id); // invalidates the cached orders/positions
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Cancel failed', message: err.message });
    }
  }

  function openOrder(symbol?: string, side: 'buy' | 'sell' = 'buy') {
    setModalSymbol(symbol);
    setModalSide(side);
    setModalOpen(true);
  }

  async function onConvert(symbol: string, from: 'CNC' | 'MIS' | 'NRML' | undefined, to: 'CNC' | 'MIS' | 'NRML') {
    try {
      const r = await convertPosition(symbol, to, from);
      if (!r.ok) throw new Error(r.error || 'Convert failed');
      invalidateTradeData();
      toast.push({ kind: 'success', title: 'Position converted', message: `${displaySymbol(symbol)} → ${to}` });
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Convert failed', message: err.message });
    }
  }

  async function onExit(symbol: string, product?: 'CNC' | 'MIS' | 'NRML') {
    const key = `${symbol}|${product ?? ''}`;
    setExiting((s) => ({ ...s, [key]: true }));
    try {
      const results = await exitPosition(symbol, product);
      const r = results[0];
      if (r?.ok) {
        toast.push({
          kind: 'success',
          title: 'Position exited',
          message: `${r.symbol} closed @ ${r.fillPrice?.toFixed(2)}`,
        });
      } else {
        toast.push({ kind: 'error', title: 'Exit failed', message: r?.error || 'Unknown error' });
      }
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Exit failed', message: err.message });
    } finally {
      setExiting((s) => {
        const next = { ...s };
        delete next[key];
        return next;
      });
    }
  }

  // Exits only the intraday/F&O POSITIONS (not delivery holdings) — one per
  // symbol so it never touches a CNC holding shown on the other tab.
  async function onExitAll() {
    const targets = pnlIntraday;
    if (targets.length === 0) return;
    setExitingAll(true);
    try {
      let ok = 0;
      let fail = 0;
      for (const p of targets) {
        try {
          const r = await exitPosition(p.symbol, p.product);
          if (r[0]?.ok) ok++; else fail++;
        } catch { fail++; }
      }
      toast.push({
        kind: fail === 0 ? 'success' : 'error',
        title: 'Exit all',
        message: `${ok} closed${fail ? `, ${fail} failed` : ''}`,
      });
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Exit all failed', message: err.message });
    } finally {
      setExitingAll(false);
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5 px-3 sm:px-0">
      {/* NSE-closed banner — the primary market for equity/F&O trading. */}
      <MarketClosedBanner />

      {/* Portfolio summary — appears whenever there's anything to summarise
          (open or closed). Hero P&L on top, secondary stats below. */}
      {(positions.length > 0 || closedRealised !== 0) && (
        <HeroSummary pnl={pnl} hasOpen={positions.length > 0} accountEquity={portfolio?.totalValue ?? null} />
      )}

      {/* Tabs */}
      <div className="inline-flex rounded-xl bg-ink-50 dark:bg-night-600/60 p-1 w-full">
        {([
          { id: 'positions', label: `Positions (${pnlIntraday.length})` },
          { id: 'holdings',  label: `Holdings (${pnlHoldings.length})` },
          { id: 'pending',   label: `Pending (${pending.length})` },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition ${
              tab === t.id
                ? 'bg-white dark:bg-night-700 text-ink-800 dark:text-night-50 shadow-card'
                : 'text-ink-500 dark:text-night-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'positions' && (
        <div className="space-y-4">
          {/* ─── Intraday + F&O positions (MIS / NRML) ─── */}
          {pnlIntraday.length === 0 ? (
            <EmptyPositions hasBookedPnL={closedTodayRealised !== 0} bookedPnL={closedTodayRealised} />
          ) : (
            <>
              <SectionHeader title="Open positions" count={pnlIntraday.length} />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {pnlIntraday.map((p) => {
                  const exitKey = posKey(p.symbol, p.product);
                  const busy = !!exiting[exitKey];
                  return (
                    <PositionCard
                      key={`${p.symbol}-${p.product ?? ''}`}
                      p={p}
                      busy={busy}
                      anyBusy={exitingAll}
                      guard={guards[exitKey] ?? null}
                      onExit={() => onExit(p.symbol, p.product)}
                      onBuy={() => openOrder(p.symbol, 'buy')}
                      onSell={() => openOrder(p.symbol, 'sell')}
                      onRisk={() => { setRiskPos(p); setRiskOpen(true); }}
                      onConvert={(to) => onConvert(p.symbol, p.product, to)}
                    />
                  );
                })}
              </div>
              <button
                onClick={onExitAll}
                disabled={exitingAll || !anyMarketOpen}
                title={!anyMarketOpen ? 'Market closed' : undefined}
                className="btn-neg w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exitingAll
                  ? 'Exiting…'
                  : !anyMarketOpen
                    ? '🔒 Market closed'
                    : `Exit all ${pnlIntraday.length} position${pnlIntraday.length === 1 ? '' : 's'} at market`}
              </button>
            </>
          )}

          {/* ─── Closed TODAY (today's booked P&L only) ─── */}
          {closedToday.length > 0 && (
            <>
              <SectionHeader
                title="Closed today"
                count={closedToday.length}
                trailing={
                  <span className={`num font-bold ${classPnL(closedTodayRealised)}`}>
                    {fmtINR(closedTodayRealised)}
                  </span>
                }
              />
              <div className="card !p-0 divide-y divide-ink-100 dark:divide-night-500/40">
                {closedToday.map((c) => (
                  <ClosedRow key={`${c.symbol}-${c.product ?? ''}-${c._id}`} c={c} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Holdings (CNC delivery) ─── */}
      {tab === 'holdings' && (
        <div className="space-y-4">
          {pnlHoldings.length === 0 ? (
            <div className="card !p-8 text-center">
              <p className="text-sm font-medium text-ink-700 dark:text-night-100">No holdings yet</p>
              <p className="text-xs text-ink-500 dark:text-night-200 mt-1">
                Equity you buy with <span className="font-semibold">CNC</span> (delivery) shows here and
                carries across days. Intraday &amp; F&amp;O appear under Positions.
              </p>
            </div>
          ) : (
            <>
              <SectionHeader title="Holdings" count={pnlHoldings.length} />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {pnlHoldings.map((p) => {
                  const exitKey = posKey(p.symbol, p.product);
                  const busy = !!exiting[exitKey];
                  return (
                    <PositionCard
                      key={`${p.symbol}-${p.product ?? ''}`}
                      p={p}
                      busy={busy}
                      anyBusy={exitingAll}
                      guard={guards[exitKey] ?? null}
                      onExit={() => onExit(p.symbol, p.product)}
                      onBuy={() => openOrder(p.symbol, 'buy')}
                      onSell={() => openOrder(p.symbol, 'sell')}
                      onRisk={() => { setRiskPos(p); setRiskOpen(true); }}
                      onConvert={(to) => onConvert(p.symbol, p.product, to)}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'pending' && (
        <section className="card !p-0 overflow-hidden">
          {pending.length === 0 ? (
            <p className="p-5 text-sm text-ink-500 dark:text-night-200">
              No pending limit orders.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pl-4">Symbol</th>
                    <th>Side</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Limit</th>
                    <th className="text-right">LTP</th>
                    <th className="text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((o) => {
                    const live = quotes[o.symbol.toUpperCase()]?.price;
                    return (
                      <tr key={o.id}>
                        <td className="pl-4 font-semibold">{o.symbol}</td>
                        <td>
                          <span className={o.side === 'buy' ? 'tag-pos' : 'tag-neg'}>
                            {o.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="text-right num">{o.quantity}</td>
                        <td className="text-right num">{o.price?.toFixed(2)}</td>
                        <td className="text-right num">{live != null ? fmtNum(live) : '—'}</td>
                        <td className="text-right pr-4">
                          <div className="inline-flex gap-1.5">
                            <button
                              onClick={() => setModifyTarget(o)}
                              className="btn-sm bg-brand/10 text-brand hover:bg-brand/20"
                            >
                              Modify
                            </button>
                            <button
                              onClick={() => onCancel(o.id)}
                              className="btn-sm bg-neg/10 text-neg hover:bg-neg/20"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <OrderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultSymbol={modalSymbol}
        defaultSide={modalSide}
        initialPrice={modalSymbol ? quotes[modalSymbol.toUpperCase()]?.price : undefined}
      />

      <RiskModal
        open={riskOpen}
        onClose={() => setRiskOpen(false)}
        position={riskPos ? {
          symbol: riskPos.symbol,
          product: riskPos.product,
          netQuantity: riskPos.netQuantity,
          avgEntryPrice: riskPos.avgEntryPrice,
          ltp: riskPos.ltp,
        } : null}
        guard={riskPos ? (guards[posKey(riskPos.symbol, riskPos.product)] ?? null) : null}
        onSaved={() => invalidate(QueryKey.Guards)}
      />

      <ModifyOrderModal
        order={modifyTarget}
        ltp={modifyTarget ? quotes[modifyTarget.symbol.toUpperCase()]?.price : undefined}
        onClose={() => setModifyTarget(null)}
        onSubmit={async (changes) => {
          if (!modifyTarget) return;
          try {
            await modifyOrder(modifyTarget.id, changes);
            toast.push({ kind: 'success', title: 'Order modified', message: modifyTarget.symbol });
            setModifyTarget(null);
          } catch (err: any) {
            toast.push({ kind: 'error', title: 'Modify failed', message: err.message });
          }
        }}
      />
    </div>
  );
}

/**
 * Hero summary at the top of the Positions tab.
 * Big "Today's P&L" headline (the number people open the screen to see),
 * three secondary stats below, optional realised row at the bottom.
 */
function HeroSummary({
  pnl, hasOpen, accountEquity,
}: { pnl: ReturnType<typeof computePortfolioPnL>; hasOpen: boolean; accountEquity: number | null }) {
  // ALWAYS show "Today's P&L" — `pnl.daysPnL` already folds in today's realised
  // bookings, so it's the correct headline even with zero open positions.
  const headlineValue = pnl.daysPnL;
  // Day's P&L % against START-OF-DAY ACCOUNT EQUITY — the honest "how much did
  // my account move today" number. Opening equity = current equity (live
  // wallet + open holdings = portfolio.totalValue) minus today's P&L. This is
  // immune to capital recycling (sum-of-cost-basis would double-count cash
  // reused across sequential same-day trades) and to overnight cost basis.
  // Falls back to the cost-basis % only if equity isn't available yet. Shown
  // whenever computable, regardless of whether positions are open.
  const openingEquity = accountEquity != null ? accountEquity - pnl.daysPnL : null;
  const headlinePct =
    openingEquity && openingEquity > 0
      ? (pnl.daysPnL / openingEquity) * 100
      : pnl.daysPnLPct;
  const headlineLabel = "Today's P&L";
  const tone = headlineValue > 0 ? 'pos' : headlineValue < 0 ? 'neg' : 'flat';
  const toneText =
    tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-ink-500 dark:text-night-200';
  const toneBar =
    tone === 'pos' ? 'bg-pos/10' : tone === 'neg' ? 'bg-neg/10' : 'bg-ink-100 dark:bg-night-600';

  return (
    <div className={`card !p-4 ${toneBar} border-l-4 ${tone === 'pos' ? 'border-pos' : tone === 'neg' ? 'border-neg' : 'border-ink-300 dark:border-night-400'}`}>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200">
        {headlineLabel}
      </div>
      <div className={`num text-3xl font-bold tracking-tight mt-1 ${toneText}`}>
        {fmtINR(headlineValue)}
      </div>
      {headlinePct !== null && (
        <div className={`num text-xs font-semibold mt-0.5 ${toneText}`}>
          {fmtPct(headlinePct)}
        </div>
      )}

      {hasOpen && (
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-ink-100 dark:border-night-500/40">
          <MiniStat label="Invested" value={fmtINR(pnl.invested)} />
          <MiniStat label="Current" value={fmtINR(pnl.marketValue)} />
          <MiniStat
            label="Overall"
            value={fmtINR(pnl.unrealised)}
            tone={pnl.unrealised}
          />
        </div>
      )}

      {hasOpen && pnl.realised !== 0 && (
        <div className="mt-3 pt-3 border-t border-ink-100 dark:border-night-500/40 flex items-center justify-between text-xs">
          <span className="text-ink-500 dark:text-night-200">Realised (booked)</span>
          <span className={`num font-semibold ${classPnL(pnl.realised)}`}>{fmtINR(pnl.realised)}</span>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const toneClass = tone == null ? '' : tone > 0 ? 'text-pos' : tone < 0 ? 'text-neg' : '';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-night-200">{label}</div>
      <div className={`num text-sm font-bold tracking-tight mt-0.5 ${toneClass}`}>{value}</div>
    </div>
  );
}

/** Small heading above a section list. Count chip on the left, optional trailing slot on the right. */
function SectionHeader({
  title, count, trailing,
}: { title: string; count?: number; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
        {count !== undefined && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-ink-100 dark:bg-night-600 text-[10px] font-bold text-ink-600 dark:text-night-100">
            {count}
          </span>
        )}
      </div>
      {trailing}
    </div>
  );
}

/**
 * Card for one open position.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ NIFTY26MAY2624000PE  NRML            +₹1,234.50  │
 *   │ Qty 650 · Avg 30.65               +4.05%  │
 *   │ ─────────────────────────────────────────────────── │
 *   │ LTP 33.55       Invested 19,922       Curr 21,807    │
 *   │ [Exit at market]               [+ Buy]  [− Sell]     │
 *   └──────────────────────────────────────────────────────┘
 */
function PositionCard({
  p, busy, anyBusy, guard, onExit, onBuy, onSell, onRisk, onConvert,
}: {
  p: ReturnType<typeof computePortfolioPnL>['positions'][number];
  busy: boolean;
  anyBusy: boolean;
  guard: PositionGuardDTO | null;
  onExit: () => void;
  onBuy: () => void;
  onSell: () => void;
  onRisk: () => void;
  onConvert: (to: 'CNC' | 'MIS' | 'NRML') => void | Promise<void>;
}) {
  const isShort = p.netQuantity < 0;
  // Convert toggle target: equity MIS↔CNC; F&O/commodity MIS↔NRML.
  const isFnO = /\d(?:CE|PE)$/.test(p.symbol) || /FUT$/.test(p.symbol.toUpperCase());
  const convertTo: 'CNC' | 'MIS' | 'NRML' | null =
    p.product === 'MIS' ? (isFnO ? 'NRML' : 'CNC')
    : p.product === 'CNC' ? 'MIS'
    : p.product === 'NRML' ? 'MIS'
    : null;
  const [converting, setConverting] = useState(false);
  const hasGuard = !!(guard && (guard.stopLossPrice || guard.targetPrice || guard.trailingAmount));
  // Exit places a market order, so it's only allowed while the symbol's
  // market is open. Re-evaluates on a timer so it re-enables at the open.
  const market = useMarketStatus(p.symbol);
  return (
    <div className="card !p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link to={`/stock/${encodeURIComponent(p.symbol)}`} className="font-bold tracking-tight text-sm truncate hover:text-accent">
              {displaySymbol(p.symbol)}
            </Link>
            {p.product && (
              <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-ink-100 dark:bg-night-600 text-ink-600 dark:text-night-100">
                {p.product}
              </span>
            )}
            {convertTo && (
              <button
                onClick={async () => { setConverting(true); try { await onConvert(convertTo); } finally { setConverting(false); } }}
                disabled={converting}
                className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-brand/10 text-accent hover:bg-brand/20 disabled:opacity-50"
                title={`Convert to ${convertTo} (${convertTo === 'CNC' ? 'delivery' : convertTo === 'NRML' ? 'carry-forward' : 'intraday'})`}
              >
                {converting ? '…' : `⇄ ${convertTo}`}
              </button>
            )}
            <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
              isShort ? 'bg-neg/15 text-neg' : 'bg-pos/15 text-pos'
            }`}>
              {isShort ? 'Short' : 'Long'}
            </span>
          </div>
          <div className="text-[11px] text-ink-500 dark:text-night-200 mt-1 num">
            Qty {p.netQuantity} · Avg {p.avgEntryPrice.toFixed(2)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`num text-base font-bold tracking-tight ${classPnL(p.unrealised)}`}>
            {p.stale ? '—' : fmtINR(p.unrealised)}
          </div>
          {!p.stale && (
            <div className={`num text-[11px] font-semibold ${classPnL(p.unrealised)}`}>
              {fmtPct(p.unrealisedPct)}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-ink-100 dark:border-night-500/40">
        <CardStat label="LTP"      value={p.stale ? '—' : fmtNum(p.ltp)} />
        <CardStat label="Invested" value={fmtINR(p.invested)} />
        <CardStat label="Current"  value={p.stale ? '—' : fmtINR(p.marketValue)} />
      </div>

      {/* Active risk-guard chips */}
      {hasGuard && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          {guard!.stopLossPrice ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neg/10 text-neg num">
              SL {fmtNum(guard!.stopLossPrice)}
            </span>
          ) : null}
          {guard!.targetPrice ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pos/10 text-pos num">
              TGT {fmtNum(guard!.targetPrice)}
            </span>
          ) : null}
          {guard!.trailingAmount ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand/10 text-accent num">
              TRAIL {fmtNum(guard!.trailingAmount)}
            </span>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onExit}
          disabled={busy || anyBusy || !market.open}
          className="btn-sm flex-1 bg-neg/10 text-neg hover:bg-neg/20 disabled:opacity-50 disabled:cursor-not-allowed"
          title={!market.open ? market.label : undefined}
        >
          {busy ? '…' : !market.open ? 'Market closed' : 'Exit at market'}
        </button>
        <button
          onClick={onRisk}
          className={`btn-sm px-3 inline-flex items-center justify-center ${
            hasGuard
              ? 'bg-brand/15 text-accent hover:bg-brand/25'
              : 'bg-ink-100 dark:bg-night-600 text-ink-600 dark:text-night-100 hover:bg-ink-200 dark:hover:bg-night-500'
          }`}
          aria-label={`Set stop-loss / target for ${p.symbol}`}
        >
          {hasGuard ? 'SL/TGT ✓' : 'SL/TGT'}
        </button>
        <button
          onClick={onBuy}
          className="w-9 h-9 rounded-lg bg-pos/10 text-pos hover:bg-pos/20 inline-flex items-center justify-center"
          aria-label={`Buy more ${p.symbol}`}
        >
          <IconPlus size={14} />
        </button>
        <button
          onClick={onSell}
          className="w-9 h-9 rounded-lg bg-neg/10 text-neg hover:bg-neg/20 inline-flex items-center justify-center"
          aria-label={`Sell ${p.symbol}`}
        >
          <IconMinus size={14} />
        </button>
      </div>

      {!market.open && (
        <div className="mt-2 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
          🔒 {market.label}
        </div>
      )}
    </div>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-night-200">{label}</div>
      <div className="num text-xs font-semibold mt-0.5">{value}</div>
    </div>
  );
}

/** Compact row for a closed position — symbol + when + realised P&L. */
function ClosedRow({ c }: { c: PositionDTO }) {
  const when = c.updatedAt
    ? new Date(c.updatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <Link
      to={`/stock/${encodeURIComponent(c.symbol)}`}
      className="flex items-center justify-between px-4 py-3 hover:bg-ink-50/60 dark:hover:bg-night-600/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-xs tracking-tight truncate">{displaySymbol(c.symbol)}</span>
          {c.product && (
            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-ink-100 dark:bg-night-600 text-ink-600 dark:text-night-100">
              {c.product}
            </span>
          )}
        </div>
        {when && (
          <div className="text-[10px] text-ink-500 dark:text-night-200 mt-0.5">
            Closed · {when}
          </div>
        )}
      </div>
      <span className={`num font-bold text-sm ${classPnL(c.realisedPnL)}`}>
        {fmtINR(c.realisedPnL)}
      </span>
    </Link>
  );
}

/** Empty state when the user has no open positions. */
function EmptyPositions({
  hasBookedPnL, bookedPnL,
}: { hasBookedPnL: boolean; bookedPnL: number }) {
  return (
    <div className="card !p-8 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-ink-50 dark:bg-night-600 flex items-center justify-center mb-3">
        <span className="text-2xl">📈</span>
      </div>
      <h3 className="text-base font-bold tracking-tight">No open positions</h3>
      <p className="text-xs text-ink-500 dark:text-night-200 mt-1 max-w-xs">
        Open any stock and tap <span className="font-semibold text-pos">Buy</span> to place your first order.
      </p>
      {hasBookedPnL && (
        <div className="mt-5 pt-5 border-t border-ink-100 dark:border-night-500/40 w-full">
          <div className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-night-200">
            Realised so far
          </div>
          <div className={`num text-xl font-bold tracking-tight mt-1 ${classPnL(bookedPnL)}`}>
            {fmtINR(bookedPnL)}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  if (status === 'filled') return <span className="tag-pos">FILLED</span>;
  if (status === 'rejected') return <span className="tag-neg">REJECTED</span>;
  if (status === 'cancelled') return <span className="tag-mute">CANCELLED</span>;
  return <span className="tag-info">PENDING</span>;
}

/* ---------- Modify a resting order (price / trigger / qty) ---------- */
function ModifyOrderModal({
  order, ltp, onClose, onSubmit,
}: {
  order: OrderDTO | null;
  ltp?: number;
  onClose: () => void;
  onSubmit: (changes: ModifyOrderInput) => void | Promise<void>;
}) {
  const [price, setPrice] = useState(0);
  const [trigger, setTrigger] = useState(0);
  const [qty, setQty] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (order) {
      setPrice(order.price ?? 0);
      setTrigger(order.triggerPrice ?? 0);
      setQty(order.quantity);
    }
  }, [order]);

  if (!order) return null;
  const hasLimit = order.type === 'limit' || order.type === 'sl';
  const hasTrigger = order.type === 'sl' || order.type === 'sl-m';

  async function submit() {
    if (!order) return;
    const changes: ModifyOrderInput = { quantity: qty };
    if (hasLimit) changes.price = price;
    if (hasTrigger) changes.triggerPrice = trigger;
    setBusy(true);
    try { await onSubmit(changes); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-white dark:bg-night-800 rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-[10px] uppercase tracking-wider font-medium text-ink-500 dark:text-night-200">
            Modify {order.type.toUpperCase()} order
          </div>
          <div className="text-base font-semibold tracking-tight">{displaySymbol(order.symbol)}</div>
          {ltp != null && (
            <div className="text-[11px] text-ink-500 dark:text-night-200">LTP <span className="num font-medium text-ink-800 dark:text-night-50">₹{fmtNum(ltp)}</span></div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Quantity</label>
            <input type="number" min={1} className="input num font-medium"
              value={qty || ''} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || '1', 10)))} />
          </div>
          {hasLimit && (
            <div>
              <label className="label">Limit price (₹)</label>
              <input type="number" step="0.05" min={0} className="input num font-medium"
                value={price || ''} onChange={(e) => setPrice(parseFloat(e.target.value || '0'))} />
            </div>
          )}
          {hasTrigger && (
            <div>
              <label className="label">Trigger price (₹)</label>
              <input type="number" step="0.05" min={0} className="input num font-medium"
                value={trigger || ''} onChange={(e) => setTrigger(parseFloat(e.target.value || '0'))} />
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary flex-1 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
