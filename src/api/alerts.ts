import { api } from './client';
import type { AlertDTO, AlertEventDTO, AlertFrequency, AlertType } from '../types';

export const listAlerts = (status?: string) =>
  api<{ alerts: AlertDTO[] }>(`/api/alerts${status ? `?status=${status}` : ''}`);

export const createAlert = (input: {
  symbol: string;
  type: AlertType;
  value: number;
  frequency: AlertFrequency;
  cooldownSeconds?: number;
  note?: string;
}) =>
  api<{ alert: AlertDTO }>('/api/alerts', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateAlert = (
  id: string,
  patch: Partial<Pick<AlertDTO, 'status' | 'value' | 'note' | 'frequency' | 'cooldownSeconds'>>
) =>
  api<{ alert: AlertDTO }>(`/api/alerts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

export const deleteAlert = (id: string) =>
  api<{ ok: boolean }>(`/api/alerts/${id}`, { method: 'DELETE' });

export const listAlertEvents = (limit = 50) =>
  api<{ events: AlertEventDTO[] }>(`/api/alerts/events?limit=${limit}`);
