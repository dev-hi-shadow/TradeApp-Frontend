import { api } from './client';
import type { TradingPlan } from '../types';

export const listPlans = () => api<{ plans: TradingPlan[] }>('/api/plans');

export const createPlan = (input: {
  name: string;
  description?: string;
  rules?: Record<string, any>;
}) =>
  api<{ plan: TradingPlan }>('/api/plans', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updatePlan = (
  id: string,
  input: Partial<{
    name: string;
    description: string;
    rules: Record<string, any>;
    status: 'active' | 'inactive' | 'archived';
  }>
) =>
  api<{ plan: TradingPlan }>(`/api/plans/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

export const deletePlan = (id: string) =>
  api<{ ok: boolean }>(`/api/plans/${id}`, { method: 'DELETE' });
