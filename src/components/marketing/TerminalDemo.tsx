/**
 * Interactive terminal-chart demo for the marketing site. Uses the SAME
 * charting engine as the real app (lightweight-charts), with self-contained
 * simulated OHLC so it works on a public page with no backend:
 *   • interval switcher (1m / 5m / 15m / 1h / 1D) — regenerates the series
 *   • candle ⇄ line toggle
 *   • pan + zoom (real terminal interaction)
 *   • live crosshair OHLC readout
 *   • a streaming last candle so it feels alive
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type CandlestickData, type LineData,
} from 'lightweight-charts';

const POS = '#00b386';
const NEG = '#eb5b3c';
type Candle = { time: number; open: number; high: number; low: number; close: number };
type Ctype = 'candle' | 'line';

const INTERVALS: { key: string; sec: number }[] = [
  { key: '1m', sec: 60 }, { key: '5m', sec: 300 }, { key: '15m', sec: 900 },
  { key: '1h', sec: 3600 }, { key: '1D', sec: 86400 },
];

function gen(count: number, bucketSec: number, start = 23400): Candle[] {
  const out: Candle[] = [];
  let prev = start;
  let t = Math.floor(Date.now() / 1000);
  t = t - (t % bucketSec) - count * bucketSec;
  for (let i = 0; i < count; i++) {
    const open = prev;
    const close = Math.max(1, open + (Math.random() - 0.5) * open * 0.005);
    const high = Math.max(open, close) + Math.random() * open * 0.0025;
    const low = Math.min(open, close) - Math.random() * open * 0.0025;
    out.push({
      time: t + i * bucketSec,
      open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +close.toFixed(2),
    });
    prev = close;
  }
  return out;
}

export function TerminalDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const dataRef = useRef<Candle[]>([]);
  const [interval, setIntervalKey] = useState('5m');
  const [ctype, setCtype] = useState<Ctype>('candle');
  const [ohlc, setOhlc] = useState<Candle | null>(null);

  const bucketSec = useMemo(() => INTERVALS.find((i) => i.key === interval)!.sec, [interval]);

  // Build the chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#b0b8c8', fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(176,184,200,0.4)', style: LineStyle.Dashed, labelVisible: true },
        horzLine: { color: 'rgba(176,184,200,0.4)', style: LineStyle.Dashed, labelVisible: true },
      },
    });
    chartRef.current = chart;
    chart.subscribeCrosshairMove((p) => {
      const s = seriesRef.current;
      if (!s || !p.point || !p.seriesData) { setOhlc(null); return; }
      const d: any = p.seriesData.get(s);
      if (!d) { setOhlc(null); return; }
      setOhlc('open' in d
        ? { time: Number(d.time), open: d.open, high: d.high, low: d.low, close: d.close }
        : { time: Number(d.time), open: d.value, high: d.value, low: d.value, close: d.value });
    });
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);

  // (Re)build the series + data on interval / chart-type change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) { chart.removeSeries(seriesRef.current); seriesRef.current = null; }
    const data = gen(130, bucketSec);
    dataRef.current = data;
    if (ctype === 'candle') {
      const s = chart.addCandlestickSeries({
        upColor: POS, downColor: NEG, borderUpColor: POS, borderDownColor: NEG, wickUpColor: POS, wickDownColor: NEG,
      });
      s.setData(data as CandlestickData[]);
      seriesRef.current = s;
    } else {
      const up = data[data.length - 1].close >= data[0].close;
      const s = chart.addAreaSeries({
        lineColor: up ? POS : NEG, lineWidth: 2,
        topColor: up ? 'rgba(0,179,134,0.25)' : 'rgba(235,91,60,0.25)',
        bottomColor: 'rgba(0,0,0,0)',
      });
      s.setData(data.map((c) => ({ time: c.time as any, value: c.close })) as LineData[]);
      seriesRef.current = s;
    }
    chart.timeScale().fitContent();
  }, [bucketSec, ctype]);

  // Stream the last candle so it feels live.
  useEffect(() => {
    const id = window.setInterval(() => {
      const data = dataRef.current;
      const s = seriesRef.current;
      if (!data.length || !s) return;
      const last = { ...data[data.length - 1] };
      const np = Math.max(1, last.close + (Math.random() - 0.5) * last.close * 0.0025);
      last.close = +np.toFixed(2);
      last.high = +Math.max(last.high, np).toFixed(2);
      last.low = +Math.min(last.low, np).toFixed(2);
      data[data.length - 1] = last;
      try {
        if (ctype === 'candle') s.update(last as any);
        else s.update({ time: last.time as any, value: last.close } as any);
      } catch { /* mid-rebuild */ }
    }, 1400);
    return () => window.clearInterval(id);
  }, [ctype]);

  const lastClose = dataRef.current.length ? dataRef.current[dataRef.current.length - 1].close : 0;
  const dayUp = lastClose >= (dataRef.current[0]?.close ?? lastClose);

  return (
    <div className="rounded-2xl border border-night-500/50 bg-night-800/80 shadow-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-night-500/40 bg-night-900/60">
        <span className="font-bold text-night-50">NIFTY</span>
        <span className="num text-sm font-semibold" style={{ color: dayUp ? POS : NEG }}>{lastClose.toFixed(2)}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-pos/15 text-pos font-semibold">TERMINAL</span>
        {/* OHLC readout */}
        {ohlc && (
          <span className="hidden sm:flex items-center gap-2 text-[11px] num text-night-200 ml-2">
            <span>O <b className="text-night-50">{ohlc.open.toFixed(1)}</b></span>
            <span>H <b className="text-night-50">{ohlc.high.toFixed(1)}</b></span>
            <span>L <b className="text-night-50">{ohlc.low.toFixed(1)}</b></span>
            <span>C <b className="text-night-50">{ohlc.close.toFixed(1)}</b></span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* interval pills */}
          <div className="flex items-center gap-1 mr-1">
            {INTERVALS.map((iv) => (
              <button key={iv.key} onClick={() => setIntervalKey(iv.key)}
                className={`px-2 h-7 rounded-md text-[11px] font-bold transition ${interval === iv.key ? 'bg-brand text-white' : 'bg-night-700 text-night-100 hover:bg-night-600'}`}>
                {iv.key}
              </button>
            ))}
          </div>
          {/* candle/line toggle */}
          <div className="inline-flex p-0.5 rounded-md bg-night-700">
            {(['candle', 'line'] as Ctype[]).map((t) => (
              <button key={t} onClick={() => setCtype(t)}
                className={`px-2 h-6 rounded text-[11px] font-bold transition ${ctype === t ? 'bg-night-50 text-night-900' : 'text-night-200'}`}>
                {t === 'candle' ? '🕯️' : '📈'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* Chart */}
      <div ref={containerRef} className="w-full h-[360px]" />
      <div className="px-4 py-2 text-[11px] text-night-300 border-t border-night-500/40">
        Drag to pan · scroll to zoom · hover for OHLC — live demo with simulated data.
      </div>
    </div>
  );
}
