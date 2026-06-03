import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ConnectionBadge } from './ConnectionBadge';
import { ThemeToggle } from './ThemeToggle';
import { IconSearch } from './icons';

/**
 * Mobile top bar (hidden on lg+, where the Sidebar + DesktopHeader take over).
 * Search state and the ⌘K shortcut are owned by the Shell; this just triggers
 * `onSearch`.
 */
export function TopBar({ title, onSearch }: { title?: string; onSearch: () => void }) {
  const { user } = useAuth();

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white/85 dark:bg-night-900/85 backdrop-blur
                       border-b border-ink-100 dark:border-night-500/40">
      <div className="px-4 h-14 flex items-center gap-3 max-w-5xl mx-auto">
        <Link
          to="/"
          className="flex items-center gap-2 hover:opacity-90 transition"
          aria-label="Go to dashboard"
        >
          <Logo />
          <span className="font-bold text-base tracking-tight">Tradar</span>
        </Link>
        {title && (
          <span className="ml-2 text-sm text-ink-500 dark:text-night-200 truncate">/ {title}</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onSearch}
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg
                       bg-ink-50 dark:bg-night-600 hover:bg-ink-100 dark:hover:bg-night-500"
            aria-label="Search"
          >
            <IconSearch size={16} />
          </button>
          <ConnectionBadge />
          <ThemeToggle />
          {user && (
            <div className="hidden sm:flex items-center pl-2 ml-1 border-l border-ink-100 dark:border-night-500/40 text-sm">
              <Avatar name={user.username} />
              <span className="ml-2 font-medium">{user.username}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand text-white font-bold text-sm">
      T
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand/15 text-accent text-xs font-bold">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
