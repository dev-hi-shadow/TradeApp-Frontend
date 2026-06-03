/**
 * Frontend mirror of backend/src/services/charges.ts + margin.ts.
 *
 * Keeps every +/− click in the OrderModal instant — no backend roundtrip
 * per quantity change. Backend remains the source of truth at order
 * submission; this file is for live preview only and MUST stay in sync
 * with the backend formulas above. If you change one, change both.
 *
 * Verified against Zerodha's "Brokerage calculator" + NSE / MCX circulars
 * (May 2026 schedule).
 */

export type Segment = 'EQ' | 'FNO' | 'COMMODITY' | 'CURRENCY';
export type Product = 'CNC' | 'MIS' | 'NRML';
export type Side    = 'buy' | 'sell';

export interface ChargeBreakup {
  brokerage:   number;
  stt:         number;
  exchangeTxn: number;
  sebi:        number;
  stampDuty:   number;
  dpCharges:   number;
  gst:         number;
  total:       number;
}

export interface ChargeInput {
  segment:       Segment;
  product:       Product;
  side:          Side;
  price:         number;
  quantity:      number;
  isOption?:     boolean;
  isStockOption?: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeCharges(input: ChargeInput): ChargeBreakup {
  const { segment, product, side, price, quantity } = input;
  const turnover = price * quantity;
  if (turnover <= 0) {
    return { brokerage: 0, stt: 0, exchangeTxn: 0, sebi: 0, stampDuty: 0, dpCharges: 0, gst: 0, total: 0 };
  }

  // 1. Brokerage
  let brokerage = 0;
  if (segment === 'EQ' && product === 'CNC') brokerage = 0;
  else if (input.isOption)                   brokerage = 20;
  else                                       brokerage = Math.min(20, turnover * 0.0003);

  // 2. STT / CTT
  let stt = 0;
  if (segment === 'EQ' && product === 'CNC')         stt = turnover * 0.001;
  else if (segment === 'EQ' && product === 'MIS')    { if (side === 'sell') stt = turnover * 0.00025; }
  else if (segment === 'FNO' && !input.isOption)     { if (side === 'sell') stt = turnover * 0.0002; }
  else if (segment === 'FNO' && input.isOption)      { if (side === 'sell') stt = turnover * 0.001; }
  else if (segment === 'COMMODITY')                  { if (side === 'sell') stt = turnover * 0.0001; }

  // 3. Exchange transaction
  let exchangeTxn = 0;
  if (segment === 'EQ')                          exchangeTxn = turnover * 0.0000297;
  else if (segment === 'FNO' && !input.isOption) exchangeTxn = turnover * 0.000019;
  else if (segment === 'FNO' && input.isOption)  exchangeTxn = turnover * 0.00035;
  else if (segment === 'COMMODITY')              exchangeTxn = turnover * 0.000026;
  else if (segment === 'CURRENCY')               exchangeTxn = turnover * 0.0000035;

  // 4. SEBI turnover fee
  const sebi = turnover * 0.000001;

  // 5. Stamp duty (BUY only)
  let stampDuty = 0;
  if (side === 'buy') {
    if (segment === 'EQ' && product === 'CNC')        stampDuty = turnover * 0.00015;
    else if (segment === 'EQ')                        stampDuty = turnover * 0.00003;
    else if (segment === 'FNO' && !input.isOption)    stampDuty = turnover * 0.00002;
    else if (segment === 'FNO' && input.isOption)     stampDuty = turnover * 0.00003;
    else if (segment === 'COMMODITY')                 stampDuty = turnover * 0.00002;
    else if (segment === 'CURRENCY')                  stampDuty = turnover * 0.00001;
  }

  // 6. DP charge — equity delivery SELL only (flat ₹13.5 + GST, qty-independent)
  let dpCharges = 0;
  if (segment === 'EQ' && product === 'CNC' && side === 'sell') dpCharges = 13.5;

  // 7. GST 18 % on (brokerage + exchange + SEBI + DP)
  const gst = (brokerage + exchangeTxn + sebi + dpCharges) * 0.18;

  const total = brokerage + stt + exchangeTxn + sebi + stampDuty + dpCharges + gst;

  return {
    brokerage:   r2(brokerage),
    stt:         r2(stt),
    exchangeTxn: r2(exchangeTxn),
    sebi:        r2(sebi),
    stampDuty:   r2(stampDuty),
    dpCharges:   r2(dpCharges),
    gst:         r2(gst),
    total:       r2(total),
  };
}

/* ---------------- Margin + cash impact ---------------- */

const MARGIN_RATES = {
  EQ:        { CNC: 1.00, MIS: 0.20, NRML: 1.00 },
  FUTURES:   { CNC: 1.00, MIS: 0.18, NRML: 0.18 },
  INDEX_OPT: { CNC: 1.00, MIS: 0.12, NRML: 0.12 },
  STOCK_OPT: { CNC: 1.00, MIS: 0.25, NRML: 0.25 },
  COMMODITY: { CNC: 1.00, MIS: 0.10, NRML: 0.10 },
} as const;

export interface MarginInput {
  segment:        Segment;
  product:        Product;
  side:           Side;
  price:          number;
  quantity:       number;
  isOption?:      boolean;
  isStockOption?: boolean;
  /** Required for option SELL — the underlying spot at OPEN time. */
  underlyingSpot?: number;
}

export function computeMargin(input: MarginInput): number {
  const { segment, product, side, price, quantity, isOption, isStockOption } = input;
  if (isOption) {
    if (side === 'buy') return 0;                       // option BUY: cash only
    const rate = isStockOption
      ? MARGIN_RATES.STOCK_OPT[product]
      : MARGIN_RATES.INDEX_OPT[product];
    const spot = input.underlyingSpot && input.underlyingSpot > 0 ? input.underlyingSpot : price;
    return spot * quantity * rate;
  }
  const notional = price * quantity;
  // EQ CNC is cash-funded (no separate margin block — mirrors backend).
  if (segment === 'EQ')        return product === 'CNC' ? 0 : notional * MARGIN_RATES.EQ[product];
  if (segment === 'FNO')       return notional * MARGIN_RATES.FUTURES[product];
  if (segment === 'COMMODITY') return notional * MARGIN_RATES.COMMODITY[product];
  return notional;
}

/**
 * Signed wallet movement at fill time (NOT margin). Positive = cash IN,
 * negative = cash OUT.
 *   Option BUY  : pay premium → −
 *   Option SELL : receive premium → +
 *   EQ CNC      : pay/receive full notional
 *   Anything else (MIS / NRML non-option) : 0 (margin only, no cash)
 */
export function computeCashImpact(input: MarginInput): number {
  const { side, price, quantity, isOption, segment, product } = input;
  if (isOption) return side === 'buy' ? -(price * quantity) : +(price * quantity);
  if (segment === 'EQ' && product === 'CNC') {
    return side === 'buy' ? -(price * quantity) : +(price * quantity);
  }
  return 0;
}

/* ---------------- Segment inference (mirror of backend) ---------------- */

const DERIVATIVES_INDEX_PREFIX =
  /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|NIFTYNXT50|SENSEX|BANKEX)/;
const COMMODITY_PREFIX =
  /^(GOLD|SILVER|CRUDEOIL|NATURALGAS|COPPER|ZINC|LEAD|ALUMINIUM)/;

export interface SegInfo {
  segment: Segment;
  isOption: boolean;
  isStockOption: boolean;
}

export function inferSegment(symbol: string): SegInfo {
  const s = symbol.toUpperCase();
  if (/\d(?:CE|PE)$/.test(s)) {
    const isIndex = DERIVATIVES_INDEX_PREFIX.test(s);
    return { segment: 'FNO', isOption: true, isStockOption: !isIndex };
  }
  if (/FUT$/.test(s)) {
    if (COMMODITY_PREFIX.test(s)) return { segment: 'COMMODITY', isOption: false, isStockOption: false };
    return { segment: 'FNO', isOption: false, isStockOption: false };
  }
  if (/^(GOLD|SILVER|CRUDEOIL|NATURALGAS|COPPER|ZINC|LEAD|ALUMINIUM)$/.test(s)) {
    return { segment: 'COMMODITY', isOption: false, isStockOption: false };
  }
  return { segment: 'EQ', isOption: false, isStockOption: false };
}
