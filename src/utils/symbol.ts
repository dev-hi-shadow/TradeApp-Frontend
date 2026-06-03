/**
 * Human-friendly option contract labels.
 *
 * Turns a raw trading symbol into a readable label:
 *   NIFTY26JUN23500CE   → "NIFTY 26 Jun 23500 Call"   (NSE, named month)
 *   SENSEX2660474600CE  → "SENSEX 4 Jun 74600 Call"    (BSE, numeric month)
 *
 * Returns null for anything that isn't a recognised option contract (equities,
 * futures, etc.) so callers can fall back to the raw symbol.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function prettyOptionLabel(symbol: string): string | null {
  const s = symbol.toUpperCase();
  // NSE-style, named month: NIFTY26JUN23500CE / NIFTY02JUN2623500CE
  const m = s.match(
    /^([A-Z]+?)(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})(\d+)(CE|PE)$/,
  );
  if (m) {
    const [, underlying, day, mon, , strike, type] = m;
    const monthNice = mon[0] + mon.slice(1).toLowerCase();
    return `${underlying} ${parseInt(day, 10)} ${monthNice} ${strike} ${type === 'CE' ? 'Call' : 'Put'}`;
  }
  // BSE-style weekly, numeric month: SENSEX2660474600CE
  //   SENSEX | 26 (YY) | 6 (month: 1-9, O=Oct, N=Nov, D=Dec) | 04 (DD) | 74600 (strike) | CE
  const b = s.match(/^([A-Z]+?)(\d{2})([1-9OND])(\d{2})(\d+)(CE|PE)$/);
  if (b) {
    const [, underlying, , monthCh, day, strike, type] = b;
    const mi = monthCh === 'O' ? 9 : monthCh === 'N' ? 10 : monthCh === 'D' ? 11 : parseInt(monthCh, 10) - 1;
    if (mi < 0 || mi > 11) return null;
    return `${underlying} ${parseInt(day, 10)} ${MONTHS[mi]} ${strike} ${type === 'CE' ? 'Call' : 'Put'}`;
  }
  return null;
}

/** Pretty option label when applicable, otherwise the raw symbol unchanged. */
export function displaySymbol(symbol: string): string {
  return prettyOptionLabel(symbol) ?? symbol;
}
