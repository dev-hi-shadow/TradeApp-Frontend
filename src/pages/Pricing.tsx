/**
 * /pricing — "coming soon" but real. Tradar is free (it's paper trading), with
 * a Pro tier teased as coming soon. Billing toggle is interactive even though
 * the free plan is ₹0 either way.
 */
import { useState } from 'react';
import { MarketingShell, Reveal, CandleButton, BRAND, GREEN } from '../components/marketing/ui';

export function Pricing() {
  const [yearly, setYearly] = useState(true);

  return (
    <MarketingShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-20 blur-3xl"
          style={{ background: `radial-gradient(circle, ${GREEN}44, transparent 60%)` }} />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-8 text-center">
          <Reveal dir="up">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pos/15 text-pos text-xs font-semibold mb-5">
              Pricing · more plans coming soon
            </span>
          </Reveal>
          <Reveal dir="up" delay={80}>
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Simple pricing.<br /><span className="shimmer-text">Mostly free.</span>
            </h1>
          </Reveal>
          <Reveal dir="up" delay={150}>
            <p className="mt-5 text-night-100 text-lg">
              Worried about the bill? Don't be — this one's on us. 🙂
            </p>
          </Reveal>

          {/* billing toggle */}
          <Reveal dir="up" delay={220}>
            <div className="mt-8 inline-flex p-1 rounded-full bg-night-700 border border-night-500/40">
              {[['Monthly', false], ['Yearly', true]].map(([label, val]) => (
                <button key={label as string} onClick={() => setYearly(val as boolean)}
                  className={`px-5 h-9 rounded-full text-sm font-bold transition ${yearly === val ? 'bg-brand text-white shadow' : 'text-night-100 hover:text-white'}`}>
                  {label}{val === true && <span className="ml-1 text-[10px] text-pos">save 100%</span>}
                </button>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Plans */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          {/* Free */}
          <Reveal dir="left">
            <div className="relative h-full rounded-3xl border-2 p-7 bg-night-800/60" style={{ borderColor: GREEN }}>
              <span className="absolute -top-3 left-6 px-3 py-1 rounded-full text-[11px] font-bold text-white" style={{ background: GREEN }}>AVAILABLE NOW</span>
              <div className="text-sm font-bold uppercase tracking-wider text-night-200">Trader</div>
              <div className="mt-2 flex items-end gap-1">
                <span className="text-5xl font-extrabold tracking-tight num">₹0</span>
                <span className="text-night-300 mb-1">/ {yearly ? 'year' : 'month'}</span>
              </div>
              <p className="mt-2 text-sm text-night-200">Everything you need to learn the markets, free.</p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {FREE_FEATURES.map((f) => <Feat key={f} ok>{f}</Feat>)}
              </ul>
              <div className="mt-7"><CandleButton to="/register">Get started free →</CandleButton></div>
            </div>
          </Reveal>

          {/* Pro — coming soon */}
          <Reveal dir="right" delay={80}>
            <div className="relative h-full rounded-3xl border border-night-500/30 p-7 bg-night-800/40 overflow-hidden">
              <span className="absolute -top-3 left-6 px-3 py-1 rounded-full text-[11px] font-bold text-white bg-brand">COMING SOON</span>
              <div className="text-sm font-bold uppercase tracking-wider text-night-200">Pro</div>
              <div className="mt-2 flex items-end gap-1">
                <span className="text-5xl font-extrabold tracking-tight num text-night-300">₹—</span>
                <span className="text-night-400 mb-1">/ {yearly ? 'year' : 'month'}</span>
              </div>
              <p className="mt-2 text-sm text-night-300">Power features for serious practice. In the works.</p>
              <ul className="mt-5 space-y-2.5 text-sm opacity-80">
                {PRO_FEATURES.map((f) => <Feat key={f} soon>{f}</Feat>)}
              </ul>
              <button disabled className="mt-7 px-6 h-12 inline-flex items-center rounded-xl text-base font-bold bg-night-600 text-night-300 cursor-not-allowed">
                Coming soon
              </button>
            </div>
          </Reveal>
        </div>
        <Reveal dir="up" className="text-center mt-6">
          <p className="text-xs text-night-400">Don't worry about paying anything — this isn't for you to pay. 🙂 Tradar is paper trading; it's free.</p>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-8">Pricing questions</h2>
        <div className="divide-y divide-night-500/30 rounded-2xl border border-night-500/30 overflow-hidden">
          {FAQS.map((f) => <Faq key={f.q} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* CTA */}
      <Reveal as="section" dir="scale" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-3xl px-6 py-14 text-center" style={{ background: `linear-gradient(135deg, ${BRAND}, #2f3cb8)` }}>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">No catch. Just start.</h2>
          <p className="mt-3 text-white/85 max-w-xl mx-auto">₹10,00,000 virtual cash, live markets, zero rupees.</p>
          <div className="mt-7 flex justify-center"><CandleButton to="/register">Create free account →</CandleButton></div>
        </div>
      </Reveal>
    </MarketingShell>
  );
}

function Feat({ children, ok, soon }: { children: React.ReactNode; ok?: boolean; soon?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0" style={{ color: ok ? GREEN : BRAND }}>{soon ? '◔' : '✓'}</span>
      <span className="text-night-100">{children}</span>
    </li>
  );
}

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

const FREE_FEATURES = [
  '₹10,00,000 virtual trading balance',
  'Live NSE · BSE · MCX market data',
  'Volume-based realistic fills',
  'Pro charts + terminal mode',
  'Full F&O option chain + Greeks',
  'Strategy builder & payoff',
  'Analytics, watchlists & alerts',
  'Web + mobile · zero ads',
];
const PRO_FEATURES = [
  'Multi-portfolio practice',
  'Strategy backtesting',
  'Advanced order types (GTT, trailing)',
  'CSV export & deeper analytics',
  'Priority data + more history',
];
const FAQS = [
  { q: 'Is Tradar really free?', a: 'Yes. Tradar is paper trading — virtual money, real prices. The Trader plan is free with no card required.' },
  { q: 'What is the Pro plan?', a: 'A future paid tier with power features (backtesting, advanced orders, deeper analytics). It is not available yet — everything you see today is on the free plan.' },
  { q: 'Will my free features go away when Pro launches?', a: "No — today's features stay on the free Trader plan." },
  { q: 'Do you take payment details?', a: 'No. Sign up with email or Google and start instantly. Nothing to pay.' },
];
