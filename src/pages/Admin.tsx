/**
 * Admin console. Only visible to users with role === 'admin'.
 *
 * Lists every user, exposes a quick-add margin form per user, and shows
 * the recent margin-ledger entries (who topped up what, when).
 */
import { useState, FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { adjustMargin, userLedger, type AdminUser, type MarginLedgerEntry } from '../api/admin';
import { useAdminUsersQuery } from '../api/queries';
import { invalidate, QueryKey } from '../queryClient';
import { fmtINR } from '../utils/fmt';
import { IconRefresh } from '../components/icons';

export function Admin() {
  const { user } = useAuth();
  if (user && user.role !== 'admin') return <Navigate to="/stocks" replace />;

  const toast = useToast();
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [ledger, setLedger] = useState<MarginLedgerEntry[]>([]);

  const usersQuery = useAdminUsersQuery(submittedQ);
  const users = usersQuery.data?.users ?? [];
  const loading = usersQuery.isLoading;

  function refresh() {
    if (submittedQ === q) {
      invalidate(QueryKey.AdminUsers);
    } else {
      setSubmittedQ(q);
    }
  }

  async function openUser(u: AdminUser) {
    setSelected(u);
    try {
      const r = await userLedger(u.id);
      setLedger(r.entries);
    } catch {
      setLedger([]);
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5 px-3 sm:px-0">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Admin console</h1>
          <p className="text-xs text-ink-500 dark:text-night-200">
            {users.length} users · margin adjustments are append-only
          </p>
        </div>
        <button onClick={refresh} className="btn-outline btn-sm">
          <IconRefresh size={14} /> Refresh
        </button>
      </header>

      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Search by email or username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && refresh()}
        />
        <button className="btn-primary" onClick={refresh}>Search</button>
      </div>

      {/* Users list */}
      <section className="card !p-0 overflow-hidden">
        {loading && (
          <div className="px-4 py-3 text-xs text-ink-500 dark:text-night-200">Loading…</div>
        )}
        <table className="data-table">
          <thead>
            <tr>
              <th className="pl-4">User</th>
              <th>Email</th>
              <th>Role</th>
              <th className="text-right pr-4">Balance</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                onClick={() => openUser(u)}
                className={`cursor-pointer ${selected?.id === u.id ? 'bg-brand/10' : ''}`}
              >
                <td className="pl-4 font-semibold">{u.username}</td>
                <td className="text-ink-600 dark:text-night-100 text-xs">{u.email}</td>
                <td>
                  <span className={u.role === 'admin' ? 'tag-info' : 'tag-mute'}>
                    {u.role.toUpperCase()}
                  </span>
                </td>
                <td className="text-right pr-4 num font-semibold">{fmtINR(u.virtualBalance)}</td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-500 dark:text-night-200">
                No users found.
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Selected-user panel */}
      {selected && (
        <AdminUserPanel
          user={selected}
          ledger={ledger}
          onAdjusted={async () => {
            // Refetch the users list (updates table balances) and re-sync the
            // currently-selected user with their latest balance.
            invalidate(QueryKey.AdminUsers);
            const r = await userLedger(selected.id);
            setLedger(r.entries);
            const refetched = await usersQuery.refetch();
            const updated = refetched.data?.users.find((u) => u.id === selected.id);
            if (updated) setSelected(updated);
          }}
        />
      )}
    </div>
  );
}

function AdminUserPanel({
  user, ledger, onAdjusted,
}: {
  user: AdminUser;
  ledger: MarginLedgerEntry[];
  onAdjusted: () => Promise<void>;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState<number>(10000);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent, sign: 1 | -1) {
    e.preventDefault();
    if (!amount || amount <= 0) {
      return toast.push({ kind: 'error', message: 'Enter a positive amount' });
    }
    setSubmitting(true);
    try {
      await adjustMargin(user.id, sign * amount, note);
      toast.push({
        kind: 'success',
        title: sign > 0 ? 'Margin added' : 'Margin removed',
        message: `${user.email} → ${sign > 0 ? '+' : '−'}${fmtINR(amount)}`,
      });
      setNote('');
      await onAdjusted();
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Adjust failed', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="card">
        <h2 className="section-title">Adjust margin · {user.username}</h2>
        <div className="text-xs text-ink-500 dark:text-night-200 mb-3">
          Current balance: <span className="num font-bold text-ink-800 dark:text-night-50">{fmtINR(user.virtualBalance)}</span>
        </div>
        <form className="space-y-3">
          <div>
            <label className="label">Amount (₹)</label>
            <input
              type="number"
              className="input num"
              min={1}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value || '0'))}
            />
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <input
              className="input"
              maxLength={200}
              placeholder="e.g. promotional top-up"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="submit"
              onClick={(e) => submit(e, 1)}
              disabled={submitting}
              className="btn-pos"
            >
              + Add ₹{amount.toLocaleString('en-IN')}
            </button>
            <button
              type="submit"
              onClick={(e) => submit(e, -1)}
              disabled={submitting}
              className="btn-neg"
            >
              − Remove ₹{amount.toLocaleString('en-IN')}
            </button>
          </div>
        </form>
      </section>

      <section className="card !p-0 overflow-hidden">
        <header className="px-4 py-3 border-b border-ink-100 dark:border-night-500/40">
          <h2 className="section-title mb-0">Margin ledger</h2>
        </header>
        {ledger.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-500 dark:text-night-200">
            No adjustments yet for this user.
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="pl-4">When</th>
                <th>Admin</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Balance after</th>
                <th className="pr-4">Note</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((e) => {
                const adminLabel =
                  typeof e.adminId === 'object' && e.adminId
                    ? `${e.adminId.username} (${e.adminId.email})`
                    : String(e.adminId);
                return (
                  <tr key={e._id}>
                    <td className="pl-4 text-xs text-ink-500 dark:text-night-200 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="text-xs">{adminLabel}</td>
                    <td className={`text-right num font-semibold ${e.amount >= 0 ? 'text-pos' : 'text-neg'}`}>
                      {e.amount >= 0 ? '+' : '−'}{fmtINR(Math.abs(e.amount))}
                    </td>
                    <td className="text-right num">{fmtINR(e.balanceAfter)}</td>
                    <td className="pr-4 text-xs text-ink-500 dark:text-night-200 truncate max-w-[140px]">
                      {e.note || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
