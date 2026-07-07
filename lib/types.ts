export type Direction = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED";

export interface Trade {
  id: string;
  date: string; // YYYY-MM-DD (entry date)
  symbol: string;
  contractSize: number; // units per 1.0 lot (XAUUSD = 100 oz)
  direction: Direction;
  lots: number;
  entry: number;
  sl?: number;
  tp?: number;
  exit?: number;
  fees?: number;
  status: TradeStatus;
  notes?: string;
}

export interface Settings {
  baseWallet: number;
  currency: string;
}

export const SYMBOL_PRESETS: Record<string, number> = {
  XAUUSD: 100,
  XAGUSD: 5000,
  EURUSD: 100000,
  GBPUSD: 100000,
  USDJPY: 100000,
  BTCUSD: 1,
  ETHUSD: 1,
  US30: 1,
  NAS100: 1,
};
