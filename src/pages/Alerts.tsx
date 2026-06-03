/**
 * Alerts management page.
 *
 *   • Active alerts list (pause / resume / delete inline)
 *   • Triggered + paused alerts collapsed
 *   • "History" tab: every time any alert fired (chronological)
 *   • + button to open the CreateAlertModal
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { useMarket } from '../context/MarketContext';
import {
  deleteAlert,
  updateAlert,
} from '../api/alerts';
import { useAlertsQuery, useAlertEventsQuery } from '../api/queries';
import { invalidate, QueryKey } from '../queryClient';
import { CreateAlertModal, describeAlert } from '../components/CreateAlertModal';
import type { AlertDTO } from '../types';
import { fmtNum } from '../utils/fmt';
import { IconPlus, IconX, IconRefresh } from '../components/icons';

type Tab = 'active' | 'history';

export function AlertsPage() {
  const toast = useToast();
  const { quotes, subscribe, onAlertTriggered } = useMarket();

  const [tab, setTab] = useState<Tab>('active');
  const { data: alerts = [] } = useAlertsQuery();
  const { data: events = [] } = useAlertEventsQuery();
  const [createOpen, setCreateOpen] = useState(false);

  // Refresh whenever a new alert fires (push handler in MarketContext)
  useEffect(
    () => onAlertTriggered(() => invalidate(QueryKey.Alerts, QueryKey.AlertEvents)),
    [onAlertTriggered],
  );

  // Subscribe to all alert symbols so the inline "current price" column is live
  useEffect(() => {
    const syms = Array.from(new Set(alerts.map((a) => a.symbol)));
    if (syms.length) subscribe(syms);
  }, [alerts, subscribe]);

  async function togglePause(a: AlertDTO) {
    try {
      await updateAlert(a._id, { status: a.status === 'active' ? 'paused' : 'active' });
      invalidate(QueryKey.Alerts, QueryKey.AlertEvents);
    } catch (err: any) {
      toast.push({ kind: 'error', message: err.message });
    }
  }

  async function remove(a: AlertDTO) {
    if (!confirm(`Delete alert on ${a.symbol}?`)) return;
    try {
      await deleteAlert(a._id);
      invalidate(QueryKey.Alerts, QueryKey.AlertEvents);
      toast.push({ kind: 'info', message: 'Alert deleted' });
    } catch (err: any) {
      toast.push({ kind: 'error', message: err.message });
    }
  }

  const active = alerts.filter((a) => a.status === 'active');
  const paused = alerts.filter((a) => a.status === 'paused');
  const triggered = alerts.filter((a) => a.status === 'triggered');

  return (
    <div className="space-y-4 lg:space-y-5 px-3 sm:px-0">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Alerts</h1>
          <p className="text-xs text-ink-500 dark:text-night-200">
            {active.length} active · {paused.length} paused · {triggered.length} done
          </p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary btn-sm">
          <IconPlus size={14} /> New alert
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-5 border-b border-ink-100 dark:border-night-500/40">
        {([
          { id: 'active',  label: `Active (${active.length})` },
          { id: 'history', label: `History (${events.length})` },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative pb-2.5 text-sm font-semibold transition ${
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

      {tab === 'active' && (
        <>
          {active.length === 0 && paused.length === 0 && triggered.length === 0 && (
            <div className="card text-sm text-ink-500 dark:text-night-200 text-center py-8">
              No alerts yet. Tap <span className="font-semibold">New alert</span> to add one.
            </div>
          )}

          {(active.length > 0 || paused.length > 0 || triggered.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              {active.length > 0 && (
                <section className="card !p-0 overflow-hidden">
                  <header className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200 border-b border-ink-100 dark:border-night-500/40">
                    Active
                  </header>
                  {active.map((a) => (
                    <AlertRow
                      key={a._id}
                      alert={a}
                      livePrice={quotes[a.symbol]?.price}
                      onToggle={() => togglePause(a)}
                      onDelete={() => remove(a)}
                    />
                  ))}
                </section>
              )}

              {paused.length > 0 && (
                <section className="card !p-0 overflow-hidden">
                  <header className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200 border-b border-ink-100 dark:border-night-500/40">
                    Paused
                  </header>
                  {paused.map((a) => (
                    <AlertRow
                      key={a._id}
                      alert={a}
                      livePrice={quotes[a.symbol]?.price}
                      onToggle={() => togglePause(a)}
                      onDelete={() => remove(a)}
                    />
                  ))}
                </section>
              )}

              {triggered.length > 0 && (
                <section className="card !p-0 overflow-hidden">
                  <header className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200 border-b border-ink-100 dark:border-night-500/40">
                    Triggered
                  </header>
                  {triggered.map((a) => (
                    <AlertRow
                      key={a._id}
                      alert={a}
                      livePrice={quotes[a.symbol]?.price}
                      onToggle={() => togglePause(a)}
                      onDelete={() => remove(a)}
                    />
                  ))}
                </section>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <section className="card !p-0 overflow-hidden">
          {events.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-500 dark:text-night-200">
              No alerts have fired yet.
            </div>
          ) : (
            events.map((e) => (
              <div
                key={e._id}
                className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-ink-100 dark:border-night-500/40"
              >
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand/15 text-accent text-base">
                  🔔
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold tracking-tight">
                    <Link to={`/stock/${encodeURIComponent(e.symbol)}`}>{e.symbol}</Link>
                    <span className="text-ink-500 dark:text-night-200 font-normal text-xs ml-2">
                      {describeAlert(e.type, e.conditionValue)}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-500 dark:text-night-200">
                    Triggered @ <span className="num font-semibold">{fmtNum(e.triggerPrice)}</span>{' '}
                    on {new Date(e.triggeredAt).toLocaleString()}
                  </div>
                  {e.note && <div className="text-[11px] text-ink-400 dark:text-night-200 italic mt-0.5">{e.note}</div>}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      <CreateAlertModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => invalidate(QueryKey.Alerts, QueryKey.AlertEvents)}
      />
    </div>
  );
}

function AlertRow({
  alert: a, livePrice, onToggle, onDelete,
}: {
  alert: AlertDTO;
  livePrice?: number;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-ink-100 dark:border-night-500/40">
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-base ${
        a.status === 'active'    ? 'bg-pos/15 text-pos' :
        a.status === 'triggered' ? 'bg-brand/15 text-accent' :
                                    'bg-ink-100 dark:bg-night-500 text-ink-500'
      }`}>
        🔔
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link to={`/stock/${encodeURIComponent(a.symbol)}`} className="font-semibold tracking-tight">
            {a.symbol}
          </Link>
          <span className="tag-mute !text-[9px]">{a.frequency.toUpperCase()}</span>
          {a.triggerCount > 0 && (
            <span className="tag-info !text-[9px]">{a.triggerCount}×</span>
          )}
        </div>
        <div className="text-xs text-ink-600 dark:text-night-100">
          {describeAlert(a.type, a.value)}
          {livePrice != null && (
            <span className="num text-ink-500 dark:text-night-200 ml-1">
              · now {fmtNum(livePrice)}
            </span>
          )}
        </div>
        {a.note && <div className="text-[11px] text-ink-400 dark:text-night-200 italic">{a.note}</div>}
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={onToggle}
          className="btn-sm btn-ghost"
          aria-label={a.status === 'active' ? 'Pause' : 'Resume'}
        >
          {a.status === 'active' ? '⏸' : <IconRefresh size={12} />}
        </button>
        <button
          onClick={onDelete}
          className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-neg/10 text-neg hover:bg-neg/20"
          aria-label="Delete"
        >
          <IconX size={12} />
        </button>
      </div>
    </div>
  );
}
