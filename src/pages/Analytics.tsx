/**
 * Performance / Analytics dashboard.
 *
 * Visualises aggregated trading performance from
 * `GET /api/analytics/performance` — a date-range filter at the top, a hero
 * Net-P&L card, a stat grid, an equity-curve chart (lightweight-charts) and a
 * daily-P&L calendar heatmap built from the per-day rows.
 *
 * Pure REST read — no WebSocket / live-data / order logic here.
 */
import { useMemo, useState } from 'react';
import { usePerformanceQuery } from '../api/queries';
import type { PerformanceDay, PerformanceStats } from '../api/analytics';
import { istToday, istShift, istRangeMs, istRangeLabel } from '../utils/istDate';
import { fmtINR, fmtNum, classPnL } from '../utils/fmt';
import { CenteredSpinner } from '../components/Spinner';
import { EquityCurveChart } from '../components/analytics/EquityCurveChart';
import { PnlHeatmap } from '../components/analytics/PnlHeatmap';

/** Range presets. `null` days = all-time (no from/to). */
type Preset = 'all' | 'today' | '7d' | '30d';

export function Analytics() {
  // Default to ALL time → no from/to sent.
  const [preset, setPreset] = useState<Preset>('all');
  // Custom From/To (used once the user edits a date input). Empty until then.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Resolve the active IST date span. `null` = all-time.
  const span = useMemo<{ from: string; to: string } | null>(() => {
    const today = istToday();
    if (from && to) return { from, to };
    switch (preset) {
      case 'today': return { from: today, to: today };
      case '7d':    return { from: istShift(today, -6),  to: today };
      case '30d':   return { from: istShift(today, -29), to: today };
      case 'all':
      default:      return null;
    }
  }, [preset, from, to]);

  // Epoch-ms bounds for the query (undefined ⇒ all-time).
  const ms = useMemo(() => (span ? istRangeMs(span.from, span.to) : null), [span]);
  const { data, isLoading, isError, refetch } = usePerformanceQuery(ms?.from, ms?.to);

  const rangeLabel = span ? istRangeLabel(span.from, span.to) : 'All time';

  // Editing either date input switches off the preset highlight and keeps
  // From ≤ To no matter which side moved.
  const onFrom = (d: string) => {
    setPreset('all');
    setFrom(d);
    if (d && to && d > to) setTo(d);
  };
  const onTo = (d: string) => {
    setPreset('all');
    setTo(d);
    if (d && from && d < from) setFrom(d);
  };
  const applyPreset = (p: Preset) => {
    setPreset(p);
    setFrom('');
    setTo('');
  };

  return (
    <div className="space-y-4 lg:space-y-5 px-3 sm:px-0">
      {/* ── Date-range filter ── */}
      <div className="card !p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200">From</label>
          <input
            type="date"
            max={to || istToday()}
            value={from}
            onChange={(e) => onFrom(e.target.value)}
            className="input !w-auto !py-1.5"
          />
          <label className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200">To</label>
          <input
            type="date"
            max={istToday()}
            value={to}
            onChange={(e) => onTo(e.target.value)}
            className="input !w-auto !py-1.5"
          />
          <span className="ml-auto text-xs font-semibold text-ink-600 dark:text-night-100">
            {rangeLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            { id: 'all',   label: 'All' },
            { id: '30d',   label: '30D' },
            { id: '7d',    label: '7D' },
            { id: 'today', label: 'Today' },
          ] as { id: Preset; label: string }[]).map((p) => {
            const active = preset === p.id && !(from && to);
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`btn-sm ${active ? 'bg-brand text-white' : 'bg-ink-50 dark:bg-night-600 text-ink-600 dark:text-night-100'}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      {isLoading ? (
        <div className="card !p-8">
          <CenteredSpinner label="Loading performance…" />
        </div>
      ) : isError ? (
        <div className="card !p-8 flex flex-col items-center text-center">
          <h3 className="text-base font-bold tracking-tight">Couldn't load analytics</h3>
          <p className="text-xs text-ink-500 dark:text-night-200 mt-1">Something went wrong fetching your performance.</p>
          <button onClick={() => refetch()} className="btn-sm mt-4 bg-brand text-white">Retry</button>
        </div>
      ) : !data || data.stats.totalTrades === 0 ? (
        <EmptyState rangeLabel={rangeLabel} />
      ) : (
        <>
          <HeroCard stats={data.stats} rangeLabel={rangeLabel} />
          <StatGrid stats={data.stats} />

          {/* Equity curve */}
          <section className="card !p-4">
            <SectionTitle title="Equity curve" subtitle="Cumulative net P&L" />
            <div className="mt-3">
              <EquityCurveChart data={data.equityCurve} />
            </div>
          </section>

          {/* Daily P&L heatmap */}
          <section className="card !p-4">
            <SectionTitle title="Daily P&L" subtitle="Green = profit · Red = loss" />
            <div className="mt-3">
              <PnlHeatmap days={data.days} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Hero card ───────────────────────── */
function HeroCard({ stats, rangeLabel }: { stats: PerformanceStats; rangeLabel: string }) {
  const net = stats.netPnL;
  const tone = net > 0 ? 'pos' : net < 0 ? 'neg' : 'flat';
  const toneBar =
    tone === 'pos' ? 'bg-pos/10 border-pos'
    : tone === 'neg' ? 'bg-neg/10 border-neg'
    : 'bg-ink-100 dark:bg-night-600 border-ink-300 dark:border-night-400';

  return (
    <div className={`card !p-4 border-l-4 ${toneBar}`}>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200">
        Net P&amp;L · {rangeLabel}
      </div>
      <div className={`num text-3xl sm:text-4xl font-bold tracking-tight mt-1 ${classPnL(net)}`}>
        {fmtINR(net)}
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-ink-100 dark:border-night-500/40">
        <HeroStat label="Win rate" value={`${fmtNum(stats.winRate, 1)}%`} />
        <HeroStat
          label="Profit factor"
          value={stats.profitFactor == null ? '—' : fmtNum(stats.profitFactor, 2)}
        />
        <HeroStat label="Max drawdown" value={fmtINR(stats.maxDrawdown)} tone="neg" />
      </div>
    </div>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: string; tone?: 'neg' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-night-200">{label}</div>
      <div className={`num text-base font-bold tracking-tight mt-0.5 ${tone === 'neg' ? 'text-neg' : ''}`}>
        {value}
      </div>
    </div>
  );
}

/* ───────────────────────── Stat grid ───────────────────────── */
function StatGrid({ stats }: { stats: PerformanceStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <StatCard label="Total trades" value={fmtNum(stats.totalTrades, 0)} />
      <StatCard label="Wins / Losses" value={`${fmtNum(stats.wins, 0)} / ${fmtNum(stats.losses, 0)}`} />
      <StatCard label="Avg win" value={fmtINR(stats.avgWin)} tone="pos" />
      <StatCard label="Avg loss" value={fmtINR(stats.avgLoss)} tone="neg" />
      <StatCard label="Turnover" value={fmtINR(stats.turnover)} />
      <StatCard label="Charges" value={fmtINR(stats.charges)} tone="neg" />
      <DayStatCard label="Best day" day={stats.bestDay} />
      <DayStatCard label="Worst day" day={stats.worstDay} />
      <StatCard label="Active days" value={fmtNum(stats.activeDays, 0)} />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const toneClass = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : '';
  return (
    <div className="card !p-3.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-night-200">{label}</div>
      <div className={`num text-sm font-bold tracking-tight mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function DayStatCard({ label, day }: { label: string; day: { date: string; net: number } | null }) {
  return (
    <div className="card !p-3.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-night-200">{label}</div>
      {day ? (
        <>
          {/* Colour by the day's ACTUAL sign — "best day" can still be a loss. */}
          <div className={`num text-sm font-bold tracking-tight mt-1 ${classPnL(day.net)}`}>
            {fmtINR(day.net)}
          </div>
          <div className="text-[10px] text-ink-500 dark:text-night-200 mt-0.5">{day.date}</div>
        </>
      ) : (
        <div className="num text-sm font-bold tracking-tight mt-1 text-ink-400 dark:text-night-200">—</div>
      )}
    </div>
  );
}

/* ───────────────────────── Helpers ───────────────────────── */
function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="text-sm font-bold tracking-tight">{title}</h3>
      {subtitle && <span className="text-[11px] text-ink-500 dark:text-night-200">{subtitle}</span>}
    </div>
  );
}

function EmptyState({ rangeLabel }: { rangeLabel: string }) {
  return (
    <div className="card !p-8 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-ink-50 dark:bg-night-600 flex items-center justify-center mb-3">
        <span className="text-2xl">📊</span>
      </div>
      <h3 className="text-base font-bold tracking-tight">No trades yet</h3>
      <p className="text-xs text-ink-500 dark:text-night-200 mt-1 max-w-xs">
        No closed trades for <span className="font-semibold">{rangeLabel}</span>. Your performance shows up here once you book some P&amp;L.
      </p>
    </div>
  );
}

// Re-export the per-day type for child components that import from the page if needed.
export type { PerformanceDay };
