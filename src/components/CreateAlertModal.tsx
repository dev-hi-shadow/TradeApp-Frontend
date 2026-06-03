/**
 * Create-alert bottom sheet.
 *
 * Lets the user set up:
 *   • Symbol (locked when opened from a stock detail page)
 *   • Type:      Price ABOVE / Price BELOW / % UP / % DOWN
 *   • Target value (rupees for above/below, percent for pct types)
 *   • Frequency: once / every cross / once-per-day
 *   • Cooldown seconds (only relevant for "every cross")
 *   • Optional note
 */
import { FormEvent, useEffect, useState } from 'react';
import { useMarket } from '../context/MarketContext';
import { useToast } from '../context/ToastContext';
import { createAlert } from '../api/alerts';
import type { AlertFrequency, AlertType } from '../types';
import { fmtNum } from '../utils/fmt';
import { IconX } from './icons';
import { SymbolSelect } from './SymbolSelect';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  defaultSymbol?: string;
}

export function CreateAlertModal({ open, onClose, onCreated, defaultSymbol }: Props) {
  const { quotes, subscribe } = useMarket();
  const toast = useToast();

  const [symbol, setSymbol] = useState(defaultSymbol || '');
  const [type, setType] = useState<AlertType>('above');
  const [value, setValue] = useState<number>(0);
  const [frequency, setFrequency] = useState<AlertFrequency>('once');
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(5);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSymbol(defaultSymbol || '');
      setType('above');
      setValue(0);
      setFrequency('once');
      setCooldownMinutes(5);
      setNote('');
    }
  }, [open, defaultSymbol]);

  useEffect(() => {
    if (open && symbol) subscribe([symbol]);
  }, [open, symbol, subscribe]);

  const live = symbol ? quotes[symbol.toUpperCase()] : undefined;
  const ltp = live?.price ?? 0;

  // Pre-fill value with current LTP +/- 1% when type changes
  useEffect(() => {
    if (!ltp) return;
    if (type === 'above') setValue(Math.round(ltp * 1.01 * 100) / 100);
    else if (type === 'below') setValue(Math.round(ltp * 0.99 * 100) / 100);
    else if (type === 'pctUp')  setValue(5);
    else if (type === 'pctDown') setValue(5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, ltp > 0]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!symbol) return toast.push({ kind: 'error', message: 'Symbol required' });
    if (!value || value <= 0) return toast.push({ kind: 'error', message: 'Value must be > 0' });
    setSubmitting(true);
    try {
      await createAlert({
        symbol: symbol.toUpperCase(),
        type,
        value,
        frequency,
        cooldownSeconds: cooldownMinutes * 60,
        note,
      });
      toast.push({
        kind: 'success',
        title: 'Alert created',
        message: `${symbol.toUpperCase()} · ${describeAlert(type, value)}`,
      });
      onCreated?.();
      onClose();
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Alert failed', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const valueLabel =
    type === 'above'
      ? 'Trigger when price goes ABOVE'
      : type === 'below'
        ? 'Trigger when price drops BELOW'
        : type === 'pctUp'
          ? 'Trigger when price has moved UP by'
          : 'Trigger when price has dropped by';

  const valueSuffix = type === 'pctUp' || type === 'pctDown' ? '%' : '₹';

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 dark:bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-night-700 rounded-t-3xl sm:rounded-2xl shadow-cardHover animate-slideUp"
      >
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-ink-200 dark:bg-night-400" />
        </div>
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200">
              Create alert
            </div>
            <div className="text-lg font-bold tracking-tight">
              🔔 {symbol || '—'}
              {ltp ? <span className="text-sm text-ink-500 ml-2 num">{fmtNum(ltp)}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-ink-50 dark:bg-night-600 text-ink-600 dark:text-night-100"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {!defaultSymbol && (
            <div>
              <label className="label">Symbol</label>
              <SymbolSelect value={symbol} onChange={setSymbol} />
            </div>
          )}

          {/* Type — 2×2 grid */}
          <div>
            <label className="label">Condition</label>
            <div className="grid grid-cols-2 gap-2">
              <TypePill active={type === 'above'}   onClick={() => setType('above')}   tone="pos" label="Price ▲ above" />
              <TypePill active={type === 'below'}   onClick={() => setType('below')}   tone="neg" label="Price ▼ below" />
              <TypePill active={type === 'pctUp'}   onClick={() => setType('pctUp')}   tone="pos" label="% up from now" />
              <TypePill active={type === 'pctDown'} onClick={() => setType('pctDown')} tone="neg" label="% down from now" />
            </div>
          </div>

          {/* Value */}
          <div>
            <label className="label">{valueLabel}</label>
            <div className="flex items-stretch gap-2">
              <span className="inline-flex items-center px-3 rounded-xl bg-ink-50 dark:bg-night-600 font-bold">
                {valueSuffix}
              </span>
              <input
                type="number"
                min={0}
                step={type === 'pctUp' || type === 'pctDown' ? 0.5 : 0.05}
                className="input num font-semibold"
                value={value || ''}
                onChange={(e) => setValue(parseFloat(e.target.value || '0'))}
                required
              />
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="label">Repeat</label>
            <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-ink-50 dark:bg-night-600/60">
              {([
                { id: 'once',  label: 'One-time' },
                { id: 'every', label: 'Every cross' },
                { id: 'daily', label: 'Daily once' },
              ] as { id: AlertFrequency; label: string }[]).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFrequency(f.id)}
                  className={`py-2 text-xs font-semibold rounded-lg transition ${
                    frequency === f.id
                      ? 'bg-white dark:bg-night-700 text-ink-800 dark:text-night-50 shadow-card'
                      : 'text-ink-500 dark:text-night-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cooldown — only when 'every' */}
          {frequency === 'every' && (
            <div>
              <label className="label">Minimum gap (minutes)</label>
              <input
                type="number"
                min={1}
                max={1440}
                className="input num"
                value={cooldownMinutes}
                onChange={(e) => setCooldownMinutes(Math.max(1, parseInt(e.target.value || '5', 10)))}
              />
            </div>
          )}

          {/* Note */}
          <div>
            <label className="label">Note (optional)</label>
            <input
              className="input"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. enter long here"
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Creating…' : '🔔 Create alert'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TypePill({
  active, onClick, tone, label,
}: { active: boolean; onClick: () => void; tone: 'pos' | 'neg'; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-3 text-xs font-bold rounded-xl transition ${
        active
          ? tone === 'pos'
            ? 'bg-pos text-white shadow-card'
            : 'bg-neg text-white shadow-card'
          : 'bg-ink-50 dark:bg-night-600 text-ink-600 dark:text-night-100'
      }`}
    >
      {label}
    </button>
  );
}

export function describeAlert(type: AlertType, value: number): string {
  switch (type) {
    case 'above':   return `goes above ₹${value}`;
    case 'below':   return `drops below ₹${value}`;
    case 'pctUp':   return `moves up ${value}%`;
    case 'pctDown': return `drops ${value}%`;
  }
}
