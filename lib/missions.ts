import { riskReward, tradePnl } from "./calc";
import { Trade } from "./types";

/**
 * Daily discipline missions. Every one is graded automatically from the day's
 * trades — nothing here is an honour-system checkbox, because a journal you can
 * lie to is not a journal.
 */
export type MissionKind =
  | "MAX_TRADES"
  | "ALL_HAVE_SL"
  | "ALL_HAVE_REASON"
  | "MIN_RR"
  | "MAX_LOSSES"
  | "RISK_CAP";

export interface MissionConfig {
  kind: MissionKind;
  /** Meaning depends on the kind: a count, an R multiple, or a percent. */
  target: number;
  enabled: boolean;
}

export interface MissionResult {
  kind: MissionKind;
  label: string;
  done: boolean;
  detail: string;
}

/** PASS/FAIL need trades to judge; a day with none is a rest day, not a win. */
export type DayStatus = "PASS" | "FAIL" | "REST";

export interface DayVerdict {
  status: DayStatus;
  results: MissionResult[];
  passed: number;
  total: number;
}

interface MissionDef {
  label: (target: number) => string;
  blurb: string;
  /** false for pass/fail missions that take no number. */
  hasTarget: boolean;
  min: number;
  max: number;
  step: number;
  unit: string;
  grade: (trades: Trade[], target: number, balance: number) => { done: boolean; detail: string };
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export const MISSION_DEFS: Record<MissionKind, MissionDef> = {
  MAX_TRADES: {
    label: t => `No more than ${plural(t, "trade")}`,
    blurb: "Overtrading is the most common way a good week is given back.",
    hasTarget: true, min: 1, max: 20, step: 1, unit: "trades",
    grade: (trades, target) => ({
      done: trades.length <= target,
      detail: `${trades.length} of ${target} taken`,
    }),
  },

  ALL_HAVE_SL: {
    label: () => "Every trade has a stop loss",
    blurb: "A position without a stop is a position without a plan.",
    hasTarget: false, min: 0, max: 0, step: 1, unit: "",
    grade: trades => {
      const bad = trades.filter(t => t.sl == null).length;
      return {
        done: bad === 0,
        detail: bad === 0 ? `all ${trades.length} protected` : `${plural(bad, "trade")} without a stop`,
      };
    },
  },

  ALL_HAVE_REASON: {
    label: () => "Every trade is journalled",
    blurb: "The note you write before is the one worth reading after.",
    hasTarget: false, min: 0, max: 0, step: 1, unit: "",
    grade: trades => {
      const bad = trades.filter(t => !t.notes?.trim()).length;
      return {
        done: bad === 0,
        detail: bad === 0 ? `all ${trades.length} written up` : `${plural(bad, "trade")} with no note`,
      };
    },
  },

  MIN_RR: {
    label: t => `Plan at least 1 : ${t} reward-to-risk`,
    blurb: "Graded on the trades that set both a stop and a target.",
    hasTarget: true, min: 0.5, max: 10, step: 0.5, unit: ": 1 R",
    grade: (trades, target) => {
      const graded = trades.filter(t => t.sl != null && t.tp != null);
      const bad = graded.filter(t => (riskReward(t) ?? 0) < target).length;
      if (graded.length === 0) return { done: true, detail: "no trade set both a stop and a target" };
      return {
        done: bad === 0,
        detail: bad === 0 ? `all ${graded.length} at 1:${target} or better` : `${plural(bad, "trade")} below 1:${target}`,
      };
    },
  },

  MAX_LOSSES: {
    label: t => `Stop after ${plural(t, "loss", "losses")}`,
    blurb: "The rule that ends a bad day before it becomes a bad month.",
    hasTarget: true, min: 1, max: 10, step: 1, unit: "losses",
    grade: (trades, target) => {
      const losses = trades.filter(t => (tradePnl(t) ?? 0) < 0).length;
      return {
        done: losses <= target,
        detail: `${losses} of ${target} allowed`,
      };
    },
  },

  RISK_CAP: {
    label: t => `Risk at most ${t}% per trade`,
    blurb: "Measured from your stop distance against the account balance.",
    hasTarget: true, min: 0.1, max: 10, step: 0.1, unit: "% of balance",
    grade: (trades, target, balance) => {
      if (balance <= 0) return { done: true, detail: "set a base wallet to grade this" };
      const graded = trades.filter(t => t.sl != null);
      if (graded.length === 0) return { done: true, detail: "no trade set a stop" };

      let worst = 0;
      let bad = 0;
      for (const t of graded) {
        const pct = (Math.abs(t.entry - t.sl!) * t.contractSize * t.lots) / balance * 100;
        if (pct > worst) worst = pct;
        if (pct > target + 1e-9) bad++;
      }
      return {
        done: bad === 0,
        detail: bad === 0 ? `worst was ${worst.toFixed(2)}%` : `${plural(bad, "trade")} over ${target}%`,
      };
    },
  },
};

export const MISSION_ORDER: MissionKind[] = [
  "MAX_TRADES", "ALL_HAVE_SL", "MIN_RR", "MAX_LOSSES", "ALL_HAVE_REASON", "RISK_CAP",
];

export const DEFAULT_MISSIONS: MissionConfig[] = [
  { kind: "MAX_TRADES", target: 3, enabled: true },
  { kind: "ALL_HAVE_SL", target: 0, enabled: true },
  { kind: "MIN_RR", target: 2, enabled: true },
  { kind: "MAX_LOSSES", target: 2, enabled: true },
  { kind: "ALL_HAVE_REASON", target: 0, enabled: true },
  { kind: "RISK_CAP", target: 1, enabled: false },
];

/** Grades one day's trades against the enabled missions. */
export function evaluateDay(trades: Trade[], configs: MissionConfig[], balance: number): DayVerdict {
  const active = configs.filter(c => c.enabled);

  const results = active.map<MissionResult>(c => {
    const def = MISSION_DEFS[c.kind];
    const { done, detail } = def.grade(trades, c.target, balance);
    return { kind: c.kind, label: def.label(c.target), done, detail };
  });

  const passed = results.filter(r => r.done).length;
  const status: DayStatus =
    trades.length === 0 ? "REST" : passed === results.length && results.length > 0 ? "PASS" : "FAIL";

  return { status, results, passed, total: results.length };
}

/**
 * Consecutive passed days ending at `today`. Rest days are skipped rather than
 * counted or treated as a break — not trading is neither discipline nor a lapse.
 */
export function missionStreak(
  tradesByDate: Map<string, Trade[]>,
  configs: MissionConfig[],
  balance: number,
  today: string,
  lookbackDays = 365,
): number {
  let streak = 0;
  const cursor = new Date(`${today}T00:00:00`);

  for (let i = 0; i < lookbackDays; i++) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const dayTrades = tradesByDate.get(iso) ?? [];
    if (dayTrades.length > 0) {
      const { status } = evaluateDay(dayTrades, configs, balance);
      if (status !== "PASS") break;
      streak++;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

/** Stable 32-bit hash — seeds the pass card's generated seal. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic reference code for a passed day, echoing the reference card. */
export function referenceCode(date: string, passed: number, total: number): string {
  let h = hashSeed(`${date}|${passed}/${total}`);
  let out = "";
  for (let i = 0; i < 32; i++) {
    h = (Math.imul(h, 0x01000193) ^ (h >>> 7)) >>> 0;
    out += (h & 0xf).toString(16);
  }
  return out;
}
