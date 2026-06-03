/**
 * Tiny localStorage-backed "recently viewed" tracker.
 * Keeps the most recent N symbols in MRU order (most-recent first), capped.
 */
const KEY = 'tradar.recentlyViewed';
const MAX = 8;

export function getRecentlyViewed(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentlyViewed(symbol: string): void {
  const s = symbol.toUpperCase();
  if (!s) return;
  const list = getRecentlyViewed().filter((x) => x !== s);
  list.unshift(s);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore quota errors */
  }
}
