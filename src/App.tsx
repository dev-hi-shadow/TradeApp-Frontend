import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { VerifyEmail } from './pages/VerifyEmail';
import { Stocks } from './pages/Stocks';
import { Trade } from './pages/Trade';
import { Plans } from './pages/Plans';
import { Profile } from './pages/Profile';
import { StockDetail } from './pages/StockDetail';
import { OptionChain } from './pages/OptionChain';
import { StrategyBuilder } from './pages/StrategyBuilder';
import { FnO } from './pages/FnO';
import { Admin } from './pages/Admin';
import { AlertsPage } from './pages/Alerts';
import { Commodities } from './pages/Commodities';
import { Analytics } from './pages/Analytics';
import { Discover } from './pages/Discover';
import { Watchlists } from './pages/Watchlists';
import { BottomNav } from './components/BottomNav';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { DesktopHeader } from './components/DesktopHeader';
import { SearchModal } from './components/SearchModal';
import { Spinner } from './components/Spinner';

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
          {children}
        </main>
      </div>
      <BottomNav />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
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
  );
}
