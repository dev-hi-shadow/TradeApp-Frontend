/**
 * Option-chain page — Groww-style mobile-first 3-column layout.
 *
 *   Header:     ← BACK · SYMBOL                  [lots toggle] [⚙]
 *   Sub-row:    Call price   |   <expiry ▼>   |   Put price
 *
 *   Each strike row:
 *     LEFT  (Call)   : ₹premium  +  %change-of-premium  (green=up, red=down)
 *     CENTER         : strike   +  OI imbalance bar (red call OI / green put OI)
 *     RIGHT (Put)    : ₹premium  +  %change-of-premium  (right-aligned)
 *
 *   Floating spot strip across the row separating ITM ↔ OTM:
 *     ─────────── 23,659.00 │ +41.00 (0.17%) ───────────
 *
 * Tap a price → opens order modal for that contract pre-filled.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMarket } from '../context/MarketContext';
import {
  fetchOptionChain,
  type OptionChainResp,
  type OptionLeg,
} from '../api/market';
import { OrderModal } from '../components/OrderModal';
import { fmtNum } from '../utils/fmt';
import { computeGreeks, yearsToExpiry, type Greeks } from '../utils/greeks';
import { computeChainAnalytics } from '../utils/optionAnalytics';
import { IconChevronDown, IconLayers } from '../components/icons';

export function OptionChain() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const sym = symbol.toUpperCase();
  const navigate = useNavigate();
  const { subscribe, quotes } = useMarket();

  const [data, setData] = useState<OptionChainResp | null>(null);
  const [expiry, setExpiry] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiryPickerOpen, setExpiryPickerOpen] = useState(false);
  const [lotsMode, setLotsMode] = useState(false);
  const [greeksMode, setGreeksMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [strikeRadius, setStrikeRadius] = useState(12);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSymbol, setModalSymbol] = useState<string | undefined>();
  const [modalSide, setModalSide] = useState<'buy' | 'sell'>('buy');
  // Price + lot for the tapped leg — handed to the modal so it paints instantly.
  const [modalInitPrice, setModalInitPrice] = useState<number | undefined>();
  const [modalInitLot, setModalInitLot] = useState<number | undefined>();

  const containerRef = useRef<HTMLDivElement>(null);
  const atmRowRef = useRef<HTMLDivElement>(null);
  // We auto-scroll to the spot strip ONLY on the very first visit to the
  // option chain after login. Coming back to the screen later (or switching
  // expiries) keeps the user's scroll position. The session-level flag is
  // cleared in AuthContext.logout() so a fresh login behaves like first time.
  const SCROLL_FLAG_KEY = 'optionChain.spotScrolled';
  // Mirror the selected expiry so the polling interval reads the LATEST value
  // instead of the empty string captured when the effect first ran.
  const expiryRef = useRef<string>('');
  useEffect(() => { expiryRef.current = expiry; }, [expiry]);

  async function refresh(useExpiry?: string, radius?: number) {
    setLoading(true);
    try {
      const r = await fetchOptionChain(sym, { expiry: useExpiry, radius: radius ?? strikeRadius });
      setData(r);
      setError(null);
      // Only adopt the server's default expiry on the FIRST load (when we
      // haven't yet remembered the user's choice). Otherwise leave the
      // selected expiry alone — the chain may otherwise reset after a tick.
      if (!useExpiry && !expiryRef.current) setExpiry(r.expiry);
    } catch (err: any) {
      // Record the failure so the body can show a clear inline state. We do
      // NOT toast here — refresh() runs on a 5s poll, so a toast would spam
      // once every cycle during any outage. The inline panel communicates it.
      setError(err?.message || 'Could not load the option chain');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // The underlying's live quote is all we need for the spot strip —
    // subscribing piggybacks on the WS tick loop, no extra HTTP roundtrip.
    subscribe([sym]);
    // Read latest expiry from ref so user's selection survives the 5s tick.
    const t = setInterval(() => refresh(expiryRef.current || undefined), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym]);

  // Auto-scroll to the spot strip ONLY on the first visit per login session.
  // If the user has already been scrolled this session (flag in sessionStorage)
  // we leave their scroll position alone — even on expiry changes and on
  // re-entering the screen via Back. Logout clears the flag.
  useEffect(() => {
    if (!data || !atmRowRef.current || !containerRef.current) return;
    if (sessionStorage.getItem(SCROLL_FLAG_KEY)) return;
    sessionStorage.setItem(SCROLL_FLAG_KEY, '1');
    const el = atmRowRef.current;
    const parent = containerRef.current;
    setTimeout(() => {
      parent.scrollTo({
        top: el.offsetTop - parent.clientHeight / 2 + el.clientHeight / 2,
        behavior: 'auto',
      });
    }, 50);
  }, [data?.rows.length]);

  function changeExpiry(e: string) {
    setExpiry(e);
    setExpiryPickerOpen(false);
    refresh(e);
  }

  function changeRadius(n: number) {
    setStrikeRadius(n);
    refresh(expiry || undefined, n);
  }

  function openOrder(leg: OptionLeg, side: 'buy' | 'sell') {
    setModalSymbol(leg.symbol);
    setModalSide(side);
    setModalInitPrice(leg.ltp > 0 ? leg.ltp : undefined);
    setModalInitLot(leg.lotsize ? parseInt(String(leg.lotsize), 10) || undefined : undefined);
    setModalOpen(true);
  }

  // ATM strike (closest to spot)
  const atmStrike = useMemo(() => {
    if (!data || !data.rows.length) return 0;
    let best = data.rows[0].strike;
    let bestDiff = Infinity;
    for (const r of data.rows) {
      const d = Math.abs(r.strike - data.spot);
      if (d < bestDiff) { bestDiff = d; best = r.strike; }
    }
    return best;
  }, [data]);

  // Live spot from snapshot (so the spot strip updates as ticks come in)
  // Live spot from the WS quote (already subscribed at mount). Falls back
  // to the spot returned with the chain payload, then 0 — never a wasted
  // snapshot HTTP call.
  const liveUnderlying = quotes[sym];
  const spotPrice = liveUnderlying?.price ?? data?.spot ?? 0;
  const spotChange = liveUnderlying?.change ?? 0;
  const spotChangePct = liveUnderlying?.changePercent ?? 0;

  // Find max VOLUME across the visible slice so the per-row bars normalise
  // against the peak strike. (We replaced the OI bars with volume bars per
  // the reference design — one clean horizontal split-bar per row.)
  const maxVol = useMemo(() => {
    if (!data) return 1;
    let m = 0;
    for (const r of data.rows) {
      m = Math.max(m, r.ce?.volume ?? 0, r.pe?.volume ?? 0);
    }
    return m || 1;
  }, [data]);

  const lotSize = data?.lotSize ? parseInt(String(data.lotSize), 10) : 1;

  // Degraded-state detection. The chain is "live" only when at least one leg
  // carries a real (>0) premium. Angel rate-limit / unconfigured / empty-slice
  // responses come back with every leg at 0 (or no rows at all) — in those
  // cases we show a clear "unavailable" panel instead of a wall of ₹0.00 or
  // silently-blank rows.
  const pricedLegs = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const r of data.rows) {
      if ((r.ce?.ltp ?? 0) > 0) n++;
      if ((r.pe?.ltp ?? 0) > 0) n++;
    }
    return n;
  }, [data]);
  const chainUnavailable = !!data && pricedLegs === 0;

  // ── Chain analytics (OI-based) + time-to-expiry for greeks ──
  const analytics = useMemo(() => computeChainAnalytics(data?.rows ?? []), [data]);
  const tYears = useMemo(() => (data?.expiry ? yearsToExpiry(data.expiry) : 0), [data?.expiry]);
  // ATM implied vol for the summary strip (from the ATM contract's premium).
  const atmIv = useMemo(() => {
    if (!data || !spotPrice || !tYears) return null;
    const atm = data.rows.find((r) => r.strike === atmStrike);
    const leg = atm?.ce ?? atm?.pe;
    if (!leg?.ltp) return null;
    const g = computeGreeks({
      spot: spotPrice, strike: atmStrike, premium: leg.ltp, tYears, type: atm?.ce ? 'CE' : 'PE',
    });
    return g?.iv ?? null;
  }, [data, spotPrice, atmStrike, tYears]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header — sits BELOW the global TopBar (h-14) so its column titles
          aren't clipped by it. */}
      <div className="sticky top-14 lg:top-16 z-20 bg-white dark:bg-night-900 border-b border-ink-100 dark:border-night-500/40">
        <div className="px-3 h-12 flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-ink-700 dark:text-night-100 hover:bg-ink-50 dark:hover:bg-night-700"
            aria-label="Back"
          >
            ←
          </button>
          <div className="font-bold tracking-tight text-base">{sym}</div>
          <div className="ml-auto flex items-center gap-2">
            {/* Build strategy — jump to the multi-leg payoff builder */}
            <Link
              to={`/strategy?symbol=${encodeURIComponent(sym)}`}
              className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-bold bg-brand/10 text-accent hover:bg-brand/20 transition-colors"
              title="Build a multi-leg strategy"
            >
              <IconLayers size={13} /> Strategy
            </Link>
            {/* Greeks-mode toggle — swaps each leg's %-change line for Δ + IV */}
            <button
              onClick={() => setGreeksMode((v) => !v)}
              className={`px-2.5 h-7 rounded-lg text-[11px] font-bold transition-colors ${
                greeksMode
                  ? 'bg-brand text-white'
                  : 'bg-ink-50 dark:bg-night-700 text-ink-600 dark:text-night-100'
              }`}
              aria-label="Show greeks"
              title={greeksMode ? 'Showing Δ / IV' : 'Show greeks (Δ / IV)'}
            >
              Δ IV
            </button>
            {/* Lots-mode toggle */}
            <button
              onClick={() => setLotsMode((v) => !v)}
              className={`relative inline-flex items-center w-12 h-6 rounded-full px-0.5 transition-colors ${
                lotsMode ? 'bg-pos' : 'bg-ink-200 dark:bg-night-500'
              }`}
              aria-label="Per-lot prices"
              title={lotsMode ? `Per-lot pricing (× ${lotSize})` : 'Per-unit pricing'}
            >
              <span className="text-[10px] mr-1 ml-1">🧺</span>
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-card transition-transform ${
                  lotsMode ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
            {/* Settings */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-ink-50 dark:bg-night-700 text-ink-700 dark:text-night-100 relative"
              aria-label="Chain settings"
              title="Settings"
            >
              ⚙️
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-pos" />
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-3 px-4 pb-1.5 text-[10px] uppercase tracking-wider font-medium text-ink-500 dark:text-night-200">
          <div className="text-left">Call price</div>
          <div className="text-center">
            <button
              onClick={() => setExpiryPickerOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-xs font-medium tracking-tight text-ink-800 dark:text-night-50"
            >
              {data ? formatExpiry(data.expiry) : 'Loading'}
              <IconChevronDown size={12} />
            </button>
          </div>
          <div className="text-right">Put price</div>
        </div>

        {/* Analytics strip — PCR · Max Pain · ATM IV (OI/greeks at a glance) */}
        {data && (analytics.pcr != null || analytics.maxPain != null) && (
          <div className="flex items-center justify-center gap-4 px-4 pb-1.5 text-[10px] text-ink-500 dark:text-night-200">
            {analytics.pcr != null && (
              <span>
                PCR{' '}
                <span className={`num font-bold ${analytics.pcr >= 1 ? 'text-neg' : 'text-pos'}`}>
                  {analytics.pcr.toFixed(2)}
                </span>
              </span>
            )}
            {analytics.maxPain != null && (
              <span>
                Max&nbsp;Pain{' '}
                <span className="num font-bold text-ink-800 dark:text-night-50">
                  {fmtNum(analytics.maxPain, 0)}
                </span>
              </span>
            )}
            {atmIv != null && (
              <span>
                IV{' '}
                <span className="num font-bold text-ink-800 dark:text-night-50">
                  {(atmIv * 100).toFixed(1)}%
                </span>
              </span>
            )}
          </div>
        )}

        {expiryPickerOpen && data && (
          <div className="absolute left-0 right-0 top-[88px] z-30 bg-white dark:bg-night-700 border-y border-ink-100 dark:border-night-500/40 shadow-cardHover max-h-72 overflow-y-auto">
            {data.expiries.map((e) => (
              <button
                key={e}
                onClick={() => changeExpiry(e)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-ink-100 dark:border-night-500/40 hover:bg-ink-50 dark:hover:bg-night-600 ${
                  expiry === e ? 'text-brand font-bold' : ''
                }`}
              >
                {formatExpiry(e)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chain body — scrollable; rows are fixed-height so we can overlay
          the spot strip as an absolute element that slides as spot ticks
          (no row gets pushed around when the strip moves between strikes). */}
      <div ref={containerRef} className="flex-1 overflow-y-auto pb-24 relative">
        {!data && loading ? (
          <div className="px-4 py-10 text-center text-sm text-ink-500 dark:text-night-200">
            Loading option chain…
          </div>
        ) : !data ? (
          // First load never produced a chain (endpoint error / Angel not
          // configured / no spot). Clear, retryable state — not a blank screen.
          <ChainUnavailable
            title="Live option data unavailable"
            detail={error || 'We couldn’t load the option chain right now.'}
            onRetry={() => refresh(expiryRef.current || undefined)}
          />
        ) : chainUnavailable ? (
          // Chain shape arrived but every leg is unpriced (Angel throttled /
          // market data down). Show the reason instead of a wall of ₹0.00.
          <ChainUnavailable
            title="Live option prices unavailable"
            detail={
              error
                ? error
                : 'The exchange feed isn’t returning option prices right now. This usually clears in a few seconds — retrying automatically.'
            }
            onRetry={() => refresh(expiryRef.current || undefined)}
          />
        ) : (
          <div className="relative">
            {/* Stale badge — backend is serving the last good chain because the
                latest live build came back unpriced. Prices may be a few
                seconds old; the poll keeps trying. */}
            {(data.stale || error) && (
              <div
                data-testid="oc-stale"
                className="mx-4 my-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300 text-center"
              >
                Showing last available prices — live feed reconnecting…
              </div>
            )}
            {data.rows.map((row) => (
              <ChainRow
                key={row.strike}
                row={row}
                isATM={row.strike === atmStrike}
                atmRef={row.strike === atmStrike ? atmRowRef : null}
                maxVol={maxVol}
                lotSize={lotsMode ? lotSize : 1}
                greeksMode={greeksMode}
                spot={spotPrice}
                tYears={tYears}
                onTap={openOrder}
              />
            ))}
            {/* Spot strip — absolutely positioned over the chain, slides
                smoothly as spot moves (no layout shift, ever). */}
            <SpotStripOverlay
              rows={data.rows.map((r) => r.strike)}
              spot={spotPrice}
              change={spotChange}
              pct={spotChangePct}
              rowHeightPx={ROW_HEIGHT}
            />
          </div>
        )}
      </div>

      {/* Settings sheet */}
      {settingsOpen && (
        <SettingsSheet
          radius={strikeRadius}
          onRadius={(n) => { changeRadius(n); }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <OrderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultSymbol={modalSymbol}
        defaultSide={modalSide}
        initialPrice={modalInitPrice}
        initialLotSize={modalInitLot}
      />
    </div>
  );
}

// Fixed row height so we can compute the spot-strip offset deterministically
// without measuring the DOM on every tick.
const ROW_HEIGHT = 58;

/* ---------- Degraded / unavailable state ---------- */
function ChainUnavailable({
  title, detail, onRetry,
}: { title: string; detail: string; onRetry: () => void }) {
  return (
    <div
      data-testid="oc-unavailable"
      className="px-6 py-12 flex flex-col items-center text-center"
    >
      <div className="w-12 h-12 rounded-2xl bg-ink-100 dark:bg-night-700 flex items-center justify-center text-2xl mb-3">
        📉
      </div>
      <div className="font-bold tracking-tight text-ink-800 dark:text-night-50">{title}</div>
      <p className="text-sm text-ink-500 dark:text-night-200 mt-1.5 max-w-xs">{detail}</p>
      <button
        onClick={onRetry}
        className="mt-4 px-4 h-9 rounded-lg text-sm font-bold bg-brand text-white hover:bg-brand-600 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

/* ---------- One strike row ---------- */
function ChainRow({
  row, isATM, atmRef, maxVol, lotSize, greeksMode, spot, tYears, onTap,
}: {
  row: { strike: number; ce: OptionLeg | null; pe: OptionLeg | null };
  isATM: boolean;
  atmRef: React.RefObject<HTMLDivElement> | null;
  maxVol: number;
  lotSize: number;
  greeksMode: boolean;
  spot: number;
  tYears: number;
  onTap: (leg: OptionLeg, side: 'buy' | 'sell') => void;
}) {
  const cePct = row.ce && row.ce.close ? ((row.ce.ltp - row.ce.close) / row.ce.close) * 100 : 0;
  const pePct = row.pe && row.pe.close ? ((row.pe.ltp - row.pe.close) / row.pe.close) * 100 : 0;
  const cePrice = row.ce ? row.ce.ltp * lotSize : 0;
  const pePrice = row.pe ? row.pe.ltp * lotSize : 0;
  const ceVol = row.ce?.volume ?? 0;
  const peVol = row.pe?.volume ?? 0;
  // Greeks (only when the toggle is on and we have spot/expiry).
  const ceG: Greeks | null = greeksMode && row.ce?.ltp && spot && tYears
    ? computeGreeks({ spot, strike: row.strike, premium: row.ce.ltp, tYears, type: 'CE' })
    : null;
  const peG: Greeks | null = greeksMode && row.pe?.ltp && spot && tYears
    ? computeGreeks({ spot, strike: row.strike, premium: row.pe.ltp, tYears, type: 'PE' })
    : null;
  const greekLine = (g: Greeks | null) =>
    g ? `Δ${g.delta.toFixed(2)} · IV ${(g.iv * 100).toFixed(0)}%` : '—';
  return (
    <div
      ref={atmRef || undefined}
      data-testid="oc-row"
      className="grid grid-cols-3 px-4 items-center"
      style={{ height: ROW_HEIGHT }}
    >
      {/* CE — left */}
      <button
        onClick={() => row.ce && onTap(row.ce, 'buy')}
        disabled={!row.ce}
        className="text-left disabled:opacity-30"
      >
        <div data-testid="oc-ce-premium" className="num text-sm font-medium tracking-tight text-ink-800 dark:text-night-50">
          {row.ce ? `₹${fmtNum(cePrice)}` : '—'}
        </div>
        {greeksMode ? (
          <div className="num text-[10px] font-medium text-ink-500 dark:text-night-200">
            {row.ce ? greekLine(ceG) : ''}
          </div>
        ) : (
          <div className={`num text-[10px] font-medium ${cePct >= 0 ? 'text-pos' : 'text-neg'}`}>
            {row.ce ? `${cePct >= 0 ? '+' : ''}${cePct.toFixed(2)}%` : ''}
          </div>
        )}
      </button>

      {/* Strike (center) + live volume split-bar */}
      <div className="flex flex-col items-center">
        <span className="num text-sm font-medium tracking-tight text-ink-800 dark:text-night-50">
          {fmtNum(row.strike, 0)}
        </span>
        <VolumeBar ceVol={ceVol} peVol={peVol} max={maxVol} />
      </div>

      {/* PE — right */}
      <button
        onClick={() => row.pe && onTap(row.pe, 'buy')}
        disabled={!row.pe}
        className="text-right disabled:opacity-30"
      >
        <div data-testid="oc-pe-premium" className="num text-sm font-medium tracking-tight text-ink-800 dark:text-night-50">
          {row.pe ? `₹${fmtNum(pePrice)}` : '—'}
        </div>
        {greeksMode ? (
          <div className="num text-[10px] font-medium text-ink-500 dark:text-night-200">
            {row.pe ? greekLine(peG) : ''}
          </div>
        ) : (
          <div className={`num text-[10px] font-medium ${pePct >= 0 ? 'text-pos' : 'text-neg'}`}>
            {row.pe ? `${pePct >= 0 ? '+' : ''}${pePct.toFixed(2)}%` : ''}
          </div>
        )}
      </button>
    </div>
  );
}

/**
 * Two horizontal bars under the strike showing live traded volume.
 *   left  (red)   — Call-side volume
 *   right (green) — Put-side volume
 * Length normalised to the peak volume across the visible slice so the user
 * can eyeball where activity is concentrated.
 */
function VolumeBar({ ceVol, peVol, max }: { ceVol: number; peVol: number; max: number }) {
  const ceLen = max ? Math.max(0, Math.min(100, (ceVol / max) * 100)) : 0;
  const peLen = max ? Math.max(0, Math.min(100, (peVol / max) * 100)) : 0;
  return (
    <div className="flex items-center w-full mt-1.5" title="Live volume">
      <div className="flex-1 flex justify-end">
        <div className="h-[3px] rounded-full bg-neg" style={{ width: `${ceLen}%` }} />
      </div>
      <div className="w-px h-2 bg-ink-200 dark:bg-night-400 mx-1" />
      <div className="flex-1">
        <div className="h-[3px] rounded-full bg-pos" style={{ width: `${peLen}%` }} />
      </div>
    </div>
  );
}

/**
 * Spot strip overlay — absolutely positioned over the chain rows.
 * Interpolates its `top` between the two surrounding strikes so as spot
 * ticks it slides smoothly, without ever reflowing the rows beneath it.
 */
function SpotStripOverlay({
  rows, spot, change, pct, rowHeightPx,
}: {
  rows: number[];
  spot: number;
  change: number;
  pct: number;
  rowHeightPx: number;
}) {
  if (!rows.length || !spot) return null;

  // Find the two strikes that bracket the spot. The strip ALWAYS sits on the
  // border line between those two rows — never inside a row — so the strike
  // numbers and bars are never obscured. The CSS transition on `top` makes it
  // glide cleanly when the spot crosses a strike level.
  let lowerIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] <= spot) lowerIdx = i;
    else break;
  }
  const topPx = (lowerIdx + 1) * rowHeightPx;

  const up = change >= 0;
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-10 transition-[top] duration-300 ease-out"
      style={{ top: topPx - 12, height: 24 }}
    >
      {/* Horizontal line across full chain */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-ink-300 dark:bg-night-300" />
      {/* Centered pill */}
      <div className="flex justify-center relative">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white dark:bg-night-700 border border-ink-200 dark:border-night-400 shadow-card text-[11px] font-medium num pointer-events-auto">
          <span>{fmtNum(spot)}</span>
          <span className="text-ink-300 dark:text-night-400">|</span>
          <span className={up ? 'text-pos' : 'text-neg'}>
            {up ? '+' : ''}{fmtNum(change)} ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Settings sheet ---------- */
function SettingsSheet({
  radius, onRadius, onClose,
}: { radius: number; onRadius: (n: number) => void; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 dark:bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-night-700 rounded-t-3xl sm:rounded-2xl shadow-cardHover animate-slideUp"
      >
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-ink-200 dark:bg-night-400" />
        </div>
        <div className="px-5 pt-3 pb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Chain settings</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-ink-50 dark:bg-night-600">×</button>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <div>
            <label className="label">Strikes around ATM</label>
            <div className="flex gap-2">
              {[5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  onClick={() => onRadius(n)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold ${
                    radius === n
                      ? 'bg-brand text-white'
                      : 'bg-ink-50 dark:bg-night-600 text-ink-700 dark:text-night-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-500 dark:text-night-200 mt-1.5">
              Show {radius * 2 + 1} strikes (±{radius} from at-the-money).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatExpiry(e: string): string {
  const m = e.match(/^(\d{1,2})([A-Z]{3})(\d{2,4})$/);
  if (!m) return e;
  const mm = m[2].charAt(0) + m[2].slice(1).toLowerCase();
  return `${m[1]} ${mm}`;
}
