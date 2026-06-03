/**
 * Multiple named watchlists (Groww / Dhan style).
 *
 * Separate from the legacy single watchlist in MarketContext (which drives the
 * indices ticker + WS index subscriptions). This is a purely additive feature
 * with its own CRUD backend at /api/watchlists.
 *
 * The backend auto-seeds a default "My Watchlist" on first read, so
 * `listWatchlists()` always returns at least one group.
 */
import { api } from './client';

export interface WatchlistGroup {
  id: string;
  name: string;
  symbols: string[];
  order: number;
}

/** All of the user's named watchlists (auto-seeds a default on the server). */
export function listWatchlists() {
  return api<{ watchlists: WatchlistGroup[] }>('/api/watchlists');
}

/** Create a new named list. Omit `name` to let the server pick "Watchlist N". */
export function createWatchlist(name?: string) {
  return api<{ watchlist: WatchlistGroup }>('/api/watchlists', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/**
 * Patch a list's name and/or its full symbols array. To add/remove a symbol,
 * send the COMPLETE new symbols array (the server replaces, it does not merge).
 */
export function updateWatchlist(id: string, patch: { name?: string; symbols?: string[] }) {
  return api<{ watchlist: WatchlistGroup }>(`/api/watchlists/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** Delete a list. The server refuses (400) to delete the user's last list. */
export function deleteWatchlist(id: string) {
  return api<{ ok: boolean }>(`/api/watchlists/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
