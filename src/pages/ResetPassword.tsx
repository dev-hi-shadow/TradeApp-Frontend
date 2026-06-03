import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { validateNewPassword } from '../utils/password';

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { applyAuth } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const check = validateNewPassword(password, confirm);
    if (!check.ok) {
      toast.push({ kind: 'error', message: check.error });
      return;
    }
    setSubmitting(true);
    try {
      const res = await resetPassword(token, password);
      applyAuth(res.token, res.user, res.refreshToken); // server signs us in after a successful reset
      toast.push({ kind: 'success', message: 'Password updated — you are signed in.' });
      navigate('/', { replace: true });
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Reset failed', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-ink-50 dark:bg-night-900">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand text-white font-bold">
            T
          </span>
          <span className="font-bold tracking-tight">Tradar</span>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="card animate-slideUp">
            {!token ? (
              <>
                <div className="text-3xl mb-2">🔗</div>
                <h1 className="text-2xl font-bold tracking-tight mb-1">Invalid reset link</h1>
                <p className="text-sm text-ink-500 dark:text-night-200 mb-6">
                  This link is missing its token. Request a fresh one to continue.
                </p>
                <Link to="/forgot-password" className="btn-primary w-full inline-flex justify-center">
                  Request new link
                </Link>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight mb-1">Set a new password</h1>
                <p className="text-sm text-ink-500 dark:text-night-200 mb-6">
                  Choose a strong password you haven't used before.
                </p>

                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label className="label">New password</label>
                    <input
                      type="password"
                      className="input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                  <button type="submit" className="btn-primary w-full" disabled={submitting}>
                    {submitting ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="text-sm text-ink-500 dark:text-night-200 mt-4 text-center">
            <Link to="/login" className="text-accent font-semibold">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
