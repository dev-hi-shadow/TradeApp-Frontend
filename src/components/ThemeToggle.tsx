import { useTheme } from '../context/ThemeContext';
import { IconMoon, IconSun } from './icons';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-xl
                  text-ink-500 hover:bg-ink-50
                  dark:text-night-100 dark:hover:bg-night-600 transition ${className}`}
    >
      {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
    </button>
  );
}
