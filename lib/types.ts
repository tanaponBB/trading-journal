export type Direction = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED";
export type TradeSource = "manual" | "xm";

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
  /** Where the row came from. Absent means it was typed in by hand. */
  source?: TradeSource;
  /** Broker deal id — the dedupe key for imports. */
  externalId?: string;
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

/** A setup is a trade you have planned but not entered yet. */
export type SetupStatus = "WATCHING" | "TAKEN" | "CANCELLED";

export interface Setup {
  id: string;
  createdAt: string; // ISO timestamp
  /** Setups go stale — a plan from three weeks ago is not a plan. */
  validDays: number;
  symbol: string;
  contractSize: number;
  direction: Direction;
  lots: number;
  entry: number;
  sl?: number;
  tp?: number;
  /** Why you want this trade — the part you re-read after a loss. */
  reason?: string;
  status: SetupStatus;
  /** Set once the setup has been promoted into a real trade. */
  tradeId?: string;
}
