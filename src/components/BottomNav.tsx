import { NavLink } from 'react-router-dom';
import { IconAnalytics, IconChart, IconHome, IconList, IconTrade, IconUser } from './icons';

// "Plans" tab hidden per user request — page + route still exist, just not navigable.
const TABS = [
  { to: '/',            label: 'Stocks',    Icon: IconHome },
  { to: '/fno',         label: 'F&O',       Icon: IconChart },
  { to: '/commodities', label: 'MCX',       Icon: IconTrade }, // commodity explorer
  { to: '/trade',       label: 'Trade',     Icon: IconList },
  { to: '/analytics',   label: 'Stats',     Icon: IconAnalytics },
  { to: '/profile',     label: 'Profile',   Icon: IconUser },
];

export function BottomNav() {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-night-800/95 backdrop-blur
                 border-t border-ink-100 dark:border-night-500/40 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex max-w-xl mx-auto">
        {TABS.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium
                 transition-colors
                 ${isActive
                   ? 'text-accent'
                   : 'text-ink-400 dark:text-night-200 hover:text-ink-700 dark:hover:text-night-50'
                }`
              }
              style={{ minHeight: 56 }}
            >
              <Icon size={22} />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
