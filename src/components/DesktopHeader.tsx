import { IconSearch } from './icons';

/**
 * Slim desktop header (lg+). Page title on the left, a search trigger on the
 * right. Account/theme/connection live in the Sidebar, so this stays minimal.
 * Search state + ⌘K are owned by the Shell and passed in via `onSearch`.
 */
export function DesktopHeader({ title, onSearch }: { title?: string; onSearch: () => void }) {
  return (
    <header
      className="hidden lg:flex sticky top-0 z-30 h-16 items-center gap-4 px-6
                 bg-ink-50/80 dark:bg-night-900/80 backdrop-blur
                 border-b border-ink-100 dark:border-night-500/40"
    >
      <h1 className="text-lg font-bold tracking-tight">{title || 'Tradar'}</h1>
      <button
        type="button"
        onClick={onSearch}
        className="ml-auto flex items-center gap-2 px-3 h-9 w-72 rounded-lg
                   bg-white dark:bg-night-700 border border-ink-200 dark:border-night-500/50
                   text-ink-500 dark:text-night-200 text-sm
                   hover:border-ink-300 dark:hover:border-night-400 transition"
        aria-label="Search stocks"
      >
        <IconSearch size={16} />
        <span className="truncate">Search stocks, F&amp;O…</span>
        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded border border-ink-200 dark:border-night-400">
          ⌘K
        </span>
      </button>
    </header>
  );
}
