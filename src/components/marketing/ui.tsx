/**
 * Shared building blocks for the public marketing pages (/, /features, /pricing):
 * brand colours, scroll-reveal, the candle CTA button, the live ticker, and the
 * shared nav + footer. Keeps every marketing page consistent.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

export const BRAND = '#5367ff';
export const GREEN = '#00b386';
export const RED = '#eb5b3c';

/* ---------- Scroll-into-view reveal ---------- */
export type Dir = 'up' | 'down' | 'left' | 'right' | 'scale';
export function Reveal({
  children, dir = 'up', delay = 0, className = '', as: Tag = 'div',
}: {
  children: React.ReactNode; dir?: Dir; delay?: number; className?: string;
  as?: 'div' | 'section' | 'span' | 'li';
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }),
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as any} style={{ transitionDelay: `${delay}ms` }}
      className={`reveal reveal-${dir} ${shown ? 'in-view' : ''} ${className}`}>
      {children}
    </Tag>
  );
}

/* ---------- Scroll progress bar ---------- */
export function ScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setPct(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5">
      <div className="h-full transition-[width] duration-150" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${RED}, ${GREEN})` }} />
    </div>
  );
}

/* ---------- Candle (red→green) CTA button ---------- */
export function CandleButton({ to, children, onClick }: { to?: string; children: React.ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="candle-glyph relative inline-flex flex-col items-center justify-center w-3 h-6">
        <span className="absolute top-0 w-px h-1.5 bg-white/90" />
        <span className="w-2.5 h-3.5 rounded-[2px] bg-white/90" />
        <span className="absolute bottom-0 w-px h-1.5 bg-white/90" />
      </span>
      {children}
    </>
  );
  const cls = 'candle-btn group px-6 h-12 inline-flex items-center gap-2.5 rounded-xl text-base font-bold text-white';
  return to ? <Link to={to} className={cls}>{inner}</Link> : <button onClick={onClick} className={cls}>{inner}</button>;
}

/* ---------- Live price ticker ---------- */
const TICKER = [
  ['NIFTY', '23,123.00', -1.04], ['SENSEX', '74,438.93', -0.96], ['BANKNIFTY', '54,307.85', 0.22],
  ['RELIANCE', '1,263.30', -2.15], ['TCS', '2,151.40', -2.16], ['INFY', '1,187.60', -0.83],
  ['HDFCBANK', '738.65', -1.12], ['GOLD', '1,54,828', 0.18], ['SILVER', '2,66,111', 1.20],
  ['CRUDEOIL', '9,074', -1.80], ['ICICIBANK', '1,250.20', 0.78], ['SBIN', '981.95', 0.43],
];
function TickerStrip() {
  const row = (
    <div className="flex items-center gap-6 px-3 shrink-0">
      {TICKER.map(([sym, px, ch]) => {
        const up = (ch as number) >= 0;
        return (
          <span key={sym as string} className="inline-flex items-center gap-2 text-xs whitespace-nowrap">
            <span className="font-semibold text-night-100">{sym}</span>
            <span className="num text-night-50">{px}</span>
            <span className="num font-semibold" style={{ color: up ? GREEN : RED }}>{up ? '▲' : '▼'} {Math.abs(ch as number).toFixed(2)}%</span>
          </span>
        );
      })}
    </div>
  );
  return (
    <div className="border-t border-night-500/20 bg-night-800/60 overflow-hidden">
      <div className="ticker-track flex w-max">{row}{row}</div>
    </div>
  );
}

/* ---------- Shared nav ---------- */
export function MarketingNav() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `hover:text-white transition ${isActive ? 'text-white' : 'text-night-100'}`;
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-night-900/85 border-b border-night-500/30">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand text-white font-bold">T</span>
          <span className="font-bold tracking-tight text-lg">Tradar</span>
        </Link>
        <div className="ml-auto hidden md:flex items-center gap-6 text-sm">
          <NavLink to="/" end className={link}>Home</NavLink>
          <NavLink to="/features" className={link}>Features</NavLink>
          <NavLink to="/pricing" className={link}>Pricing</NavLink>
        </div>
        <div className="ml-auto md:ml-4 flex items-center gap-2">
          <Link to="/login" className="px-3.5 h-9 inline-flex items-center rounded-lg text-sm font-semibold text-night-50 hover:bg-night-700 transition">Sign in</Link>
          <Link to="/register" className="px-4 h-9 inline-flex items-center rounded-lg text-sm font-bold bg-brand text-white hover:bg-brand-600 transition shadow-[0_4px_20px_-4px_rgba(83,103,255,0.6)]">Get started</Link>
        </div>
      </nav>
      <TickerStrip />
    </header>
  );
}

/* ---------- Shared footer ---------- */
export function MarketingFooter() {
  return (
    <footer className="border-t border-night-500/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand text-white font-bold">T</span>
            <span className="font-bold text-lg text-night-50">Tradar</span>
          </div>
          <p className="text-night-200">Paper-trading terminal for Indian markets.</p>
        </div>
        <FooterCol title="Product" links={[['Home', '/'], ['Features', '/features'], ['Pricing', '/pricing']]} />
        <FooterCol title="Markets" links={['NSE Equities', 'BSE', 'F&O', 'MCX']} />
        <FooterCol title="Account" links={[['Sign in', '/login'], ['Get started', '/register']]} />
      </div>
      <div className="border-t border-night-500/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-2 items-center justify-between text-xs text-night-300">
          <span>Paper trading only · virtual money · not investment advice.</span>
          <span>© 2026 Tradar</span>
        </div>
      </div>
    </footer>
  );
}
function FooterCol({ title, links }: { title: string; links: (string | [string, string])[] }) {
  return (
    <div>
      <div className="font-bold text-night-50 mb-3">{title}</div>
      <ul className="space-y-2 text-night-200">
        {links.map((l) => {
          const [label, to] = Array.isArray(l) ? l : [l, null];
          return (
            <li key={label}>
              {to ? <Link to={to} className="hover:text-white transition">{label}</Link>
                  : <span className="hover:text-white transition cursor-default">{label}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Page shell every marketing page wraps itself in. */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-night-900 text-night-50 antialiased selection:bg-brand/30 overflow-x-hidden">
      <ScrollProgress />
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}
