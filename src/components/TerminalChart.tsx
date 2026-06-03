/**
 * Fullscreen "Terminal" chart — TradingView-style overlay with:
 *   • Candlestick price series (TradingView lightweight-charts)
 *   • Optional SMA(20), SMA(50), SMA(200) overlays
 *   • Optional Volume histogram panel
 *   • Optional RSI(14) panel
 *
 * Pure client-side computation from the candles we already fetch.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  HistogramData,
  LineStyle,
} from 'lightweight-charts';
import { useTheme } from '../context/ThemeContext';
import { fetchCandles, type Interval } from '../api/market';
import type { Candle } from '../types';
import { useMarket } from '../context/MarketContext';
import { fmtNum } from '../utils/fmt';
import {
  IconX, IconArrowLeft, IconCandle, IconBars, IconLine, IconFx, IconPencil, IconRotate, IconDots,
  IconChevronDown,
} from './icons';
import { Spinner } from './Spinner';
import {
  ema as emaCalc,
  bollinger as bollingerCalc,
  vwap as vwapCalc,
  macd as macdCalc,
  closes as closesArr,
} from '../utils/indicators';

const POS = '#00b386';
const NEG = '#eb5b3c';
const INTERVALS: Interval[] = ['1m', '2m', '3m', '5m', '10m', '15m', '20m', '30m', '1h', '2h'];

/** Bucket length (seconds) per terminal timeframe — used by the live bar
 *  appender to know when to roll a fresh candle past the historical fetch. */
const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m':   60,  '2m':  120,  '3m':  180,  '5m':  300,  '10m':  600,
  '15m': 900, '20m': 1200, '30m': 1800, '1h': 3600, '2h':  7200,
};

interface Props {
  symbol: string;
  open: boolean;
  onClose: () => void;
}

interface IndicatorState {
  sma20: boolean;
  sma50: boolean;
  sma200: boolean;
  ema20: boolean;
  ema50: boolean;
  bb: boolean;
  vwap: boolean;
  volume: boolean;
  rsi: boolean;
  macd: boolean;
}

// Default: NO indicators attached. User explicitly opts in via the toggles
// at the bottom of the Terminal — keeps a fresh chart visually clean.
const DEFAULT_IND: IndicatorState = {
  sma20: false,
  sma50: false,
  sma200: false,
  ema20: false,
  ema50: false,
  bb: false,
  vwap: false,
  volume: false,
  rsi: false,
  macd: false,
};

export function TerminalChart({ symbol, open, onClose }: Props) {
  const { theme } = useTheme();
  const { quotes } = useMarket();
  // Terminal opens on a 15-minute timeframe by default — broad enough to
  // see structure without losing intrabar detail. User can switch via the
  // bottom toolbar (1m → 2h).
  const [interval, setInterval] = useState<Interval>('15m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [ind, setInd] = useState<IndicatorState>(DEFAULT_IND);
  const [hover, setHover] = useState<Candle | null>(null);
  // Chart type — terminal defaults to candles. Top toolbar icon cycles
  // candle → bar → line → candle. All three series types reflect live
  // ticks via series.update() in the bar-rollover effect below.
  const [chartType, setChartType] = useState<'candle' | 'bar' | 'line'>('candle');
  // Price-axis mode controls — wire up the % / log / auto chips at the
  // bottom of the screen. Defaults match every other charting tool: linear
  // price, auto-scale on.
  const [priceMode, setPriceMode] = useState<'price' | 'percent'>('price');
  const [logScale, setLogScale] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  // Bottom-sheet picker visibility.
  const [intervalSheetOpen, setIntervalSheetOpen] = useState(false);
  const [indSheetOpen, setIndSheetOpen] = useState(false);
  // Wall-clock ticker that refreshes the timestamp in the bottom bar every
  // second — keeps the "11:41:48" feel.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  // Running OHLC of the bar currently being walked by live ticks — drives
  // the LIVE legend at the top of the terminal.
  const [liveBar, setLiveBar] = useState<Candle | null>(null);
  // Server-confirmed bucket size for the current fetch. Used by the live
  // bar appender; falls back to the local INTERVAL_SECONDS map if the
  // response is in-flight.
  const bucketSecondsRef = useRef<number>(INTERVAL_SECONDS['15m']);
  // The synthetic forward-walking bar appended past the historical fetch.
  const liveBarRef = useRef<{ time: number; open: number; high: number; low: number } | null>(null);

  const priceRef = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);

  const charts = useRef<{ price?: IChartApi; vol?: IChartApi; rsi?: IChartApi; macd?: IChartApi }>({});
  const series = useRef<{
    candle?: ISeriesApi<'Candlestick'>;
    bar?: ISeriesApi<'Bar'>;
    area?: ISeriesApi<'Area'>;
    sma20?: ISeriesApi<'Line'>;
    sma50?: ISeriesApi<'Line'>;
    sma200?: ISeriesApi<'Line'>;
    ema20?: ISeriesApi<'Line'>;
    ema50?: ISeriesApi<'Line'>;
    bbUp?: ISeriesApi<'Line'>;
    bbMid?: ISeriesApi<'Line'>;
    bbLo?: ISeriesApi<'Line'>;
    vwap?: ISeriesApi<'Line'>;
    vol?: ISeriesApi<'Histogram'>;
    rsi?: ISeriesApi<'Line'>;
    macdLine?: ISeriesApi<'Line'>;
    macdSig?: ISeriesApi<'Line'>;
    macdHist?: ISeriesApi<'Histogram'>;
  }>({});
  // Track the candles reference so we only re-zoom on a real period-load
  // (not on indicator toggles, theme changes, or live ticks). This keeps
  // the user's hand-zoomed/scrolled view intact while they're exploring.
  const prevCandlesRef = useRef<Candle[]>([]);

  const palette = useMemo(() => {
    if (theme === 'dark') {
      return {
        bg: '#0a0d14', text: '#b0b8c8',
        grid: 'rgba(255,255,255,0.04)', border: '#262e3d',
        crosshair: 'rgba(176,184,200,0.4)',
      };
    }
    return {
      bg: '#ffffff', text: '#696c75',
      grid: 'rgba(15,16,18,0.04)', border: '#dde0e6',
      crosshair: 'rgba(105,108,117,0.4)',
    };
  }, [theme]);

  // Build the three charts when opened / on theme change
  useEffect(() => {
    if (!open) return;
    const make = (el: HTMLDivElement | null, isMain: boolean) => {
      if (!el) return undefined;
      return createChart(el, {
        layout: { background: { color: palette.bg }, textColor: palette.text, fontFamily: 'Inter' },
        grid: {
          vertLines: { color: palette.grid },
          horzLines: { color: palette.grid },
        },
        rightPriceScale: {
          borderColor: palette.border,
          scaleMargins: isMain ? { top: 0.05, bottom: 0.05 } : { top: 0.1, bottom: 0.1 },
        },
        timeScale: { borderColor: palette.border, timeVisible: true, secondsVisible: false },
        crosshair: {
          // Magnet snaps to the actual data point so the y-axis label always
          // matches the dot on the line (no finger-drift offset).
          mode: CrosshairMode.Magnet,
          vertLine: { color: palette.text, style: 2, width: 1, labelBackgroundColor: palette.text },
          horzLine: { color: palette.text, style: 2, width: 1, labelBackgroundColor: palette.text },
        },
        handleScroll: {
          horzTouchDrag: true,
          // Vertical touch drag pans the PRICE axis (lets the user push the
          // chart up/down to look at higher/lower price levels) — without
          // this, swiping up only resizes the container, not the data view.
          vertTouchDrag: true,
          mouseWheel: true,
          pressedMouseMove: true,
        },
        handleScale: {
          // Dragging directly on either axis scales it — TradingView-style.
          //   • horizontal drag on the bottom axis  → zoom time
          //   • vertical drag on the right axis     → zoom price
          axisPressedMouseMove: { time: true, price: true },
          mouseWheel: true,
          pinch: true,
        },
        autoSize: true,
      });
    };

    charts.current.price = make(priceRef.current, true);
    charts.current.vol = make(volRef.current, false);
    charts.current.rsi = make(rsiRef.current, false);
    charts.current.macd = make(macdRef.current, false);

    // Hover OHLC handler (drives the on-chart legend). Works for both the
    // candlestick and the area-line series — the area series only reports
    // `value`, so we synthesise O/H/L/C from it (all four = value).
    charts.current.price?.subscribeCrosshairMove((p) => {
      if (!p.seriesData) { setHover(null); return; }
      const main = series.current.candle || series.current.bar || series.current.area;
      if (!main) { setHover(null); return; }
      const d: any = p.seriesData.get(main as any);
      if (!d) { setHover(null); return; }
      if ('open' in d) {
        setHover({ time: Number(d.time), open: d.open, high: d.high, low: d.low, close: d.close, volume: 0 });
      } else if ('value' in d) {
        const v = Number(d.value);
        setHover({ time: Number(d.time), open: v, high: v, low: v, close: v, volume: 0 });
      } else {
        setHover(null);
      }
    });

    const resize = () => {
      [priceRef.current, volRef.current, rsiRef.current, macdRef.current].forEach((el) => {
        if (!el) return;
        const c =
          el === priceRef.current ? charts.current.price :
          el === volRef.current   ? charts.current.vol   :
          el === rsiRef.current   ? charts.current.rsi   : charts.current.macd;
        if (c) c.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      charts.current.price?.remove();
      charts.current.vol?.remove();
      charts.current.rsi?.remove();
      charts.current.macd?.remove();
      charts.current = {};
      series.current = {};
    };
  }, [open, palette]);

  // Load candles when interval/symbol changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    // Reset the live bucket-roller on every fresh fetch — the next live
    // tick will seed a new synthetic bar at the next boundary.
    liveBarRef.current = null;
    setLiveBar(null);
    fetchCandles(symbol, interval)
      .then((r) => {
        if (cancelled) return;
        bucketSecondsRef.current = r.bucketSeconds || INTERVAL_SECONDS[interval];
        setCandles(r.candles);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, symbol, interval]);

  // Push series whenever candles or indicator toggles change
  useEffect(() => {
    if (!open) return;
    const priceChart = charts.current.price;
    const volChart = charts.current.vol;
    const rsiChart = charts.current.rsi;
    if (!priceChart) return;

    const macdChart = charts.current.macd;
    // Reset all series across all panels
    Object.entries(series.current).forEach(([k, s]) => {
      if (!s) return;
      try {
        if (k === 'vol' && volChart) volChart.removeSeries(s as any);
        else if (k === 'rsi' && rsiChart) rsiChart.removeSeries(s as any);
        else if ((k === 'macdLine' || k === 'macdSig' || k === 'macdHist') && macdChart)
          macdChart.removeSeries(s as any);
        else priceChart.removeSeries(s as any);
      } catch {}
    });
    series.current = {};

    // Main price series — candle (default) or area/line depending on user
    // toggle. Both expose the right-side price pill ("LIVE marker") so the
    // user sees the current LTP in a coloured chip on the price axis.
    const lastClose = candles[candles.length - 1]?.close;
    const firstClose = candles[0]?.close ?? lastClose;
    const trendingUp = lastClose >= firstClose;
    if (chartType === 'candle') {
      // Candle colour rule (lightweight-charts honours this automatically):
      //   close >= open  →  upColor   (green / POS)  — bullish bar
      //   close <  open  →  downColor (red   / NEG)  — bearish bar
      // The live tick appender below updates {open, high, low, close} on
      // every quote, so the currently-forming bar flips colour the moment
      // its `close` crosses back through its `open`.
      series.current.candle = priceChart.addCandlestickSeries({
        upColor: POS, downColor: NEG, borderUpColor: POS, borderDownColor: NEG,
        wickUpColor: POS, wickDownColor: NEG,
        // Show the live price line + axis label — that's the coloured pill
        // on the right edge users expect from a live chart.
        priceLineVisible: true,
        priceLineColor: trendingUp ? POS : NEG,
        priceLineStyle: LineStyle.Dotted,
        priceLineWidth: 1,
        lastValueVisible: true,
      });
      series.current.candle.setData(
        candles.map<CandlestickData>((c) => ({
          time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close,
        }))
      );
    } else if (chartType === 'bar') {
      // OHLC bar: a vertical line spanning low→high with a tick on the LEFT
      // marking the open and a tick on the RIGHT marking the close. Same
      // green/red rule as candles (close >= open → green).
      series.current.bar = priceChart.addBarSeries({
        upColor: POS,
        downColor: NEG,
        thinBars: false,
        priceLineVisible: true,
        priceLineColor: trendingUp ? POS : NEG,
        priceLineStyle: LineStyle.Dotted,
        priceLineWidth: 1,
        lastValueVisible: true,
      });
      series.current.bar.setData(
        candles.map<CandlestickData>((c) => ({
          time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close,
        }))
      );
    } else {
      const lineColor = trendingUp ? POS : NEG;
      series.current.area = priceChart.addAreaSeries({
        lineColor,
        topColor:    trendingUp ? 'rgba(0,179,134,0.25)'  : 'rgba(235,91,60,0.25)',
        bottomColor: trendingUp ? 'rgba(0,179,134,0.001)' : 'rgba(235,91,60,0.001)',
        lineWidth: 2,
        priceLineVisible: true,
        priceLineColor: lineColor,
        priceLineStyle: LineStyle.Dotted,
        priceLineWidth: 1,
        lastValueVisible: true,
      });
      series.current.area.setData(
        candles.map((c) => ({ time: c.time as any, value: c.close })),
      );
    }
    const mainSeries: ISeriesApi<any> = (series.current.candle || series.current.bar || series.current.area) as any;

    // Previous-close reference line — thin dashed, 35% opacity. White in
    // dark mode, ink in light. Source: live quote's `previousClose` field
    // (exchange's official prior session close).
    const prevClose = quotes[symbol.toUpperCase()]?.previousClose;
    if (prevClose && prevClose > 0 && mainSeries) {
      try {
        mainSeries.createPriceLine({
          price: prevClose,
          color: theme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(15,16,18,0.35)',
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          axisLabelVisible: false,
          title: '',
        });
      } catch {}
    }

    // SMAs
    const closes = candles.map((c) => c.close);
    const times = candles.map((c) => c.time);
    if (ind.sma20) {
      series.current.sma20 = priceChart.addLineSeries({ color: '#3b82f6', lineWidth: 1, title: 'SMA 20' });
      series.current.sma20.setData(zipLine(sma(closes, 20), times));
    }
    if (ind.sma50) {
      series.current.sma50 = priceChart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'SMA 50' });
      series.current.sma50.setData(zipLine(sma(closes, 50), times));
    }
    if (ind.sma200) {
      series.current.sma200 = priceChart.addLineSeries({ color: '#a855f7', lineWidth: 1, title: 'SMA 200' });
      series.current.sma200.setData(zipLine(sma(closes, 200), times));
    }

    // EMAs
    if (ind.ema20) {
      series.current.ema20 = priceChart.addLineSeries({ color: '#22d3ee', lineWidth: 1, title: 'EMA 20' });
      series.current.ema20.setData(zipLineN(emaCalc(closes, 20), times));
    }
    if (ind.ema50) {
      series.current.ema50 = priceChart.addLineSeries({ color: '#ec4899', lineWidth: 1, title: 'EMA 50' });
      series.current.ema50.setData(zipLineN(emaCalc(closes, 50), times));
    }

    // Bollinger Bands (20, 2)
    if (ind.bb) {
      const bb = bollingerCalc(closes, 20, 2);
      series.current.bbMid = priceChart.addLineSeries({ color: 'rgba(148,163,184,0.9)', lineWidth: 1, title: 'BB mid' });
      series.current.bbUp  = priceChart.addLineSeries({ color: 'rgba(148,163,184,0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB up' });
      series.current.bbLo  = priceChart.addLineSeries({ color: 'rgba(148,163,184,0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB lo' });
      series.current.bbMid.setData(zipLineN(bb.mid, times));
      series.current.bbUp.setData(zipLineN(bb.upper, times));
      series.current.bbLo.setData(zipLineN(bb.lower, times));
    }

    // VWAP (resets per session — meaningful on 1D, less so on 1Y+)
    if (ind.vwap) {
      series.current.vwap = priceChart.addLineSeries({ color: '#f97316', lineWidth: 1, title: 'VWAP' });
      series.current.vwap.setData(zipLineN(vwapCalc(candles), times));
    }

    // Volume
    if (ind.volume && volChart) {
      series.current.vol = volChart.addHistogramSeries({ color: '#94a3b8' });
      series.current.vol.setData(
        candles.map<HistogramData>((c) => ({
          time: c.time as any,
          value: c.volume || 0,
          color: c.close >= c.open ? 'rgba(0,179,134,0.6)' : 'rgba(235,91,60,0.6)',
        }))
      );
    }

    // RSI
    if (ind.rsi && rsiChart) {
      series.current.rsi = rsiChart.addLineSeries({ color: '#5367ff', lineWidth: 1, title: 'RSI 14' });
      series.current.rsi.setData(zipLine(rsi(closes, 14), times));
      // 70 / 30 reference lines
      rsiChart.applyOptions({ rightPriceScale: { autoScale: false, mode: 0 } });
      try {
        series.current.rsi.createPriceLine({ price: 70, color: '#eb5b3c', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
        series.current.rsi.createPriceLine({ price: 30, color: '#00b386', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });
      } catch {}
    }

    // MACD (12, 26, 9)
    if (ind.macd && macdChart) {
      const m = macdCalc(closes, 12, 26, 9);
      series.current.macdHist = macdChart.addHistogramSeries({ color: 'rgba(148,163,184,0.6)' });
      const histData: HistogramData[] = [];
      for (let i = 0; i < m.histogram.length; i++) {
        const v = m.histogram[i] as number;
        if (Number.isFinite(v)) histData.push({
          time: times[i] as any,
          value: v,
          color: v >= 0 ? 'rgba(0,179,134,0.6)' : 'rgba(235,91,60,0.6)',
        });
      }
      series.current.macdHist.setData(histData);
      series.current.macdLine = macdChart.addLineSeries({ color: '#3b82f6', lineWidth: 1, title: 'MACD' });
      series.current.macdSig  = macdChart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'Signal' });
      series.current.macdLine.setData(zipLineN(m.macd, times));
      series.current.macdSig.setData(zipLineN(m.signal, times));
    }

    // Initial zoom: when a NEW period loads (candles array reference
    // changed), zoom in to the most recent slice instead of fitting all of
    // history. On indicator toggles / theme changes / live ticks the
    // candles ref is the same so we leave the user's zoom alone — exactly
    // what you'd expect when exploring history after pinching to zoom.
    //
    // We schedule via requestAnimationFrame because lightweight-charts'
    // `autoSize: true` ResizeObserver fires after first mount and silently
    // resets the visible range to "all data". Deferring past that frame
    // makes our zoom stick on the very first paint.
    if (prevCandlesRef.current !== candles && candles.length > 0) {
      prevCandlesRef.current = candles;
      const visible = initialVisibleCount(interval, candles.length);
      const range = { from: candles.length - visible, to: candles.length };
      const apply = () => {
        try { priceChart.timeScale().setVisibleLogicalRange(range); } catch {}
        try { volChart?.timeScale().setVisibleLogicalRange(range); } catch {}
        try { rsiChart?.timeScale().setVisibleLogicalRange(range); } catch {}
      };
      // Apply once immediately, then a second time after TWO animation
      // frames. The double-rAF outlives both the autoSize ResizeObserver's
      // first reset AND the layout flush that follows it on Chromium —
      // without that, the chart would briefly flash zoomed-in and then snap
      // back to fitContent before the user even saw the 300% view.
      apply();
      requestAnimationFrame(() => requestAnimationFrame(apply));
    }
    // Deps intentionally minimal — `period`, `symbol`, `theme` are read via
    // closure but flow through `candles`/`palette` already. `previousClose`
    // is the one scalar we DO depend on so the dashed reference line appears
    // as soon as the first quote arrives. previousClose only changes once
    // per session, so it doesn't trigger rebuilds on every live tick.
  }, [open, candles, ind, palette, chartType, quotes[symbol.toUpperCase()]?.previousClose]);

  // Live price drives both the LIVE OHLC legend at the top of the terminal
  // AND the bar-rollover appender below — every WS tick either walks the
  // current bar or, when the clock crosses the next bucket boundary, spawns
  // a fresh bar at the right edge of the chart.
  const live = quotes[symbol.toUpperCase()];

  useEffect(() => {
    if (!open || candles.length === 0 || !live?.price) return;
    const mainSeries = series.current.candle || series.current.bar || series.current.area;
    if (!mainSeries) return;

    const bucketSec = bucketSecondsRef.current || INTERVAL_SECONDS[interval];
    const lastBar = candles[candles.length - 1];
    const nowBucket = Math.floor(Date.now() / 1000 / bucketSec) * bucketSec;
    const px = live.price;

    let activeTime: number;
    let activeOpen: number;
    let activeHigh: number;
    let activeLow: number;
    if (nowBucket > lastBar.time) {
      // Past the last fetched bar — synthesise a new one and grow it.
      if (!liveBarRef.current || liveBarRef.current.time !== nowBucket) {
        liveBarRef.current = { time: nowBucket, open: px, high: px, low: px };
      } else {
        liveBarRef.current.high = Math.max(liveBarRef.current.high, px);
        liveBarRef.current.low  = Math.min(liveBarRef.current.low,  px);
      }
      activeTime = liveBarRef.current.time;
      activeOpen = liveBarRef.current.open;
      activeHigh = liveBarRef.current.high;
      activeLow  = liveBarRef.current.low;
    } else {
      // Still within the bucket of the last fetched bar — mutate it.
      activeTime = lastBar.time;
      activeOpen = lastBar.open;
      activeHigh = Math.max(lastBar.high, px);
      activeLow  = Math.min(lastBar.low,  px);
    }
    // For candles AND bars we push the full O/H/L/C (same shape — the bar
    // series renders it as OHLC ticks instead of a body); for the area/line
    // series we only need {time, value}. lightweight-charts rejects
    // mismatched payloads, so pick the shape that matches whichever series
    // is active.
    try {
      const ohlc = {
        time: activeTime as any,
        open: activeOpen, high: activeHigh, low: activeLow, close: px,
      };
      if (series.current.candle) {
        series.current.candle.update(ohlc);
      } else if (series.current.bar) {
        series.current.bar.update(ohlc);
      } else if (series.current.area) {
        series.current.area.update({ time: activeTime as any, value: px });
      }
    } catch { /* lightweight-charts rejects out-of-order — ignore */ }
    setLiveBar({ time: activeTime, open: activeOpen, high: activeHigh, low: activeLow, close: px, volume: 0 });
  }, [open, candles, interval, chartType, live?.price, live?.timestamp]);

  // Apply price-scale settings (% / log / auto) on every state change.
  // priceScale.mode:  0 = Normal, 1 = Logarithmic, 2 = Percentage, 3 = IndexedTo100
  useEffect(() => {
    const chart = charts.current.price;
    if (!chart) return;
    try {
      chart.priceScale('right').applyOptions({
        mode: priceMode === 'percent' ? 2 : (logScale ? 1 : 0),
        autoScale,
      });
    } catch { /* ignore — price scale not yet initialised */ }
  }, [priceMode, logScale, autoScale, open]);

  // Sync zoom across price + vol + rsi + macd panels
  useEffect(() => {
    if (!open) return;
    const a = charts.current.price?.timeScale();
    const b = charts.current.vol?.timeScale();
    const c = charts.current.rsi?.timeScale();
    const d = charts.current.macd?.timeScale();
    if (!a) return;
    const syncTo = (target: any) => (range: any) => target?.setVisibleLogicalRange(range);
    const offs: (() => void)[] = [];
    for (const t of [b, c, d]) {
      if (!t) continue;
      const f = syncTo(t);
      a.subscribeVisibleLogicalRangeChange(f);
      offs.push(() => a.unsubscribeVisibleLogicalRangeChange(f));
    }
    return () => offs.forEach((u) => u());
  }, [open, ind.volume, ind.rsi, ind.macd]);

  if (!open) return null;

  const price = live?.price ?? candles[candles.length - 1]?.close;
  const showVol = ind.volume;
  const showRsi = ind.rsi;
  const showMacd = ind.macd;

  const change = live?.change ?? 0;
  const changePct = live?.changePercent ?? 0;
  const changeUp = change >= 0;

  // List of currently-on indicators — shown as a thin legend below the
  // symbol/price header so the user always knows what's overlaid.
  const activeIndicators = activeIndicatorLabels(ind);

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-night-900 animate-fadeIn flex flex-col">
      {/* ─── TOP TOOLBAR (back · interval · type · indicators · draw · rotate · more) */}
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-b border-ink-100 dark:border-night-500/40 bg-white dark:bg-night-900">
        <ToolbarBtn onClick={onClose} label="Close terminal"><IconArrowLeft size={20} /></ToolbarBtn>
        <button
          onClick={() => setIntervalSheetOpen(true)}
          className="px-2.5 py-1.5 rounded-md text-sm font-bold tracking-tight uppercase text-ink-800 dark:text-night-50 hover:bg-ink-50 dark:hover:bg-night-700"
        >
          {interval}
        </button>
        <div className="w-px h-5 bg-ink-200 dark:bg-night-500/40 mx-1" />
        <ToolbarBtn
          onClick={() => setChartType((t) => (t === 'candle' ? 'bar' : t === 'bar' ? 'line' : 'candle'))}
          label={`Chart type: ${chartType} — tap to switch`}
        >
          {chartType === 'candle' ? <IconCandle size={20} /> :
           chartType === 'bar'    ? <IconBars   size={20} /> :
                                    <IconLine   size={20} />}
        </ToolbarBtn>
        <button
          onClick={() => setIndSheetOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold text-ink-700 dark:text-night-100 hover:bg-ink-50 dark:hover:bg-night-700"
        >
          <IconFx size={18} /> Indicators
        </button>
        <div className="w-px h-5 bg-ink-200 dark:bg-night-500/40 mx-1" />
        <ToolbarBtn onClick={() => {}} label="Draw (coming soon)" disabled><IconPencil size={18} /></ToolbarBtn>
        <ToolbarBtn onClick={() => {}} label="Rotate" disabled><IconRotate size={18} /></ToolbarBtn>
        <div className="ml-auto" />
        <ToolbarBtn onClick={() => {}} label="More" disabled><IconDots size={18} /></ToolbarBtn>
      </div>

      {/* ─── SYMBOL HEADER (symbol · interval · exchange / price · change / indicators) */}
      <div className="shrink-0 px-3 pt-2 pb-2 bg-white dark:bg-night-900">
        <div className="text-[11px] tracking-tight text-ink-500 dark:text-night-200">
          <span className="font-bold text-ink-800 dark:text-night-50">{symbol}</span>
          <span className="mx-1.5">·</span>
          <span>{interval.replace('m', '').replace('h', '').toUpperCase() || interval}</span>
          <span className="mx-1.5">·</span>
          <span>NSE</span>
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="num text-xl font-bold tracking-tight text-ink-800 dark:text-night-50">
            {price != null ? fmtNum(price) : '—'}
          </span>
          {live && (
            <span className={`text-xs font-semibold num ${changeUp ? 'text-pos' : 'text-neg'}`}>
              {changeUp ? '+' : ''}{change.toFixed(2)} ({changeUp ? '+' : ''}{changePct.toFixed(2)}%)
            </span>
          )}
        </div>
        {activeIndicators.length > 0 && (
          <div className="text-[11px] text-ink-500 dark:text-night-200 mt-0.5 truncate">
            {activeIndicators.join(' · ')}
          </div>
        )}
      </div>

      {/* ─── CHART AREA */}
      <div className="flex-1 flex flex-col relative min-h-0">
        <TerminalLegend
          hover={hover}
          fallback={candles[candles.length - 1]}
          liveBar={liveBar}
          live={price}
          interval={interval}
        />
        <div ref={priceRef} className="flex-1 min-h-0 touch-none" />
        {showVol && (
          <div className="border-t border-ink-100 dark:border-night-500/40 shrink-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-400 dark:text-night-200 px-2 pt-1">
              Volume
            </div>
            <div ref={volRef} style={{ height: 90 }} className="touch-none" />
          </div>
        )}
        {showRsi && (
          <div className="border-t border-ink-100 dark:border-night-500/40 shrink-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-400 dark:text-night-200 px-2 pt-1">
              RSI (14)
            </div>
            <div ref={rsiRef} style={{ height: 90 }} className="touch-none" />
          </div>
        )}
        {showMacd && (
          <div className="border-t border-ink-100 dark:border-night-500/40 shrink-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-400 dark:text-night-200 px-2 pt-1">
              MACD (12, 26, 9)
            </div>
            <div ref={macdRef} style={{ height: 100 }} className="touch-none" />
          </div>
        )}
      </div>

      {/* ─── BOTTOM UTILITY BAR (date range · live clock · % / log / auto) */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-ink-100 dark:border-night-500/40 bg-white dark:bg-night-900 text-[11px] text-ink-500 dark:text-night-200">
        <button className="inline-flex items-center gap-1 font-semibold text-ink-700 dark:text-night-100">
          Date Range <IconChevronDown size={12} />
        </button>
        <span className="flex-1 text-center num">
          {now.toLocaleTimeString('en-IN', { hour12: false })} (UTC+5:30)
        </span>
        <ScaleChip active={priceMode === 'percent'} onClick={() => setPriceMode((m) => (m === 'percent' ? 'price' : 'percent'))} label="%" />
        <ScaleChip active={logScale} onClick={() => setLogScale((v) => !v)} label="log" />
        <ScaleChip active={autoScale} onClick={() => setAutoScale((v) => !v)} label="auto" />
        {loading && <span className="text-accent"><Spinner size={12} thickness={3} /></span>}
      </div>

      {/* ─── INTERVAL BOTTOM SHEET */}
      {intervalSheetOpen && (
        <BottomSheet title="Interval" onClose={() => setIntervalSheetOpen(false)}>
          <div className="grid grid-cols-5 gap-2">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                onClick={() => { setInterval(iv); setIntervalSheetOpen(false); }}
                className={`py-2.5 rounded-lg text-sm font-bold ${
                  interval === iv
                    ? 'bg-brand text-white'
                    : 'bg-ink-50 dark:bg-night-700 text-ink-700 dark:text-night-100'
                }`}
              >
                {iv}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {/* ─── INDICATORS BOTTOM SHEET */}
      {indSheetOpen && (
        <BottomSheet title="Indicators" onClose={() => setIndSheetOpen(false)}>
          <IndicatorGroup title="Trend">
            <IndRow label="SMA 20"  on={ind.sma20}  onChange={(v) => setInd({ ...ind, sma20:  v })} dot="#3b82f6" />
            <IndRow label="SMA 50"  on={ind.sma50}  onChange={(v) => setInd({ ...ind, sma50:  v })} dot="#f59e0b" />
            <IndRow label="SMA 200" on={ind.sma200} onChange={(v) => setInd({ ...ind, sma200: v })} dot="#a855f7" />
            <IndRow label="EMA 20"  on={ind.ema20}  onChange={(v) => setInd({ ...ind, ema20:  v })} dot="#22d3ee" />
            <IndRow label="EMA 50"  on={ind.ema50}  onChange={(v) => setInd({ ...ind, ema50:  v })} dot="#ec4899" />
            <IndRow label="VWAP"    on={ind.vwap}   onChange={(v) => setInd({ ...ind, vwap:   v })} dot="#f97316" />
          </IndicatorGroup>
          <IndicatorGroup title="Volatility">
            <IndRow label="Bollinger Bands (20, 2)" on={ind.bb} onChange={(v) => setInd({ ...ind, bb: v })} dot="#94a3b8" />
          </IndicatorGroup>
          <IndicatorGroup title="Momentum">
            <IndRow label="RSI (14)"        on={ind.rsi}  onChange={(v) => setInd({ ...ind, rsi:  v })} />
            <IndRow label="MACD (12, 26, 9)" on={ind.macd} onChange={(v) => setInd({ ...ind, macd: v })} />
          </IndicatorGroup>
          <IndicatorGroup title="Volume">
            <IndRow label="Volume" on={ind.volume} onChange={(v) => setInd({ ...ind, volume: v })} />
          </IndicatorGroup>
        </BottomSheet>
      )}
    </div>
  );
}

/** Square 36px icon button for the top toolbar. */
function ToolbarBtn({
  children, onClick, label, disabled,
}: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-700 dark:text-night-100 hover:bg-ink-50 dark:hover:bg-night-700 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

/** Compact chip used by the bottom utility bar (% / log / auto). */
function ScaleChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-1.5 py-0.5 rounded text-[11px] font-semibold tracking-tight ${
        active
          ? 'bg-brand/15 text-accent'
          : 'text-ink-500 dark:text-night-200 hover:bg-ink-50 dark:hover:bg-night-700'
      }`}
    >
      {label}
    </button>
  );
}

/** Modal sheet that slides up from the bottom. Tap-anywhere-to-dismiss. */
function BottomSheet({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-ink-900/40 dark:bg-black/60 flex items-end animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-white dark:bg-night-700 rounded-t-2xl shadow-cardHover animate-slideUp max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-ink-50 dark:bg-night-600 inline-flex items-center justify-center" aria-label="Close">
            <IconX size={14} />
          </button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function IndicatorGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-[10px] uppercase tracking-wider font-bold text-ink-400 dark:text-night-200 mb-1.5">{title}</div>
      <div className="rounded-xl bg-ink-50 dark:bg-night-600/60 divide-y divide-ink-100 dark:divide-night-500/40">
        {children}
      </div>
    </div>
  );
}

function IndRow({
  label, on, onChange, dot,
}: { label: string; on: boolean; onChange: (v: boolean) => void; dot?: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="w-full flex items-center justify-between px-3.5 py-2.5 text-left text-sm"
    >
      <span className="flex items-center gap-2">
        {dot && <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />}
        <span className="text-ink-800 dark:text-night-50">{label}</span>
      </span>
      <span
        className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${
          on ? 'bg-brand' : 'bg-ink-200 dark:bg-night-500'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-card transition-transform ${
            on ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

/** Translate the active indicator booleans into a flat label list for the
 *  header legend (e.g. "SMA 20 · RSI 14"). */
function activeIndicatorLabels(ind: IndicatorState): string[] {
  const out: string[] = [];
  if (ind.sma20)  out.push('SMA 20');
  if (ind.sma50)  out.push('SMA 50');
  if (ind.sma200) out.push('SMA 200');
  if (ind.ema20)  out.push('EMA 20');
  if (ind.ema50)  out.push('EMA 50');
  if (ind.bb)     out.push('BB (20, 2)');
  if (ind.vwap)   out.push('VWAP');
  if (ind.volume) out.push('Volume');
  if (ind.rsi)    out.push('RSI 14');
  if (ind.macd)   out.push('MACD');
  return out;
}

/**
 * Pick how many of the most recent candles to fit on the initial view per
 * period. Tuned for a "300% zoom" first impression — i.e. roughly a third
 * of what `fitContent()` would show — so each candle has real screen real
 * estate the moment the chart opens. The user can pinch / scroll-wheel out
 * to see more history (we never auto-adjust after the first paint).
 */
function initialVisibleCount(interval: Interval, total: number): number {
  // Target ~"last N candles" on first paint so each bar has comfortable
  // screen real estate. Sized per-interval so a 1m chart and a 2h chart
  // both feel readable, not crushed or stretched.
  const target = (() => {
    switch (interval) {
      case '1m':  return 60;   // last ~1 hour
      case '2m':  return 60;   // last ~2 hours
      case '3m':  return 60;   // last ~3 hours
      case '5m':  return 60;   // last ~5 hours
      case '10m': return 50;   // last ~8 hours
      case '15m': return 60;   // last ~15 hours of session time (~2 days)
      case '20m': return 50;   // last ~2 days
      case '30m': return 50;   // last ~3 days
      case '1h':  return 60;   // last ~10 trading days
      case '2h':  return 60;   // last ~3 weeks
      default:    return 50;
    }
  })();
  return Math.max(20, Math.min(total, target));
}

// ----- Indicator math -----
function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function rsi(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function zipLine(vals: (number | null)[], times: number[]): LineData[] {
  const out: LineData[] = [];
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] != null) out.push({ time: times[i] as any, value: vals[i] as number });
  }
  return out;
}

// Variant for indicators that fill leading values with NaN instead of null.
function zipLineN(vals: (number | typeof NaN)[], times: number[]): LineData[] {
  const out: LineData[] = [];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i] as number;
    if (Number.isFinite(v)) out.push({ time: times[i] as any, value: v });
  }
  return out;
}

function TerminalLegend({
  hover, fallback, liveBar, live, interval,
}: {
  hover: Candle | null;
  fallback: Candle | undefined;
  liveBar: Candle | null;
  live: number | undefined;
  interval: Interval;
}) {
  // Priority: user hover > the live forward-walking bar > last fetched bar.
  // When the user isn't hovering, the legend tracks the bar currently being
  // built by WS ticks — so OHLC numbers move with every quote.
  const point =
    hover
    || liveBar
    || (fallback ? { ...fallback, close: live ?? fallback.close } : null);
  if (!point) return null;
  const isLive = !hover && (liveBar !== null || live != null);
  const ts = new Date(point.time * 1000);
  const date = ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  const time = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="absolute top-2 left-2 z-10 pointer-events-none">
      <div className="rounded-lg bg-white/85 dark:bg-night-800/85 backdrop-blur border border-ink-100 dark:border-night-500/40 px-2.5 py-1.5 text-[11px] font-medium shadow-card">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-ink-500 dark:text-night-200">{date} · {time}</span>
          <span className="px-1.5 py-0.5 rounded-full bg-ink-100 dark:bg-night-600 text-[9px] tracking-wider font-bold uppercase text-ink-600 dark:text-night-100">
            {interval}
          </span>
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[9px] tracking-wider font-bold uppercase text-pos">
              <span className="relative inline-block w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-pos animate-ping opacity-75" />
                <span className="absolute inset-0 rounded-full bg-pos" />
              </span>
              LIVE
            </span>
          )}
        </div>
        <div className="flex gap-2.5 num">
          <span><span className="text-ink-400 dark:text-night-200">O</span> {point.open.toFixed(2)}</span>
          <span className="text-pos"><span className="text-ink-400 dark:text-night-200">H</span> {point.high.toFixed(2)}</span>
          <span className="text-neg"><span className="text-ink-400 dark:text-night-200">L</span> {point.low.toFixed(2)}</span>
          <span><span className="text-ink-400 dark:text-night-200">C</span> {point.close.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
