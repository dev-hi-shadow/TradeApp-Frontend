import { api } from './client';

export const getWatchlist = () => api<{ symbols: string[] }>('/api/account/watchlist');

export const updateWatchlist = (symbols: string[]) =>
  api<{ symbols: string[] }>('/api/account/watchlist', {
    method: 'PUT',
    body: JSON.stringify({ symbols }),
  });

export const resetAccount = () =>
  api<{ ok: boolean; virtualBalance: number }>('/api/account/reset', { method: 'POST' });
