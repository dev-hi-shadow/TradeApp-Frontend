/**
 * Public marketing landing page for Tradar — trading-themed, long-form.
 *
 * Highlights:
 *   • Web ⇄ Mobile toggle that swaps real app screenshots AND the device frame
 *     (browser window ↔ phone) + view tabs.
 *   • Live scrolling price ticker, animated candlestick decor, big Smackdab-style
 *     typographic bands, floating pill labels on screenshots, stat band, FAQ.
 *   • "Candle" CTA buttons that hover RED → GREEN (turn your loss into profit).
 *
 * Standalone dark theme so it always matches the dark product screenshots.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/* ---------- Pointer parallax (returns -1..1 from screen center) ---------- */
function useParallax() {
  const [p, setP] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (window.matchMedia?.('(pointer: coarse)').matches) return; // skip on touch
    const onMove = (e: MouseEvent) => {
      setP({ x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return p;
}

/* ---------- Scroll-into-view reveal (IntersectionObserver) ---------- */
type Dir = 'up' | 'down' | 'left' | 'right' | 'scale';
function Reveal({
  children, dir = 'up', delay = 0, className = '', as: Tag = 'div',
}: {
  children: React.ReactNode; dir?: Dir; delay?: number; className?: string;
  as?: 'div' | 'section' | 'span';
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }),
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as any}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal reveal-${dir} ${shown ? 'in-view' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}

type Device = 'web' | 'mobile';
type ViewKey = 'home' | 'options' | 'chart' | 'trade' | 'analytics';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'home', label: 'Dashboard' },
  { key: 'options', label: 'Option chain' },
  { key: 'chart', label: 'Charts' },
  { key: 'trade', label: 'Positions' },
  { key: 'analytics', label: 'Analytics' },
];

const BRAND = '#5367ff';
const GREEN = '#00b386';
const RED = '#eb5b3c';

export function Landing() {
  const [device, setDevice] = useState<Device>('web');
  const [view, setView] = useState<ViewKey>('home');
  const shot = `/landing/${device}-${view}.png`;
  const par = useParallax(); // subtle pointer parallax for the hero glow

  return (
    <div className="min-h-screen bg-night-900 text-night-50 antialiased selection:bg-brand/30 overflow-x-hidden">
      <ScrollProgress />
      {/* ── Nav ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-night-900/85 border-b border-night-500/30">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand text-white font-bold">T</span>
            <span className="font-bold tracking-tight text-lg">Tradar</span>
          </div>
          <div className="ml-auto hidden md:flex items-center gap-6 text-sm text-night-100">
            <a href="#showcase" className="hover:text-white transition">Product</a>
            <Link to="/features" className="hover:text-white transition">Features</Link>
            <Link to="/pricing" className="hover:text-white transition">Pricing</Link>
            <a href="#faq" className="hover:text-white transition">FAQ</a>
          </div>
          <div className="ml-auto md:ml-4 flex items-center gap-2">
            <Link to="/login" className="px-3.5 h-9 inline-flex items-center rounded-lg text-sm font-semibold text-night-50 hover:bg-night-700 transition">
              Sign in
            </Link>
            <Link to="/register" className="px-4 h-9 inline-flex items-center rounded-lg text-sm font-bold bg-brand text-white hover:bg-brand-600 transition shadow-[0_4px_20px_-4px_rgba(83,103,255,0.6)]">
              Get started
            </Link>
          </div>
        </nav>
        {/* Live ticker */}
        <Ticker />
      </header>

      {/* ── Hero — asymmetric (text left, floating trading visual right) ── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 -left-20 w-[800px] h-[800px] rounded-full opacity-25 blur-3xl transition-transform duration-300 ease-out"
          style={{ background: `radial-gradient(circle, ${BRAND}55, transparent 60%)`, transform: `translate(${par.x * 30}px, ${par.y * 30}px)` }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-20 w-[700px] h-[700px] rounded-full opacity-20 blur-3xl transition-transform duration-300 ease-out"
          style={{ background: `radial-gradient(circle, ${GREEN}44, transparent 60%)`, transform: `translate(${par.x * -30}px, ${par.y * -30}px)` }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-14 grid lg:grid-cols-12 gap-10 items-center">
          {/* Left: copy */}
          <div className="lg:col-span-7 text-center lg:text-left">
            <Reveal dir="up">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pos/15 text-pos text-xs font-semibold mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-pos animate-pulse" /> Live NSE · BSE · MCX market data
              </span>
            </Reveal>
            <Reveal dir="left" delay={60}>
              <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-[1.02]">
                Turn your <span style={{ color: RED }}>red</span>
                <br className="hidden sm:block" />{' '}
                into <span className="shimmer-text">green.</span>
              </h1>
            </Reveal>
            <Reveal dir="left" delay={140}>
              <p className="mt-6 max-w-xl mx-auto lg:mx-0 text-base sm:text-lg text-night-100">
                A paper-trading terminal for Indian markets — live stocks, F&O option chains, MCX
                commodities, pro charts and analytics. Practise with virtual money, build real skill,
                risk nothing.
              </p>
            </Reveal>
            <Reveal dir="up" delay={220}>
              <div className="mt-8 flex items-center justify-center lg:justify-start gap-3 flex-wrap">
                <CandleButton to="/register">Start trading free</CandleButton>
                <a href="#showcase" className="px-6 h-12 inline-flex items-center rounded-xl text-base font-semibold border border-night-400/60 text-night-50 hover:bg-night-700 transition">
                  See it live
                </a>
              </div>
              <div className="mt-4 text-xs text-night-200">₹10,00,000 virtual balance · no card required</div>
            </Reveal>
          </div>
          {/* Right: interactive demo terminal (live chart + red→green trade) */}
          <div className="lg:col-span-5">
            <Reveal dir="right">
              <DemoTerminal />
              <p className="mt-3 text-center text-xs text-night-300">Live demo — tap BUY/SELL and watch your P&amp;L move 👆</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Device showcase (the toggle) ──────────────────────────────── */}
      <section id="showcase" className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 pt-4">
        <div className="flex justify-center mb-6">
          <div className="inline-flex p-1 rounded-full bg-night-700 border border-night-500/40">
            {(['web', 'mobile'] as Device[]).map((d) => (
              <button key={d} onClick={() => setDevice(d)}
                className={`px-5 h-9 rounded-full text-sm font-bold transition inline-flex items-center gap-2 ${
                  device === d ? 'bg-brand text-white shadow' : 'text-night-100 hover:text-white'
                }`} aria-pressed={device === d}>
                <span>{d === 'web' ? '🖥️' : '📱'}</span>{d === 'web' ? 'Web' : 'Mobile'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-center mb-8">
          <div className="flex flex-wrap justify-center gap-1.5">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`px-3.5 h-8 rounded-full text-xs font-semibold transition ${
                  view === v.key ? 'bg-night-50 text-night-900' : 'bg-night-700 text-night-100 hover:bg-night-600'
                }`}>{v.label}</button>
            ))}
          </div>
        </div>
        <div className="relative flex justify-center">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 mx-auto w-2/3 h-full rounded-full opacity-20 blur-3xl"
            style={{ background: `radial-gradient(circle, ${BRAND}66, transparent 65%)` }} />
          {device === 'web' ? <BrowserFrame src={shot} /> : <PhoneFrame src={shot} />}
        </div>
        <p className="text-center text-sm text-night-200 mt-6">
          {device === 'web'
            ? 'Full desktop terminal — multi-panel, keyboard-first.'
            : 'Mobile-first — the same power, tuned for your thumb.'}
        </p>
      </section>

      {/* ── Markets strip ─────────────────────────────────────────────── */}
      <Reveal as="section" dir="up" className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center text-[11px] uppercase tracking-widest text-night-300 mb-4">Live data across India's markets</div>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 opacity-80">
          {['NSE', 'BSE', 'MCX', 'NIFTY', 'BANKNIFTY', 'SENSEX', 'F&O'].map((m) => (
            <span key={m} className="text-lg sm:text-xl font-extrabold tracking-tight text-night-100">{m}</span>
          ))}
        </div>
      </Reveal>

      {/* ── Big band ──────────────────────────────────────────────────── */}
      <BigBand>ALL-IN-ONE TERMINAL</BigBand>

      {/* ── Features — bento grid ─────────────────────────────────────── */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
        <BentoFeatures device={device} />
      </section>

      {/* ── Oversized type band ───────────────────────────────────────── */}
      <section className="py-12 text-center overflow-hidden">
        <Reveal dir="scale">
          <div className="text-[15vw] leading-none font-extrabold tracking-tighter text-night-50/95">UNLIMITED</div>
        </Reveal>
        <Reveal dir="up" delay={120}>
          <div className="text-2xl sm:text-4xl font-extrabold tracking-tight -mt-2 sm:-mt-4">paper trades.</div>
        </Reveal>
      </section>

      {/* ── Stats (count up on scroll) ────────────────────────────────── */}
      <section id="stats" className="max-w-6xl mx-auto px-4 sm:px-6 pb-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CountUpStat target={1000000} prefix="₹" label="Virtual cash to start" />
          <CountUpStat target={3} label="Exchanges — NSE · BSE · MCX" />
          <CountUpStat target={80000} suffix="+" label="Instruments tradable" />
          <CountUpStat fixed="₹0" label="Real money at risk" />
        </div>
      </section>

      {/* ── What makes Tradar click (left-aligned, big) ───────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
        <Reveal dir="left">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">What makes Tradar</h2>
        </Reveal>
        <Reveal dir="right" delay={80}>
          <div className="text-6xl sm:text-8xl font-extrabold tracking-tighter" style={{ color: GREEN }}>CLICK</div>
        </Reveal>
      </section>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <div className="relative rounded-3xl border border-night-500/30 bg-night-800/60 p-8 sm:p-12 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            {[['Live data', BRAND], ['Option chain', GREEN], ['Real charts', BRAND], ['Analytics', GREEN], ['Watchlists', BRAND]].map(([t, c]) => (
              <span key={t} className="px-3.5 py-1.5 rounded-full text-xs font-bold" style={{ background: `${c}22`, color: c as string }}>{t}</span>
            ))}
          </div>
          <p className="max-w-xl mx-auto text-night-100">
            Whether you're learning your first option spread or stress-testing a strategy, Tradar
            makes practising real, fast and consequence-free.
          </p>
          <div className="mt-6 flex justify-center">
            <CandleButton to="/register">Get going →</CandleButton>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-8">Questions? We've got answers.</h2>
        <div className="divide-y divide-night-500/30 rounded-2xl border border-night-500/30 overflow-hidden">
          {FAQS.map((f) => <Faq key={f.q} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <Reveal as="section" dir="scale" className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="relative overflow-hidden rounded-3xl px-6 py-16 text-center" style={{ background: `linear-gradient(135deg, ${BRAND}, #2f3cb8)` }}>
          <div aria-hidden className="absolute inset-x-0 bottom-0 opacity-25"><CandleStrip count={36} height={90} /></div>
          <h2 className="relative text-3xl sm:text-5xl font-extrabold tracking-tight text-white">Trade fearlessly. Lose nothing.</h2>
          <p className="relative mt-3 text-white/85 max-w-xl mx-auto">₹10,00,000 in virtual cash, live Indian markets, zero risk. It's the only account you'll ever need to learn.</p>
          <div className="relative mt-8 flex justify-center"><CandleButton to="/register">Create free account →</CandleButton></div>
        </div>
      </Reveal>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-night-500/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8 text-sm">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand text-white font-bold">T</span>
              <span className="font-bold text-lg text-night-50">Tradar</span>
            </div>
            <p className="text-night-200">Paper-trading terminal for Indian markets.</p>
          </div>
          <FooterCol title="Product" links={['Dashboard', 'Option chain', 'Charts', 'Analytics']} />
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
    </div>
  );
}

/* ---------- Candle (red→green) CTA button ---------- */
function CandleButton({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="candle-btn group px-6 h-12 inline-flex items-center gap-2.5 rounded-xl text-base font-bold text-white">
      {/* candlestick glyph: wick + body */}
      <span className="candle-glyph relative inline-flex flex-col items-center justify-center w-3 h-6">
        <span className="absolute top-0 w-px h-1.5 bg-white/90" />
        <span className="w-2.5 h-3.5 rounded-[2px] bg-white/90" />
        <span className="absolute bottom-0 w-px h-1.5 bg-white/90" />
      </span>
      {children}
    </Link>
  );
}

/* ---------- Live price ticker ---------- */
const TICKER = [
  ['NIFTY', '23,123.00', -1.04], ['SENSEX', '74,438.93', -0.96], ['BANKNIFTY', '54,307.85', 0.22],
  ['RELIANCE', '1,263.30', -2.15], ['TCS', '2,151.40', -2.16], ['INFY', '1,187.60', -0.83],
  ['HDFCBANK', '738.65', -1.12], ['GOLD', '1,54,828', 0.18], ['SILVER', '2,66,111', 1.20],
  ['CRUDEOIL', '9,074', -1.80], ['ICICIBANK', '1,250.20', 0.78], ['SBIN', '981.95', 0.43],
];
function Ticker() {
  const row = (
    <div className="flex items-center gap-6 px-3 shrink-0">
      {TICKER.map(([sym, px, ch]) => {
        const up = (ch as number) >= 0;
        return (
          <span key={sym as string} className="inline-flex items-center gap-2 text-xs whitespace-nowrap">
            <span className="font-semibold text-night-100">{sym}</span>
            <span className="num text-night-50">{px}</span>
            <span className="num font-semibold" style={{ color: up ? GREEN : RED }}>
              {up ? '▲' : '▼'} {Math.abs(ch as number).toFixed(2)}%
            </span>
          </span>
        );
      })}
    </div>
  );
  return (
    <div className="border-t border-night-500/20 bg-night-800/60 overflow-hidden">
      <div className="ticker-track flex w-max">
        {row}{row}
      </div>
    </div>
  );
}

/* ---------- Decorative candlestick strip ---------- */
function CandleStrip({ count, height }: { count: number; height: number }) {
  // Deterministic pseudo-pattern (no Math.random → stable render).
  const candles = Array.from({ length: count }, (_, i) => {
    const h = 24 + ((i * 37) % Math.max(20, height - 24));
    const up = (i * 7) % 3 !== 0;
    const wick = 6 + ((i * 13) % 14);
    return { h, up, wick, i };
  });
  return (
    <div className="flex items-end justify-center gap-1.5 sm:gap-2" style={{ height }}>
      {candles.map((c) => (
        <span key={c.i} className="relative flex flex-col items-center" style={{ height }}>
          <span className="candle-body relative flex flex-col items-center justify-end" style={{ animationDelay: `${(c.i % 7) * 0.18}s`, height: c.h }}>
            <span className="w-px" style={{ height: c.wick, background: c.up ? GREEN : RED }} />
            <span className="w-1.5 sm:w-2 rounded-[2px]" style={{ height: c.h, background: c.up ? GREEN : RED, opacity: 0.85 }} />
            <span className="w-px" style={{ height: c.wick * 0.6, background: c.up ? GREEN : RED }} />
          </span>
        </span>
      ))}
    </div>
  );
}

/* ---------- Big typographic band ---------- */
function BigBand({ children }: { children: React.ReactNode }) {
  return (
    <Reveal dir="scale" className="text-center py-12">
      <h2 className="text-3xl sm:text-6xl font-extrabold tracking-tight">{children}</h2>
      <div className="mx-auto mt-4 w-16 h-1 rounded-full" style={{ background: GREEN }} />
    </Reveal>
  );
}

/* ---------- Scroll progress bar ---------- */
function ScrollProgress() {
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

/* ---------- Count-up number (animates when scrolled into view) ---------- */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }), { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return { ref, seen };
}
function CountUpStat({ target, prefix = '', suffix = '', label, fixed }: { target?: number; prefix?: string; suffix?: string; label: string; fixed?: string }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen || target == null) return;
    let raf = 0; const t0 = performance.now(); const dur = 1300;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [seen, target]);
  const shown = fixed != null ? fixed : `${prefix}${v.toLocaleString('en-IN')}${suffix}`;
  return (
    <div ref={ref} className="rounded-2xl border border-night-500/30 bg-night-800/60 p-5 text-center">
      <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-brand-400 num">{shown}</div>
      <div className="mt-1 text-xs text-night-200">{label}</div>
    </div>
  );
}

/* ---------- Interactive demo terminal (live chart + red→green trade) ---------- */
function DemoTerminal() {
  const LOT = 75;
  const [pts, setPts] = useState<number[]>(() => Array.from({ length: 44 }, () => 23400));
  const [price, setPrice] = useState(23400);
  const [pos, setPos] = useState<{ side: 'buy' | 'sell'; entry: number } | null>(null);
  const [lots, setLots] = useState(1);

  useEffect(() => {
    const id = setInterval(() => {
      setPrice((p) => {
        const np = Math.max(22900, Math.min(23900, p + (Math.random() - 0.47) * 20));
        const r = Math.round(np * 100) / 100;
        setPts((arr) => [...arr.slice(1), r]);
        return r;
      });
    }, 600);
    return () => clearInterval(id);
  }, []);

  const pnl = pos ? (price - pos.entry) * (pos.side === 'buy' ? 1 : -1) * lots * LOT : 0;
  const up = pos ? pnl >= 0 : price >= pts[0];
  const col = up ? GREEN : RED;

  // SVG path from points
  const W = 320, H = 120;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const path = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / span) * (H - 12) - 6}`).join(' ');
  const endX = W, endY = H - ((price - min) / span) * (H - 12) - 6;

  return (
    <div className="rounded-2xl border border-night-500/40 bg-night-800/80 backdrop-blur p-4 shadow-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-night-50 text-sm">NIFTY</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-pos/15 text-pos font-semibold">DEMO · LIVE</span>
        </div>
        <span className="num text-lg font-extrabold" style={{ color: col }}>{price.toFixed(2)}</span>
      </div>
      {/* live chart */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-28">
        <defs>
          <linearGradient id="demoFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.25" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${path} ${W},${H}`} fill="url(#demoFill)" />
        <polyline points={path} fill="none" stroke={col} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <circle cx={endX} cy={endY} r={3.5} fill={col}>
          <animate attributeName="r" values="3.5;6;3.5" dur="1.4s" repeatCount="indefinite" />
        </circle>
      </svg>
      {/* P&L + ticket */}
      {pos ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-night-200">Demo P&amp;L · {pos.side.toUpperCase()} {lots}×{LOT}</div>
            <div className="num text-xl font-extrabold transition-colors duration-300" style={{ color: col }}>
              {pnl >= 0 ? '+' : ''}₹{Math.abs(Math.round(pnl)).toLocaleString('en-IN')}
            </div>
          </div>
          <button onClick={() => setPos(null)} className="px-3 h-9 rounded-lg text-sm font-bold bg-night-600 text-night-50 hover:bg-night-500 transition">
            Square off
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-night-200">Lots</span>
            <button onClick={() => setLots((l) => Math.max(1, l - 1))} className="w-7 h-7 rounded-lg bg-night-600 text-night-50 font-bold">−</button>
            <span className="num text-sm font-bold w-5 text-center">{lots}</span>
            <button onClick={() => setLots((l) => Math.min(10, l + 1))} className="w-7 h-7 rounded-lg bg-night-600 text-night-50 font-bold">+</button>
            <span className="ml-auto text-[11px] text-night-300">Tap to start a demo trade ↓</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPos({ side: 'buy', entry: price })} className="h-10 rounded-lg font-bold text-white transition" style={{ background: GREEN }}>BUY</button>
            <button onClick={() => setPos({ side: 'sell', entry: price })} className="h-10 rounded-lg font-bold text-white transition" style={{ background: RED }}>SELL</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Bento feature grid ---------- */
function BentoFeatures({ device }: { device: Device }) {
  const img = (v: string) => `/landing/${device}-${v}.png`;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 auto-rows-[minmax(0,auto)]">
      {/* Big: option chain */}
      <Reveal dir="up" className="sm:col-span-2 sm:row-span-2">
        <BentoCard pill="OPTIONS" pillColor={GREEN} title="A real F&O option chain" body="Live premiums, OI, PCR, max-pain & Greeks across NIFTY / BANKNIFTY / SENSEX. Build multi-leg strategies and preview the payoff." img={img('options')} big />
      </Reveal>
      {/* Wide: charts */}
      <Reveal dir="up" delay={80} className="sm:col-span-2">
        <BentoCard pill="CHARTS" pillColor={BRAND} title="Pro charts" body="Live red/green line vs prev close, terminal mode, every interval." img={img('chart')} />
      </Reveal>
      {/* Small: live data */}
      <Reveal dir="up" delay={160} className="sm:col-span-1">
        <BentoMini icon="📡" title="Live data" body="NSE · BSE · MCX, sub-second." />
      </Reveal>
      {/* Small: analytics */}
      <Reveal dir="up" delay={240} className="sm:col-span-1">
        <BentoMini icon="📊" title="Analytics" body="P&L, win-rate, drawdown." />
      </Reveal>
      {/* Wide: dashboard */}
      <Reveal dir="up" delay={120} className="sm:col-span-4">
        <BentoCard pill="DASHBOARD" pillColor={BRAND} title="Your whole market, one screen" body="Watchlists, holdings, positions, orders and alerts — the full terminal." img={img('home')} wide />
      </Reveal>
    </div>
  );
}
function BentoCard({ pill, pillColor, title, body, img, big, wide }: { pill: string; pillColor: string; title: string; body: string; img: string; big?: boolean; wide?: boolean }) {
  return (
    <div className="group relative h-full rounded-3xl border border-night-500/30 bg-night-800/60 p-5 overflow-hidden transition hover:border-night-400/60 hover:-translate-y-0.5">
      <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold mb-3" style={{ background: pillColor, color: '#fff' }}>{pill}</span>
      <h3 className={`font-extrabold tracking-tight ${big ? 'text-2xl' : 'text-xl'}`}>{title}</h3>
      <p className="mt-2 text-sm text-night-100 leading-relaxed max-w-md">{body}</p>
      <img src={img} alt={title} loading="lazy"
        className={`mt-4 w-full rounded-xl border border-night-500/40 shadow-2xl tilt ${wide ? 'max-h-72 object-cover object-top' : ''}`} />
    </div>
  );
}
function BentoMini({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="h-full rounded-3xl border border-night-500/30 bg-night-800/60 p-5 transition hover:-translate-y-0.5">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-bold text-night-50">{title}</div>
      <div className="text-xs text-night-200 mt-1">{body}</div>
    </div>
  );
}

/* ---------- Device frames ---------- */
function BrowserFrame({ src }: { src: string }) {
  return (
    <div className="relative z-10 w-full max-w-5xl rounded-2xl border border-night-500/50 bg-night-700 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden animate-[fadeIn_.3s_ease]">
      <div className="flex items-center gap-2 px-4 h-10 border-b border-night-500/40 bg-night-800">
        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
        <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        <div className="ml-3 flex-1 max-w-md mx-auto h-6 rounded-md bg-night-600 flex items-center justify-center text-[11px] text-night-200">tradar.app</div>
      </div>
      <img src={src} alt="Tradar on web" className="w-full block" loading="eager" />
    </div>
  );
}
function PhoneFrame({ src }: { src: string }) {
  return (
    <div className="relative z-10 w-[290px] rounded-[2.5rem] border-[10px] border-night-600 bg-night-600 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] overflow-hidden animate-[fadeIn_.3s_ease]">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 rounded-full bg-night-900 z-10" />
      <img src={src} alt="Tradar on mobile" className="w-full block rounded-[1.8rem]" loading="eager" />
    </div>
  );
}

/* ---------- FAQ ---------- */
function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen((o) => !o)} className="w-full text-left px-5 py-4 hover:bg-night-800/50 transition">
      <div className="flex items-center justify-between gap-4">
        <span className="font-semibold text-night-50">{q}</span>
        <span className="text-night-300 text-lg shrink-0">{open ? '−' : '+'}</span>
      </div>
      {open && <p className="mt-2 text-sm text-night-100 leading-relaxed">{a}</p>}
    </button>
  );
}

/* ---------- Footer column ---------- */
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

const FAQS = [
  { q: 'Is Tradar real money?', a: 'No — Tradar is 100% paper trading. You start with ₹10,00,000 in virtual cash against live market prices. Nothing you do touches real money.' },
  { q: 'Which markets are covered?', a: 'NSE & BSE equities and indices, NSE/BSE F&O option chains, and MCX commodities — with live quotes and historical charts.' },
  { q: 'Do I need a broker account?', a: 'No. Sign up with email or Google and start placing simulated orders instantly.' },
  { q: 'Is it free?', a: 'Yes — Tradar is free to use for practice trading.' },
];
