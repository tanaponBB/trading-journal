import { Setup, Trade } from "./types";

const dir = (t: Pick<Trade, "direction">) => (t.direction === "LONG" ? 1 : -1);

/** Realized P/L in account currency. Returns null while the trade is open. */
export function tradePnl(t: Trade): number | null {
  if (t.status !== "CLOSED" || t.exit == null) return null;
  const gross = (t.exit - t.entry) * t.contractSize * t.lots * dir(t);
  return gross - (t.fees ?? 0);
}

/** True for gold pairs priced against the live XAU/USD feed. */
export const isGoldSymbol = (symbol: string) => symbol.toUpperCase().includes("XAU");

/** Unrealized (floating) P/L for an open trade at the given market price. */
export function unrealizedPnl(t: Trade, marketPrice: number): number | null {
  if (t.status !== "OPEN") return null;
  const gross = (marketPrice - t.entry) * t.contractSize * t.lots * dir(t);
  return gross - (t.fees ?? 0);
}

/** Total floating P/L across open gold trades. Null when there are none. */
export function floatingGoldPnl(trades: Trade[], goldPrice: number): number | null {
  let sum = 0, count = 0;
  for (const t of trades) {
    if (t.status !== "OPEN" || !isGoldSymbol(t.symbol)) continue;
    sum += unrealizedPnl(t, goldPrice) ?? 0;
    count++;
  }
  return count > 0 ? sum : null;
}

/** Projected P/L if price hits TP. */
export function pnlAtTp(t: Pick<Trade, "direction" | "entry" | "tp" | "contractSize" | "lots">): number | null {
  if (t.tp == null || Number.isNaN(t.tp)) return null;
  return (t.tp - t.entry) * t.contractSize * t.lots * dir(t);
}

/** Projected P/L if price hits SL (normally negative). */
export function pnlAtSl(t: Pick<Trade, "direction" | "entry" | "sl" | "contractSize" | "lots">): number | null {
  if (t.sl == null || Number.isNaN(t.sl)) return null;
  return (t.sl - t.entry) * t.contractSize * t.lots * dir(t);
}

/** Risk : Reward ratio, e.g. 2.5 means 1:2.5 */
export function riskReward(t: Pick<Trade, "direction" | "entry" | "sl" | "tp" | "contractSize" | "lots">): number | null {
  const risk = pnlAtSl(t);
  const reward = pnlAtTp(t);
  if (risk == null || reward == null || risk === 0) return null;
  return Math.abs(reward / risk);
}

export interface Stats {
  realized: number;
  wins: number;
  losses: number;
  breakeven: number;
  open: number;
  winRate: number; // 0..1
  profitFactor: number | null;
  best: number;
  worst: number;
}

export function computeStats(trades: Trade[]): Stats {
  let realized = 0, wins = 0, losses = 0, breakeven = 0, open = 0;
  let grossWin = 0, grossLoss = 0, best = 0, worst = 0;

  for (const t of trades) {
    const pnl = tradePnl(t);
    if (pnl == null) { open++; continue; }
    realized += pnl;
    if (pnl > 0) { wins++; grossWin += pnl; }
    else if (pnl < 0) { losses++; grossLoss += -pnl; }
    else breakeven++;
    if (pnl > best) best = pnl;
    if (pnl < worst) worst = pnl;
  }

  const closedCount = wins + losses + breakeven;
  return {
    realized, wins, losses, breakeven, open,
    winRate: closedCount ? wins / closedCount : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    best, worst,
  };
}

/** Net realized P/L per date, keyed by YYYY-MM-DD. */
export function pnlByDay(trades: Trade[]): Map<string, { pnl: number; count: number; open: number }> {
  const map = new Map<string, { pnl: number; count: number; open: number }>();
  for (const t of trades) {
    const cell = map.get(t.date) ?? { pnl: 0, count: 0, open: 0 };
    cell.count++;
    const pnl = tradePnl(t);
    if (pnl == null) cell.open++;
    else cell.pnl += pnl;
    map.set(t.date, cell);
  }
  return map;
}

/** Equity curve points: base wallet + cumulative realized P/L, ordered by date. */
export function equityCurve(trades: Trade[], baseWallet: number): { date: string; equity: number; pnl: number }[] {
  const daily = [...pnlByDay(trades).entries()]
    .filter(([, v]) => v.count > v.open) // only days with closed trades
    .sort(([a], [b]) => a.localeCompare(b));

  let equity = baseWallet;
  const points = [{ date: "Start", equity: baseWallet, pnl: 0 }];
  for (const [date, v] of daily) {
    equity += v.pnl;
    points.push({ date, equity, pnl: v.pnl });
  }
  return points;
}

export function fmtMoney(n: number, currency = "USD", signed = false): string {
  const sign = signed && n > 0 ? "+" : "";
  return sign + n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** When a setup goes stale. */
export function setupExpiry(s: Pick<Setup, "createdAt" | "validDays">): Date {
  const d = new Date(s.createdAt);
  d.setDate(d.getDate() + s.validDays);
  return d;
}

/** Whole days left before a setup expires. Negative once it has. */
export function setupDaysLeft(s: Pick<Setup, "createdAt" | "validDays">, now = new Date()): number {
  return Math.ceil((setupExpiry(s).getTime() - now.getTime()) / 86_400_000);
}

/** A watching setup past its validity window — still listed, but visibly dimmed. */
export function isSetupStale(s: Pick<Setup, "createdAt" | "validDays" | "status">, now = new Date()): boolean {
  return s.status === "WATCHING" && setupDaysLeft(s, now) <= 0;
}

/**
 * Account balance at the START of `date` — base wallet plus everything realized
 * strictly before it. Grading a past day against today's balance would be wrong,
 * so percentage-based missions use this.
 */
export function balanceAsOf(trades: Trade[], date: string, baseWallet: number): number {
  let realized = 0;
  for (const t of trades) {
    if (t.date >= date) continue;
    realized += tradePnl(t) ?? 0;
  }
  return baseWallet + realized;
}

/** Distinct dates on which at least one trade was closed. */
export function tradingDayCount(trades: Trade[]): number {
  const days = new Set<string>();
  for (const t of trades) if (tradePnl(t) != null) days.add(t.date);
  return days.size;
}

/**
 * Where the balance should be after `days` trading days of compounding at
 * `dailyPct`. Compounds over days traded, not calendar days — a day you sat out
 * is not a day you fell behind, which matches how the mission streak treats rest.
 */
export function expectedBalance(baseWallet: number, dailyPct: number, days: number): number {
  return baseWallet * Math.pow(1 + dailyPct / 100, days);
}

/**
 * Equity curve points. When `dailyPct` is given, each point also carries the
 * target balance for that many trading days in, so actual and plan can be drawn
 * against each other.
 */
export function equityWithTarget(
  trades: Trade[],
  baseWallet: number,
  dailyPct: number | null,
): { date: string; equity: number; pnl: number; target?: number }[] {
  const points = equityCurve(trades, baseWallet);
  if (dailyPct == null || dailyPct <= 0) return points;
  return points.map((p, i) => ({ ...p, target: expectedBalance(baseWallet, dailyPct, i) }));
}
