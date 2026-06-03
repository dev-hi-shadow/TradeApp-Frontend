/**
 * First-mount boot splash.
 *
 * The screen blocks the routed UI until at least ONE of:
 *   1. WS auth completes AND the first index quote (NIFTY) has streamed in
 *      — i.e. when the user first sees the app, indices already have live
 *      numbers in `quotes`, so no card shows "Loading…" on the initial paint.
 *   2. A safety cap of 2500 ms elapses (avoids stranding the user forever if
 *      the broker is down).
 *
 * After the dismiss criterion is met it fades to the UI in ~320 ms.
 * Skipped automatically on every NEXT route change in the same session
 * (sessionStorage flag) — only the very first visit pays the splash.
 *
 * Visuals: generic animated chart-bar mark + circular spinner + tagline.
 * No third-party brand or asset is referenced.
 */
import { useEffect, useState } from 'react';
import { useMarket, INDICES } from '../context/MarketContext';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './Spinner';

const STORAGE_KEY = 'splash:bootShown';
// How long to wait for live data before dismissing anyway. Long enough that
// a healthy network shows the splash for ~700-900 ms (smooth perceived boot),
// short enough that a sick backend doesn't strand the user.
const MAX_WAIT_MS = 2500;

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const { status, quotes } = useMarket();
  const { token, loading: authLoading } = useAuth();
  // Only show on the very first navigation per browser-session. Refreshes
  // count as "first" again; tab-internal route changes do not.
  const [showing, setShowing] = useState<boolean>(() => sessionStorage.getItem(STORAGE_KEY) !== '1');
  const [exiting, setExiting] = useState(false);

  // No token (user is on login/register or logged out) → splash is useless
  // because no live market stream will start. Skip immediately.
  useEffect(() => {
    if (!showing) return;
    if (authLoading) return;
    if (!token) {
      sessionStorage.setItem(STORAGE_KEY, '1');
      setShowing(false);
    }
  }, [showing, authLoading, token]);

  // Dismiss when we have enough to render a meaningful first screen.
  useEffect(() => {
    if (!showing || exiting) return;
    // Have we received at least one index quote?
    const firstIndex = INDICES.find((s) => quotes[s]?.price);
    const ready = status === 'open' && !!firstIndex;
    if (ready) {
      // Tiny delay so the splash never "flashes" — feels intentional.
      const t = setTimeout(() => beginExit(), 250);
      return () => clearTimeout(t);
    }
  }, [showing, exiting, status, quotes]);

  // Hard cap — never stall the UI for a dead backend.
  useEffect(() => {
    if (!showing || exiting) return;
    const cap = setTimeout(() => beginExit(), MAX_WAIT_MS);
    return () => clearTimeout(cap);
  }, [showing, exiting]);

  function beginExit() {
    setExiting(true);
    // Match the CSS exit animation duration (320 ms) — after that we
    // unmount the splash so it stops intercepting events.
    setTimeout(() => {
      sessionStorage.setItem(STORAGE_KEY, '1');
      setShowing(false);
    }, 320);
  }

  return (
    <>
      {/* Always render children behind the splash so live data is
          already flowing by the time the overlay fades out. */}
      {children}
      {showing && (
        <div
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white dark:bg-night-900 ${
            exiting ? 'splash-exit' : ''
          }`}
        >
          {/* Subtle radial accent — pure CSS, no images */}
          <div
            className="absolute inset-0 opacity-60 dark:opacity-40 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 35%, rgba(83,103,255,0.10), transparent 60%)',
            }}
          />

          <div className="relative flex flex-col items-center gap-6">
            <BrandMark />

            <div className="text-center">
              <div className="text-xl font-bold tracking-tight text-ink-800 dark:text-night-50">
                Paper Trading
              </div>
              <div className="text-xs text-ink-500 dark:text-night-200 mt-1">
                Connecting to live market…
              </div>
            </div>

            <div className="text-accent">
              <Spinner size={32} thickness={3.5} />
            </div>
          </div>

          {/* Footer status — faint, only for the curious */}
          <div className="absolute bottom-6 left-0 right-0 flex justify-center text-[10px] uppercase tracking-wider text-ink-400 dark:text-night-200">
            {status === 'open' ? 'Streaming quotes' : status === 'connecting' ? 'Authenticating' : 'Establishing socket'}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Animated chart-bars mark. Five vertical bars whose heights breathe in
 * staggered phase — reads as a live market without depicting any specific
 * stock or product. Pure SVG + CSS keyframes.
 */
function BrandMark() {
  // Per-bar phase offset so the wave moves left-to-right.
  const bars = [
    { x: 4,  h: 36, delay: '0s'   },
    { x: 16, h: 50, delay: '0.12s' },
    { x: 28, h: 28, delay: '0.24s' },
    { x: 40, h: 58, delay: '0.36s' },
    { x: 52, h: 44, delay: '0.48s' },
  ];
  return (
    <div className="brand-pulse">
      <svg width="72" height="72" viewBox="0 0 64 64" className="block">
        {/* Rounded square plate */}
        <rect x="0" y="0" width="64" height="64" rx="16" className="fill-brand/10" />
        {/* Bars */}
        {bars.map((b) => (
          <rect
            key={b.x}
            x={b.x}
            y={62 - b.h}
            width="8"
            height={b.h}
            rx="2"
            className="fill-brand bar-rise"
            style={{ animationDelay: b.delay }}
          />
        ))}
      </svg>
    </div>
  );
}
