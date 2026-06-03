import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMarket } from '../context/MarketContext';
import { useToast } from '../context/ToastContext';
import { useMarketStatus } from '../hooks/useMarketStatus';
import { fmtNum } from '../utils/fmt';
import { prettyOptionLabel } from '../utils/symbol';
import type { OrderProduct } from '../types';
import { previewCharges } from '../api/orders';
import {
  computeCharges, computeMargin, computeCashImpact, inferSegment,
} from '../utils/charges';
import { IconMinus, IconPlus, IconX } from './icons';

/** Pick a default product per market segment. */
function defaultProductFor(symbol: string): OrderProduct {
  const s = symbol.toUpperCase();
  if (/\d(?:CE|PE)$/.test(s) || /FUT$/.test(s)) return 'NRML';
  if (/^(GOLD|SILVER|CRUDEOIL|NATURALGAS|COPPER|ZINC|LEAD|ALUMINIUM)$/.test(s)) return 'NRML';
  return 'CNC';
}

/** Which product options are available for the given symbol. */
function productOptionsFor(symbol: string): OrderProduct[] {
  const s = symbol.toUpperCase();
  if (/\d(?:CE|PE)$/.test(s) || /FUT$/.test(s)) return ['NRML', 'MIS'];
  if (/^(GOLD|SILVER|CRUDEOIL|NATURALGAS|COPPER|ZINC|LEAD|ALUMINIUM)$/.test(s)) return ['NRML', 'MIS'];
  return ['CNC', 'MIS'];
}

function productHint(p: OrderProduct): string {
  switch (p) {
    case 'CNC':  return 'Delivery — full cash, holds beyond today';
    case 'MIS':  return 'Intraday — auto-squared-off before close';
    case 'NRML': return 'Carry-forward — F&O / Commodity overnight';
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaultSymbol?: string;
  defaultSide?: 'buy' | 'sell';
  /** Price the caller ALREADY has (option-chain leg LTP / stock snapshot) — lets
   *  the modal paint price + charges + margin INSTANTLY, with no wait for the
   *  preview API (which only refines the volume-based est. fill in the background). */
  initialPrice?: number;
  /** Lot size the caller already knows (chain leg lotsize; 1 for equity). */
  initialLotSize?: number;
}

/**
 * The one-shot seed we fetch from the backend per symbol/side/product
 * combination. Everything else (charges, margin, cash impact) is then
 * recomputed LOCALLY on every quantity / price tick — zero-latency UI.
 */
interface Seed {
  lotSize: number;
  underlyingSpot: number;
  availableMargin: number;
  /** LTP at modal-open time. Used as the price source until the WS
      subscription delivers its first tick — so the modal never shows "—". */
  ltp: number;
}

export function OrderModal({ open, onClose, defaultSymbol, defaultSide, initialPrice, initialLotSize }: Props) {
  // Symbol is fixed by the caller — no setter exposed in the UI.
  const [symbol, setSymbol] = useState(defaultSymbol || '');
  void setSymbol;
  const [side, setSide] = useState<'buy' | 'sell'>(defaultSide || 'buy');
  const [type, setType] = useState<'market' | 'limit' | 'sl' | 'sl-m'>('market');
  const [quantity, setQuantity] = useState<number>(1);
  const [price, setPrice] = useState<number>(0);
  const [triggerPrice, setTriggerPrice] = useState<number>(0);
  const [validity, setValidity] = useState<'DAY' | 'IOC' | 'GTT'>('DAY');
  const [product, setProduct] = useState<OrderProduct>(defaultProductFor(defaultSymbol || ''));
  const [seed, setSeed] = useState<Seed | null>(null);
  const [estFill, setEstFill] = useState<{ price: number; mode: 'book' | 'synthetic'; bookQty: number } | null>(null);
  const [bracketOn, setBracketOn] = useState(false);
  const [bracketSL, setBracketSL] = useState<number>(0);
  const [bracketTgt, setBracketTgt] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const { quotes, subscribe, placeOrder, portfolio } = useMarket();
  const toast = useToast();
  // Live market-open status for the symbol. When closed we block submission
  // (defense in depth on top of the backend rejection) and grey the CTA.
  const market = useMarketStatus(symbol);

  useEffect(() => {
    if (open) {
      setSymbol(defaultSymbol || '');
      setSide(defaultSide || 'buy');
      setType('market');
      setBracketOn(false);
      setBracketSL(0);
      setBracketTgt(0);
      // Start at one full lot when we already know it (instant, no API wait).
      setQuantity(initialLotSize && initialLotSize > 1 ? initialLotSize : 1);
      setPrice(0);
      setTriggerPrice(0);
      setValidity('DAY');
      setProduct(defaultProductFor(defaultSymbol || ''));
      setSeed(null);
    }
  }, [open, defaultSymbol, defaultSide, initialLotSize]);

  useEffect(() => {
    setProduct(defaultProductFor(symbol));
  }, [symbol]);

  useEffect(() => {
    if (open && symbol) subscribe([symbol]);
  }, [open, symbol, subscribe]);

  // Quantity-aware estimated MARKET fill — walks the REAL order book on the
  // backend, so the user sees what they'll actually fill at (incl. spread +
  // volume impact) vs the raw LTP. Debounced so rapid +/- taps don't spam the
  // API. Only meaningful for market / SL-M (which fill at market); for limit/SL
  // the fill is bounded by the user's own price.
  useEffect(() => {
    if (!open || !symbol || (type !== 'market' && type !== 'sl-m')) {
      setEstFill(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      previewCharges({ symbol: symbol.toUpperCase(), side, product, price: 0, quantity })
        .then((r) => {
          if (cancelled) return;
          setEstFill(
            r.estFill != null
              ? { price: r.estFill, mode: r.estFillMode ?? 'synthetic', bookQty: r.estFillBookQty ?? 0 }
              : null,
          );
        })
        .catch(() => { if (!cancelled) setEstFill(null); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, symbol, side, product, quantity, type]);

  const live = symbol ? quotes[symbol.toUpperCase()] : undefined;

  useEffect(() => {
    // Seed the limit / trigger inputs from the best price we have: live tick
    // first, otherwise the LTP returned by the bootstrap preview.
    const sp = live?.price ?? seed?.ltp ?? initialPrice ?? 0;
    if (sp <= 0) return;
    if ((type === 'limit' || type === 'sl') && price === 0) {
      setPrice(Number(sp.toFixed(2)));
    }
    if ((type === 'sl' || type === 'sl-m') && triggerPrice === 0) {
      setTriggerPrice(Number(sp.toFixed(2)));
    }
  }, [type, live, price, triggerPrice, seed?.ltp, initialPrice]);

  // ONE-shot seed from the backend per (symbol, side, product). We grab
  //   • lotSize        — authoritative lot from the scrip master
  //   • availableMargin — the wallet snapshot at modal-open time
  //   • underlyingSpot — for SPAN-style option SELL margin calc
  // Everything else (charges, margin, cash impact) is then computed LOCALLY
  // on every +/− or limit-price keystroke — zero backend roundtrips per
  // click, so the UI feels instant.
  useEffect(() => {
    if (!open || !symbol) return;
    let cancelled = false;
    previewCharges({
      symbol: symbol.toUpperCase(),
      side, product, price: 0, quantity: 1,
    })
      .then((r) => {
        if (cancelled) return;
        setSeed({
          lotSize: r.lotSize && r.lotSize > 0 ? r.lotSize : 1,
          underlyingSpot: r.margin?.underlyingSpot ?? 0,
          availableMargin: r.available?.availableMargin ?? 0,
          ltp: r.ltp ?? 0,
        });
        if (r.lotSize && r.lotSize > 1) {
          // Snap quantity to one full lot on first seed for F&O / commodity
          setQuantity((q) => (q === 1 ? r.lotSize! : q));
        }
      })
      .catch(() => {
        // Even on failure, fall back to lot=1 so the modal renders.
        if (!cancelled) setSeed({ lotSize: 1, underlyingSpot: 0, availableMargin: 0, ltp: 0 });
      });
    return () => { cancelled = true; };
  }, [open, symbol, side, product]);

  const lotSize = seed?.lotSize ?? initialLotSize ?? 1;
  const inLots = lotSize > 1;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!symbol) return toast.push({ kind: 'error', message: 'Symbol required' });
    // Defense in depth — never call placeOrder when the market is closed.
    if (!market.open) {
      return toast.push({ kind: 'error', title: 'Market closed', message: market.label });
    }
    if (!quantity || quantity <= 0) return toast.push({ kind: 'error', message: 'Qty > 0' });
    if (inLots && quantity % lotSize !== 0) {
      return toast.push({ kind: 'error', message: `Qty must be a multiple of ${lotSize}` });
    }
    if ((type === 'limit' || type === 'sl') && (!price || price <= 0))
      return toast.push({ kind: 'error', message: 'Limit price > 0' });
    if ((type === 'sl' || type === 'sl-m') && (!triggerPrice || triggerPrice <= 0))
      return toast.push({ kind: 'error', message: 'Trigger price > 0' });

    setSubmitting(true);
    try {
      const order = await placeOrder({
        symbol: symbol.toUpperCase(),
        type, side, quantity,
        price: type === 'limit' || type === 'sl' ? price : undefined,
        triggerPrice: type === 'sl' || type === 'sl-m' ? triggerPrice : undefined,
        validity,
        product,
        bracketStopLoss: bracketOn && bracketSL > 0 ? bracketSL : undefined,
        bracketTarget: bracketOn && bracketTgt > 0 ? bracketTgt : undefined,
      });
      const resting = order.status === 'pending';
      toast.push({
        kind: 'success',
        title: resting ? `${type.toUpperCase()} order placed` : 'Order submitted',
        message: `${order.side.toUpperCase()} ${order.quantity} ${order.symbol}`,
      });
      onClose();
    } catch (err: any) {
      const msg = String(err?.message || '');
      const isMargin = /margin|balance|insufficient/i.test(msg);
      toast.push({
        kind: 'error',
        title: isMargin ? 'Insufficient margin' : 'Order failed',
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Effective price for charges + margin calc:
  //   • limit / sl   → user-typed limit price
  //   • sl-m         → trigger price (best estimate of the eventual fill)
  //   • market       → live WS quote if we have it, otherwise the seeded LTP
  //     (so the modal never falls back to "—" while the WS warms up)
  const liveOrSeed = live?.price ?? seed?.ltp ?? initialPrice ?? 0;
  const refPrice =
    type === 'limit' || type === 'sl' ? price
    : type === 'sl-m'                  ? (triggerPrice || liveOrSeed)
    :                                    liveOrSeed;

  // ALL charges / margin / cash-impact are computed locally per render —
  // mirrors the backend formulas (utils/charges.ts). useMemo keeps this
  // basically free even at 60 fps. MUST be declared before any early
  // return so React always sees the same hook order.
  const local = useMemo(() => {
    if (!symbol || !refPrice || !quantity || quantity <= 0) {
      return null;
    }
    const seg = inferSegment(symbol);
    const charges = computeCharges({
      segment: seg.segment, product, side,
      price: refPrice, quantity,
      isOption: seg.isOption, isStockOption: seg.isStockOption,
    });
    const marginBlocked = computeMargin({
      segment: seg.segment, product, side,
      price: refPrice, quantity,
      isOption: seg.isOption, isStockOption: seg.isStockOption,
      underlyingSpot: seed?.underlyingSpot,
    });
    const cashImpact = computeCashImpact({
      segment: seg.segment, product, side,
      price: refPrice, quantity,
      isOption: seg.isOption, isStockOption: seg.isStockOption,
    });
    // Groww-style single number: net wallet outflow required to open.
    //   option BUY  → premium + charges
    //   option SELL → SPAN margin + charges − premium credited
    //   EQ CNC      → notional + charges
    //   MIS / NRML  → margin + charges
    const required = Math.max(0, -cashImpact + marginBlocked + charges.total);
    return { charges, marginBlocked, cashImpact, required };
  }, [symbol, refPrice, quantity, side, product, seed?.underlyingSpot]);

  if (!open) return null;

  const charges = local?.charges;
  const requiredFromAvailable = local?.required ?? 0;
  // Available funds come from the LIVE WS portfolio (already in memory) — not the
  // preview API. This removes the "Insufficient funds" flash that showed while
  // the seed request was in flight (availableMargin briefly 0). Fall back to the
  // seed only if the portfolio hasn't pushed yet.
  const fundsKnown = portfolio != null || seed != null;
  const availableMargin = portfolio?.availableMargin ?? seed?.availableMargin ?? 0;
  const shortBy = Math.max(0, requiredFromAvailable - availableMargin);
  // Don't flag insufficient until we actually KNOW the funds (avoids any flash
  // on a cold open before the first portfolio push / seed lands).
  const insufficient = fundsKnown && shortBy > 0 && local != null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 dark:bg-black/60 flex items-end sm:items-center
                 justify-center p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-night-700 rounded-t-3xl sm:rounded-2xl
                   shadow-cardHover animate-slideUp max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-ink-200 dark:bg-night-400" />
        </div>

        {/* Header — uses the human-friendly option label so the user sees
            "NIFTY 26 May 23050 Call" instead of NIFTY26MAY2623050CE. */}
        <div className="flex items-center justify-between px-5 pt-2 pb-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-medium text-ink-500 dark:text-night-200">
              {side === 'buy' ? 'Buy' : 'Sell'} order
            </div>
            <div className="text-base font-semibold tracking-tight truncate">
              {prettyOptionLabel(symbol) ?? symbol ?? '—'}
            </div>
            <div className="flex items-center gap-2 text-[11px] mt-0.5 text-ink-500 dark:text-night-200">
              <span>LTP</span>
              <span className="num font-medium text-ink-800 dark:text-night-50">
                {(() => {
                  const shown = live?.price ?? seed?.ltp ?? initialPrice ?? 0;
                  return shown > 0 ? `₹${fmtNum(shown)}` : '—';
                })()}
              </span>
            </div>
            {(type === 'market' || type === 'sl-m') && estFill && (() => {
              const ref = live?.price ?? seed?.ltp ?? initialPrice ?? 0;
              const diff = ref > 0 ? estFill.price - ref : 0;
              return (
                <div className="flex items-center gap-2 text-[11px] mt-0.5 text-ink-500 dark:text-night-200">
                  <span>Est. fill</span>
                  <span className="num font-semibold text-ink-800 dark:text-night-50">
                    ₹{fmtNum(estFill.price)}
                  </span>
                  {ref > 0 && Math.abs(diff) >= 0.01 && (
                    <span className="num text-ink-400 dark:text-night-300">
                      ({diff > 0 ? '+' : ''}{fmtNum(diff)} vs LTP)
                    </span>
                  )}
                  {estFill.mode === 'book' && (
                    <span className="text-[10px] text-ink-400 dark:text-night-300">· live book</span>
                  )}
                </div>
              );
            })()}
            {!market.open && (
              <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full
                               bg-amber-500/10 text-amber-600 dark:text-amber-400
                               text-[10px] font-semibold">
                🔒 {market.label}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center
                       bg-ink-50 dark:bg-night-600 text-ink-600 dark:text-night-100
                       hover:bg-ink-100 dark:hover:bg-night-500"
          >
            <IconX size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 pb-5 space-y-3">

          {/* BUY / SELL pill */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-ink-50 dark:bg-night-600/60">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={`py-2 text-sm font-semibold rounded-lg transition ${
                side === 'buy' ? 'bg-pos text-white shadow-card' : 'text-ink-600 dark:text-night-100'
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={`py-2 text-sm font-semibold rounded-lg transition ${
                side === 'sell' ? 'bg-neg text-white shadow-card' : 'text-ink-600 dark:text-night-100'
              }`}
            >
              SELL
            </button>
          </div>

          {/* Order type — Market / Limit / SL / SL-M (Zerodha-style) */}
          <div className="grid grid-cols-4 gap-2 p-1 rounded-xl bg-ink-50 dark:bg-night-600/60">
            {([
              { v: 'market', label: 'Market' },
              { v: 'limit',  label: 'Limit' },
              { v: 'sl',     label: 'SL' },
              { v: 'sl-m',   label: 'SL-M' },
            ] as const).map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setType(t.v)}
                className={`py-2 text-xs font-semibold rounded-lg transition ${
                  type === t.v
                    ? 'bg-white dark:bg-night-700 text-ink-800 dark:text-night-50 shadow-card'
                    : 'text-ink-500 dark:text-night-200'
                }`}
                title={
                  t.v === 'sl' ? 'Stop-Loss Limit — triggers at trigger price, then rests as a limit'
                  : t.v === 'sl-m' ? 'Stop-Loss Market — triggers at trigger price, then fills at market'
                  : t.v === 'limit' ? 'Limit — fills only at your price or better'
                  : 'Market — fills now at the best available price'
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Product */}
          <div>
            <label className="label">Product</label>
            <div className={`grid grid-cols-${productOptionsFor(symbol).length} gap-2 p-1 rounded-xl bg-ink-50 dark:bg-night-600/60`}>
              {productOptionsFor(symbol).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProduct(p)}
                  className={`py-2 text-xs font-semibold rounded-lg transition ${
                    product === p
                      ? 'bg-white dark:bg-night-700 text-ink-800 dark:text-night-50 shadow-card'
                      : 'text-ink-500 dark:text-night-200'
                  }`}
                  title={productHint(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-ink-500 dark:text-night-200 mt-1.5">
              {productHint(product)}
            </div>
          </div>

          {/* Quantity — RAW count. + / − step by one full lot for F&O contracts
              so the user always lands on a valid multiple; typing 24 when the
              lot is 20 shows an inline error and disables submit. */}
          {(() => {
            const step = inLots ? lotSize : 1;
            const inc = () => setQuantity(Math.max(step, Math.floor(quantity / step) * step + step));
            const dec = () => setQuantity(Math.max(step, Math.floor((quantity - 1) / step) * step));
            const invalidQty = inLots && quantity > 0 && quantity % lotSize !== 0;
            const nearestValid = inLots
              ? Math.max(lotSize, Math.round(quantity / lotSize) * lotSize)
              : quantity;
            return (
              <div>
                <label className="label">Quantity</label>
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={dec}
                    className="w-12 rounded-xl bg-ink-50 dark:bg-night-600 inline-flex items-center justify-center"
                    aria-label={`Decrease by ${step}`}
                  >
                    <IconMinus size={18} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    className={`input text-center font-medium num ${
                      invalidQty ? '!border-neg focus:!border-neg' : ''
                    }`}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))}
                  />
                  <button
                    type="button"
                    onClick={inc}
                    className="w-12 rounded-xl bg-ink-50 dark:bg-night-600 inline-flex items-center justify-center"
                    aria-label={`Increase by ${step}`}
                  >
                    <IconPlus size={18} />
                  </button>
                </div>
                {inLots && !invalidQty && (
                  <div className="text-[11px] text-ink-500 dark:text-night-200 mt-1.5">
                    1 lot = {lotSize} · current = <span className="num font-semibold">{quantity / lotSize}</span> lot{quantity / lotSize === 1 ? '' : 's'}
                  </div>
                )}
                {invalidQty && (
                  <div className="text-[11px] text-neg font-semibold mt-1.5 flex items-center justify-between gap-2">
                    <span>Quantity must be a multiple of {lotSize}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(nearestValid)}
                      className="underline underline-offset-2"
                    >
                      snap to {nearestValid}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Trigger price — SL / SL-M */}
          {(type === 'sl' || type === 'sl-m') && (
            <div>
              <label className="label">Trigger price (₹)</label>
              <input
                type="number"
                step="0.05"
                min={0}
                className="input num font-medium"
                value={triggerPrice || ''}
                onChange={(e) => setTriggerPrice(parseFloat(e.target.value || '0'))}
              />
              <div className="text-[11px] text-ink-500 dark:text-night-200 mt-1.5">
                {side === 'buy'
                  ? 'Activates when price rises to the trigger.'
                  : 'Activates when price falls to the trigger.'}
              </div>
            </div>
          )}

          {/* Limit price — Limit / SL */}
          {(type === 'limit' || type === 'sl') && (
            <div>
              <label className="label">Limit price (₹)</label>
              <input
                type="number"
                step="0.05"
                min={0}
                className="input num font-medium"
                value={price || ''}
                onChange={(e) => setPrice(parseFloat(e.target.value || '0'))}
              />
            </div>
          )}

          {/* Bracket — auto stop-loss / target armed when this entry fills */}
          <div>
            <button
              type="button"
              onClick={() => setBracketOn((v) => !v)}
              className="flex items-center justify-between w-full"
            >
              <span className="label !mb-0">Bracket — auto SL / Target</span>
              <span
                className={`relative inline-flex items-center w-10 h-5 rounded-full transition-colors ${
                  bracketOn ? 'bg-brand' : 'bg-ink-200 dark:bg-night-500'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-card transition-transform ${
                    bracketOn ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
            {bracketOn && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="label !text-[10px]">Stop-loss (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    placeholder="optional"
                    className="input num font-medium !border-neg/40 focus:!border-neg"
                    value={bracketSL || ''}
                    onChange={(e) => setBracketSL(parseFloat(e.target.value || '0'))}
                  />
                </div>
                <div>
                  <label className="label !text-[10px]">Target (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    placeholder="optional"
                    className="input num font-medium !border-pos/40 focus:!border-pos"
                    value={bracketTgt || ''}
                    onChange={(e) => setBracketTgt(parseFloat(e.target.value || '0'))}
                  />
                </div>
                <p className="col-span-2 text-[11px] text-ink-500 dark:text-night-200">
                  Auto-exits the position at market when either level is hit.
                </p>
              </div>
            )}
          </div>

          {/* Validity */}
          <div>
            <label className="label">Validity</label>
            <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-ink-50 dark:bg-night-600/60">
              {([
                { v: 'DAY', hint: 'Rests for the session' },
                { v: 'IOC', hint: 'Immediate-or-cancel: fill now, cancel the rest' },
                { v: 'GTT', hint: 'Good-till-triggered: rests across sessions' },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setValidity(o.v)}
                  className={`py-2 text-xs font-semibold rounded-lg transition ${
                    validity === o.v
                      ? 'bg-white dark:bg-night-700 text-ink-800 dark:text-night-50 shadow-card'
                      : 'text-ink-500 dark:text-night-200'
                  }`}
                  title={o.hint}
                >
                  {o.v}
                </button>
              ))}
            </div>
          </div>

          {/* Charges breakup (collapsed by default — Groww-style detail-on-tap) */}
          {charges && charges.total > 0 && (
            <details className="rounded-xl bg-ink-50 dark:bg-night-600/60 px-4 py-2.5">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <span className="text-xs text-ink-500 dark:text-night-200">Charges</span>
                <span className="num text-xs font-medium text-ink-700 dark:text-night-100">
                  ₹{fmtNum(charges.total)} <span className="text-ink-400 dark:text-night-300 ml-1">▾</span>
                </span>
              </summary>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] num text-ink-500 dark:text-night-200">
                <dt>Brokerage</dt><dd className="text-right">₹{fmtNum(charges.brokerage)}</dd>
                <dt>STT/CTT</dt><dd className="text-right">₹{fmtNum(charges.stt)}</dd>
                <dt>Exchange txn</dt><dd className="text-right">₹{fmtNum(charges.exchangeTxn)}</dd>
                <dt>SEBI</dt><dd className="text-right">₹{fmtNum(charges.sebi)}</dd>
                <dt>Stamp duty</dt><dd className="text-right">₹{fmtNum(charges.stampDuty)}</dd>
                {charges.dpCharges > 0 && (<><dt>DP charge</dt><dd className="text-right">₹{fmtNum(charges.dpCharges)}</dd></>)}
                <dt>GST (18%)</dt><dd className="text-right">₹{fmtNum(charges.gst)}</dd>
              </dl>
            </details>
          )}

          {/* ONE margin-required line (Groww-style). Computed LOCALLY from the
              price the caller already passed — renders INSTANTLY, no wait for
              the preview API (which only refines est. fill in the background). */}
          {local && (
            <div className="rounded-xl bg-ink-50 dark:bg-night-600/60 px-4 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-500 dark:text-night-200">Margin required</span>
                <span className={`num text-base font-semibold ${insufficient ? 'text-neg' : ''}`}>
                  ₹{fmtNum(requiredFromAvailable)}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[11px] mt-0.5">
                <span className="text-ink-500 dark:text-night-200">Available</span>
                <span className="num text-ink-700 dark:text-night-100">
                  ₹{fmtNum(availableMargin)}
                </span>
              </div>
              {insufficient && (
                <div className="text-[11px] text-neg font-medium mt-1">
                  Short by ₹{fmtNum(shortBy)} — reduce quantity or top up margin.
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || insufficient || !market.open}
            className={`${side === 'buy' ? 'btn-pos' : 'btn-neg'} w-full text-base !py-3
                        disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {!market.open
              ? 'Market closed'
              : submitting
                ? 'Placing…'
                : insufficient
                  ? 'Insufficient margin'
                  : (side === 'buy' ? 'Buy' : 'Sell')}
          </button>
        </form>
      </div>
    </div>
  );
}
