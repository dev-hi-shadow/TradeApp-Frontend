/**
 * Daily P&L calendar heatmap.
 *
 * Renders one month grid per month that contains trading days. Each day cell is
 * shaded by its net P&L — green for profit, red for loss, neutral for no-trade
 * days. Hovering a cell shows date + net P&L + trade count via the native
 * `title` tooltip. CSS grid, 7 columns Mon–Sun.
 *
 * Built purely from the `days` array (looked up by 'YYYY-MM-DD'); no time-zone
 * math beyond plain calendar arithmetic on the IST date strings.
 */
import { useMemo } from 'react';
import type { PerformanceDay } from '../../api/analytics';
import { fmtINR } from '../../utils/fmt';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MonthBlock {
  year: number;
  month: number; // 0-indexed
  /** Day-of-month (1..N) → row for that calendar day, when a trade happened. */
  byDom: Map<number, PerformanceDay>;
  daysInMonth: number;
  /** Mon=0 … Sun=6 offset of the 1st of the month. */
  firstWeekday: number;
}

export function PnlHeatmap({ days }: { days: PerformanceDay[] }) {
  const months = useMemo(() => buildMonths(days), [days]);

  // Shade intensity scales against the largest absolute net in the set so a
  // big day pops and small days stay subtle.
  const maxAbs = useMemo(
    () => days.reduce((m, d) => Math.max(m, Math.abs(d.net)), 0) || 1,
    [days],
  );

  if (days.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-sm text-ink-500 dark:text-night-200">
        No trades yet
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {months.map((m) => (
        <MonthGrid key={`${m.year}-${m.month}`} block={m} maxAbs={maxAbs} />
      ))}
      <Legend />
    </div>
  );
}

function MonthGrid({ block, maxAbs }: { block: MonthBlock; maxAbs: number }) {
  // Leading blanks so the 1st lands under its weekday, then the real days.
  const cells: ({ dom: number; row: PerformanceDay | undefined } | null)[] = [];
  for (let i = 0; i < block.firstWeekday; i++) cells.push(null);
  for (let dom = 1; dom <= block.daysInMonth; dom++) {
    cells.push({ dom, row: block.byDom.get(dom) });
  }

  return (
    <div>
      <div className="text-xs font-bold tracking-tight mb-2">
        {MONTH_NAMES[block.month]} {block.year}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] uppercase tracking-wider font-semibold text-ink-400 dark:text-night-300 text-center">
            {w}
          </div>
        ))}
        {cells.map((c, i) =>
          c === null ? (
            <div key={`b-${i}`} />
          ) : (
            <DayCell key={c.dom} dom={c.dom} row={c.row} maxAbs={maxAbs} dateStr={fmtDate(block.year, block.month, c.dom)} />
          ),
        )}
      </div>
    </div>
  );
}

function DayCell({
  dom, row, maxAbs, dateStr,
}: { dom: number; row: PerformanceDay | undefined; maxAbs: number; dateStr: string }) {
  const net = row?.net ?? 0;
  const traded = !!row && row.trades > 0;
  const style = traded ? shadeStyle(net, maxAbs) : undefined;
  const title = traded
    ? `${dateStr} · ${fmtINR(net)} · ${row!.trades} trade${row!.trades === 1 ? '' : 's'}`
    : `${dateStr} · No trades`;

  return (
    <div
      title={title}
      style={style}
      className={`aspect-square rounded-md flex items-center justify-center text-[11px] font-semibold num
        ${traded
          ? 'text-ink-900 dark:text-white'
          : 'bg-ink-50 dark:bg-night-700/50 text-ink-400 dark:text-night-300'}`}
    >
      {dom}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-ink-500 dark:text-night-200 pt-1">
      <div className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(235,91,60,0.85)' }} />
        <span>Loss</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded-sm bg-ink-50 dark:bg-night-700/50 border border-ink-100 dark:border-night-500/40" />
        <span>No trade</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(0,179,134,0.85)' }} />
        <span>Profit</span>
      </div>
    </div>
  );
}

/* ───────────────────────── helpers ───────────────────────── */

/** Background shade for a traded day, intensity ∝ |net| / maxAbs. */
function shadeStyle(net: number, maxAbs: number): React.CSSProperties {
  const intensity = Math.min(1, Math.abs(net) / maxAbs);
  // Floor the alpha so even a tiny day is clearly tinted.
  const alpha = 0.2 + intensity * 0.65;
  const rgb = net >= 0 ? '0,179,134' : '235,91,60';
  return { backgroundColor: `rgba(${rgb},${alpha.toFixed(2)})` };
}

/** Group the per-day rows into calendar-month blocks spanning the data range. */
function buildMonths(days: PerformanceDay[]): MonthBlock[] {
  if (days.length === 0) return [];
  // `days` is ascending — first/last bound the span we render.
  const first = parseDate(days[0].date);
  const last = parseDate(days[days.length - 1].date);

  // Index rows by 'YYYY-MM' → (dom → row).
  const index = new Map<string, Map<number, PerformanceDay>>();
  for (const d of days) {
    const { year, month, dom } = parseDate(d.date);
    const key = `${year}-${month}`;
    let bucket = index.get(key);
    if (!bucket) { bucket = new Map(); index.set(key, bucket); }
    bucket.set(dom, d);
  }

  const blocks: MonthBlock[] = [];
  let y = first.year;
  let m = first.month;
  while (y < last.year || (y === last.year && m <= last.month)) {
    const key = `${y}-${m}`;
    blocks.push({
      year: y,
      month: m,
      byDom: index.get(key) ?? new Map(),
      daysInMonth: new Date(y, m + 1, 0).getDate(),
      firstWeekday: mondayFirst(new Date(y, m, 1).getDay()),
    });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return blocks;
}

/** Convert JS getDay() (Sun=0) to a Mon=0 … Sun=6 index. */
function mondayFirst(jsDay: number): number {
  return (jsDay + 6) % 7;
}

function parseDate(s: string): { year: number; month: number; dom: number } {
  const [y, mo, d] = s.split('-').map(Number);
  return { year: y, month: mo - 1, dom: d };
}

function fmtDate(year: number, month: number, dom: number): string {
  const dd = String(dom).padStart(2, '0');
  return `${dd} ${MONTH_NAMES[month].slice(0, 3)} ${year}`;
}
