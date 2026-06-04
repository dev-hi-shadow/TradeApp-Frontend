import { Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
// Eager: the first screens a user ever sees (tiny, no chart libs).
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Stocks } from './pages/Stocks';
import { BottomNav } from './components/BottomNav';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { DesktopHeader } from './components/DesktopHeader';
import { SearchModal } from './components/SearchModal';
import { Spinner } from './components/Spinner';
import { PageSkeleton } from './components/PageSkeleton';
import { lazyPage } from './utils/lazyPage';

// Lazy: everything else loads on demand, so the first paint ships a fraction
// of the old single bundle (lightweight-charts alone was ~⅓ of it). Each page
// becomes its own content-hashed chunk; lazyPage auto-recovers when a stale
// tab requests chunks from a previous deploy.
const ForgotPassword  = lazyPage(() => import('./pages/ForgotPassword'), 'ForgotPassword');
const ResetPassword   = lazyPage(() => import('./pages/ResetPassword'), 'ResetPassword');
const VerifyEmail     = lazyPage(() => import('./pages/VerifyEmail'), 'VerifyEmail');
const Trade           = lazyPage(() => import('./pages/Trade'), 'Trade');
const Plans           = lazyPage(() => import('./pages/Plans'), 'Plans');
const Profile         = lazyPage(() => import('./pages/Profile'), 'Profile');
const StockDetail     = lazyPage(() => import('./pages/StockDetail'), 'StockDetail');
const OptionChain     = lazyPage(() => import('./pages/OptionChain'), 'OptionChain');
const StrategyBuilder = lazyPage(() => import('./pages/StrategyBuilder'), 'StrategyBuilder');
const FnO             = lazyPage(() => import('./pages/FnO'), 'FnO');
const Admin           = lazyPage(() => import('./pages/Admin'), 'Admin');
const AlertsPage      = lazyPage(() => import('./pages/Alerts'), 'AlertsPage');
const Commodities     = lazyPage(() => import('./pages/Commodities'), 'Commodities');
const Analytics       = lazyPage(() => import('./pages/Analytics'), 'Analytics');
const Discover        = lazyPage(() => import('./pages/Discover'), 'Discover');
const Watchlists      = lazyPage(() => import('./pages/Watchlists'), 'Watchlists');

const TITLES: Record<string, string> = {
  '/': 'Stocks',
  '/fno': 'F&O',
  '/strategy': 'Strategy',
  '/commodities': 'Commodities',
  '/discover': 'Discover',
  '/watchlists': 'Watchlists',
  '/trade': 'Trade',
  '/analytics': 'Analytics',
  '/plans': 'Plans',
  '/profile': 'Profile',
  '/alerts': 'Alerts',
  '/admin': 'Admin',
};

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 text-ink-500 dark:text-night-200">
        <span className="text-accent"><Spinner size={28} thickness={3.5} /></span>
        <span className="text-xs">Loading…</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function titleFor(pathname: string): string | undefined {
  if (TITLES[pathname]) return TITLES[pathname];
  // Dynamic routes: derive a readable title from the URL segment.
  const stock = pathname.match(/^\/stock\/(.+)$/);
  if (stock) return decodeURIComponent(stock[1]).toUpperCase();
  const opt = pathname.match(/^\/options\/(.+)$/);
  if (opt) return `${decodeURIComponent(opt[1]).toUpperCase()} · Options`;
  return undefined;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const title = titleFor(pathname);
  const [searchOpen, setSearchOpen] = useState(false);

  // Single global ⌘K / "/" search shortcut for the whole app (lifted here so
  // there's exactly one handler + one modal across mobile TopBar + DesktopHeader).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openSearch = () => setSearchOpen(true);

  return (
    <div className="min-h-screen lg:flex bg-ink-50 dark:bg-night-900">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar title={title} onSearch={openSearch} />
        <DesktopHeader title={title} onSearch={openSearch} />
        <main className="flex-1 w-full max-w-6xl mx-auto px-0 sm:px-4 lg:px-8 pt-3 lg:pt-6 pb-24 lg:pb-12">
          {/* Lazy page chunks resolve inside the shell, so the sidebar/header
              stay solid and only the content area shimmers. */}
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
      </div>
      <BottomNav />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

/** Full-screen fallback for lazy pages that live OUTSIDE the Shell. */
function FullScreenLoader() {
  return (
    <div className="h-screen flex items-center justify-center bg-ink-50 dark:bg-night-900 text-accent">
      <Spinner size={28} thickness={3.5} />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
    <Routes>
      <Route path="/login"           element={<Login />} />
      <Route path="/register"        element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password"  element={<ResetPassword />} />
      <Route path="/verify-email"    element={<VerifyEmail />} />
      <Route path="/"          element={<ProtectedRoute><Shell><Stocks /></Shell></ProtectedRoute>} />
      <Route path="/fno"         element={<ProtectedRoute><Shell><FnO /></Shell></ProtectedRoute>} />
      <Route path="/strategy"    element={<ProtectedRoute><Shell><StrategyBuilder /></Shell></ProtectedRoute>} />
      <Route path="/commodities" element={<ProtectedRoute><Shell><Commodities /></Shell></ProtectedRoute>} />
      <Route path="/discover"    element={<ProtectedRoute><Shell><Discover /></Shell></ProtectedRoute>} />
      <Route path="/watchlists"  element={<ProtectedRoute><Shell><Watchlists /></Shell></ProtectedRoute>} />
      <Route path="/trade"       element={<ProtectedRoute><Shell><Trade /></Shell></ProtectedRoute>} />
      <Route path="/analytics"   element={<ProtectedRoute><Shell><Analytics /></Shell></ProtectedRoute>} />
      <Route path="/plans"     element={<ProtectedRoute><Shell><Plans /></Shell></ProtectedRoute>} />
      <Route path="/profile"   element={<ProtectedRoute><Shell><Profile /></Shell></ProtectedRoute>} />
      <Route path="/stock/:symbol"   element={<ProtectedRoute><Shell><StockDetail /></Shell></ProtectedRoute>} />
      <Route path="/options/:symbol" element={<ProtectedRoute><Shell><OptionChain /></Shell></ProtectedRoute>} />
      <Route path="/admin"           element={<ProtectedRoute><Shell><Admin /></Shell></ProtectedRoute>} />
      <Route path="/alerts"          element={<ProtectedRoute><Shell><AlertsPage /></Shell></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
