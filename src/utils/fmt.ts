export function fmtNum(n: number | undefined | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Like fmtNum but with explicit min/max digits. */
export function fmtInt(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

export function fmtINR(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export function fmtPct(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function classPnL(n: number | undefined | null): string {
  if (n == null || n === 0) return 'text-ink-500 dark:text-night-200';
  return n > 0 ? 'text-pos' : 'text-neg';
}
