import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { setGuard, type PositionGuardDTO } from '../api/orders';
import { fmtINR, fmtNum } from '../utils/fmt';
import { IconX } from './icons';

interface PositionLite {
  symbol: string;
  product?: 'CNC' | 'MIS' | 'NRML';
  netQuantity: number;
  avgEntryPrice: number;
  ltp: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  position: PositionLite | null;
  guard: PositionGuardDTO | null;
  onSaved: () => void;
}

/**
 * Risk-management editor: attach an auto-exiting Stop-Loss / Target / Trailing
 * stop to an open position ("SL on P&L"). Levels are entered as prices, with a
 * live P&L preview and quick ₹/% chips so the user can think in profit/loss
 * terms. Triggers fire server-side, even when the app is closed.
 */
export function RiskModal({ open, onClose, position, guard, onSaved }: Props) {
  const toast = useToast();
  const [sl, setSl] = useState<string>('');
  const [tgt, setTgt] = useState<string>('');
  const [trail, setTrail] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSl(guard?.stopLossPrice ? String(guard.stopLossPrice) : '');
      setTgt(guard?.targetPrice ? String(guard.targetPrice) : '');
      setTrail(guard?.trailingAmount ? String(guard.trailingAmount) : '');
    }
  }, [open, guard]);

  const absQty = position ? Math.abs(position.netQuantity) : 0;
  const long = (position?.netQuantity ?? 0) > 0;
  const avg = position?.avgEntryPrice ?? 0;
  const ltp = position?.ltp ?? 0;
  const invested = avg * absQty;

  // Price ⇄ P&L conversion (sign-aware for shorts).
  const pnlAt = (price: number) => (long ? price - avg : avg - price) * absQty;
  const priceForPnl = (pnl: number) => (long ? avg + pnl / absQty : avg - pnl / absQty);

  const slNum = parseFloat(sl);
  const tgtNum = parseFloat(tgt);
  const trailNum = parseFloat(trail);

  const slPnl = useMemo(() => (slNum > 0 ? pnlAt(slNum) : null), [slNum, avg, absQty, long]);
  const tgtPnl = useMemo(() => (tgtNum > 0 ? pnlAt(tgtNum) : null), [tgtNum, avg, absQty, long]);

  // Warn when a level is on the wrong side of LTP (would trigger immediately).
  const slImmediate = slNum > 0 && ltp > 0 && (long ? ltp <= slNum : ltp >= slNum);
  const tgtImmediate = tgtNum > 0 && ltp > 0 && (long ? ltp >= tgtNum : ltp <= tgtNum);

  function chipPrice(kind: 'sl' | 'tgt', pnl: number) {
    const p = priceForPnl(pnl);
    const v = Math.max(0, Number(p.toFixed(2)));
    if (kind === 'sl') setSl(String(v));
    else setTgt(String(v));
  }

  if (!open || !position) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const p = position!;
    setSaving(true);
    try {
      const res = await setGuard(p.symbol, {
        product: p.product,
        stopLossPrice: slNum > 0 ? slNum : null,
        targetPrice: tgtNum > 0 ? tgtNum : null,
        trailingAmount: trailNum > 0 ? trailNum : null,
      });
      toast.push({
        kind: 'success',
        title: res.cleared ? 'Risk levels cleared' : 'Risk levels saved',
        message: res.cleared ? `${p.symbol} auto-exit removed` : `${p.symbol} will auto-exit at your levels`,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Could not save', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  const slLossChips = long ? [-0.01, -0.02, -0.05] : [-0.01, -0.02, -0.05];
  const tgtChips = [0.01, 0.02, 0.05];

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 dark:bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-night-700 rounded-t-3xl sm:rounded-2xl shadow-cardHover animate-slideUp max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-ink-200 dark:bg-night-400" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-medium text-ink-500 dark:text-night-200">
              Stop-loss / Target · {position.product}
            </div>
            <div className="text-base font-semibold tracking-tight truncate">{position.symbol}</div>
            <div className="text-[11px] mt-0.5 text-ink-500 dark:text-night-200 num">
              {long ? 'Long' : 'Short'} {absQty} · Avg {fmtNum(avg)} · LTP {ltp > 0 ? fmtNum(ltp) : '—'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center bg-ink-50 dark:bg-night-600 text-ink-600 dark:text-night-100 hover:bg-ink-100 dark:hover:bg-night-500"
          >
            <IconX size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 pb-5 space-y-5">
          {/* STOP-LOSS */}
          <div>
            <label className="label flex items-center justify-between">
              <span>Stop-loss price (₹)</span>
              {slPnl != null && (
                <span className={`num font-semibold ${slPnl >= 0 ? 'text-pos' : 'text-neg'}`}>
                  {slPnl >= 0 ? '+' : ''}{fmtINR(slPnl)} ({invested > 0 ? ((slPnl / invested) * 100).toFixed(2) : '0'}%)
                </span>
              )}
            </label>
            <input
              type="number" step="0.05" min={0}
              className={`input num font-medium ${slImmediate ? '!border-neg' : ''}`}
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder="e.g. cut loss here"
            />
            <div className="flex gap-1.5 mt-1.5">
              {slLossChips.map((pct) => (
                <button key={pct} type="button"
                  onClick={() => chipPrice('sl', pct * invested)}
                  className="flex-1 text-[11px] font-semibold py-1 rounded-lg bg-neg/10 text-neg hover:bg-neg/20">
                  {Math.round(pct * 100)}%
                </button>
              ))}
              <button type="button" onClick={() => chipPrice('sl', -500)}
                className="flex-1 text-[11px] font-semibold py-1 rounded-lg bg-neg/10 text-neg hover:bg-neg/20">−₹500</button>
            </div>
            {slImmediate && (
              <div className="text-[11px] text-neg font-medium mt-1.5">
                ⚠ Already past LTP — this will exit on the next tick.
              </div>
            )}
          </div>

          {/* TARGET */}
          <div>
            <label className="label flex items-center justify-between">
              <span>Target price (₹)</span>
              {tgtPnl != null && (
                <span className={`num font-semibold ${tgtPnl >= 0 ? 'text-pos' : 'text-neg'}`}>
                  {tgtPnl >= 0 ? '+' : ''}{fmtINR(tgtPnl)} ({invested > 0 ? ((tgtPnl / invested) * 100).toFixed(2) : '0'}%)
                </span>
              )}
            </label>
            <input
              type="number" step="0.05" min={0}
              className={`input num font-medium ${tgtImmediate ? '!border-pos' : ''}`}
              value={tgt}
              onChange={(e) => setTgt(e.target.value)}
              placeholder="e.g. book profit here"
            />
            <div className="flex gap-1.5 mt-1.5">
              {tgtChips.map((pct) => (
                <button key={pct} type="button"
                  onClick={() => chipPrice('tgt', pct * invested)}
                  className="flex-1 text-[11px] font-semibold py-1 rounded-lg bg-pos/10 text-pos hover:bg-pos/20">
                  +{Math.round(pct * 100)}%
                </button>
              ))}
              <button type="button" onClick={() => chipPrice('tgt', 500)}
                className="flex-1 text-[11px] font-semibold py-1 rounded-lg bg-pos/10 text-pos hover:bg-pos/20">+₹500</button>
            </div>
            {tgtImmediate && (
              <div className="text-[11px] text-pos font-medium mt-1.5">
                ⚠ Already past LTP — this will exit on the next tick.
              </div>
            )}
          </div>

          {/* TRAILING */}
          <div>
            <label className="label">Trailing stop (₹ per unit)</label>
            <input
              type="number" step="0.05" min={0}
              className="input num font-medium"
              value={trail}
              onChange={(e) => setTrail(e.target.value)}
              placeholder="exit if price retraces this much from peak"
            />
            <div className="text-[11px] text-ink-500 dark:text-night-200 mt-1.5">
              {trailNum > 0
                ? `Exits if price drops ₹${fmtNum(trailNum)} (₹${fmtNum(trailNum * absQty)} on ${absQty}) from its best.`
                : 'Ratchets with the price; locks in gains as it moves your way.'}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full text-base !py-3.5"
          >
            {saving ? 'Saving…' : (sl || tgt || trail) ? 'Save risk levels' : 'Clear risk levels'}
          </button>
        </form>
      </div>
    </div>
  );
}
