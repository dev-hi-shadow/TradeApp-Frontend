import { api } from './client';

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  virtualBalance: number;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface MarginLedgerEntry {
  _id: string;
  userId: string;
  adminId: { _id: string; username: string; email: string } | string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note?: string;
  createdAt: string;
}

export const listUsers = (q?: string) =>
  api<{ users: AdminUser[] }>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);

export const adjustMargin = (id: string, amount: number, note?: string) =>
  api<{ ok: boolean; user: AdminUser }>(`/api/admin/users/${id}/margin`, {
    method: 'POST',
    body: JSON.stringify({ amount, note }),
  });

export const userLedger = (id: string) =>
  api<{ entries: MarginLedgerEntry[] }>(`/api/admin/users/${id}/ledger`);
