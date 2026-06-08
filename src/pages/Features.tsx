/**
 * /features — the full Tradar feature tour, interactive.
 *
 * The headline differentiator gets an interactive demo: VOLUME-BASED FILLS.
 * Most paper apps fill your whole order at the last price. Tradar walks the
 * REAL order book, so a big order gets a worse average price (slippage) and
 * your P&L reflects actual traded volume — not a fantasy last-tick fill.
 */
import { useMemo, useState } from 'react';
import { MarketingShell, Reveal, CandleButton, BRAND, GREEN, RED } from '../components/marketing/ui';
import { TerminalDemo } from '../components/marketing/TerminalDemo';

export function Features() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-20 blur-3xl"
          style={{ background: `radial-gradient(circle, ${BRAND}55, transparent 60%)` }} />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-10 text-center">
          <Reveal dir="up">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/15 text-brand-400 text-xs font-semibold mb-5">Everything in Tradar</span>
          </Reveal>
          <Reveal dir="up" delay={80}>
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Built like a real terminal.<br /><span className="shimmer-text">Not a toy.</span>
            </h1>
          </Reveal>
          <Reveal dir="up" delay={160}>
            <p className="mt-5 text-night-100 text-lg max-w-2xl mx-auto">
              Most paper-trading apps just move a number up and down. Tradar models the
              market the way it actually behaves — real volume, real charts, real option chains.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── THE DIFFERENCE: volume-based fills (interactive) ──────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Reveal dir="up" className="text-center mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-pos mb-2">The difference</div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">Fills that move with real volume</h2>
          <p className="mt-4 text-night-100 max-w-2xl mx-auto">
            Your buy/sell doesn't magically fill at the last price. Tradar walks the live order
            book — so a bigger order pays slippage, exactly like the real market. Drag the size
            and watch your average fill change.
          </p>
        </Reveal>
        <Reveal dir="up" delay={80}>
          <VolumeFillDemo />
        </Reveal>
      </section>

      {/* ── Real charts ───────────────────────────────────────────────── */}
      <Spotlight
        eyebrow="Not every paper app delivers this"
        title="Real, professional charts"
        body="Crisp intraday & historical candlestick/line charts powered by a trading-grade engine — a live red/green line vs yesterday's close, smooth hover crosshair, every timeframe, plus a full terminal mode. Most paper apps fake the chart. We don't."
        points={['1m → monthly candles', 'Terminal mode + intervals', 'Live red/green vs prev close', 'Yesterday-close reference line']}
        img="/landing/web-chart.png" flip={false} accent={BRAND}
      />

      {/* ── Terminal mode (interactive chart) ─────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <Reveal dir="up" className="text-center mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-brand-400 mb-2">Terminal mode</div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">A full charting terminal</h2>
          <p className="mt-4 text-night-100 max-w-2xl mx-auto">
            Switch timeframes, flip candle ⇄ line, pan and zoom, and read OHLC on hover — the same
            engine that powers the in-app terminal. Try it right here.
          </p>
        </Reveal>
        <Reveal dir="up" delay={80}>
          <TerminalDemo />
        </Reveal>
        <Reveal dir="up" delay={120}>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[['🕒', 'Multiple timeframes'], ['🕯️', 'Candle & line'], ['🔍', 'Pan & zoom'], ['🎯', 'Crosshair OHLC']].map(([i, t]) => (
              <div key={t} className="rounded-xl border border-night-500/30 bg-night-800/60 p-3 text-center">
                <div className="text-xl">{i}</div>
                <div className="text-xs text-night-100 mt-1 font-semibold">{t}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── No ads ────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <Reveal dir="scale">
          <div className="rounded-3xl border border-night-500/30 bg-night-800/60 p-8 sm:p-12 text-center relative overflow-hidden">
            <div className="text-6xl sm:text-8xl font-extrabold tracking-tighter" style={{ color: GREEN }}>ZERO ADS</div>
            <p className="mt-3 text-night-100 max-w-xl mx-auto">
              No banners. No pop-ups. No "watch a video to unlock". Just your charts and your trades —
              on every page.<sup className="text-night-300">*</sup>
            </p>
            <p className="mt-2 text-xs text-night-400">*terms &amp; conditions applied 🙂</p>
          </div>
        </Reveal>
      </section>

      {/* ── Option chain spotlight ────────────────────────────────────── */}
      <Spotlight
        eyebrow="Derivatives, done right"
        title="A real F&O option chain"
        body="Full NIFTY / BANKNIFTY / SENSEX chains with live premiums, open interest, PCR, max-pain and Black-Scholes Greeks. Tap any strike to trade it, or jump to the strategy builder and preview your multi-leg payoff before you commit."
        points={['Live premiums + OI', 'PCR · Max-pain · IV', 'Δ Greeks per strike', 'Multi-leg payoff builder']}
        img="/landing/web-options.png" flip accent={GREEN}
      />

      {/* ── Feature grid ──────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <Reveal dir="up" className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">And everything else a trader needs</h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GRID.map((f, i) => (
            <Reveal key={f.title} dir="up" delay={(i % 3) * 80}>
              <div className="h-full rounded-2xl border border-night-500/30 bg-night-800/60 p-5 transition hover:-translate-y-0.5 hover:border-night-400/60">
                <div className="text-2xl mb-2">{f.icon}</div>
                <div className="font-bold text-night-50">{f.title}</div>
                <div className="text-sm text-night-200 mt-1 leading-relaxed">{f.body}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Analytics spotlight ───────────────────────────────────────── */}
      <Spotlight
        eyebrow="Learn from real numbers"
        title="Know your edge"
        body="P&L, win-rate, profit factor, max-drawdown and an equity curve — plus holdings, positions and a full trade ledger with a date-range filter. See what's actually working."
        points={['Win-rate + profit factor', 'Equity curve + drawdown', 'Holdings vs positions split', 'Full trade ledger']}
        img="/landing/web-analytics.png" flip={false} accent={BRAND}
      />

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <Reveal as="section" dir="scale" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-3xl px-6 py-14 text-center" style={{ background: `linear-gradient(135deg, ${BRAND}, #2f3cb8)` }}>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Feel the difference yourself.</h2>
          <p className="mt-3 text-white/85 max-w-xl mx-auto">Free, ₹10,00,000 virtual cash, live Indian markets.</p>
          <div className="mt-7 flex justify-center"><CandleButton to="/register">Start trading free →</CandleButton></div>
        </div>
      </Reveal>
    </MarketingShell>
  );
}

/* ---------- Interactive volume-based fill demo ---------- */
const ASKS = [ // price, available qty (units)
  { p: 23400, q: 90 }, { p: 23405, q: 75 }, { p: 23410, q: 140 },
  { p: 23415, q: 60 }, { p: 23420, q: 220 }, { p: 23425, q: 100 }, { p: 23430, q: 300 },
];
const LOT = 75;
function VolumeFillDemo() {
  const [lots, setLots] = useState(3);
  const need = lots * LOT;

  const { avg, consumed, maxLevel } = useMemo(() => {
    let remaining = need, cost = 0, maxLevel = 0;
    const consumed: number[] = [];
    for (let i = 0; i < ASKS.length; i++) {
      const take = Math.min(remaining, ASKS[i].q);
      consumed.push(take);
      cost += take * ASKS[i].p;
      remaining -= take;
      if (take > 0) maxLevel = i;
      if (remaining <= 0) break;
    }
    const filled = need - Math.max(0, remaining);
    return { avg: filled ? cost / filled : ASKS[0].p, consumed, maxLevel };
  }, [need]);

  const best = ASKS[0].p;
  const slip = avg - best;
  const slipPct = (slip / best) * 100;
  const naivePnLNote = slip * need; // extra rupees a naive app would hide

  return (
    <div className="grid lg:grid-cols-2 gap-6 rounded-3xl border border-night-500/30 bg-night-800/60 p-6 sm:p-8">
      {/* Order book ladder */}
      <div>
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-night-300 mb-2">
          <span>Live ask book · NIFTY</span><span>Your order eats →</span>
        </div>
        <div className="space-y-1.5">
          {ASKS.map((a, i) => {
            const eaten = consumed[i] || 0;
            const pct = (a.q / 300) * 100;
            const eatenPct = (eaten / a.q) * 100;
            return (
              <div key={a.p} className={`relative rounded-lg overflow-hidden border ${i <= maxLevel && eaten > 0 ? 'border-night-400/60' : 'border-night-500/30'}`}>
                <div className="absolute inset-y-0 left-0 bg-night-600/40" style={{ width: `${pct}%` }} />
                <div className="absolute inset-y-0 left-0" style={{ width: `${(pct * eatenPct) / 100}%`, background: `${RED}40` }} />
                <div className="relative flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="num font-semibold" style={{ color: eaten > 0 ? RED : '#b0b8c8' }}>{a.p.toFixed(2)}</span>
                  <span className="num text-xs text-night-200">{a.q} {eaten > 0 && <span style={{ color: RED }}>· took {eaten}</span>}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls + result */}
      <div className="flex flex-col justify-center">
        <label className="text-sm font-semibold text-night-100 mb-2">Order size: <span className="num text-brand-400">{lots} lots</span> <span className="text-night-300 text-xs">({need} qty)</span></label>
        <input type="range" min={1} max={30} value={lots} onChange={(e) => setLots(Number(e.target.value))}
          className="w-full accent-brand mb-6" />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-night-500/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-night-300">Naive app fill</div>
            <div className="num text-xl font-extrabold text-night-50">{best.toFixed(2)}</div>
            <div className="text-[11px] text-night-400">always "last price"</div>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: `${GREEN}55`, background: `${GREEN}11` }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: GREEN }}>Tradar fill (VWAP)</div>
            <div className="num text-xl font-extrabold" style={{ color: GREEN }}>{avg.toFixed(2)}</div>
            <div className="text-[11px] text-night-400">walks real volume</div>
          </div>
        </div>
        <div className="rounded-xl bg-night-900/60 border border-night-500/30 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-night-200">Slippage your P&amp;L actually feels</span>
            <span className="num font-bold" style={{ color: slip > 0 ? RED : GREEN }}>
              ₹{slip.toFixed(2)} ({slipPct.toFixed(2)}%)
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-night-200">Hidden cost a naive app ignores</span>
            <span className="num font-bold" style={{ color: RED }}>₹{Math.round(naivePnLNote).toLocaleString('en-IN')}</span>
          </div>
        </div>
        <p className="text-xs text-night-300 mt-3">Bigger order → deeper into the book → worse average price. That realism is the whole point.</p>
      </div>
    </div>
  );
}

/* ---------- Spotlight section (alternating) ---------- */
function Spotlight({ eyebrow, title, body, points, img, flip, accent }: {
  eyebrow: string; title: string; body: string; points: string[]; img: string; flip: boolean; accent: string;
}) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="grid lg:grid-cols-2 gap-8 items-center">
        <Reveal dir={flip ? 'right' : 'left'} className={flip ? 'lg:order-2' : ''}>
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: accent }}>{eyebrow}</div>
          <h3 className="text-2xl sm:text-4xl font-extrabold tracking-tight">{title}</h3>
          <p className="mt-3 text-night-100 leading-relaxed">{body}</p>
          <ul className="mt-5 grid grid-cols-2 gap-2">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-2 text-sm text-night-100">
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: accent }} />{p}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal dir={flip ? 'left' : 'right'} className={flip ? 'lg:order-1' : ''}>
          <div className="group rounded-2xl p-3" style={{ background: `${accent}14` }}>
            <img src={img} alt={title} loading="lazy" className={`tilt ${flip ? 'rotate-2' : '-rotate-2'} w-full rounded-xl border border-night-500/40 shadow-2xl`} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const GRID = [
  { icon: '📡', title: 'Live data — NSE · BSE · MCX', body: 'Streaming equity, index and commodity quotes from a real exchange feed.' },
  { icon: '🧮', title: 'Strategy builder', body: 'Compose multi-leg option strategies and see the payoff diagram instantly.' },
  { icon: '👀', title: 'Named watchlists', body: 'Multiple lists, Groww/Dhan-style, with live prices and quick add.' },
  { icon: '🔔', title: 'Price alerts', body: 'Above / below / % triggers — one-time, recurring or daily, with push.' },
  { icon: '🕘', title: 'Market-hours engine', body: 'No trading after close; SL/target defer to the next open at 9:15.' },
  { icon: '📦', title: 'Holdings vs positions', body: 'Intraday and delivery split cleanly, with convert (MIS↔CNC/NRML).' },
  { icon: '📈', title: 'Performance analytics', body: 'Win-rate, profit factor, drawdown, equity curve and a full ledger.' },
  { icon: '🔐', title: 'Google sign-in + sessions', body: 'One-tap login and revocable device sessions — proper auth.' },
  { icon: '📱', title: 'Web + mobile', body: 'A full desktop terminal and a mobile-first design, same account.' },
];
