// Grading rules for the daily missions. Run with `npm test`.
import { DEFAULT_MISSIONS, evaluateDay, missionStreak, referenceCode } from "../lib/missions";
import { Trade } from "../lib/types";

let fail = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}: ${got}${ok ? "" : ` (want ${want})`}`);
};

const mk = (p: Partial<Trade> = {}): Trade => ({
  id: Math.random().toString(16).slice(2), date: "2026-08-25", symbol: "XAUUSD",
  contractSize: 100, direction: "LONG", lots: 0.1, entry: 2650,
  sl: 2640, tp: 2680, status: "CLOSED", exit: 2680, notes: "level retest", ...p,
});

const cfg = DEFAULT_MISSIONS;          // MAX_TRADES 3, SL, MIN_RR 2, MAX_LOSSES 2, REASON
const BAL = 10_000;
const kinds = (v: ReturnType<typeof evaluateDay>) =>
  v.results.filter(r => !r.done).map(r => r.kind).sort().join(",") || "-";

console.log("evaluateDay:");
t("no trades -> REST", evaluateDay([], cfg, BAL).status, "REST");

const clean = [mk(), mk()];
t("2 clean trades -> PASS", evaluateDay(clean, cfg, BAL).status, "PASS");
t("  nothing failing", kinds(evaluateDay(clean, cfg, BAL)), "-");

const over = [mk(), mk(), mk(), mk()];
t("4 trades -> FAIL", evaluateDay(over, cfg, BAL).status, "FAIL");
t("  fails MAX_TRADES", kinds(evaluateDay(over, cfg, BAL)), "MAX_TRADES");

t("no stop -> fails SL+RR", kinds(evaluateDay([mk({ sl: undefined })], cfg, BAL)), "ALL_HAVE_SL");
t("no note -> fails REASON", kinds(evaluateDay([mk({ notes: "" })], cfg, BAL)), "ALL_HAVE_REASON");
t("1:1 rr -> fails MIN_RR", kinds(evaluateDay([mk({ tp: 2660 })], cfg, BAL)), "MIN_RR");
t("exactly 1:2 rr passes", kinds(evaluateDay([mk({ tp: 2670 })], cfg, BAL)), "-");

const losses = [mk({ exit: 2630 }), mk({ exit: 2630 }), mk({ exit: 2630 })];
t("3 losses -> fails MAX_LOSSES", kinds(evaluateDay(losses, cfg, BAL)), "MAX_LOSSES");
t("2 losses ok", kinds(evaluateDay(losses.slice(0, 2), cfg, BAL)), "-");

console.log("RISK_CAP (1% of 10000 = 100):");
const risky = [{ kind: "RISK_CAP" as const, target: 1, enabled: true }];
// |2650-2640| * 100 * 0.1 = 100 -> exactly 1%
t("exactly at cap passes", evaluateDay([mk()], risky, BAL).results[0].done, true);
t("over cap fails", evaluateDay([mk({ lots: 0.2 })], risky, BAL).results[0].done, false);
t("open trade still graded", evaluateDay([mk({ lots: 0.2, status: "OPEN", exit: undefined })], risky, BAL).results[0].done, false);

console.log("missionStreak:");
const byDate = new Map<string, Trade[]>();
byDate.set("2026-08-25", [mk({ date: "2026-08-25" })]);
byDate.set("2026-08-24", [mk({ date: "2026-08-24" })]);
// 23rd: rest day (absent)
byDate.set("2026-08-22", [mk({ date: "2026-08-22" })]);
byDate.set("2026-08-21", [mk({ date: "2026-08-21", sl: undefined })]); // breaks
t("streak skips rest days", missionStreak(byDate, cfg, BAL, "2026-08-25"), 3);
t("empty history -> 0", missionStreak(new Map(), cfg, BAL, "2026-08-25"), 0);

const brokeToday = new Map(byDate);
brokeToday.set("2026-08-25", [mk({ date: "2026-08-25", sl: undefined })]);
t("today failing -> 0", missionStreak(brokeToday, cfg, BAL, "2026-08-25"), 0);

console.log("referenceCode:");
t("32 hex chars", referenceCode("2026-08-25", 5, 5).length, 32);
t("deterministic", referenceCode("2026-08-25", 5, 5) === referenceCode("2026-08-25", 5, 5), true);
t("differs by day", referenceCode("2026-08-25", 5, 5) === referenceCode("2026-08-26", 5, 5), false);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILING`);
process.exit(fail ? 1 : 0);
