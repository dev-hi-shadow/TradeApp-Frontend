/**
 * Overview tab for the stock detail page.
 * Modelled on Groww's Performance + Support & Resistance layout.
 *
 * "Support and Resistance" levels are classic Camarilla pivots
 * computed from the previous session's OHLC:
 *   R1 = C + 1.1 × (H - L) / 12
 *   R2 = C + 1.1 × (H - L) / 6
 *   R3 = C + 1.1 × (H - L) / 4
 *   S1 = C - 1.1 × (H - L) / 12
 *   S2 = C - 1.1 × (H - L) / 6
 *   S3 = C - 1.1 × (H - L) / 4
 *   Pivot = (H + L + C) / 3
 */
import type { Snapshot } from '../api/market';
import { fmtNum } from '../utils/fmt';
import { CenteredSpinner } from './Spinner';

interface Props {
  snap: Snapshot | null;
  livePrice: number;
}

export function StockOverview({ snap, livePrice }: Props) {
  if (!snap) {
    return (
      <div className="card !p-5">
        <CenteredSpinner label="Loading overview…" />
      </div>
    );
  }

  const hasW52 = snap.weekHigh52 && snap.weekLow52 && snap.weekHigh52 > snap.weekLow52;
  const pivots = computePivots(snap.high, snap.low, snap.previousClose);
  const showPivots = pivots && snap.high > 0 && snap.low > 0;

  return (
    <div className="space-y-4">
      {/* Performance card */}
      <section className="card !p-5">
        <Header title="Performance" />

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4 mt-4">
          <div className="space-y-5">
            <RangeRow
              loLabel="Today's Low"
              hiLabel="Today's High"
              low={snap.low}
              high={snap.high}
              current={livePrice}
            />
            {hasW52 && (
              <RangeRow
                loLabel="52W Low"
                hiLabel="52W High"
                low={snap.weekLow52!}
                high={snap.weekHigh52!}
                current={livePrice}
              />
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:border-l sm:border-ink-100 sm:dark:border-night-500/40 sm:pl-4">
            <Stat label="Open" value={fmtNum(snap.open)} />
            <Stat label="Prev. Close" value={fmtNum(snap.previousClose)} />
          </div>
        </div>
      </section>

      {/* Support and Resistance */}
      {showPivots && pivots && (
        <section className="card !p-5">
          <Header title="Support and Resistance" />
          <div className="mt-3 rounded-xl border border-ink-100 dark:border-night-500/40 overflow-hidden">
            {/* Resistances (above price) */}
            {(['R3', 'R2', 'R1'] as const).map((k) => (
              <PivotRow key={k} label={k} value={pivots[k]} />
            ))}
            {/* Current price + Pivot pill in the middle */}
            <div className="relative py-2.5 border-y border-ink-100 dark:border-night-500/40 bg-ink-50/60 dark:bg-night-700/40">
              <div className="flex flex-col items-center gap-1">
                <span className="px-3 py-0.5 rounded-full bg-ink-700 dark:bg-night-50 text-white dark:text-night-700 text-[10px] font-bold tracking-wider num">
                  PRICE {fmtNum(livePrice)}
                </span>
                <span className="px-3 py-0.5 rounded-full bg-ink-100 dark:bg-night-500 text-ink-700 dark:text-night-50 text-[10px] font-bold tracking-wider num">
                  PIVOT {fmtNum(pivots.Pivot)}
                </span>
              </div>
            </div>
            {/* Supports (below price) */}
            {(['S1', 'S2', 'S3'] as const).map((k) => (
              <PivotRow key={k} label={k} value={pivots[k]} />
            ))}
          </div>
        </section>
      )}

      {/* Market depth (top 5 bid/ask) — Angel One returns this in FULL mode */}
      {snap.depth && (snap.depth.buy?.length || snap.depth.sell?.length) ? (
        <MarketDepth depth={snap.depth} />
      ) : null}

      {/* Auxiliary stats */}
      {(snap.volume || snap.upperCircuit || snap.openInterest) ? (
        <section className="card !p-5">
          <Header title="Other Stats" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {snap.volume ? <Stat label="Volume" value={snap.volume.toLocaleString('en-IN')} /> : null}
            {snap.avgPrice ? <Stat label="Avg Price" value={fmtNum(snap.avgPrice)} /> : null}
            {snap.upperCircuit ? <Stat label="Upper Circuit" value={fmtNum(snap.upperCircuit)} tone="pos" /> : null}
            {snap.lowerCircuit ? <Stat label="Lower Circuit" value={fmtNum(snap.lowerCircuit)} tone="neg" /> : null}
            {snap.openInterest ? <Stat label="Open Interest" value={snap.openInterest.toLocaleString('en-IN')} /> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <h3 className="text-base font-bold tracking-tight">{title}</h3>
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-ink-400 dark:text-night-200 border border-ink-200 dark:border-night-400"
        title="Info"
      >
        i
      </span>
    </div>
  );
}

function RangeRow({
  loLabel, hiLabel, low, high, current,
}: {
  loLabel: string;
  hiLabel: string;
  low: number;
  high: number;
  current: number;
}) {
  const pct = high === low ? 50 : Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs text-ink-500 dark:text-night-200">{loLabel}</div>
          <div className="num font-semibold">{fmtNum(low)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-500 dark:text-night-200">{hiLabel}</div>
          <div className="num font-semibold">{fmtNum(high)}</div>
        </div>
      </div>
      <div className="relative h-1 mt-2 rounded-full bg-ink-100 dark:bg-night-500/60">
        <div
          className="absolute -top-1 w-0 h-0"
          style={{
            left: `calc(${pct}% - 5px)`,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `6px solid currentColor`,
          }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div>
      <div className="text-xs text-ink-500 dark:text-night-200">{label}</div>
      <div
        className={`num text-sm font-semibold ${
          tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function PivotRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b last:border-b-0 border-ink-100 dark:border-night-500/40">
      <span className="text-sm text-ink-500 dark:text-night-200 font-semibold">{label}</span>
      <span className="num font-semibold">{fmtNum(value)}</span>
    </div>
  );
}

/**
 * Top 5 bid / ask depth table. Each side renders with a horizontal
 * cumulative-quantity bar growing from the inside (best price) outward,
 * normalised against the larger total of the two sides — gives an
 * at-a-glance read of buyer vs. seller pressure.
 *
 * Angel One's FULL-mode quote returns up to 5 levels per side as
 * `{ price, quantity, orders }`. We tolerate any of the variant key names
 * brokers commonly use.
 */
function MarketDepth({ depth }: { depth: { buy: any[]; sell: any[] } }) {
  const norm = (row: any) => ({
    price: Number(row?.price ?? row?.rate ?? 0),
    qty:   Number(row?.quantity ?? row?.qty ?? row?.quantityTraded ?? 0),
    orders: Number(row?.orders ?? row?.no_of_orders ?? row?.noOfOrders ?? 0),
  });
  const buys  = (depth.buy  || []).slice(0, 5).map(norm).filter((r) => r.price > 0);
  const sells = (depth.sell || []).slice(0, 5).map(norm).filter((r) => r.price > 0);
  if (!buys.length && !sells.length) return null;

  // Cumulative depth — visualises iceberg pressure (level 1 + level 2 + …).
  const cumBuys = buys.map((_, i) => buys.slice(0, i + 1).reduce((s, r) => s + r.qty, 0));
  const cumSells = sells.map((_, i) => sells.slice(0, i + 1).reduce((s, r) => s + r.qty, 0));
  const maxCum = Math.max(
    cumBuys.length ? cumBuys[cumBuys.length - 1] : 0,
    cumSells.length ? cumSells[cumSells.length - 1] : 0,
    1,
  );

  const totalBuy  = buys.reduce((s, r) => s + r.qty, 0);
  const totalSell = sells.reduce((s, r) => s + r.qty, 0);

  return (
    <section className="card !p-5">
      <Header title="Market Depth" />
      <div className="grid grid-cols-2 gap-3 mt-3">
        {/* Bids */}
        <div>
          <div className="grid grid-cols-3 text-[10px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200 pb-1.5 border-b border-ink-100 dark:border-night-500/40">
            <span>Bid</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Orders</span>
          </div>
          {buys.map((r, i) => (
            <DepthRow key={i} side="buy" price={r.price} qty={r.qty} orders={r.orders} barPct={(cumBuys[i] / maxCum) * 100} />
          ))}
        </div>
        {/* Asks */}
        <div>
          <div className="grid grid-cols-3 text-[10px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200 pb-1.5 border-b border-ink-100 dark:border-night-500/40">
            <span>Ask</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Orders</span>
          </div>
          {sells.map((r, i) => (
            <DepthRow key={i} side="sell" price={r.price} qty={r.qty} orders={r.orders} barPct={(cumSells[i] / maxCum) * 100} />
          ))}
        </div>
      </div>
      {/* Totals strip */}
      <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-ink-100 dark:border-night-500/40">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-500 dark:text-night-200">Total Bid Qty</span>
          <span className="num font-semibold text-pos">{totalBuy.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-500 dark:text-night-200">Total Ask Qty</span>
          <span className="num font-semibold text-neg">{totalSell.toLocaleString('en-IN')}</span>
        </div>
      </div>
    </section>
  );
}

function DepthRow({
  side, price, qty, orders, barPct,
}: { side: 'buy' | 'sell'; price: number; qty: number; orders: number; barPct: number }) {
  const tone = side === 'buy' ? 'text-pos' : 'text-neg';
  // Buy side: bar fills right-to-left (best bid grows outward). Sell side:
  // bar fills left-to-right. Same logic Angel/Zerodha/etc render.
  const barColor = side === 'buy' ? 'bg-pos/10' : 'bg-neg/10';
  const justify = side === 'buy' ? 'right' : 'left';
  return (
    <div className="relative grid grid-cols-3 text-xs py-1.5 border-b last:border-b-0 border-ink-50 dark:border-night-600/40">
      <div
        className={`absolute inset-y-0 ${justify === 'right' ? 'right-0' : 'left-0'} ${barColor} rounded-sm`}
        style={{ width: `${Math.min(100, Math.max(0, barPct))}%` }}
      />
      <span className={`num relative ${tone} font-semibold`}>{price.toFixed(2)}</span>
      <span className="num relative text-right">{qty.toLocaleString('en-IN')}</span>
      <span className="num relative text-right text-ink-500 dark:text-night-200">{orders}</span>
    </div>
  );
}

function computePivots(high: number, low: number, close: number):
  | { R3: number; R2: number; R1: number; Pivot: number; S1: number; S2: number; S3: number }
  | null
{
  if (!high || !low || !close || high <= low) return null;
  const range = high - low;
  return {
    R3: close + (1.1 * range) / 4,
    R2: close + (1.1 * range) / 6,
    R1: close + (1.1 * range) / 12,
    Pivot: (high + low + close) / 3,
    S1: close - (1.1 * range) / 12,
    S2: close - (1.1 * range) / 6,
    S3: close - (1.1 * range) / 4,
  };
}
