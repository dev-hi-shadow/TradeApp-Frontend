import { useState, FormEvent } from 'react';
import { createPlan, deletePlan, updatePlan } from '../api/plans';
import { usePlansQuery } from '../api/queries';
import { invalidate, QueryKey } from '../queryClient';
import { useToast } from '../context/ToastContext';
import type { TradingPlan } from '../types';
import { IconPlus, IconX } from '../components/icons';

export function Plans() {
  const { data: plans = [] } = usePlansQuery();
  const [editing, setEditing] = useState<TradingPlan | null>(null);
  const [showForm, setShowForm] = useState(false);
  const toast = useToast();

  async function onDelete(id: string) {
    if (!confirm('Delete this trading plan?')) return;
    try {
      await deletePlan(id);
      invalidate(QueryKey.Plans);
      toast.push({ kind: 'success', message: 'Plan deleted' });
    } catch (err: any) {
      toast.push({ kind: 'error', message: err.message });
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5 px-3 sm:px-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title mb-0">Trading plans</h2>
          <p className="text-xs text-ink-500 dark:text-night-200 mt-1">
            {plans.length}/20 plans · attach to an order for discipline
          </p>
        </div>
        <button
          className="btn-primary btn-sm"
          onClick={() => { setEditing(null); setShowForm(true); }}
          disabled={plans.length >= 20}
        >
          <IconPlus size={14} /> New plan
        </button>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {plans.map((p) => (
          <article key={p._id} className="card hover:shadow-cardHover transition">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-base tracking-tight">{p.name}</h3>
                <span
                  className={`mt-1.5 ${
                    p.status === 'active' ? 'tag-pos' :
                    p.status === 'inactive' ? 'tag-mute' : 'tag-mute'
                  }`}
                >
                  {p.status.toUpperCase()}
                </span>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  className="btn-sm btn-ghost"
                  onClick={() => { setEditing(p); setShowForm(true); }}
                >
                  Edit
                </button>
                <button
                  className="btn-sm bg-neg/10 text-neg hover:bg-neg/20"
                  onClick={() => onDelete(p._id)}
                >
                  Delete
                </button>
              </div>
            </div>
            {p.description && (
              <p className="text-sm text-ink-600 dark:text-night-100 mt-3 leading-snug">
                {p.description}
              </p>
            )}
            <div className="mt-3 rounded-xl bg-ink-50 dark:bg-night-600/60 p-3 overflow-x-auto">
              <pre className="font-mono text-[11px] text-ink-700 dark:text-night-100 whitespace-pre">
{JSON.stringify(p.rules, null, 2)}
              </pre>
            </div>
          </article>
        ))}
        {plans.length === 0 && (
          <div className="card text-sm text-ink-500 dark:text-night-200 col-span-full">
            No plans yet. Click <span className="font-semibold">New plan</span> to create one.
          </div>
        )}
      </section>

      {showForm && (
        <PlanForm
          existing={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); invalidate(QueryKey.Plans); }}
        />
      )}
    </div>
  );
}

function PlanForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: TradingPlan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [rulesText, setRulesText] = useState(
    JSON.stringify(existing?.rules || { maxLossPercent: 2, targetPercent: 5 }, null, 2)
  );
  const [status, setStatus] = useState<'active' | 'inactive' | 'archived'>(
    existing?.status || 'active'
  );
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    let rules: Record<string, any>;
    try { rules = JSON.parse(rulesText); }
    catch { return toast.push({ kind: 'error', message: 'Rules must be valid JSON' }); }
    setSubmitting(true);
    try {
      if (existing) {
        await updatePlan(existing._id, { name, description, rules, status });
        toast.push({ kind: 'success', message: 'Plan updated' });
      } else {
        await createPlan({ name, description, rules });
        toast.push({ kind: 'success', message: 'Plan created' });
      }
      onSaved();
    } catch (err: any) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 dark:bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-night-700 rounded-t-3xl sm:rounded-2xl shadow-cardHover animate-slideUp"
      >
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-ink-200 dark:bg-night-400" />
        </div>
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <h2 className="text-lg font-bold tracking-tight">
            {existing ? 'Edit plan' : 'New plan'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-ink-50 dark:bg-night-600 text-ink-600 dark:text-night-100"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Rules (JSON)</label>
            <textarea
              className="input font-mono text-[12px] min-h-[120px]"
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
            />
          </div>
          {existing && (
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-outline flex-1">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
