/**
 * Single source of truth for "company logo" badges across the app.
 *
 * Strategy (no external CDN — reliable + offline-friendly):
 *   • Major Indian brands have a hand-picked brand colour
 *   • Indices + commodities get an emoji + brand colour
 *   • Everything else hashes its symbol → HSL hue for a deterministic
 *     but visually distinct colour
 *   • Initials = first 2-3 letters, bold, white on coloured background
 *
 * Wherever you want a logo, drop in <StockLogo symbol="RELIANCE" size={36} />.
 */
import { useMemo } from 'react';

/** Hand-picked colours that roughly match each company's real brand identity. */
const BRAND_COLOR: Record<string, string> = {
  // ---- Indices ----
  NIFTY:        '#00b386',
  'NIFTY 50':   '#00b386',
  BANKNIFTY:    '#9333ea',
  'NIFTY BANK': '#9333ea',
  FINNIFTY:     '#10b981',
  SENSEX:       '#ef4444',
  'GIFT NIFTY': '#0099a8',

  // ---- Commodities ----
  GOLD:       '#eab308',
  SILVER:     '#94a3b8',
  CRUDEOIL:   '#1f2937',
  NATURALGAS: '#3b82f6',
  COPPER:     '#b45309',

  // ---- Top NSE equities — hand-tuned to brand ----
  RELIANCE:    '#0099a8',
  TCS:         '#1d3a82',
  INFY:        '#007cc3',
  HDFCBANK:    '#004c8f',
  ICICIBANK:   '#f37e1f',
  SBIN:        '#2e6db4',
  AXISBANK:    '#97144d',
  KOTAKBANK:   '#ed1c24',
  BHARTIARTL:  '#ed1c24',
  ITC:         '#005bab',
  LT:          '#bc1f2c',
  WIPRO:       '#3f1f5e',
  HCLTECH:     '#0080c0',
  MARUTI:      '#dc2626',
  TITAN:       '#dc2626',
  ADANIENT:    '#005baa',
  TATAMOTORS:  '#2154a3',
  HINDUNILVR:  '#0070c0',
  BAJFINANCE:  '#1e3a8a',
  ASIANPAINT:  '#e8243e',
  ETERNAL:     '#0066cc',
  ZOMATO:      '#cb202d',
  SWIGGY:      '#fc8019',
  PAYTM:       '#00bafe',
  NYKAA:       '#e80f5b',
  POLICYBZR:   '#19a6f0',
  IRCTC:       '#1e40af',
  SBILIFE:     '#1f7a8c',
  HDFCLIFE:    '#004c8f',
  TATASTEEL:   '#4a5568',
  JSWSTEEL:    '#0f3a6a',
  ONGC:        '#dc2626',
  IOC:         '#ec4900',
  POWERGRID:   '#005faa',
  NTPC:        '#1b5e20',
  COALINDIA:   '#374151',
  ULTRACEMCO:  '#0070ff',
  GRASIM:      '#005baa',
  SUNPHARMA:   '#f59e0b',
  DRREDDY:     '#1e3a8a',
  CIPLA:       '#1d6cb9',
  DIVISLAB:    '#dc2626',
  DMART:       '#16a34a',
  TRENT:       '#1f2937',
  ADANIPORTS:  '#005baa',
  ADANIGREEN:  '#16a34a',
  TATACONSUM:  '#2154a3',
  PIDILITIND:  '#fdc500',
  HAVELLS:     '#dc2626',
  EICHERMOT:   '#1f2937',
  BAJAJ_AUTO:  '#1f3a82',
};

/** Some symbols look better with an emoji prefix (indices / commodities). */
const EMOJI: Record<string, string> = {
  NIFTY:        '📈',
  'NIFTY 50':   '📈',
  BANKNIFTY:    '🏦',
  'NIFTY BANK': '🏦',
  FINNIFTY:     '💼',
  SENSEX:       '📊',
  'GIFT NIFTY': '🌏',
  GOLD:         '🥇',
  SILVER:       '🥈',
  CRUDEOIL:     '🛢️',
  NATURALGAS:   '🔥',
  COPPER:       '🟤',
};

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 58%, 42%)`;
}

function pickColor(symbol: string): string {
  return BRAND_COLOR[symbol] || hashColor(symbol);
}

function pickInitials(symbol: string): string {
  // For multi-word symbols ("NIFTY 50") take both initials
  if (symbol.includes(' ')) {
    return symbol
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || '')
      .join('')
      .toUpperCase();
  }
  return symbol.slice(0, symbol.length >= 4 ? 3 : 2).toUpperCase();
}

interface Props {
  symbol: string;
  size?: number;
  className?: string;
}

export function StockLogo({ symbol, size = 36, className = '' }: Props) {
  const upper = symbol.toUpperCase();
  const color = useMemo(() => pickColor(upper), [upper]);
  const emoji = EMOJI[upper];
  const initials = useMemo(() => pickInitials(upper), [upper]);

  const fontSize =
    emoji
      ? Math.round(size * 0.50)
      : initials.length >= 3
        ? Math.round(size * 0.30)
        : Math.round(size * 0.36);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-2xl shrink-0 text-white font-bold tracking-tight ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize,
        lineHeight: 1,
      }}
      aria-label={symbol}
      title={symbol}
    >
      {emoji || initials}
    </span>
  );
}
