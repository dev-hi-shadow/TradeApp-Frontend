/**
 * Equity-curve chart for the Analytics page.
 *
 * Renders the running cumulative net P&L as a lightweight-charts area series.
 * Series colour is green when the final cumulative ≥ 0, red otherwise. The
 * chart background is transparent so it blends into the card (palette approach
 * copied from StockDetail). ~220px tall, responsive width.
 */
import { useEffect, useMemo, useRef } from 'react';
import { createChart, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type AreaData } from 'lightweight-charts';
import { useTheme } from '../../context/ThemeContext';
import type { EquityPoint } from '../../api/analytics';

const POS = '#00b386';
const NEG = '#eb5b3c';

export function EquityCurveChart({ data }: { data: EquityPoint[] }) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  // Transparent bg + invisible grid so the chart blends into the card.
  const palette = useMemo(() => {
    if (theme === 'dark') {
      return { bg: 'transparent', text: '#b0b8c8', grid: 'rgba(255,255,255,0.04)', crosshair: 'rgba(176,184,200,0.4)' };
    }
    return { bg: 'transparent', text: '#696c75', grid: 'rgba(15,16,18,0.04)', crosshair: 'rgba(105,108,117,0.4)' };
  }, [theme]);

  const up = useMemo(() => {
    const last = data[data.length - 1];
    return !last || last.cumulative >= 0;
  }, [data]);

  // Build / tear-down the chart on theme change.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: palette.bg }, textColor: palette.text, fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: 'transparent' }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderVisible: false },
      leftPriceScale: { visible: false },
      timeScale: { borderVisible: false, timeVisible: false, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: palette.crosshair, style: LineStyle.Dashed, width: 1, labelVisible: true },
        horzLine: { color: palette.crosshair, style: LineStyle.Dashed, width: 1, labelVisible: true },
      },
      handleScroll: { horzTouchDrag: false, vertTouchDrag: false, mouseWheel: false, pressedMouseMove: false },
      handleScale: { axisPressedMouseMove: { time: false, price: false }, mouseWheel: false, pinch: false },
      autoSize: true,
    });
    chartRef.current = chart;

    const resize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
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

  // (Re)build the series whenever the data or colour direction changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) {
      try { chart.removeSeries(seriesRef.current); } catch {}
      seriesRef.current = null;
    }
    const color = up ? POS : NEG;
    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: up ? 'rgba(0,179,134,0.22)' : 'rgba(235,91,60,0.22)',
      bottomColor: up ? 'rgba(0,179,134,0.00)' : 'rgba(235,91,60,0.00)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    seriesRef.current = series;
    // lightweight-charts accepts a 'YYYY-MM-DD' business-day string as `time`.
    series.setData(data.map<AreaData>((d) => ({ time: d.date as any, value: d.cumulative })));

    // Zero reference line so profit/loss territory is obvious.
    try {
      series.createPriceLine({
        price: 0,
        color: theme === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(15,16,18,0.20)',
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: false,
        title: '',
      });
    } catch {}

    try { chart.timeScale().fitContent(); } catch {}
  }, [data, up, theme]);

  if (data.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-sm text-ink-500 dark:text-night-200">
        No trades yet
      </div>
    );
  }

  return <div ref={containerRef} style={{ height: 220 }} className="w-full" />;
}
