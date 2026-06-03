import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton';

export function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await register(username, email, password);
      toast.push({ kind: 'success', message: 'Account created — welcome!' });
      navigate('/', { replace: true });
    } catch (err: any) {
      toast.push({ kind: 'error', title: 'Registration failed', message: err.message });
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
            <h1 className="text-2xl font-bold tracking-tight mb-1">Create your account</h1>
            <p className="text-sm text-ink-500 dark:text-night-200 mb-6">
              Start practicing with ₹1,00,000 in virtual cash.
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label">Username</label>
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create account'}
              </button>
            </form>

            <GoogleSignInButton onDone={() => navigate('/', { replace: true })} />
          </div>

          <p className="text-sm text-ink-500 dark:text-night-200 mt-4 text-center">
            Already a member?{' '}
            <Link to="/login" className="text-accent font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
