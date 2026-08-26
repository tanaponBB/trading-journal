"use client";

import { useMemo } from "react";
import MissionCard from "@/components/MissionCard";
import { DUR, EASE, gsap, useGsap } from "@/lib/anim";
import { balanceAsOf } from "@/lib/calc";
import { DayStatus, MissionConfig, evaluateDay, missionStreak } from "@/lib/missions";
import { Trade } from "@/lib/types";

interface Props {
  date: string; // the day being viewed
  today: string;
  tradesByDate: Map<string, Trade[]>;
  missions: MissionConfig[];
  /** Full trade list — needed to reconstruct the balance at the start of any day. */
  trades: Trade[];
  baseWallet: number;
  /** The settings modal lives on the page, so Targets and Missions share one. */
  onOpenMissions: () => void;
}

const HISTORY_DAYS = 21;

const shiftIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function MissionBoard({ date, today, tradesByDate, missions, trades, baseWallet, onOpenMissions }: Props) {

  // Percentage missions grade against the balance the day opened with.
  const balanceAt = useMemo(
    () => (d: string) => balanceAsOf(trades, d, baseWallet),
    [trades, baseWallet],
  );

  const dayTrades = useMemo(() => tradesByDate.get(date) ?? [], [tradesByDate, date]);
  const verdict = useMemo(
    () => evaluateDay(dayTrades, missions, balanceAt(date)),
    [dayTrades, missions, balanceAt, date],
  );
  const streak = useMemo(
    () => missionStreak(tradesByDate, missions, balanceAt, today),
    [tradesByDate, missions, balanceAt, today],
  );

  // recent history strip, oldest → newest
  const history = useMemo(() => {
    const out: { iso: string; status: DayStatus }[] = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
      const iso = shiftIso(today, -i);
      const t = tradesByDate.get(iso) ?? [];
      out.push({ iso, status: evaluateDay(t, missions, balanceAt(iso)).status });
    }
    return out;
  }, [tradesByDate, missions, balanceAt, today]);

  const scope = useGsap<HTMLDivElement>((_self, el) => {
    gsap.fromTo(
      el.querySelectorAll("[data-mission]"),
      { autoAlpha: 0, x: 10 },
      { autoAlpha: 1, x: 0, duration: DUR.base, ease: EASE, stagger: 0.06, clearProps: "transform" },
    );
    gsap.fromTo(
      el.querySelectorAll("[data-hist]"),
      { autoAlpha: 0, scaleY: 0.4 },
      { autoAlpha: 1, scaleY: 1, duration: DUR.fast, ease: EASE, stagger: 0.015, clearProps: "transform" },
    );
  }, [date, verdict.passed, verdict.total, history.length]);

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1fr_1.1fr]">
      <MissionCard date={date} verdict={verdict} streak={streak} />

      <div ref={scope} className="space-y-4 sm:space-y-5">
        <section className="panel p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold">
                Missions {date !== today && <span className="text-ash">· {date}</span>}
              </h3>
              <p className="mt-0.5 text-xs text-ash">
                {dayTrades.length === 0
                  ? "No trades on this day."
                  : `Graded from ${dayTrades.length} trade${dayTrades.length === 1 ? "" : "s"}.`}
              </p>
            </div>
            <button onClick={onOpenMissions} className="btn-ghost">Edit</button>
          </div>

          {verdict.results.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-dim">
              No missions enabled yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {verdict.results.map(r => (
                <li
                  key={r.kind}
                  data-mission
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    dayTrades.length === 0
                      ? "border-line opacity-60"
                      : r.done
                        ? "border-up/40 bg-up/5"
                        : "border-down/40 bg-down/5"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full font-mono text-[11px] font-bold ${
                      dayTrades.length === 0
                        ? "border border-line text-dim"
                        : r.done
                          ? "bg-up text-canvas"
                          : "bg-down text-canvas"
                    }`}
                  >
                    {dayTrades.length === 0 ? "·" : r.done ? "✓" : "✕"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-chalk">{r.label}</span>
                    <span className="mt-0.5 block font-mono text-xs text-ash">{r.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-display text-base font-semibold">Last {HISTORY_DAYS} days</h3>
            <span className="font-mono text-xs text-ash">
              <span className="text-chalk">{streak}</span> day streak
            </span>
          </div>
          <div className="flex items-end gap-1">
            {history.map(h => (
              <span
                key={h.iso}
                data-hist
                title={`${h.iso} — ${h.status.toLowerCase()}`}
                className={`h-8 flex-1 rounded-sm ${
                  h.status === "PASS" ? "bg-up" : h.status === "FAIL" ? "bg-down" : "bg-line"
                }`}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-4 font-mono text-[11px] text-dim">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-up align-middle" />passed</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-down align-middle" />missed</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-line align-middle" />no trades</span>
          </div>
        </section>
      </div>
    </div>
  );
}
