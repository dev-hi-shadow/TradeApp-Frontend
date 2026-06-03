/**
 * Global search modal — opened from the TopBar magnifier (and via ⌘K / Ctrl+K).
 *
 * Hits the existing `/api/market/search` endpoint which is backed by Angel
 * One's scrip master (fuzzy match on both trading symbol AND company name),
 * so typing "ETER" returns "ETERNAL" the way Groww does.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import debounce from 'lodash/debounce';
import { searchSymbols } from '../api/market';
import { IconSearch, IconX } from './icons';
import { StockLogo } from './StockLogo';
import { pushRecentlyViewed, getRecentlyViewed } from '../utils/recentlyViewed';

interface Hit {
  symbol: string;
  name: string;
  exchange?: string;
}

const POPULAR = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'RELIANCE', 'HDFCBANK', 'TCS', 'INFY', 'GOLD'];

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setHits([]);
    setActiveIdx(0);
    setRecent(getRecentlyViewed());
    // Focus + scroll-lock body
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
    };
  }, [open]);

  // Debounced search — fires 200 ms after the user stops typing.
  useEffect(() => {
    if (!open) return;
    const run = debounce(async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 1) {
        setHits([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const r = await searchSymbols(trimmed);
        setHits(r.results || []);
        setActiveIdx(0);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    run(q);
    return () => run.cancel();
  }, [q, open]);

  function go(symbol: string) {
    pushRecentlyViewed(symbol);
    onClose();
    navigate(`/stock/${encodeURIComponent(symbol)}`);
  }

  function onKey(e: React.KeyboardEvent) {
    const list = hits.length ? hits : (q ? [] : recent.map((s) => ({ symbol: s, name: s })));
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(list.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = list[activeIdx];
      if (pick) go(pick.symbol);
    }
  }

  if (!open) return null;

  const showRecent = !q && recent.length > 0;
  const showPopular = !q && recent.length === 0;
  const list: Hit[] = q
    ? hits
    : showRecent
      ? recent.map((s) => ({ symbol: s, name: s }))
      : POPULAR.map((s) => ({ symbol: s, name: s }));

  return (
    <div
      className="fixed inset-0 z-[60] bg-ink-900/60 dark:bg-black/70 flex items-start justify-center pt-20 sm:pt-28 px-4 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-night-700 rounded-2xl shadow-cardHover border border-ink-100 dark:border-night-500/40 overflow-hidden animate-slideUp"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-ink-100 dark:border-night-500/40">
          <IconSearch size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stocks, indices, F&O…"
            className="flex-1 bg-transparent outline-none text-sm placeholder-ink-400 dark:placeholder-night-300"
            autoComplete="off"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="text-ink-400 hover:text-ink-600 dark:text-night-300 dark:hover:text-night-100"
              aria-label="Clear"
            >
              <IconX size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="hidden sm:inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border border-ink-200 dark:border-night-400 text-ink-500 dark:text-night-200"
          >
            ESC
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {(showRecent || showPopular) && (
            <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-medium text-ink-500 dark:text-night-200">
              {showRecent ? 'Recently viewed' : 'Popular'}
            </div>
          )}
          {q && loading && list.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-ink-500 dark:text-night-200">
              Searching…
            </div>
          )}
          {q && !loading && list.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-ink-500 dark:text-night-200">
              No results for "{q}"
            </div>
          )}
          {list.map((h, i) => (
            <button
              key={`${h.symbol}-${h.exchange ?? ''}`}
              onClick={() => go(h.symbol)}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                activeIdx === i
                  ? 'bg-ink-50 dark:bg-night-600/60'
                  : 'hover:bg-ink-50/60 dark:hover:bg-night-600/40'
              }`}
            >
              <StockLogo symbol={h.symbol} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-medium tracking-tight truncate">{h.symbol}</div>
                {h.name && h.name !== h.symbol && (
                  <div className="text-[11px] text-ink-500 dark:text-night-200 truncate">{h.name}</div>
                )}
              </div>
              {h.exchange && (
                <span className="text-[10px] font-medium text-ink-400 dark:text-night-300 uppercase tracking-wider">
                  {h.exchange}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Footer hints */}
        <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-t border-ink-100 dark:border-night-500/40 text-[11px] text-ink-500 dark:text-night-200">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd><Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded border border-ink-200 dark:border-night-400 font-medium">
      {children}
    </span>
  );
}
