/**
 * Multiple named watchlists (Groww / Dhan style).
 *
 *   • Horizontal pills to switch between named lists (+ a "＋" to create one)
 *   • Rename / delete the active list (delete confirms; server blocks the last)
 *   • Rows of symbols with LIVE price + change% (from MarketContext quotes),
 *     tappable → /stock/{symbol}, each with a ✕ to remove
 *   • Add-symbol search box reusing the global /api/market/search endpoint
 *
 * This is a separate, additive feature — it does NOT touch the legacy single
 * watchlist in MarketContext (which drives the indices ticker). It only calls
 * `subscribe()` so the active list's symbols stream live prices over the same WS.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import debounce from 'lodash/debounce';
import { useMarket } from '../context/MarketContext';
import { useWatchlistsQuery } from '../api/queries';
import {
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
  type WatchlistGroup,
} from '../api/watchlists';
import { searchSymbols } from '../api/market';
import { invalidate, QueryKey } from '../queryClient';
import { useToast } from '../context/ToastContext';
import { fmtNum } from '../utils/fmt';
import { StockLogo } from '../components/StockLogo';
import { Spinner } from '../components/Spinner';
import { IconPlus, IconX, IconSearch, IconPencil } from '../components/icons';

export function Watchlists() {
  const { data: lists, isLoading, isError, refetch } = useWatchlistsQuery();
  const toast = useToast();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep a valid active list selected as the data loads / changes.
  const sorted = useMemo(
    () => (lists ? [...lists].sort((a, b) => a.order - b.order) : []),
    [lists]
  );
  useEffect(() => {
    if (sorted.length === 0) return;
    if (!activeId || !sorted.some((l) => l.id === activeId)) {
      setActiveId(sorted[0].id);
    }
  }, [sorted, activeId]);

  const active = sorted.find((l) => l.id === activeId) ?? null;

  async function handleCreate() {
    if (busy) return;
    setBusy(true);
    try {
      const { watchlist } = await createWatchlist();
      invalidate(QueryKey.Watchlists);
      setActiveId(watchlist.id);
      toast.push({ kind: 'success', title: 'List created', message: watchlist.name });
    } catch (e: any) {
      toast.push({ kind: 'error', title: 'Could not create list', message: e?.message || 'Try again' });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="px-3 sm:px-0 flex flex-col items-center justify-center gap-3 py-24 text-ink-500 dark:text-night-200">
        <span className="text-accent"><Spinner size={26} thickness={3.5} /></span>
        <span className="text-xs">Loading watchlists…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-3 sm:px-0 py-16">
        <div className="card text-center text-sm text-ink-500 dark:text-night-200 py-10 space-y-3">
          <div>Couldn't load your watchlists.</div>
          <button className="btn-sm btn-primary mx-auto" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-0 pb-6">
      <div className="flex items-center justify-between gap-3 px-1 sm:px-0 mb-3">
        <h1 className="text-lg font-bold tracking-tight">Watchlists</h1>
      </div>

      {/* List selector pills */}
      <ListSelector
        lists={sorted}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={handleCreate}
        creating={busy}
      />

      {active && (
        <ActiveWatchlist
          key={active.id}
          list={active}
          canDelete={sorted.length > 1}
          onDeleted={() => {
            invalidate(QueryKey.Watchlists);
            const next = sorted.find((l) => l.id !== active.id);
            setActiveId(next?.id ?? null);
          }}
        />
      )}
    </div>
  );
}

/* ---------------- List selector (horizontal pills + create) ---------------- */

function ListSelector({
  lists,
  activeId,
  onSelect,
  onCreate,
  creating,
}: {
  lists: WatchlistGroup[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1">
      {lists.map((l) => {
        const isActive = l.id === activeId;
        return (
          <button
            key={l.id}
            onClick={() => onSelect(l.id)}
            className={[
              'shrink-0 flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-semibold transition-colors border',
              isActive
                ? 'bg-brand text-white border-brand'
                : 'bg-white dark:bg-night-700 text-ink-600 dark:text-night-100 border-ink-200 dark:border-night-500/40 hover:bg-ink-50 dark:hover:bg-night-600/60',
            ].join(' ')}
          >
            <span className="truncate max-w-[10rem]">{l.name}</span>
            <span
              className={`text-[11px] num font-semibold px-1.5 rounded-full ${
                isActive ? 'bg-white/20' : 'bg-ink-100 dark:bg-night-600 text-ink-500 dark:text-night-200'
              }`}
            >
              {l.symbols.length}
            </span>
          </button>
        );
      })}
      <button
        onClick={onCreate}
        disabled={creating}
        title="New watchlist"
        aria-label="New watchlist"
        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border border-dashed
                   border-ink-300 dark:border-night-500 text-ink-500 dark:text-night-200
                   hover:bg-ink-50 dark:hover:bg-night-600/60 transition-colors disabled:opacity-50"
      >
        {creating ? <Spinner size={16} thickness={3} /> : <IconPlus size={18} />}
      </button>
    </div>
  );
}

/* ---------------- Active list: header (rename/delete) + symbols + add ------- */

function ActiveWatchlist({
  list,
  canDelete,
  onDeleted,
}: {
  list: WatchlistGroup;
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const { subscribe } = useMarket();
  const toast = useToast();

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Subscribe the active list's symbols for live prices.
  useEffect(() => {
    if (list.symbols.length) subscribe(list.symbols);
  }, [list.symbols, subscribe]);

  // Keep the rename input in sync when switching lists / after a save.
  useEffect(() => {
    setName(list.name);
    setRenaming(false);
    setConfirmDelete(false);
  }, [list.id, list.name]);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === list.name) {
      setRenaming(false);
      setName(list.name);
      return;
    }
    setBusy(true);
    try {
      await updateWatchlist(list.id, { name: trimmed });
      invalidate(QueryKey.Watchlists);
      setRenaming(false);
    } catch (e: any) {
      toast.push({ kind: 'error', title: 'Rename failed', message: e?.message || 'Try again' });
    } finally {
      setBusy(false);
    }
  }

  async function removeSymbol(symbol: string) {
    setBusy(true);
    try {
      await updateWatchlist(list.id, {
        symbols: list.symbols.filter((s) => s.toUpperCase() !== symbol.toUpperCase()),
      });
      invalidate(QueryKey.Watchlists);
    } catch (e: any) {
      toast.push({ kind: 'error', title: 'Remove failed', message: e?.message || 'Try again' });
    } finally {
      setBusy(false);
    }
  }

  async function addSymbol(symbol: string) {
    const up = symbol.toUpperCase().trim();
    if (!up) return;
    if (list.symbols.some((s) => s.toUpperCase() === up)) {
      toast.push({ kind: 'info', title: 'Already in list', message: up });
      return;
    }
    setBusy(true);
    try {
      await updateWatchlist(list.id, { symbols: [...list.symbols, up] });
      invalidate(QueryKey.Watchlists);
      subscribe([up]);
    } catch (e: any) {
      toast.push({ kind: 'error', title: 'Add failed', message: e?.message || 'Try again' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteWatchlist(list.id);
      toast.push({ kind: 'success', title: 'List deleted', message: list.name });
      onDeleted();
    } catch (e: any) {
      toast.push({
        kind: 'error',
        title: 'Could not delete',
        message: e?.status === 400 ? 'You must keep at least one watchlist.' : e?.message || 'Try again',
      });
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {/* List header: name + rename + delete */}
      <div className="flex items-center gap-2 px-1 sm:px-0 min-h-9">
        {renaming ? (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') { setRenaming(false); setName(list.name); }
              }}
              className="input h-9 flex-1 max-w-xs"
              placeholder="List name"
            />
            <button className="btn-sm btn-primary" onClick={saveName} disabled={busy}>Save</button>
            <button
              className="btn-sm bg-ink-100 dark:bg-night-600 text-ink-700 dark:text-night-50"
              onClick={() => { setRenaming(false); setName(list.name); }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold tracking-tight truncate">{list.name}</h2>
            <button
              onClick={() => setRenaming(true)}
              title="Rename list"
              aria-label="Rename list"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink-400 dark:text-night-300
                         hover:bg-ink-100 dark:hover:bg-night-600/60 hover:text-ink-600 dark:hover:text-night-50 transition-colors"
            >
              <IconPencil size={15} />
            </button>
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-500 dark:text-night-200 hidden sm:inline">Delete this list?</span>
                  <button
                    className="btn-sm bg-neg text-white hover:opacity-90"
                    onClick={handleDelete}
                    disabled={busy}
                  >
                    Delete
                  </button>
                  <button
                    className="btn-sm bg-ink-100 dark:bg-night-600 text-ink-700 dark:text-night-50"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={!canDelete}
                  title={canDelete ? 'Delete list' : 'You must keep at least one list'}
                  className="btn-sm bg-ink-100 dark:bg-night-600 text-ink-600 dark:text-night-100
                             hover:bg-ink-200 dark:hover:bg-night-500 disabled:opacity-40"
                >
                  <IconX size={14} /> Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add symbol search */}
      <AddSymbolBox onAdd={addSymbol} existing={list.symbols} />

      {/* Symbols */}
      {list.symbols.length === 0 ? (
        <div className="card text-center py-12 text-sm text-ink-500 dark:text-night-200">
          <div className="mb-1 font-semibold text-ink-700 dark:text-night-50">No symbols yet</div>
          Search above to add stocks to <span className="font-medium">{list.name}</span>.
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          {list.symbols.map((s) => (
            <SymbolRow key={s} symbol={s} onRemove={() => removeSymbol(s)} disabled={busy} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- One symbol row (live price + remove) --------------------- */

function SymbolRow({
  symbol,
  onRemove,
  disabled,
}: {
  symbol: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { quotes, prevPrice } = useMarket();
  const key = symbol.toUpperCase();
  const q = quotes[key];
  const up = (q?.change ?? 0) >= 0;

  // Brief colour flash when the live price ticks up/down. Self-contained: we
  // set a tint for ~400ms whenever the price changes, no global CSS needed.
  const prev = prevPrice[key];
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    if (q?.price == null || prev == null || prev === q.price) return;
    setFlash(q.price > prev ? 'up' : 'down');
    const t = setTimeout(() => setFlash(''), 400);
    return () => clearTimeout(t);
  }, [q?.price, prev]);
  const flashCls =
    flash === 'up' ? 'text-pos' : flash === 'down' ? 'text-neg' : '';

  return (
    <div className="group flex items-center gap-3 px-4 py-3 border-b last:border-b-0 border-ink-100 dark:border-night-500/40 hover:bg-ink-50/60 dark:hover:bg-night-600/40 transition">
      <Link to={`/stock/${encodeURIComponent(symbol)}`} className="flex items-center gap-3 min-w-0 flex-1">
        <StockLogo symbol={symbol} size={36} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold tracking-tight truncate">{symbol}</div>
          <div className={`text-xs num ${q ? (up ? 'text-pos' : 'text-neg') : 'text-ink-400 dark:text-night-300'}`}>
            {q?.changePercent != null
              ? `${up ? '+' : '−'}${fmtNum(Math.abs(q.change))} (${Math.abs(q.changePercent).toFixed(2)}%)`
              : 'Loading…'}
          </div>
        </div>
      </Link>

      <Link
        to={`/stock/${encodeURIComponent(symbol)}`}
        className={`num text-sm font-semibold shrink-0 transition-colors ${flashCls}`}
      >
        {q?.price != null ? `₹${fmtNum(q.price)}` : '—'}
      </Link>

      <button
        onClick={onRemove}
        disabled={disabled}
        title={`Remove ${symbol}`}
        aria-label={`Remove ${symbol}`}
        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg text-ink-400 dark:text-night-300
                   hover:bg-neg/10 hover:text-neg transition-colors disabled:opacity-40
                   opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <IconX size={15} />
      </button>
    </div>
  );
}

/* ---------------- Add-symbol search box (reuses global search) ------------- */

interface Hit {
  symbol: string;
  name: string;
  exchange?: string;
}

function AddSymbolBox({
  onAdd,
  existing,
}: {
  onAdd: (symbol: string) => void;
  existing: string[];
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const existingSet = useMemo(
    () => new Set(existing.map((s) => s.toUpperCase())),
    [existing]
  );

  // Debounced search against the SAME /api/market/search the global modal uses.
  useEffect(() => {
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
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    run(q);
    return () => run.cancel();
  }, [q]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(symbol: string) {
    onAdd(symbol);
    setQ('');
    setHits([]);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 input h-11">
        <IconSearch size={17} className="text-ink-400 dark:text-night-300 shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Add a symbol — search stocks, indices, F&O…"
          className="flex-1 bg-transparent outline-none text-sm placeholder-ink-400 dark:placeholder-night-300"
          autoComplete="off"
        />
        {q && (
          <button
            onClick={() => { setQ(''); setHits([]); }}
            className="text-ink-400 hover:text-ink-600 dark:text-night-300 dark:hover:text-night-100 shrink-0"
            aria-label="Clear"
          >
            <IconX size={15} />
          </button>
        )}
      </div>

      {open && q.trim().length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1.5 bg-white dark:bg-night-700 rounded-xl shadow-cardHover
                        border border-ink-100 dark:border-night-500/40 overflow-hidden max-h-80 overflow-y-auto">
          {loading && hits.length === 0 && (
            <div className="px-4 py-5 text-center text-sm text-ink-500 dark:text-night-200">Searching…</div>
          )}
          {!loading && hits.length === 0 && (
            <div className="px-4 py-5 text-center text-sm text-ink-500 dark:text-night-200">No results for "{q}"</div>
          )}
          {hits.map((h) => {
            const already = existingSet.has(h.symbol.toUpperCase());
            return (
              <button
                key={`${h.symbol}-${h.exchange ?? ''}`}
                onClick={() => !already && pick(h.symbol)}
                disabled={already}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                  already
                    ? 'opacity-50 cursor-default'
                    : 'hover:bg-ink-50/70 dark:hover:bg-night-600/50'
                }`}
              >
                <StockLogo symbol={h.symbol} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium tracking-tight truncate">{h.symbol}</div>
                  {h.name && h.name !== h.symbol && (
                    <div className="text-[11px] text-ink-500 dark:text-night-200 truncate">{h.name}</div>
                  )}
                </div>
                {already ? (
                  <span className="text-[10px] font-semibold text-ink-400 dark:text-night-300 uppercase tracking-wider">
                    Added
                  </span>
                ) : (
                  <span className="text-accent shrink-0"><IconPlus size={17} /></span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
