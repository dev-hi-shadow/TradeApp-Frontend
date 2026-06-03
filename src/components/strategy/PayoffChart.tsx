/**
 * PayoffChart — a clean, theme-aware SVG line chart of strategy P&L-at-expiry
 * versus the underlying price. Deliberately NOT lightweight-charts: that lib is
 * time-series; a payoff curve is value-vs-price.
 *
 *   • x-axis = underlying price across the sampled range
 *   • y-axis = combined P&L (rupees)
 *   • zero line drawn across the chart
 *   • the curve is two-coloured: green where pnl ≥ 0, red where pnl < 0
 *     (achieved with a clip-path split at the zero line, no per-segment paths)
 *   • a vertical marker at the live spot
 *   • dots + labels at each breakeven
 *   • hover crosshair showing (price → P&L)
 */
import { useMemo, useRef, useState } from 'react';
import type { PayoffPoint } from '../../utils/payoff';
import { fmtINR, fmtNum } from '../../utils/fmt';

const PROFIT = '#00b386';
const LOSS = '#eb5b3c';

interface Props {
  points: PayoffPoint[];
  spot: number;
  breakevens: number[];
  height?: number;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 12 };
const VIEW_W = 600; // logical width; SVG scales responsively via viewBox

export function PayoffChart({ points, spot, breakevens, height = 240 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; pt: PayoffPoint } | null>(null);

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const xs = points.map((p) => p.s);
    const ys = points.map((p) => p.pnl);
    const minX = xs[0];
    const maxX = xs[xs.length - 1];
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    // Always include the zero line and add a little headroom.
    minY = Math.min(minY, 0);
    maxY = Math.max(maxY, 0);
    const spanY = maxY - minY || 1;
    minY -= spanY * 0.08;
    maxY += spanY * 0.08;

    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const xAt = (s: number) =>
      PAD.left + ((s - minX) / (maxX - minX || 1)) * plotW;
    const yAt = (v: number) =>
      PAD.top + (1 - (v - minY) / (maxY - minY || 1)) * plotH;
    // Inverse of xAt: viewBox-x → underlying price (clamped to the domain).
    const sAtX = (vx: number) => {
      const t = (vx - PAD.left) / (plotW || 1);
      return minX + Math.min(1, Math.max(0, t)) * (maxX - minX);
    };
    // Exact P&L at any price via linear interpolation between samples.
    // The payoff-at-expiry curve is piecewise-linear, so this is exact, not an
    // approximation — and it lets the crosshair glide instead of stair-stepping.
    const last = points.length - 1;
    const pnlAt = (s: number) => {
      const frac = ((s - minX) / (maxX - minX || 1)) * last;
      const i = Math.min(last - 1, Math.max(0, Math.floor(frac)));
      const t = frac - i;
      return points[i].pnl + t * (points[i + 1].pnl - points[i].pnl);
    };

    const line = points.map((p) => `${xAt(p.s)},${yAt(p.pnl)}`).join(' ');
    const zeroY = yAt(0);

    return { xs, minX, maxX, minY, maxY, xAt, yAt, sAtX, pnlAt, line, zeroY, plotH };
  }, [points, height]);

  if (!geom) return null;

  // Snap the readout to a nearby kink (spot / strike-driven breakeven) so the
  // visually important prices feel crisp, while everything else glides freely.
  const SNAP_PX = 6;
  const anchors = [spot, ...breakevens].filter((a) => a >= geom.minX && a <= geom.maxX);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || !geom) return;
    const rect = svg.getBoundingClientRect();
    // Map the pointer's client x into viewBox units (clamped to the plot area).
    const raw = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    let vx = Math.min(VIEW_W - PAD.right, Math.max(PAD.left, raw));
    // Magnet snap to the closest anchor within SNAP_PX (in viewBox units).
    for (const a of anchors) {
      if (Math.abs(geom.xAt(a) - vx) <= SNAP_PX) { vx = geom.xAt(a); break; }
    }
    const s = geom.sAtX(vx);
    setHover({ x: vx, pt: { s, pnl: geom.pnlAt(s) } });
  }

  const zeroY = geom.zeroY;

  return (
    <div className="relative w-full select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        className="block touch-none cursor-crosshair"
      >
        <defs>
          {/* Split the plot at the zero line: top half = profit, bottom = loss. */}
          <clipPath id="payoff-profit-clip">
            <rect x="0" y="0" width={VIEW_W} height={zeroY} />
          </clipPath>
          <clipPath id="payoff-loss-clip">
            <rect x="0" y={zeroY} width={VIEW_W} height={height - zeroY} />
          </clipPath>
          <linearGradient id="payoff-profit-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PROFIT} stopOpacity="0.20" />
            <stop offset="100%" stopColor={PROFIT} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="payoff-loss-fill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={LOSS} stopOpacity="0.20" />
            <stop offset="100%" stopColor={LOSS} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Filled area, clipped into profit / loss halves */}
        <polygon
          points={`${PAD.left},${zeroY} ${geom.line} ${VIEW_W - PAD.right},${zeroY}`}
          fill="url(#payoff-profit-fill)"
          clipPath="url(#payoff-profit-clip)"
        />
        <polygon
          points={`${PAD.left},${zeroY} ${geom.line} ${VIEW_W - PAD.right},${zeroY}`}
          fill="url(#payoff-loss-fill)"
          clipPath="url(#payoff-loss-clip)"
        />

        {/* Zero line */}
        <line
          x1={PAD.left}
          x2={VIEW_W - PAD.right}
          y1={zeroY}
          y2={zeroY}
          className="stroke-ink-300 dark:stroke-night-400"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />

        {/* The payoff curve — two colours via the same clip split */}
        <polyline
          points={geom.line}
          fill="none"
          stroke={PROFIT}
          strokeWidth={2}
          clipPath="url(#payoff-profit-clip)"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={geom.line}
          fill="none"
          stroke={LOSS}
          strokeWidth={2}
          clipPath="url(#payoff-loss-clip)"
          vectorEffect="non-scaling-stroke"
        />

        {/* Spot marker */}
        {spot >= geom.minX && spot <= geom.maxX && (
          <line
            x1={geom.xAt(spot)}
            x2={geom.xAt(spot)}
            y1={PAD.top}
            y2={height - PAD.bottom}
            className="stroke-brand"
            strokeWidth={1}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Breakeven dots */}
        {breakevens
          .filter((b) => b >= geom.minX && b <= geom.maxX)
          .map((b, i) => (
            <circle
              key={i}
              cx={geom.xAt(b)}
              cy={zeroY}
              r={3.5}
              className="fill-white dark:fill-night-900 stroke-ink-500 dark:stroke-night-200"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}

        {/* Hover crosshair */}
        {hover && (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD.top}
              y2={height - PAD.bottom}
              className="stroke-ink-400 dark:stroke-night-300"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={hover.x}
              cy={geom.yAt(hover.pt.pnl)}
              r={3.5}
              fill={hover.pt.pnl >= 0 ? PROFIT : LOSS}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {/* x-axis labels (HTML overlay so text isn't stretched by the viewBox) */}
      <div className="flex justify-between px-2 -mt-4 text-[10px] num text-ink-400 dark:text-night-300 pointer-events-none">
        <span>{fmtNum(geom.minX, 0)}</span>
        <span className="text-brand font-semibold">{fmtNum(spot, 0)}</span>
        <span>{fmtNum(geom.maxX, 0)}</span>
      </div>

      {/* Breakeven price labels */}
      {breakevens.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 mt-1 text-[10px] text-ink-500 dark:text-night-200">
          {breakevens.map((b, i) => (
            <span key={i}>
              BE: <span className="num font-semibold">{fmtNum(b, 0)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Hover tooltip */}
      {hover && (
        <div
          className="absolute top-1 px-2 py-1 rounded-lg bg-white dark:bg-night-700 border border-ink-100 dark:border-night-500/40 shadow-card text-[11px] num pointer-events-none whitespace-nowrap"
          style={{
            left: `${(hover.x / VIEW_W) * 100}%`,
            transform:
              hover.x > VIEW_W / 2 ? 'translateX(-100%)' : 'translateX(0)',
          }}
        >
          <span className="text-ink-500 dark:text-night-200">
            {fmtNum(hover.pt.s, 0)}
          </span>{' '}
          <span className={hover.pt.pnl >= 0 ? 'text-pos font-semibold' : 'text-neg font-semibold'}>
            {hover.pt.pnl >= 0 ? '+' : ''}
            {fmtINR(hover.pt.pnl)}
          </span>
        </div>
      )}
    </div>
  );
}
