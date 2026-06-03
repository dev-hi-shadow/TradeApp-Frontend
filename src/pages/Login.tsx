import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton';

export function Login() {
  const [emailOrUsername, setIdent] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(emailOrUsername, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Login failed', message: err.message });
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
            <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome back</h1>
            <p className="text-sm text-ink-500 dark:text-night-200 mb-6">
              Sign in to your paper-trading account.
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label">Email or Username</label>
                <input
                  className="input"
                  value={emailOrUsername}
                  onChange={(e) => setIdent(e.target.value)}
                  autoComplete="username"
                  placeholder="demo@example.com"
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="label">Password</label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <GoogleSignInButton onDone={() => navigate('/', { replace: true })} />

            <div className="divider my-5" />
            <div className="rounded-xl bg-brand/5 dark:bg-brand/10 px-3 py-2.5 text-xs text-ink-600 dark:text-night-100">
              <span className="font-semibold text-accent">Demo:</span>{' '}
              demo@example.com / demo123
            </div>
          </div>

          <p className="text-sm text-ink-500 dark:text-night-200 mt-4 text-center">
            New to Tradar?{' '}
            <Link to="/register" className="text-accent font-semibold">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
