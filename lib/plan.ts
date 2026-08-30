import { tradePnl } from "./calc";
import { Trade } from "./types";

/**
 * The daily plan: a compounding ladder of profit targets.
 *
 * Three parameters generate the whole thing — a start balance, a daily percent
 * and a length. The ladder is never stored row by row, because a hand-typed
 * table drifts: the original 30-day table this was built from had a balance
 * cell reading $161.41 where the ladder called for $116.41.
 */

export interface PlanConfig {
  /** What the ladder starts from — day 1's opening balance. */
  startBalance: number;
  /** Daily profit target as a percent of that day's opening balance. */
  dailyPct: number;
  /** How many trading days the ladder runs for. */
  days: number;
  /**
   * Ignore trades before this date (YYYY-MM-DD). Without it, day 1 is the
   * first trading day on record — which is wrong if the journal already has
   * history from before the plan began.
   */
  startDate?: string;
}

export const DEFAULT_PLAN: PlanConfig = { startBalance: 10, dailyPct: 25, days: 30 };

export const PLAN_LIMITS = {
  startBalance: { min: 0.01, max: 10_000_000 },
  dailyPct: { min: 0.01, max: 100 },
  days: { min: 1, max: 365 },
};

/**
 * Round to cents, half-up. Applied at every rung, so the ladder is reproducible
 * to the cent rather than drifting with floating point.
 */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type RungStatus = "hit" | "missed" | "breached" | "pending";

export interface Rung {
  day: number;
  /** The plan — frozen at creation, never rewritten by what actually happened. */
  plannedStart: number;
  plannedTarget: number;
  plannedEnd: number;
  /** The outcome — null until a trading day fills this rung. */
  date: string | null;
  actualStart: number | null;
  actualPnl: number | null;
  actualEnd: number | null;
  trades: number;
  status: RungStatus;
}

export interface PlanProgress {
  rungs: Rung[];
  /** Rungs already filled by a trading day. */
  daysDone: number;
  /** The rung you are on now — 1-based, clamped to the plan length. */
  currentDay: number;
  /** Where the ladder says you should be after `daysDone` days. */
  plannedNow: number;
  /** Where you actually are, including any trading days beyond the ladder. */
  actualNow: number;
  /** actual − planned. Negative means behind schedule. */
  drift: number;
  hits: number;
  misses: number;
  breaches: number;
  /** The ladder's final expected balance. */
  goal: number;
  complete: boolean;
}

/** One row per day: opening balance, the target, and where it should close. */
export function buildLadder(plan: PlanConfig) {
  const rows: { day: number; plannedStart: number; plannedTarget: number; plannedEnd: number }[] = [];
  let balance = round2(plan.startBalance);

  for (let day = 1; day <= plan.days; day++) {
    const plannedTarget = round2((balance * plan.dailyPct) / 100);
    const plannedEnd = round2(balance + plannedTarget);
    rows.push({ day, plannedStart: balance, plannedTarget, plannedEnd });
    balance = plannedEnd;
  }
  return rows;
}

export interface TradingDay {
  date: string;
  pnl: number;
  count: number;
}

/**
 * Days that actually produced a realized result, oldest first.
 * Open trades don't count — a day is only done when something closed on it.
 */
export function tradingDays(trades: Trade[], from?: string): TradingDay[] {
  const byDate = new Map<string, { pnl: number; count: number }>();

  for (const t of trades) {
    if (from && t.date < from) continue;
    const pnl = tradePnl(t);
    if (pnl == null) continue;
    const cell = byDate.get(t.date) ?? { pnl: 0, count: 0 };
    cell.pnl += pnl;
    cell.count++;
    byDate.set(t.date, cell);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, pnl: round2(v.pnl), count: v.count }));
}

function statusFor(actualPnl: number, plannedTarget: number): RungStatus {
  if (actualPnl < 0) return "breached";
  return actualPnl >= plannedTarget ? "hit" : "missed";
}

/**
 * Lay the real trading days against the ladder, rung by rung.
 *
 * The two tracks are deliberately independent: the plan stays frozen so you can
 * see you are behind, while the actual balance compounds from what really
 * happened. Rebasing the plan after a bad day would hide exactly the gap this
 * is meant to show.
 */
export function buildProgress(plan: PlanConfig, trades: Trade[]): PlanProgress {
  const ladder = buildLadder(plan);
  const days = tradingDays(trades, plan.startDate);

  let running = round2(plan.startBalance);
  let hits = 0;
  let misses = 0;
  let breaches = 0;

  const rungs: Rung[] = ladder.map((row, i) => {
    const day = days[i];
    if (!day) {
      return {
        ...row,
        date: null,
        actualStart: null,
        actualPnl: null,
        actualEnd: null,
        trades: 0,
        status: "pending" as const,
      };
    }

    const actualStart = running;
    const actualEnd = round2(actualStart + day.pnl);
    running = actualEnd;

    const status = statusFor(day.pnl, row.plannedTarget);
    if (status === "hit") hits++;
    else if (status === "missed") misses++;
    else breaches++;

    return {
      ...row,
      date: day.date,
      actualStart,
      actualPnl: day.pnl,
      actualEnd,
      trades: day.count,
      status,
    };
  });

  const daysDone = Math.min(days.length, plan.days);
  // Trading days past the end of the ladder still move the balance, so the
  // headline figure stays true even after the plan is complete.
  const actualNow = round2(
    plan.startBalance + days.reduce((sum, d) => sum + d.pnl, 0),
  );
  const plannedNow = daysDone > 0 ? ladder[daysDone - 1].plannedEnd : round2(plan.startBalance);

  return {
    rungs,
    daysDone,
    currentDay: Math.min(daysDone + 1, plan.days),
    plannedNow,
    actualNow,
    drift: round2(actualNow - plannedNow),
    hits,
    misses,
    breaches,
    goal: ladder[ladder.length - 1]?.plannedEnd ?? round2(plan.startBalance),
    complete: daysDone >= plan.days,
  };
}

/** Clamp a config into range so a bad input can't produce a nonsense ladder. */
export function normalizePlan(input: Partial<PlanConfig> | null | undefined): PlanConfig {
  const p = { ...DEFAULT_PLAN, ...(input ?? {}) };
  const clamp = (v: number, { min, max }: { min: number; max: number }, fallback: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

  return {
    startBalance: clamp(p.startBalance, PLAN_LIMITS.startBalance, DEFAULT_PLAN.startBalance),
    dailyPct: clamp(p.dailyPct, PLAN_LIMITS.dailyPct, DEFAULT_PLAN.dailyPct),
    days: Math.round(clamp(p.days, PLAN_LIMITS.days, DEFAULT_PLAN.days)),
    ...(p.startDate && /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) ? { startDate: p.startDate } : {}),
  };
}
