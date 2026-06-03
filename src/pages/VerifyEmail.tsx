import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../components/ThemeToggle';

type State = 'verifying' | 'ok' | 'error' | 'missing';

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<State>(token ? 'verifying' : 'missing');
  const [message, setMessage] = useState('');
  const { user, setUser, refreshUser } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // guard React 18 StrictMode double-invoke (token is one-time)
    verifyEmail(token)
      .then((r) => {
        setState('ok');
        setMessage(r.message || 'Your email is verified.');
        // Reflect the new status if the user is signed in.
        if (user) setUser({ ...user, emailVerified: true });
        refreshUser().catch(() => {});
      })
      .catch((err: any) => {
        setState('error');
        setMessage(err.message || 'Verification failed.');
      });
  }, [token]);

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
          <div className="card animate-slideUp text-center">
            {state === 'verifying' && (
              <>
                <div className="text-3xl mb-2">⏳</div>
                <h1 className="text-2xl font-bold tracking-tight mb-1">Verifying…</h1>
                <p className="text-sm text-ink-500 dark:text-night-200">Confirming your email address.</p>
              </>
            )}
            {state === 'ok' && (
              <>
                <div className="text-3xl mb-2">✅</div>
                <h1 className="text-2xl font-bold tracking-tight mb-1">Email verified</h1>
                <p className="text-sm text-ink-500 dark:text-night-200 mb-6">{message}</p>
                <button
                  className="btn-primary w-full"
                  onClick={() => navigate(user ? '/' : '/login', { replace: true })}
                >
                  {user ? 'Go to dashboard' : 'Sign in'}
                </button>
              </>
            )}
            {(state === 'error' || state === 'missing') && (
              <>
                <div className="text-3xl mb-2">⚠️</div>
                <h1 className="text-2xl font-bold tracking-tight mb-1">
                  {state === 'missing' ? 'Invalid link' : 'Verification failed'}
                </h1>
                <p className="text-sm text-ink-500 dark:text-night-200 mb-6">
                  {state === 'missing'
                    ? 'This link is missing its token.'
                    : message}{' '}
                  {user && 'You can resend the confirmation email from your profile.'}
                </p>
                <Link
                  to={user ? '/profile' : '/login'}
                  className="btn-primary w-full inline-flex justify-center"
                >
                  {user ? 'Go to profile' : 'Back to sign in'}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
