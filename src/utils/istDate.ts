import moment from 'moment-timezone';

/** All trading-day calendar logic is anchored to IST, matching the backend. */
const IST = 'Asia/Kolkata';

/** Today's IST calendar day as 'YYYY-MM-DD' (drives the date picker default). */
export function istToday(): string {
  return moment().tz(IST).format('YYYY-MM-DD');
}

/**
 * Human label for an IST 'YYYY-MM-DD' date: 'Today' for the current IST day,
 * otherwise 'DD MMM YYYY' (e.g. '03 Jun 2026').
 */
export function istLabel(date: string): string {
  if (date === istToday()) return 'Today';
  return moment.tz(date, 'YYYY-MM-DD', IST).format('DD MMM YYYY');
}

/** Epoch-ms window [from, to) for an inclusive IST date range (start..end day). */
export function istRangeMs(fromDate: string, toDate: string): { from: number; to: number } {
  const from = moment.tz(fromDate, 'YYYY-MM-DD', IST).startOf('day').valueOf();
  // Exclusive upper bound = start of the day AFTER toDate, so `to` is inclusive.
  const to = moment.tz(toDate, 'YYYY-MM-DD', IST).add(1, 'day').startOf('day').valueOf();
  return { from, to };
}

/** `date` shifted by `days` (can be negative), as 'YYYY-MM-DD' IST. */
export function istShift(date: string, days: number): string {
  return moment.tz(date, 'YYYY-MM-DD', IST).add(days, 'day').format('YYYY-MM-DD');
}

/** Human label for an inclusive IST date range. Single day → istLabel. */
export function istRangeLabel(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return istLabel(fromDate);
  const f = moment.tz(fromDate, 'YYYY-MM-DD', IST).format('DD MMM');
  const t = moment.tz(toDate, 'YYYY-MM-DD', IST).format('DD MMM YYYY');
  return `${f} – ${t}`;
}
