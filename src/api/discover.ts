import { api } from './client';

/**
 * One curated, liquid NSE stock with its live-ish quote.
 *
 * Powers the Discover page (top gainers / losers + screener). The list comes
 * from `GET /api/market/universe` — a server-cached (~30s) snapshot of ~48
 * liquid names, so it refreshes on a poll rather than the live WebSocket feed.
 */
export interface UniverseStock {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

export interface UniverseResp {
  stocks: UniverseStock[];
  fromCache?: boolean;
}

export function fetchUniverse() {
  return api<UniverseResp>('/api/market/universe');
}
