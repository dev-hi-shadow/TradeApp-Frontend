export interface User {
  id: string;
  username: string;
  email: string;
  virtualBalance: number;
  role?: 'user' | 'admin';
  avatarUrl?: string;
  emailVerified?: boolean;
  authProvider?: 'local' | 'google';
}

export type OrderType = 'market' | 'limit' | 'sl' | 'sl-m';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'filling' | 'partial' | 'filled' | 'rejected' | 'cancelled';
export type OrderProduct = 'CNC' | 'MIS' | 'NRML';
export type OrderValidity = 'DAY' | 'IOC' | 'GTT';

export interface OrderDTO {
  id: string;
  symbol: string;
  type: OrderType;
  side: OrderSide;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  validity?: OrderValidity;
  filledQuantity?: number;
  avgFillPrice?: number;
  filledPrice?: number;
  status: OrderStatus;
  product?: OrderProduct;
  planId?: string;
  /** Cumulative charges booked on this order (brokerage + statutory taxes). */
  charges?: ChargeBreakup;
  rejectReason?: string;
  createdAt: string;
  filledAt?: string;
}

export interface ChargeBreakup {
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  sebi: number;
  stampDuty: number;
  dpCharges: number;
  gst: number;
  total: number;
}

export type AlertType      = 'above' | 'below' | 'pctUp' | 'pctDown';
export type AlertFrequency = 'once' | 'every' | 'daily';
export type AlertStatus    = 'active' | 'triggered' | 'paused';

export interface AlertDTO {
  _id: string;
  symbol: string;
  type: AlertType;
  value: number;
  baselinePrice?: number;
  frequency: AlertFrequency;
  status: AlertStatus;
  cooldownSeconds: number;
  lastTriggeredAt?: string;
  triggerCount: number;
  note?: string;
  createdAt: string;
}

export interface AlertEventDTO {
  _id: string;
  alertId: string;
  symbol: string;
  type: AlertType;
  triggerPrice: number;
  conditionValue: number;
  baselinePrice?: number;
  note?: string;
  triggeredAt: string;
}

export interface PositionDTO {
  _id?: string;
  symbol: string;
  netQuantity: number;
  avgEntryPrice: number;
  realisedPnL: number;
  marginBlocked?: number;
  product?: 'CNC' | 'MIS' | 'NRML';
  /** ISO timestamps from Mongoose. Used to show "Closed today" sections. */
  updatedAt?: string;
  createdAt?: string;
}

export interface Quote {
  symbol: string;
  displaySymbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  currency?: string;
  exchange?: string;
  timestamp: number;
}

export interface PortfolioSummary {
  balance: number;
  holdingsValue: number;
  totalValue: number;
  unrealisedPnL: number;
  realisedPnL: number;
  marginUsed: number;
  availableMargin: number;
  positions: Array<{
    symbol: string;
    netQuantity: number;
    avgEntryPrice: number;
    lastPrice: number;
    marketValue: number;
    unrealisedPnL: number;
    realisedPnL: number;
    marginBlocked: number;
    product: 'CNC' | 'MIS' | 'NRML';
  }>;
}

export interface TradingPlan {
  _id: string;
  name: string;
  description: string;
  rules: Record<string, any>;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
