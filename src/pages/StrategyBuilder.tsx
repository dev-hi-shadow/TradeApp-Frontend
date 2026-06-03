/**
 * Strategy Builder — pick an underlying + expiry, assemble multi-leg option
 * positions from the chain, and see the combined P&L-at-expiry payoff, with
 * breakevens / max profit / max loss / net premium. Place the whole basket as
 * market NRML orders in one tap.
 *
 * Self-contained v1: reuses fetchOptionChain, MarketContext.placeOrder, the
 * shared fmt helpers and useMarketStatus. No live-data / order-engine changes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMarket } from '../context/MarketContext';
import { useToast } from '../context/ToastContext';
import { useMarketStatus } from '../hooks/useMarketStatus';
import { fetchOptionChain, type OptionChainResp, type OptionLeg } from '../api/market';
import { computePayoff, type StrategyLeg } from '../utils/payoff';
import { fmtINR, fmtNum, classPnL } from '../utils/fmt';
import { PayoffChart } from '../components/strategy/PayoffChart';
import { IconPlus, IconMinus, IconX } from '../components/icons';

const UNDERLYINGS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'] as const;
type Underlying = (typeof UNDERLYINGS)[number];

type PresetId = 'longStraddle' | 'shortStraddle' | 'bullCall' | 'bearPut';
const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'longStraddle', label: 'Long Straddle' },
  { id: 'shortStraddle', label: 'Short Straddle' },
  { id: 'bullCall', label: 'Bull Call Spread' },
  { id: 'bearPut', label: 'Bear Put Spread' },
];

let legSeq = 0;
const nextLegId = () => `leg-${Date.now()}-${legSeq++}`;

export function StrategyBuilder() {
  const [params] = useSearchParams();
  const { placeOrder, quotes, subscribe } = useMarket();
  const toast = useToast();

  const initialSym = (params.get('symbol') || '').toUpperCase();
  const [underlying, setUnderlying] = useState<Underlying>(
    (UNDERLYINGS as readonly string[]).includes(initialSym)
      ? (initialSym as Underlying)
      : 'NIFTY'
  );

  const [data, setData] = useState<OptionChainResp | null>(null);
  const [expiry, setExpiry] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const [placing, setPlacing] = useState(false);

  // Mirror the selected expiry so refresh-on-symbol-change reads the latest.
  const expiryRef = useRef('');
  useEffect(() => { expiryRef.current = expiry; }, [expiry]);

  const refresh = useCallback(
    async (sym: string, useExpiry?: string) => {
      setLoading(true);
      try {
        const r = await fetchOptionChain(sym, { expiry: useExpiry, radius: 10 });
        setData(r);
        if (!useExpiry) setExpiry(r.expiry);
      } catch (err: any) {
        toast.push({ kind: 'error', title: 'Option chain failed', message: err.message });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  // Reload the chain + reset the basket ONLY when the underlying changes.
  // (subscribe is intentionally NOT a dep — it changes identity on every WS
  //  reconnect, which would otherwise wipe the user's legs a few seconds in.)
  useEffect(() => {
    setLegs([]);
    setExpiry('');
    expiryRef.current = '';
    refresh(underlying);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlying]);

  // Keep a live quote on the underlying; re-subscribes on reconnect, no reset.
  useEffect(() => {
    subscribe([underlying]);
  }, [underlying, subscribe]);

  function changeExpiry(e: string) {
    setExpiry(e);
    setLegs([]);
    refresh(underlying, e);
  }

  // Live spot from the WS quote, falling back to the chain payload.
  const spot = quotes[underlying]?.price ?? data?.spot ?? 0;
  const lotSize = data?.lotSize ? parseInt(String(data.lotSize), 10) || 1 : 1;

  const atmStrike = useMemo(() => {
    if (!data?.rows.length) return 0;
    let best = data.rows[0].strike;
    let bestDiff = Infinity;
    for (const r of data.rows) {
      const d = Math.abs(r.strike - spot);
      if (d < bestDiff) { bestDiff = d; best = r.strike; }
    }
    return best;
  }, [data, spot]);

  function addLeg(leg: OptionLeg, type: 'CE' | 'PE', strike: number, side: 'buy' | 'sell') {
    const legLotSize = leg.lotsize ? parseInt(String(leg.lotsize), 10) || lotSize : lotSize;
    setLegs((cur) => [
      ...cur,
      {
        id: nextLegId(),
        type,
        side,
        strike,
        premium: leg.ltp > 0 ? leg.ltp : 0,
        lots: 1,
        lotSize: legLotSize,
        symbol: leg.symbol,
      },
    ]);
  }

  function setLots(id: string, lots: number) {
    setLegs((cur) =>
      cur.map((l) => (l.id === id ? { ...l, lots: Math.max(1, lots) } : l))
    );
  }
  function removeLeg(id: string) {
    setLegs((cur) => cur.filter((l) => l.id !== id));
  }

  function applyPreset(id: PresetId) {
    if (!data || !atmStrike) return;
    const rows = data.rows;
    const atmIdx = rows.findIndex((r) => r.strike === atmStrike);
    if (atmIdx < 0) return;
    const at = rows[atmIdx];
    const above = rows[Math.min(atmIdx + 2, rows.length - 1)];
    const below = rows[Math.max(atmIdx - 2, 0)];

    const mk = (
      row: typeof at,
      type: 'CE' | 'PE',
      side: 'buy' | 'sell'
    ): StrategyLeg | null => {
      const leg = type === 'CE' ? row.ce : row.pe;
      if (!leg) return null;
      const legLotSize = leg.lotsize ? parseInt(String(leg.lotsize), 10) || lotSize : lotSize;
      return {
        id: nextLegId(),
        type,
        side,
        strike: row.strike,
        premium: leg.ltp > 0 ? leg.ltp : 0,
        lots: 1,
        lotSize: legLotSize,
        symbol: leg.symbol,
      };
    };

    let built: (StrategyLeg | null)[] = [];
    if (id === 'longStraddle') built = [mk(at, 'CE', 'buy'), mk(at, 'PE', 'buy')];
    else if (id === 'shortStraddle') built = [mk(at, 'CE', 'sell'), mk(at, 'PE', 'sell')];
    else if (id === 'bullCall') built = [mk(at, 'CE', 'buy'), mk(above, 'CE', 'sell')];
    else if (id === 'bearPut') built = [mk(at, 'PE', 'buy'), mk(below, 'PE', 'sell')];

    const valid = built.filter((l): l is StrategyLeg => l !== null);
    if (valid.length < 2) {
      toast.push({ kind: 'warning', title: 'Preset unavailable', message: 'Strikes missing for this expiry.' });
      return;
    }
    setLegs(valid);
  }

  const payoff = useMemo(() => computePayoff(legs, spot), [legs, spot]);

  // Options trade on the NSE clock regardless of the index.
  const market = useMarketStatus('NIFTY');

  async function placeBasket() {
    if (!legs.length || placing) return;
    setPlacing(true);
    let placed = 0;
    let failed = 0;
    for (const leg of legs) {
      try {
        await placeOrder({
          symbol: leg.symbol,
          type: 'market',
          side: leg.side,
          quantity: leg.lots * leg.lotSize,
          product: 'NRML',
        });
        placed++;
      } catch {
        failed++;
      }
    }
    setPlacing(false);
    if (failed === 0) {
      toast.push({ kind: 'success', title: 'Basket placed', message: `${placed} order${placed === 1 ? '' : 's'} sent.` });
      setLegs([]);
    } else {
      toast.push({
        kind: failed === legs.length ? 'error' : 'warning',
        title: 'Basket partially placed',
        message: `${placed} placed · ${failed} failed.`,
      });
    }
  }

  return (
    <div className="px-3 sm:px-0 space-y-4">
      {/* Underlying selector */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold tracking-tight">Strategy Builder</h1>
          {spot > 0 && (
            <div className="text-sm num text-ink-600 dark:text-night-100">
              Spot <span className="font-semibold text-ink-900 dark:text-night-50">{fmtNum(spot)}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {UNDERLYINGS.map((u) => (
            <button
              key={u}
              onClick={() => setUnderlying(u)}
              className={`btn-sm ${
                underlying === u
                  ? 'bg-brand text-white'
                  : 'bg-ink-50 dark:bg-night-700 text-ink-700 dark:text-night-100 hover:bg-ink-100 dark:hover:bg-night-600'
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Expiry picker */}
        {data && data.expiries.length > 0 && (
          <div className="mt-3">
            <div className="label mb-1.5">Expiry</div>
            <div className="flex flex-wrap gap-2">
              {data.expiries.map((e) => (
                <button
                  key={e}
                  onClick={() => changeExpiry(e)}
                  className={`px-2.5 h-7 rounded-lg text-xs font-semibold transition-colors ${
                    (expiry || data.expiry) === e
                      ? 'bg-brand/10 text-accent'
                      : 'bg-ink-50 dark:bg-night-700 text-ink-600 dark:text-night-100 hover:bg-ink-100 dark:hover:bg-night-600'
                  }`}
                >
                  {formatExpiry(e)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payoff section */}
      <div className="card">
        <h2 className="text-sm font-bold tracking-tight mb-2">Payoff at expiry</h2>
        {legs.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-500 dark:text-night-200">
            Add legs from the chain to see the payoff
          </div>
        ) : (
          <>
            <PayoffChart points={payoff.points} spot={spot} breakevens={payoff.breakevens} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <Stat
                label="Net premium"
                value={`${payoff.netPremium >= 0 ? '+' : '−'}${fmtINR(Math.abs(payoff.netPremium))}`}
                sub={payoff.netPremium >= 0 ? 'Credit' : 'Debit'}
                className={classPnL(payoff.netPremium)}
              />
              <Stat
                label="Max profit"
                value={payoff.profitUnlimited ? 'Unlimited' : `+${fmtINR(Math.abs(payoff.maxProfit))}`}
                className="text-pos"
              />
              <Stat
                label="Max loss"
                value={payoff.lossUnlimited ? 'Unlimited' : `−${fmtINR(Math.abs(payoff.maxLoss))}`}
                className="text-neg"
              />
              <Stat
                label="Breakeven"
                value={
                  payoff.breakevens.length
                    ? payoff.breakevens.map((b) => fmtNum(b, 0)).join(' · ')
                    : '—'
                }
                className="text-ink-800 dark:text-night-50"
              />
            </div>
          </>
        )}
      </div>

      {/* Presets + Legs panel */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold tracking-tight">
            Legs {legs.length > 0 && <span className="text-ink-400">({legs.length})</span>}
          </h2>
          {legs.length > 0 && (
            <button
              onClick={() => setLegs([])}
              className="text-xs font-semibold text-ink-500 dark:text-night-200 hover:text-neg"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Quick presets */}
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              disabled={!data}
              className="btn-sm bg-ink-50 dark:bg-night-700 text-ink-700 dark:text-night-100 hover:bg-ink-100 dark:hover:bg-night-600 disabled:opacity-40"
            >
              {p.label}
            </button>
          ))}
        </div>

        {legs.length === 0 ? (
          <p className="text-xs text-ink-500 dark:text-night-200">
            Tap +Buy / +Sell on a strike below, or pick a preset.
          </p>
        ) : (
          <div className="space-y-2">
            {legs.map((leg) => (
              <LegRow
                key={leg.id}
                leg={leg}
                onLots={(n) => setLots(leg.id, n)}
                onRemove={() => removeLeg(leg.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Place basket */}
      <div className="card sticky bottom-20 lg:bottom-4 z-10">
        <button
          onClick={placeBasket}
          disabled={!legs.length || !market.open || placing}
          className="btn-primary w-full disabled:opacity-50"
        >
          {placing
            ? 'Placing…'
            : !market.open
              ? 'Market closed'
              : legs.length
                ? `Place basket · ${legs.length} order${legs.length === 1 ? '' : 's'}`
                : 'Add legs to place'}
        </button>
        {!market.open && (
          <p className="text-[11px] text-center text-ink-500 dark:text-night-200 mt-1.5">
            {market.label}
          </p>
        )}
      </div>

      {/* Strikes list */}
      <div className="card">
        <h2 className="text-sm font-bold tracking-tight mb-2">Option chain · {underlying}</h2>
        {!data ? (
          <div className="py-10 text-center text-sm text-ink-500 dark:text-night-200">
            {loading ? 'Loading option chain…' : 'No data'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-ink-100 dark:border-night-500/40">
            <div className="grid grid-cols-[1fr_auto_1fr] text-[10px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200 px-3 py-1.5 bg-ink-50 dark:bg-night-700">
              <div className="text-left">Call (CE)</div>
              <div className="text-center">Strike</div>
              <div className="text-right">Put (PE)</div>
            </div>
            <div className="divide-y divide-ink-100 dark:divide-night-500/40">
              {data.rows.map((row) => (
                <StrikeRow
                  key={row.strike}
                  strike={row.strike}
                  ce={row.ce}
                  pe={row.pe}
                  isATM={row.strike === atmStrike}
                  onAdd={addLeg}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Stat cell ---------- */
function Stat({
  label, value, sub, className,
}: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="rounded-xl bg-ink-50 dark:bg-night-700/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200">
        {label}
      </div>
      <div className={`num text-sm font-bold tracking-tight ${className ?? ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink-400 dark:text-night-300">{sub}</div>}
    </div>
  );
}

/* ---------- One leg row ---------- */
function LegRow({
  leg, onLots, onRemove,
}: { leg: StrategyLeg; onLots: (n: number) => void; onRemove: () => void }) {
  const buy = leg.side === 'buy';
  return (
    <div className="flex items-center gap-2 rounded-xl bg-ink-50 dark:bg-night-700/60 px-2.5 py-2">
      <span
        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${
          buy ? 'bg-pos/10 text-pos' : 'bg-neg/10 text-neg'
        }`}
      >
        {buy ? 'Buy' : 'Sell'}
      </span>
      <span className="text-xs font-semibold text-ink-800 dark:text-night-50">{leg.type}</span>
      <span className="num text-sm font-semibold text-ink-900 dark:text-night-50">{fmtNum(leg.strike, 0)}</span>
      <span className="num text-[11px] text-ink-500 dark:text-night-200">@ {fmtNum(leg.premium)}</span>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => onLots(leg.lots - 1)}
          className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-white dark:bg-night-600 border border-ink-100 dark:border-night-500/40 text-ink-700 dark:text-night-100 disabled:opacity-40"
          disabled={leg.lots <= 1}
          aria-label="Decrease lots"
        >
          <IconMinus size={13} />
        </button>
        <span className="num text-xs font-bold w-8 text-center">
          {leg.lots}<span className="text-ink-400 dark:text-night-300 font-normal">L</span>
        </span>
        <button
          onClick={() => onLots(leg.lots + 1)}
          className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-white dark:bg-night-600 border border-ink-100 dark:border-night-500/40 text-ink-700 dark:text-night-100"
          aria-label="Increase lots"
        >
          <IconPlus size={13} />
        </button>
        <button
          onClick={onRemove}
          className="w-6 h-6 inline-flex items-center justify-center rounded-md text-ink-400 dark:text-night-300 hover:text-neg hover:bg-neg/10"
          aria-label="Remove leg"
        >
          <IconX size={14} />
        </button>
      </div>
    </div>
  );
}

/* ---------- One strike row with +Buy / +Sell affordances ---------- */
function StrikeRow({
  strike, ce, pe, isATM, onAdd,
}: {
  strike: number;
  ce: OptionLeg | null;
  pe: OptionLeg | null;
  isATM: boolean;
  onAdd: (leg: OptionLeg, type: 'CE' | 'PE', strike: number, side: 'buy' | 'sell') => void;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-center px-3 py-2 ${
        isATM ? 'bg-brand/5' : ''
      }`}
    >
      {/* CE side */}
      <div className="flex items-center gap-2">
        <span className="num text-xs font-medium text-ink-700 dark:text-night-100 w-14">
          {ce ? `₹${fmtNum(ce.ltp)}` : '—'}
        </span>
        <AddButtons leg={ce} onBuy={() => ce && onAdd(ce, 'CE', strike, 'buy')} onSell={() => ce && onAdd(ce, 'CE', strike, 'sell')} />
      </div>

      {/* Strike */}
      <div className={`num text-sm font-bold text-center px-2 ${isATM ? 'text-accent' : 'text-ink-900 dark:text-night-50'}`}>
        {fmtNum(strike, 0)}
      </div>

      {/* PE side */}
      <div className="flex items-center gap-2 justify-end">
        <AddButtons leg={pe} onBuy={() => pe && onAdd(pe, 'PE', strike, 'buy')} onSell={() => pe && onAdd(pe, 'PE', strike, 'sell')} />
        <span className="num text-xs font-medium text-ink-700 dark:text-night-100 w-14 text-right">
          {pe ? `₹${fmtNum(pe.ltp)}` : '—'}
        </span>
      </div>
    </div>
  );
}

function AddButtons({
  leg, onBuy, onSell,
}: { leg: OptionLeg | null; onBuy: () => void; onSell: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onBuy}
        disabled={!leg}
        className="px-1.5 h-6 rounded-md text-[10px] font-bold bg-pos/10 text-pos hover:bg-pos/20 disabled:opacity-30"
        title="Add buy leg"
      >
        +B
      </button>
      <button
        onClick={onSell}
        disabled={!leg}
        className="px-1.5 h-6 rounded-md text-[10px] font-bold bg-neg/10 text-neg hover:bg-neg/20 disabled:opacity-30"
        title="Add sell leg"
      >
        +S
      </button>
    </div>
  );
}

function formatExpiry(e: string): string {
  const m = e.match(/^(\d{1,2})([A-Z]{3})(\d{2,4})$/);
  if (!m) return e;
  const mm = m[2].charAt(0) + m[2].slice(1).toLowerCase();
  return `${m[1]} ${mm}`;
}
