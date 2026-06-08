import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { ConnectionBadge } from './ConnectionBadge';
import {
  IconHome, IconChart, IconTrade, IconList, IconBell, IconShield, IconLogOut, IconAnalytics,
  IconLayers, IconCompass, IconBookmark,
} from './icons';

const NAV = [
  { to: '/stocks',      label: 'Stocks',      Icon: IconHome,  end: true },
  { to: '/watchlists',  label: 'Watchlists',  Icon: IconBookmark },
  { to: '/discover',    label: 'Discover',    Icon: IconCompass },
  { to: '/fno',         label: 'F&O',         Icon: IconChart },
  { to: '/strategy',    label: 'Strategy',    Icon: IconLayers },
  { to: '/commodities', label: 'Commodities', Icon: IconTrade },
  { to: '/trade',       label: 'Trade',       Icon: IconList },
  { to: '/analytics',   label: 'Analytics',   Icon: IconAnalytics },
  { to: '/alerts',      label: 'Alerts',      Icon: IconBell },
];

/**
 * Desktop-only left sidebar (lg+). Mobile keeps the TopBar + BottomNav.
 * Professional dashboard nav: brand mark, primary nav with a tinted active
 * state, then account / theme / sign-out pinned to the bottom.
 */
export function Sidebar() {
  const { user, logout } = useAuth();

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    [
      'group flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-semibold transition-colors',
      isActive
        ? 'bg-brand/10 text-accent'
        : 'text-ink-600 dark:text-night-100 hover:bg-ink-100/70 dark:hover:bg-night-700/70',
    ].join(' ');

  return (
    <aside
      className="hidden lg:flex lg:flex-col w-60 shrink-0 sticky top-0 h-screen
                 bg-white dark:bg-night-800 border-r border-ink-100 dark:border-night-500/40"
    >
      {/* Brand */}
      <Link to="/stocks" className="flex items-center gap-2.5 px-5 h-16 shrink-0 hover:opacity-90 transition">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand text-white font-bold text-sm">
          T
        </span>
        <span className="font-bold text-[17px] tracking-tight">Tradar</span>
        <span className="ml-auto"><ConnectionBadge /></span>
      </Link>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        <div className="px-3 pb-1.5 text-[10px] uppercase tracking-wider font-bold text-ink-400 dark:text-night-300">
          Markets
        </div>
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={itemClass}>
            {({ isActive }) => (
              <>
                <Icon size={19} className={isActive ? '' : 'opacity-80'} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <>
            <div className="px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-wider font-bold text-ink-400 dark:text-night-300">
              Manage
            </div>
            <NavLink to="/admin" className={itemClass}>
              <IconShield size={19} className="opacity-80" />
              <span>Admin</span>
            </NavLink>
          </>
        )}
      </nav>

      {/* Account / theme / sign-out */}
      <div className="shrink-0 border-t border-ink-100 dark:border-night-500/40 p-3 space-y-2">
        <Link
          to="/profile"
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-ink-100/70 dark:hover:bg-night-700/70 transition-colors"
        >
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand/15 text-accent text-xs font-bold shrink-0">
            {user?.username?.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{user?.username}</div>
            <div className="text-[11px] text-ink-500 dark:text-night-200 truncate">{user?.email}</div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={logout} className="btn-ghost btn-sm flex-1">
            <IconLogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
