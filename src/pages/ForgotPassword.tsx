import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import _ from 'lodash';
import { forgotPassword } from '../api/auth';
import { useToast } from '../context/ToastContext';
import { ThemeToggle } from '../components/ThemeToggle';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const toast = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = _.trim(email).toLowerCase();
    if (_.isEmpty(clean)) {
      toast.push({ kind: 'error', message: 'Enter your email address' });
      return;
    }
    setSubmitting(true);
    try {
      await forgotPassword(clean);
      // Server intentionally returns the same response whether or not the
      // email is registered (no account enumeration) — so we always show the
      // same confirmation screen.
      setSent(true);
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Something went wrong', message: err.message });
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
            {sent ? (
              <>
                <div className="text-3xl mb-2">📬</div>
                <h1 className="text-2xl font-bold tracking-tight mb-1">Check your email</h1>
                <p className="text-sm text-ink-500 dark:text-night-200 mb-6">
                  If <span className="font-semibold">{email}</span> is registered, we've sent a
                  link to reset your password. It expires in 30 minutes.
                </p>
                <Link to="/login" className="btn-primary w-full inline-flex justify-center">
                  Back to sign in
                </Link>
                <button
                  className="btn-outline w-full mt-2"
                  onClick={() => setSent(false)}
                >
                  Use a different email
                </button>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight mb-1">Forgot password?</h1>
                <p className="text-sm text-ink-500 dark:text-night-200 mb-6">
                  Enter your account email and we'll send you a reset link.
                </p>

                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label className="label">Email</label>
                    <input
                      type="email"
                      className="input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary w-full" disabled={submitting}>
                    {submitting ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="text-sm text-ink-500 dark:text-night-200 mt-4 text-center">
            Remembered it?{' '}
            <Link to="/login" className="text-accent font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
