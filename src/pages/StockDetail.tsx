import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  LineStyle,
} from 'lightweight-charts';
import { getTodaySessionRange, marketFor, useMarket } from '../context/MarketContext';
import { useMarketStatus } from '../hooks/useMarketStatus';
import { useTheme } from '../context/ThemeContext';
import { type Period } from '../api/market';
import { useSnapshotQuery, useHistoryQuery } from '../api/queries';
import { OrderModal } from '../components/OrderModal';
import { StockOverview } from '../components/StockOverview';
import { TerminalChart } from '../components/TerminalChart';
import { CreateAlertModal } from '../components/CreateAlertModal';
import { StockLogo } from '../components/StockLogo';
import {
  IconArrowDown,
  IconArrowUp,
  IconChart,
  IconLink,
  IconList,
} from '../components/icons';
import { classPnL, fmtNum, fmtPct } from '../utils/fmt';
import { pushRecentlyViewed } from '../utils/recentlyViewed';
import type { Candle } from '../types';

const POS = '#00b386';
const NEG = '#eb5b3c';

const PERIODS: Period[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'];

type ChartType = 'line' | 'candle';

/**
 * Reserve 15 minutes of empty space at the right edge of every 1D chart.
 * This represents the next session's pre-open settle window (NSE pre-open
 * 09:00–09:15 IST) so the visual rhythm carries over to tomorrow.
 */
const SESSION_TRAIL_SEC = 15 * 60;

/**
 * Symbols that are NOT directly tradable on Indian exchanges — only via
 * F&O. Sources:
 *   • NSE: indices (NIFTY 50, BANK NIFTY, FINNIFTY, MIDCPNIFTY, NIFTYNXT50,
 *     SENSEX, BANKEX) have no cash market — only OPTIDX / FUTIDX contracts.
 *   • MCX: commodity friendly names (GOLD, SILVER, CRUDEOIL, NATURALGAS,
 *     COPPER, ZINC, LEAD, ALUMINIUM) trade via FUTCOM / OPTCOM only.
 *
 * For these, the stock-detail page replaces the BUY / SELL bar with a
 * "Trade Options" CTA that routes to the option chain — mirrors Groww.
 */
const DERIVATIVES_ONLY = new Set([
  // NSE indices
  'NIFTY', 'NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50',
  // BSE indices
  'SENSEX', 'BANKEX',
  // MCX commodities (friendly names; the actual tradable is a FUT contract)
  'GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS', 'COPPER', 'ZINC', 'LEAD', 'ALUMINIUM',
]);

function isDerivativesOnly(symbol: string): boolean {
  return DERIVATIVES_ONLY.has(symbol.toUpperCase());
}

/**
 * Pad `data` with whitespace items (no value/OHLC) from after the last candle
 * up to `sessionEnd`. Whitespace points reserve x-axis space in
 * lightweight-charts but render nothing — perfect for the "full session
 * reserved on the x-axis, candles fill in as time passes" behaviour.
 */
function appendWhitespace(data: any[], sessionEnd: number, intervalSec: number) {
  if (!data.length) return;
  const lastTime = data[data.length - 1].time;
  if (typeof lastTime !== 'number') return;
  for (let t = lastTime + intervalSec; t <= sessionEnd; t += intervalSec) {
    data.push({ time: t });
  }
}

/**
 * After the session has closed for the day, append one synthetic data point
 * AT `sessionEnd` carrying the last candle's close price (or the live price
 * if we already have one, so the initial paint matches the header). Angel
 * One anchors intraday candles at the START of the 5-min slot, so the final
 * 15:25 candle (covering 15:25–15:30) leaves the chart visually ending at
 * 15:25. This function extends the line/candle out to the actual close
 * (15:30 NSE / 23:30 MCX).
 */
function appendSessionCloseMarker(
  data: any[],
  sessionEnd: number,
  chartType: ChartType,
  livePrice?: number,
) {
  if (!data.length) return;
  const last = data[data.length - 1];
  if (typeof last.time !== 'number' || last.time >= sessionEnd) return;
  const v = typeof livePrice === 'number'
    ? livePrice
    : ('close' in last ? last.close : ('value' in last ? last.value : null));
  if (v == null) return;
  if (chartType === 'candle') {
    data.push({ time: sessionEnd, open: v, high: v, low: v, close: v });
  } else {
    data.push({ time: sessionEnd, value: v });
  }
}

export function StockDetail() {
  const { symbol: urlSymbol = '' } = useParams<{ symbol: string }>();
  const symbol = urlSymbol.toUpperCase();
  const { quotes, subscribe } = useMarket();
  const marketStatus = useMarketStatus(symbol);
  const { theme } = useTheme();

  const [period, setPeriod] = useState<Period>('1D');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [tab, setTab] = useState<'overview' | 'fo'>('overview');
  const [hoverOHLC, setHoverOHLC] = useState<Candle | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const { data: snap = null } = useSnapshotQuery(symbol);

  // Candle history via TanStack Query — cached per (symbol, period), so
  // revisits and period flips paint instantly from cache (background refresh
  // keeps 1D growing). keepPreviousData means the old line stays on screen
  // while the next range loads: no blank/loading flash.
  // Fallback: if 1D comes back empty (market closed + contract had no ticks
  // today), pull 1W so the chart always has SOMETHING to render.
  const histQ = useHistoryQuery(symbol, period);
  const need1W = period === '1D' && !histQ.isPending && (histQ.data?.length ?? 0) === 0;
  const fallbackQ = useHistoryQuery(symbol, '1W', { enabled: need1W });
  const candles: Candle[] = useMemo(() => {
    const main = histQ.data ?? [];
    if (main.length > 0) return main;
    return need1W ? (fallbackQ.data ?? []) : main;
  }, [histQ.data, fallbackQ.data, need1W]);
  // Spinner ONLY on the very first ever load of this (symbol, period) — once
  // cached (or while previous data is shown) there's nothing to wait for.
  const loading = histQ.isPending && candles.length === 0;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSide, setModalSide] = useState<'buy' | 'sell'>('buy');
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  // Current line/area colour sign (true = green/up). Tracked so the live
  // overlay can flip the whole 1D line red↔green in realtime when the price
  // crosses yesterday's close, without rebuilding the series every tick.
  const lineUpRef = useRef<boolean>(true);
  // Time of the synthetic session-close marker (15:30 NSE / 23:30 MCX), only
  // present when the session is already over. The live-overlay effect uses
  // this to keep the marker's value in sync with the live price so hovering
  // at the end of the chart shows the same number as the header.
  const sessionEndMarkerRef = useRef<number | null>(null);
  // Last REAL data point (post live-overlay). Used as a fallback for the
  // hover pill when the user hovers over the empty / whitespace area past
  // the most recent candle — we snap the value to this instead of going blank.
  const lastCandleRef = useRef<Candle | null>(null);
  // Pulsing end-of-line dot (line chart only) — position recomputed on each
  // live tick / resize via priceToCoordinate / timeToCoordinate.
  const [endDot, setEndDot] = useState<{ x: number; y: number; color: string } | null>(null);

  // Subscribe + load initial snapshot whenever symbol changes
  useEffect(() => {
    pushRecentlyViewed(symbol);
    subscribe([symbol]);
  }, [symbol, subscribe]);

  // Theme palette for chart — transparent bg + invisible grid so the chart
  // blends into the page (no "boxes" / framed look).
  const palette = useMemo(() => {
    if (theme === 'dark') {
      return {
        bg:        'transparent',
        text:      '#b0b8c8',
        grid:      'transparent',
        border:    'transparent',
        crosshair: 'rgba(176,184,200,0.4)',
      };
    }
    return {
      bg:        'transparent',
      text:      '#696c75',
      grid:      'transparent',
      border:    'transparent',
      crosshair: 'rgba(105,108,117,0.4)',
    };
  }, [theme]);

  // Build/tear-down chart on theme change
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: palette.bg },
        textColor: palette.text,
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      // Right-axis price column hidden per user request — keep the chart
      // visually clean; price values are exposed via the on-chart legend.
      rightPriceScale: {
        visible: false,
      },
      leftPriceScale: { visible: false },
      // Time axis hidden — the date/time appears in the hover tippy instead.
      timeScale: {
        visible: false,
        borderVisible: false,
        timeVisible: false,
        lockVisibleTimeRangeOnResize: true,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        // Only a vertical guide line — the horizontal price line is hidden
        // because we render the price as a floating pill on top of it instead.
        vertLine: { color: palette.text, style: 2, width: 1, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      // Fully locked: hover-only. No pan, no zoom, no axis drag.
      // The 1D/1W/1M pills are the ONLY way to change what's shown.
      handleScroll: {
        horzTouchDrag: false,
        vertTouchDrag: false,
        mouseWheel: false,
        pressedMouseMove: false,
      },
      handleScale: {
        axisPressedMouseMove: { time: false, price: false },
        mouseWheel: false,
        pinch: false,
      },
      autoSize: true,
    });
    chartRef.current = chart;

    chart.subscribeCrosshairMove((p) => {
      const s = seriesRef.current;
      if (!s || !p.point) {
        setHoverOHLC(null);
        setHoverPos(null);
        return;
      }
      const d: any = p.seriesData?.get(s);
      let candle: Candle | null = null;
      let snapToLast = false;
      if (d) {
        // Hovering on a real data point (or our synthetic session-close marker).
        candle = 'open' in d
          ? { time: Number(d.time), open: d.open, high: d.high, low: d.low, close: d.close, volume: 0 }
          : { time: Number(d.time), open: d.value, high: d.value, low: d.value, close: d.value, volume: 0 };
      } else if (lastCandleRef.current) {
        // Hovering past the last data point — over the whitespace reserved
        // for the rest of the session. Snap the pill AND the chart's vertical
        // crosshair to the dot at the line's end instead of leaving them at
        // the cursor's empty position.
        candle = lastCandleRef.current;
        snapToLast = true;
      }
      if (!candle) {
        setHoverOHLC(null);
        setHoverPos(null);
        return;
      }
      // Position the pill exactly on the dot when we snapped, otherwise on
      // the current crosshair point.
      const ts = chart.timeScale();
      const xCoord = snapToLast ? ts.timeToCoordinate(candle.time as any) : p.point.x;
      const yPrice = (s as any).priceToCoordinate?.(candle.close);
      setHoverOHLC(candle);
      setHoverPos({
        x: typeof xCoord === 'number' ? xCoord : p.point.x,
        y: typeof yPrice === 'number' ? yPrice : p.point.y,
      });
      if (snapToLast) {
        // Lock the chart's built-in crosshair to the dot so the vertical
        // guide line lands on top of it (instead of trailing the cursor).
        try { chart.setCrosshairPosition(candle.close, candle.time as any, s); } catch {}
      }
    });

    const resize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [palette]);

  // Swap series on chartType / candles change.
  // We fit content ONLY when the underlying candles change (new period loaded).
  // Toggling chartType (line ↔ candle) reuses the same data and keeps the
  // existing time range — so the chart no longer "jumps" on every interaction.
  const prevCandlesRef = useRef<Candle[]>([]);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    // ---- Build the data array; on 1D, pad the remaining session with whitespace ----
    let sessionEnd: number | null = null;
    let intervalSec = 300; // 5-minute slots
    if (period === '1D' && candles.length) {
      const market = marketFor(symbol);
      sessionEnd = getTodaySessionRange(market).to;
      // Infer the slot size from the data so empty slots align with real ones.
      if (candles.length >= 2) {
        const diffs = candles
          .slice(1, 10)
          .map((c, i) => c.time - candles[i].time)
          .filter((d) => d > 0);
        if (diffs.length) intervalSec = Math.min(...diffs);
      }
    }

    // Decide how to pad the 1D chart: if the market is still live we reserve
    // future x-axis space with whitespace; if the session is already over we
    // extend the last candle's close out to the session-end time so the line
    // visually reaches 15:30 (NSE) / 23:30 (MCX) instead of stopping at 15:25.
    const nowSec = Math.floor(Date.now() / 1000);
    const sessionEnded = sessionEnd != null && nowSec > sessionEnd;
    sessionEndMarkerRef.current = sessionEnded ? sessionEnd : null;

    if (chartType === 'candle') {
      const prevClose = (snap?.close && snap.close > 0) ? snap.close : (quotes[symbol]?.previousClose ?? 0);
      seriesRef.current = chart.addCandlestickSeries({
        upColor: POS, downColor: NEG,
        borderUpColor: POS, borderDownColor: NEG,
        wickUpColor: POS, wickDownColor: NEG,
        priceLineVisible: false,
        lastValueVisible: false,
        // Keep yesterday's close in view on big gap opens (see line branch).
        ...(period === '1D' && prevClose > 0
          ? {
              autoscaleInfoProvider: (orig: () => any) => {
                const r = orig();
                if (!r?.priceRange) return r;
                return {
                  ...r,
                  priceRange: {
                    minValue: Math.min(r.priceRange.minValue, prevClose),
                    maxValue: Math.max(r.priceRange.maxValue, prevClose),
                  },
                };
              },
            }
          : {}),
      });
      const data: any[] = candles.map<CandlestickData>((c) => ({
        time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      if (sessionEnd) {
        if (sessionEnded) appendSessionCloseMarker(data, sessionEnd, 'candle', quotes[symbol]?.price);
        else appendWhitespace(data, sessionEnd, intervalSec);
      }
      seriesRef.current.setData(data);
    } else {
      // Colour: on 1D the line is green when price ≥ yesterday's close, red
      // when below (the live overlay flips this in realtime). On longer ranges
      // it tracks the change vs the first candle of the loaded window.
      const livePrice = quotes[symbol]?.price ?? snap?.price ?? 0;
      // prevClose: prefer the live quote (always present) over snap.close
      // (often 0 when the snapshot is throttled).
      const prevClose = (snap?.close && snap.close > 0)
        ? snap.close
        : (quotes[symbol]?.previousClose ?? 0);
      let up: boolean;
      if (period === '1D') {
        const ch = quotes[symbol]?.change ?? snap?.change;
        up = ch != null && ch !== 0
          ? ch >= 0
          : (prevClose > 0 && livePrice > 0 ? livePrice >= prevClose : (ch ?? 0) >= 0);
      } else {
        const periodChange =
          candles.length > 0 && candles[0].close > 0 ? livePrice - candles[0].close : (snap?.change ?? 0);
        up = periodChange >= 0;
      }
      lineUpRef.current = up;
      seriesRef.current = chart.addAreaSeries({
        lineColor: up ? POS : NEG,
        topColor: up ? 'rgba(0,179,134,0.20)' : 'rgba(235,91,60,0.20)',
        bottomColor: up ? 'rgba(0,179,134,0.00)' : 'rgba(235,91,60,0.00)',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        // We render our own dot (matching the end-of-line dot exactly) so
        // both the persistent endpoint dot and the hover dot look identical.
        crosshairMarkerVisible: false,
        // Keep yesterday's-close in the visible price range even on a big
        // gap-up/down open, so the dashed reference line never falls
        // off-screen (the cause of the "sometimes no prev-close line").
        ...(period === '1D' && prevClose > 0
          ? {
              autoscaleInfoProvider: (orig: () => any) => {
                const r = orig();
                if (!r?.priceRange) return r;
                return {
                  ...r,
                  priceRange: {
                    minValue: Math.min(r.priceRange.minValue, prevClose),
                    maxValue: Math.max(r.priceRange.maxValue, prevClose),
                  },
                };
              },
            }
          : {}),
      });
      const data: any[] = candles.map<LineData>((c) => ({
        time: c.time as any, value: c.close,
      }));
      if (sessionEnd) {
        if (sessionEnded) appendSessionCloseMarker(data, sessionEnd, 'line', quotes[symbol]?.price);
        else appendWhitespace(data, sessionEnd, intervalSec);
      }
      seriesRef.current.setData(data);
    }
    // Yesterday's close reference line — thin dashed, 75% white in dark
    // mode (subtle dark gray in light so it stays visible). Only meaningful
    // on the 1D chart; for longer ranges the value would be off-screen or
    // visually noisy. Lightweight-charts cleans this up automatically when
    // the series is removed at the top of the next effect run.
    const prevCloseLine = (snap?.close && snap.close > 0) ? snap.close : (quotes[symbol]?.previousClose ?? 0);
    if (period === '1D' && prevCloseLine > 0 && seriesRef.current) {
      seriesRef.current.createPriceLine({
        price: prevCloseLine,
        color: theme === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(40,40,40,0.55)',
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: false,
        title: '',
      });
    }
    // ── View enforcement ────────────────────────────────────────────────
    // For 1D, the view must span the FULL session (open → close + a 15-min
    // trail) — exactly what our data (real candles + whitespace) covers; for
    // longer periods, fit everything. The chart is HOVER-ONLY (pan/zoom
    // disabled), so enforcing this deterministic view repeatedly can never
    // fight the user.
    //
    // Why enforcement instead of a one-shot: with TanStack-cached candles a
    // revisit renders synchronously while the lazy page's container still has
    // ZERO width — any setVisibleRange issued then dies silently, and when
    // lightweight-charts' autoSize finally measures the box it falls back to
    // fitting the data → the line stretched full-width and an OPEN market
    // looked closed. Our own ResizeObserver fires exactly when the container
    // gains real size, so the correct range is (re)applied at the right time.
    prevCandlesRef.current = candles;
    const applyView = () => {
      const c = chartRef.current;
      if (!c || !candles.length) return;
      const el = containerRef.current;
      if (!el || el.clientWidth < 10) return; // not laid out yet — observer will re-fire
      const ts = c.timeScale();
      try {
        if (period === '1D' && sessionEnd) {
          const { from } = getTodaySessionRange(marketFor(symbol));
          ts.setVisibleRange({ from: from as any, to: (sessionEnd + SESSION_TRAIL_SEC) as any });
        } else {
          ts.fitContent();
        }
      } catch { /* chart mid-teardown */ }
    };
    applyView();
    const rafId = requestAnimationFrame(() => requestAnimationFrame(applyView));
    const timeoutId = window.setTimeout(applyView, 350);
    let ro: ResizeObserver | null = null;
    if (containerRef.current) {
      ro = new ResizeObserver(() => applyView());
      ro.observe(containerRef.current);
    }
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      ro?.disconnect();
    };
    // `quotes[symbol]?.previousClose` is in deps so the dashed prev-close line +
    // autoscale appear once the live quote's prevClose is known (snap.close is
    // often 0 when the snapshot is throttled). It's stable through the day, so
    // this triggers at most one extra rebuild.
  }, [chartType, candles, palette, snap?.change, snap?.close, quotes[symbol]?.previousClose, period, symbol]);


  // Live price overlay on last candle
  const live = quotes[symbol];
  useEffect(() => {
    if (candles.length === 0) {
      lastCandleRef.current = null;
      setEndDot(null);
      return;
    }
    const baseLast = candles[candles.length - 1];
    const lastClose = live?.price ?? baseLast.close;
    const lastHigh = Math.max(baseLast.high, lastClose);
    const lastLow = Math.min(baseLast.low, lastClose);

    // Keep ref pointing at the live-adjusted last candle so the crosshair
    // fallback (hovering over the empty area of the chart) always shows
    // the most recent price/time pair.
    lastCandleRef.current = {
      time: baseLast.time,
      open: baseLast.open,
      high: lastHigh,
      low: lastLow,
      close: lastClose,
      volume: baseLast.volume,
    };

    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    if (live) {
      const updated: any = chartType === 'candle'
        ? { time: baseLast.time as any, open: baseLast.open, high: lastHigh, low: lastLow, close: lastClose }
        : { time: baseLast.time as any, value: lastClose };
      try { series.update(updated); } catch {}

      // If the session has already closed we also keep the synthetic
      // session-close marker in sync with the live price — otherwise hovering
      // at the last point on the chart shows a stale close that doesn't match
      // the live number rendered in the header.
      const markerTime = sessionEndMarkerRef.current;
      if (markerTime && markerTime > baseLast.time) {
        const markerUpdate: any = chartType === 'candle'
          ? { time: markerTime as any, open: lastClose, high: lastClose, low: lastClose, close: lastClose }
          : { time: markerTime as any, value: lastClose };
        try { series.update(markerUpdate); } catch {}
      }
    }

    // Recompute pulsing end-of-line dot position. Only shown for line/area
    // charts — candles have an obvious visual endpoint already.
    if (chartType !== 'line') {
      setEndDot(null);
      return;
    }
    // requestAnimationFrame so lightweight-charts has finished its current
    // paint cycle before we ask for coordinates.
    const raf = requestAnimationFrame(() => {
      try {
        const ts = chart.timeScale();
        const x = ts.timeToCoordinate(baseLast.time as any);
        const y = (series as any).priceToCoordinate?.(lastClose);
        if (typeof x === 'number' && typeof y === 'number') {
          let up: boolean;
          if (period === '1D') {
            const pc = snap?.close ?? 0;
            up = pc > 0 ? lastClose >= pc : (snap?.change ?? live?.change ?? 0) >= 0;
          } else {
            const periodChange =
              candles.length > 0 && candles[0].close > 0
                ? lastClose - candles[0].close
                : (snap?.change ?? live?.change ?? 0);
            up = periodChange >= 0;
          }
          setEndDot({ x, y, color: up ? POS : NEG });
        } else {
          setEndDot(null);
        }
      } catch {
        setEndDot(null);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [live, candles, chartType, snap?.change, period, palette]);

  // Realtime 1D line colour: green when the live price is at/above yesterday's
  // close, red when below — recoloured the instant it crosses. Its own effect
  // (not gated on a WS tick) so the colour is correct regardless of whether
  // the snapshot or the live quote arrived first.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || chartType !== 'line' || period !== '1D') return;
    // Use the live quote's day-change first (it's reliably present — same
    // source the header uses); fall back to price-vs-prevClose. This avoids
    // depending on snap.close, which is often 0 when the snapshot is throttled.
    const ch = live?.change ?? snap?.change;
    let up: boolean;
    if (ch != null && ch !== 0) {
      up = ch >= 0;
    } else {
      const pc = live?.previousClose || snap?.close || 0;
      const px = live?.price ?? snap?.price ?? 0;
      if (pc <= 0 || px <= 0) return; // nothing to decide on yet
      up = px >= pc;
    }
    if (up === lineUpRef.current) return;
    lineUpRef.current = up;
    try {
      series.applyOptions({
        lineColor: up ? POS : NEG,
        topColor: up ? 'rgba(0,179,134,0.20)' : 'rgba(235,91,60,0.20)',
        bottomColor: up ? 'rgba(0,179,134,0.00)' : 'rgba(235,91,60,0.00)',
      });
    } catch { /* series mid-teardown */ }
  }, [live?.change, live?.price, live?.previousClose, snap?.change, snap?.close, snap?.price, chartType, period, symbol, candles]);

  // Reposition the pulsing end-of-line dot whenever the chart container
  // resizes (lightweight-charts re-lays out internally, but our React
  // overlay needs a re-render to pick up new pixel coordinates).
  useEffect(() => {
    if (chartType !== 'line' || !containerRef.current) return;
    const el = containerRef.current;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const chart = chartRef.current;
        const series = seriesRef.current;
        const last = lastCandleRef.current;
        if (!chart || !series || !last) return;
        try {
          const x = chart.timeScale().timeToCoordinate(last.time as any);
          const y = (series as any).priceToCoordinate?.(last.close);
          if (typeof x === 'number' && typeof y === 'number') {
            let up: boolean;
            if (period === '1D') {
              const pc = snap?.close ?? 0;
              up = pc > 0 ? last.close >= pc : (snap?.change ?? live?.change ?? 0) >= 0;
            } else {
              const c = candles.length > 0 && candles[0].close > 0
                ? last.close - candles[0].close
                : (snap?.change ?? live?.change ?? 0);
              up = c >= 0;
            }
            setEndDot({ x, y, color: up ? POS : NEG });
          }
        } catch {}
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [chartType, snap?.change, live?.change, period, candles]);

  const hasQuote = !!(live || snap);
  // The very first WS tick after subscribe can carry change=0 before the
  // snapshot (with previousClose) lands — during that window the change is
  // simply UNKNOWN, not zero. Gate the change span separately from the price.
  const changeKnown =
    !!snap || (!!live && (live.change !== 0 || live.changePercent !== 0));
  const price = live?.price ?? snap?.price ?? 0;
  // Day-change is what the live ticker / snapshot give us — correct for 1D.
  // For any longer period (1W/1M/3M/6M/1Y/3Y/5Y/ALL) compute the change
  // RELATIVE TO THE FIRST CANDLE in the loaded range so the header matches
  // what the chart is visually showing.
  let change = live?.change ?? snap?.change ?? 0;
  let changePct = live?.changePercent ?? snap?.changePercent ?? 0;
  // Some snapshots (esp. outside market hours / before the first WS tick)
  // report change=0 even though price and previousClose are valid — derive
  // the real day-change instead of flashing "+0.00 (+0.00%)".
  const prevClose = snap?.previousClose ?? 0;
  if (change === 0 && prevClose > 0 && price > 0 && price !== prevClose) {
    change = price - prevClose;
    changePct = (change / prevClose) * 100;
  }
  if (period !== '1D' && candles.length > 0) {
    const periodOpen = candles[0].close;
    if (periodOpen > 0) {
      change = price - periodOpen;
      changePct = (change / periodOpen) * 100;
    }
  }
  const up = change >= 0;

  function openOrder(side: 'buy' | 'sell') {
    setModalSide(side);
    setModalOpen(true);
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StockLogo symbol={symbol} size={32} />
              <div>
                <h1 className="font-bold text-base tracking-tight">{symbol}</h1>
                <div className="text-[10px] text-ink-500 dark:text-night-200 uppercase tracking-wider">
                  {snap?.exchange || 'NSE'} · {snap?.tradingSymbol || symbol}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAlertOpen(true)}
              className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-ink-50 dark:bg-night-600 hover:bg-ink-100 dark:hover:bg-night-500 text-base"
              aria-label="Create alert"
              title="Create alert"
            >
              🔔
            </button>
            <Link
              to={`/options/${encodeURIComponent(symbol)}`}
              className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-ink-50 dark:bg-night-600 hover:bg-ink-100 dark:hover:bg-night-500"
              title="Option chain"
              aria-label="Option chain"
            >
              <IconLink size={16} />
            </Link>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mt-3">
          {hasQuote ? (
            <span className="num text-2xl sm:text-3xl font-bold tracking-tight">{fmtNum(price)}</span>
          ) : (
            // No quote at all yet — shimmer the price slot.
            <span className="h-8 w-32 rounded-lg bg-ink-100/80 dark:bg-night-600 animate-pulse" />
          )}
          {hasQuote && changeKnown ? (
            <span className={`num text-sm font-semibold flex items-center gap-1 ${classPnL(change)}`}>
              {up ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />}
              {up ? '+' : ''}{fmtNum(change)} ({fmtPct(changePct)})
            </span>
          ) : (
            // Change not derivable yet (first WS tick precedes the snapshot) —
            // shimmer instead of a misleading "+0.00 (+0.00%)".
            <span className="h-4 w-24 rounded bg-ink-100/80 dark:bg-night-600 animate-pulse" />
          )}
          <span className="text-[11px] text-ink-400 dark:text-night-200 ml-auto">{period}</span>
        </div>
      </div>

      {/* Chart — transparent, blends into page */}
      <div className="relative px-2 sm:px-3 ">
        {/* Floating price tooltip above the touched data point */}
        <PricePill hover={hoverOHLC} pos={hoverPos} containerRef={containerRef} />
        <div className="relative w-full h-[39vh] min-h-[210px]">
          <div
            ref={containerRef}
            className="w-full h-full"
            style={{ touchAction: 'pan-y' }}
            onTouchEnd={() => {
              chartRef.current?.clearCrosshairPosition();
              setHoverOHLC(null);
              setHoverPos(null);
            }}
            onTouchCancel={() => {
              chartRef.current?.clearCrosshairPosition();
              setHoverOHLC(null);
              setHoverPos(null);
            }}
            onPointerLeave={() => {
              chartRef.current?.clearCrosshairPosition();
              setHoverOHLC(null);
              setHoverPos(null);
            }}
          />
          {endDot && chartType === 'line' && <EndOfLineDot pos={endDot} />}
          {chartType === 'line' && hoverOHLC && hoverPos && endDot && (
            <EndOfLineDot
              pos={{ x: hoverPos.x, y: hoverPos.y, color: endDot.color }}
            />
          )}
        </div>
        {loading && (
          <div className="px-1 py-1.5 text-xs text-ink-500 dark:text-night-200 border-t border-ink-100 dark:border-night-500/40">
            Loading…
          </div>
        )}

        {/* Period + tool row — sits directly under the chart */}
        <div className="flex items-center gap-1.5 px-1 py-2 overflow-x-auto">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                period === p
                  ? 'bg-ink-800 text-white dark:bg-night-50 dark:text-night-800'
                  : 'text-ink-500 dark:text-night-200 hover:bg-ink-50 dark:hover:bg-night-600'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setChartType(chartType === 'line' ? 'candle' : 'line')}
            className="shrink-0 ml-auto w-9 h-9 inline-flex items-center justify-center rounded-full bg-ink-50 dark:bg-night-600 hover:bg-ink-100 dark:hover:bg-night-500"
            aria-label="Toggle chart type"
          >
            <IconChart size={16} />
          </button>
          <button
            onClick={() => setTerminalOpen(true)}
            className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full bg-ink-50 dark:bg-night-600 hover:bg-ink-100 dark:hover:bg-night-500"
            aria-label="Fullscreen chart"
            title="Terminal"
          >
            ⛶
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-5">
        <div className="flex gap-5 border-b border-ink-100 dark:border-night-500/40">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabButton>
          <TabButton active={tab === 'fo'} onClick={() => setTab('fo')}>F&amp;O</TabButton>
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 pt-4 space-y-4">
        {tab === 'overview' && <StockOverview snap={snap} livePrice={price} />}

        {tab === 'fo' && (
          <div className="card !p-5 text-center">
            <h3 className="text-base font-bold tracking-tight">Options Chain</h3>
            <p className="text-sm text-ink-500 dark:text-night-200 mt-1">
              View live calls and puts with OI, IV, and place orders.
            </p>
            <Link
              to={`/options/${encodeURIComponent(symbol)}`}
              className="btn-primary mt-4 inline-flex"
            >
              <IconList size={16} /> Open Option Chain
            </Link>
          </div>
        )}
      </div>

      {/* Sticky action bar — varies by instrument type:
            • Equity (RELIANCE, TCS, etc.)  → BUY / SELL
            • Index (NIFTY, BANKNIFTY, …)   → Trade Options (NSE rule: no cash buy)
            • Commodity (CRUDEOIL, GOLD…)   → Trade Options (MCX rule: derivatives only) */}
      <div className="fixed bottom-[72px] lg:bottom-6 left-0 right-0 lg:left-60 z-30 px-4 pointer-events-none">
        <div className="max-w-5xl mx-auto pointer-events-auto rounded-2xl bg-white/95 dark:bg-night-700/95 backdrop-blur shadow-cardHover border border-ink-100 dark:border-night-500/40 p-2 flex gap-2">
          {isDerivativesOnly(symbol) ? (
            <Link
              to={`/options/${encodeURIComponent(symbol)}`}
              className="btn-primary flex-1"
            >
              <IconLink size={16} /> Trade {marketFor(symbol) === 'MCX' ? 'Futures & Options' : 'Options'}
            </Link>
          ) : (
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex gap-2">
                <button
                  className="btn-pos flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => openOrder('buy')}
                  disabled={!marketStatus.open}
                >
                  BUY
                </button>
                <button
                  className="btn-neg flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => openOrder('sell')}
                  disabled={!marketStatus.open}
                >
                  SELL
                </button>
              </div>
              {!marketStatus.open && (
                <div className="text-center text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  🔒 {marketStatus.label}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <OrderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultSymbol={symbol}
        defaultSide={modalSide}
        initialPrice={price || undefined}
        initialLotSize={1}
      />
      <TerminalChart
        symbol={symbol}
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
      />
      <CreateAlertModal
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        defaultSymbol={symbol}
      />
    </div>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative pb-2.5 text-sm font-semibold transition ${
        active
          ? 'text-brand'
          : 'text-ink-500 dark:text-night-200 hover:text-ink-700 dark:hover:text-night-50'
      }`}
    >
      {children}
      {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand rounded" />}
    </button>
  );
}

/**
 * Floating price + time pill — sits at the TOP of the vertical crosshair line,
 * horizontally following the finger. Clamps to the container edges so it
 * never gets cut off when the user hovers near the start/end of the chart.
 */
function PricePill({
  hover,
  pos,
  containerRef,
}: {
  hover: Candle | null;
  pos: { x: number; y: number } | null;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const pillRef = useRef<HTMLDivElement>(null);
  if (!hover || !pos) return null;
  const ts = new Date(hover.time * 1000);
  const date = ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const time = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Clamp x so the centred pill never overflows the container's visible width.
  const containerWidth = containerRef.current?.clientWidth ?? 0;
  const pillWidth = pillRef.current?.offsetWidth ?? 90; // initial estimate; correct after first render
  const half = pillWidth / 2;
  const insetLeft = 10; // px-2 inset
  const rawX = pos.x + insetLeft;
  const clampedX = Math.max(half + 2, Math.min(containerWidth - half - 2, rawX));

  return (
    <div
      className="absolute top-1 z-10 pointer-events-none -translate-x-1/2"
      style={{ left: clampedX }}
    >
      <div
        ref={pillRef}
        className="rounded-md bg-ink-800 dark:bg-night-50 text-white dark:text-night-800 px-2.5 py-1 shadow-card whitespace-nowrap text-center"
      >
        <div className="num text-[12px] font-bold tracking-tight">
          {hover.close.toFixed(2)}
        </div>
        <div className="text-[9px] font-semibold opacity-80 mt-0.5">
          {date} · {time}
        </div>
      </div>
    </div>
  );
}

/**
 * Static dot rendered at the tip of the line chart's most-recent data point.
 * Soft outer halo + solid inner dot ringed in white, matching the design
 * reference. No animation.
 */
function EndOfLineDot({ pos }: { pos: { x: number; y: number; color: string } }) {
  return (
    <div
      className="absolute z-10 pointer-events-none"
      style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
    >
      <span
        className="absolute left-1/2 top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: pos.color, opacity: 0.22 }}
      />
      <span
        className="relative block w-2 h-2 rounded-full ring-2 ring-white dark:ring-night-800"
        style={{ backgroundColor: pos.color }}
      />
    </div>
  );
}

