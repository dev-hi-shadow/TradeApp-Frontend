import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isLockedSymbol, useMarket } from '../context/MarketContext';
import { useToast } from '../context/ToastContext';
import { resetAccount } from '../api/account';
import {
  changePassword,
  resendVerification,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  type SessionInfo,
} from '../api/auth';
import { validateNewPassword } from '../utils/password';
import { fmtINR, fmtNum, classPnL } from '../utils/fmt';
import { IconLogOut, IconPlus, IconRefresh, IconX } from '../components/icons';
import { SymbolSelect } from '../components/SymbolSelect';
import { FormEvent } from 'react';

export function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const { watchlist, setWatchlist, quotes } = useMarket();
  const toast = useToast();
  const [newSym, setNewSym] = useState('');
  const [resetting, setResetting] = useState(false);

  function addSymbol() {
    const s = newSym.trim().toUpperCase();
    if (!s) return;
    if (watchlist.includes(s)) {
      toast.push({ kind: 'info', message: 'Already in watchlist' });
      return;
    }
    setWatchlist([...watchlist, s]);
    setNewSym('');
  }

  function remove(s: string) {
    if (isLockedSymbol(s)) {
      toast.push({
        kind: 'info',
        message: `${s} is a default watchlist item and cannot be removed.`,
      });
      return;
    }
    setWatchlist(watchlist.filter((x) => x !== s));
  }

  async function onReset() {
    if (!confirm('Reset balance to ₹1,00,000 and clear ALL orders and positions?')) return;
    setResetting(true);
    try {
      const r = await resetAccount();
      await refreshUser();
      toast.push({
        kind: 'success',
        title: 'Account reset',
        message: `Balance restored to ${fmtINR(r.virtualBalance)}`,
      });
    } catch (err: any) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5 px-3 sm:px-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:space-y-0 lg:items-start">
      {/* Main column: account, security, danger zone */}
      <div className="space-y-4 lg:space-y-5 lg:col-span-2">
      {/* Account card */}
      <section className="card">
        <div className="flex items-center gap-3">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-2xl object-cover"
            />
          ) : (
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand/15 text-accent font-bold text-base">
              {user?.username.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <div className="font-bold tracking-tight truncate flex items-center gap-1.5">
              {user?.username}
              {user?.authProvider === 'google' && (
                <span className="tag-mute !text-[9px] !px-1.5">GOOGLE</span>
              )}
            </div>
            <div className="text-xs text-ink-500 dark:text-night-200 truncate">{user?.email}</div>
          </div>
          <button
            onClick={logout}
            className="ml-auto btn-outline btn-sm"
            aria-label="Sign out"
          >
            <IconLogOut size={14} /> Sign out
          </button>
        </div>
        <EmailVerificationRow />
        <div className="divider my-4" />
        <MarginSummary />
      </section>

      {/* Security — password (local accounts only) + active sessions */}
      {user?.authProvider !== 'google' && <ChangePasswordCard />}
      <SessionsCard />

      {/* Danger zone */}
      <section className="card border-neg/30 dark:border-neg/40 !border">
        <h2 className="section-title text-neg dark:text-neg">Danger zone</h2>
        <p className="text-sm text-ink-600 dark:text-night-100 mb-3">
          Resetting will clear all orders, positions and transactions, and restore your virtual balance to ₹1,00,000.
        </p>
        <button onClick={onReset} disabled={resetting} className="btn-neg w-full">
          <IconRefresh size={16} />
          {resetting ? 'Resetting…' : 'Reset paper-trading account'}
        </button>
      </section>
      </div>

      {/* Right column: shortcuts + watchlist */}
      <div className="space-y-4 lg:space-y-5 lg:col-span-1">
      {/* Shortcuts */}
      <section className="card !p-0 overflow-hidden">
        <Link
          to="/alerts"
          className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50/60 dark:hover:bg-night-600/40 transition border-b border-ink-100 dark:border-night-500/40"
        >
          <span className="text-xl">🔔</span>
          <div className="flex-1">
            <div className="font-semibold tracking-tight text-sm">Price alerts</div>
            <div className="text-xs text-ink-500 dark:text-night-200">
              Above/below/% triggers · one-time, recurring, or daily
            </div>
          </div>
          <span className="text-ink-400 dark:text-night-200">›</span>
        </Link>
        {user?.role === 'admin' && (
          <Link
            to="/admin"
            className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50/60 dark:hover:bg-night-600/40 transition"
          >
            <span className="text-xl">🛡️</span>
            <div className="flex-1">
              <div className="font-semibold tracking-tight text-sm">Admin console</div>
              <div className="text-xs text-ink-500 dark:text-night-200">
                Manage user margins, view ledger
              </div>
            </div>
            <span className="text-ink-400 dark:text-night-200">›</span>
          </Link>
        )}
      </section>

      {/* Watchlist */}
      <section className="card">
        <h2 className="section-title">Watchlist</h2>
        <div className="flex gap-2 mb-3">
          <SymbolSelect
            value={newSym}
            onChange={(s) => setNewSym(s)}
            placeholder="Add a stock, index or commodity"
          />
          <button className="btn-primary px-4" onClick={addSymbol}>
            <IconPlus size={16} />
          </button>
        </div>

        {watchlist.length === 0 ? (
          <p className="text-sm text-ink-500 dark:text-night-200">No symbols in watchlist.</p>
        ) : (
          <ul className="divide-y divide-ink-100 dark:divide-night-500/40">
            {watchlist.map((s) => {
              const q = quotes[s];
              const change = q?.change ?? 0;
              const locked = isLockedSymbol(s);
              return (
                <li key={s} className="flex items-center gap-3 py-3">
                  <Link
                    to={`/stock/${encodeURIComponent(s)}`}
                    className="min-w-0 flex-1 hover:opacity-90"
                  >
                    <div className="font-semibold tracking-tight flex items-center gap-1.5">
                      {s}
                      {locked && (
                        <span className="tag-mute !text-[9px] !px-1.5">DEFAULT</span>
                      )}
                    </div>
                    <div className={`text-xs num ${classPnL(change)}`}>
                      {q?.price != null
                        ? `${fmtNum(q.price)} (${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%)`
                        : '—'}
                    </div>
                  </Link>
                  {!locked && (
                    <button
                      onClick={() => remove(s)}
                      className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-neg/10 text-neg hover:bg-neg/20"
                      aria-label={`Remove ${s}`}
                    >
                      <IconX size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

/**
 * Change-password form for the signed-in user. Requires the current password,
 * validates the new one client-side (same rules as the backend), then calls
 * POST /api/auth/change-password.
 */
function ChangePasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!current) {
      toast.push({ kind: 'error', message: 'Enter your current password' });
      return;
    }
    const check = validateNewPassword(next, confirm);
    if (!check.ok) {
      toast.push({ kind: 'error', message: check.error });
      return;
    }
    if (current === next) {
      toast.push({ kind: 'error', message: 'New password must be different from the current one' });
      return;
    }
    setSaving(true);
    try {
      await changePassword(current, next);
      toast.push({ kind: 'success', title: 'Password changed', message: 'Use it next time you sign in.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Could not change password', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2 className="section-title">Change password</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label">Current password</label>
          <input
            type="password"
            className="input"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            type="password"
            className="input"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={6}
            required
          />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={6}
            required
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </section>
  );
}

/**
 * Email-verification status pill + a resend action when unverified. Hidden for
 * accounts that have no email-verification concept surfaced (always shown here
 * since every account has an email).
 */
function EmailVerificationRow() {
  const { user } = useAuth();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  if (!user) return null;
  const verified = user.emailVerified !== false;

  async function onResend() {
    setSending(true);
    try {
      const r = await resendVerification();
      toast.push({ kind: 'success', title: 'Verification sent', message: r.message });
    } catch (err: any) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink-50 dark:bg-night-600/60 px-3 py-2">
      <span className="text-sm">{verified ? '✅' : '✉️'}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold tracking-tight">
          {verified ? 'Email verified' : 'Email not verified'}
        </div>
        <div className="text-[11px] text-ink-500 dark:text-night-200 truncate">
          {verified
            ? 'Your email address is confirmed.'
            : 'Confirm your email to secure your account.'}
        </div>
      </div>
      {!verified && (
        <button onClick={onResend} disabled={sending} className="btn-outline btn-sm shrink-0">
          {sending ? 'Sending…' : 'Resend'}
        </button>
      )}
    </div>
  );
}

/**
 * Active login sessions (one per device/browser holding a refresh token).
 * Lets the user see where they're signed in and revoke any device — or all
 * other devices at once.
 */
function SessionsCard() {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await listSessions();
      setSessions(r.sessions);
    } catch (err: any) {
      toast.push({ kind: 'error', message: err.message });
      setSessions([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRevoke(id: string) {
    setBusy(id);
    try {
      await revokeSession(id);
      setSessions((s) => (s ? s.filter((x) => x.id !== id) : s));
      toast.push({ kind: 'success', message: 'Signed out that device.' });
    } catch (err: any) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function onRevokeOthers() {
    setBusy('others');
    try {
      const r = await revokeOtherSessions();
      toast.push({ kind: 'success', message: `Signed out ${r.revoked} other device${r.revoked === 1 ? '' : 's'}.` });
      await load();
    } catch (err: any) {
      toast.push({ kind: 'error', message: err.message });
    } finally {
      setBusy(null);
    }
  }

  const hasOthers = (sessions?.filter((s) => !s.current).length ?? 0) > 0;

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="section-title !mb-0">Active sessions</h2>
        {hasOthers && (
          <button onClick={onRevokeOthers} disabled={busy === 'others'} className="btn-outline btn-sm">
            {busy === 'others' ? 'Working…' : 'Log out others'}
          </button>
        )}
      </div>
      <p className="text-xs text-ink-500 dark:text-night-200 mb-3">
        Devices currently signed in to your account.
      </p>

      {sessions == null ? (
        <p className="text-sm text-ink-500 dark:text-night-200">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-ink-500 dark:text-night-200">No active sessions.</p>
      ) : (
        <ul className="divide-y divide-ink-100 dark:divide-night-500/40">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <span className="text-lg">{deviceEmoji(s.userAgent)}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold tracking-tight text-sm flex items-center gap-1.5 truncate">
                  {prettyDevice(s.userAgent)}
                  {s.current && <span className="tag-mute !text-[9px] !px-1.5">THIS DEVICE</span>}
                </div>
                <div className="text-[11px] text-ink-500 dark:text-night-200 truncate">
                  {s.ip ? `${s.ip} · ` : ''}active {timeAgo(s.lastUsedAt)}
                </div>
              </div>
              {!s.current && (
                <button
                  onClick={() => onRevoke(s.id)}
                  disabled={busy === s.id}
                  className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-neg/10 text-neg hover:bg-neg/20 shrink-0"
                  aria-label="Revoke session"
                >
                  <IconX size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Rough device/browser label from a user-agent string. */
function prettyDevice(ua: string): string {
  const u = ua || '';
  const browser = /Edg\//.test(u) ? 'Edge'
    : /OPR\/|Opera/.test(u) ? 'Opera'
    : /Chrome\//.test(u) ? 'Chrome'
    : /Firefox\//.test(u) ? 'Firefox'
    : /Safari\//.test(u) ? 'Safari'
    : 'Browser';
  const os = /Windows/.test(u) ? 'Windows'
    : /Android/.test(u) ? 'Android'
    : /iPhone|iPad|iOS/.test(u) ? 'iOS'
    : /Mac OS X|Macintosh/.test(u) ? 'macOS'
    : /Linux/.test(u) ? 'Linux'
    : '';
  return os ? `${browser} · ${os}` : browser;
}

function deviceEmoji(ua: string): string {
  const u = ua || '';
  if (/iPhone|Android.*Mobile|Mobile/.test(u)) return '📱';
  if (/iPad|Tablet/.test(u)) return '💻';
  return '🖥️';
}

/** Compact "x minutes ago" from an ISO timestamp. */
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return 'recently';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

/**
 * Live margin breakdown driven by the WebSocket `portfolioUpdate` channel.
 * Falls back to the user's static virtualBalance when there are no positions yet.
 */
function MarginSummary() {
  const { user } = useAuth();
  const { portfolio } = useMarket();
  const balance = portfolio?.balance ?? user?.virtualBalance ?? 0;
  const used     = portfolio?.marginUsed     ?? 0;
  const free     = portfolio?.availableMargin ?? balance;
  const unrl     = portfolio?.unrealisedPnL  ?? 0;
  const realised = portfolio?.realisedPnL    ?? 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Balance"  value={fmtINR(balance)} />
        <Cell label="Used"     value={fmtINR(used)}    sub="margin"   />
        <Cell label="Free"     value={fmtINR(free)}    sub="available" tone={free > 0 ? 'pos' : 'neg'} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Cell label="Unrealised P&L" value={fmtINR(unrl)}     tone={unrl >= 0 ? 'pos' : 'neg'} />
        <Cell label="Realised P&L"   value={fmtINR(realised)} tone={realised >= 0 ? 'pos' : 'neg'} />
      </div>
    </div>
  );
}

function Cell({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="rounded-xl bg-ink-50 dark:bg-night-600/60 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-500 dark:text-night-200">
        {label}
      </div>
      <div className={`num text-sm font-bold ${tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : ''}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-ink-400 dark:text-night-200">{sub}</div>}
    </div>
  );
}
