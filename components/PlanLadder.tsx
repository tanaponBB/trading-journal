"use client";

import { useMemo } from "react";
import { DUR, EASE, gsap, useCountUp, useGsap } from "@/lib/anim";
import { fmtMoney } from "@/lib/calc";
import { PlanConfig, Rung, buildProgress } from "@/lib/plan";
import { Trade } from "@/lib/types";

interface Props {
  plan: PlanConfig;
  trades: Trade[];
  currency: string;
  /** Today in YYYY-MM-DD, so the rung you are standing on can be highlighted. */
  today: string;
  onEdit: () => void;
}

/**
 * The daily plan as a ladder: one rung per trading day, each asking for a fixed
 * percent of the balance it opens with.
 *
 * The planned track is frozen — it is not rebased when a day goes badly, because
 * being able to see that you are behind is the entire point. The actual track
 * compounds from real closed trades beside it, and the gap between them is the
 * number worth reading.
 */
export default function PlanLadder({ plan, trades, currency, today, onEdit }: Props) {
  const p = useMemo(() => buildProgress(plan, trades), [plan, trades]);

  // If something closed today, today's rung is the live one; otherwise the next
  // unfilled rung is what you are aiming at.
  const current = useMemo(
    () => p.rungs.find(r => r.date === today) ?? p.rungs.find(r => r.status === "pending") ?? null,
    [p.rungs, today],
  );

  const booked = current?.actualPnl ?? 0;
  const targetCash = current?.plannedTarget ?? 0;
  const progress = targetCash > 0 ? Math.max(0, Math.min(1, booked / targetCash)) : 0;
  const hitToday = current != null && booked >= targetCash;

  const balRef = useCountUp<HTMLDivElement>(p.actualNow, n => fmtMoney(n, currency));
  const driftRef = useCountUp<HTMLDivElement>(p.drift, n => fmtMoney(n, currency, true));
  const bookedRef = useCountUp<HTMLDivElement>(booked, n => fmtMoney(n, currency, true));

  const scope = useGsap<HTMLElement>((_self, el) => {
    const bar = el.querySelector("[data-bar]");
    if (bar) {
      gsap.fromTo(bar, { scaleX: 0 }, {
        scaleX: progress, duration: DUR.slow, ease: EASE, transformOrigin: "left center",
      });
    }
    const rail = el.querySelector("[data-rail]");
    if (rail) {
      gsap.fromTo(rail, { scaleX: 0 }, {
        scaleX: plan.days > 0 ? p.daysDone / plan.days : 0,
        duration: DUR.slow, ease: EASE, transformOrigin: "left center",
      });
    }
  }, [progress, p.daysDone, plan.days]);

  return (
    <section ref={scope} className="space-y-4 sm:space-y-5">
      {/* ---------------------------------------------------------- header -- */}
      <div className="panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold">Daily plan</h3>
            <p className="mt-0.5 font-mono text-xs text-ash">
              +{plan.dailyPct}% a day · {plan.days} trading days · from {fmtMoney(plan.startBalance, currency)}
              {plan.startDate ? ` · since ${plan.startDate}` : ""}
            </p>
          </div>
          <button onClick={onEdit} className="btn-ghost">Edit</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-line p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-ash">Day</div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-chalk">
              {p.complete ? plan.days : p.currentDay}
              <span className="text-dim"> / {plan.days}</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line">
              <div data-rail className="h-full w-full rounded-full bg-chalk" />
            </div>
          </div>

          <div className="rounded-lg border border-line p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-ash">Balance</div>
            <div ref={balRef} className="mt-1 font-mono text-lg font-semibold tabular-nums text-chalk">
              {fmtMoney(p.actualNow, currency)}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-dim">
              goal {fmtMoney(p.goal, currency)}
            </div>
          </div>

          <div className="rounded-lg border border-line p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-ash">Against plan</div>
            <div
              ref={driftRef}
              className={`mt-1 font-mono text-lg font-semibold tabular-nums ${p.drift >= 0 ? "text-up" : "text-down"}`}
            >
              {fmtMoney(p.drift, currency, true)}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-dim">
              plan says {fmtMoney(p.plannedNow, currency)}
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------- current -- */}
      {current && (
        <div className="panel p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-ash">
                {current.date === today ? `Day ${current.day} · today` : `Day ${current.day} · up next`}
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-chalk">
                {fmtMoney(targetCash, currency, true)}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-dim">
                {plan.dailyPct}% of {fmtMoney(current.plannedStart, currency)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.16em] text-ash">Booked</div>
              <div
                ref={bookedRef}
                className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                  booked > 0 ? "text-up" : booked < 0 ? "text-down" : "text-chalk"
                }`}
              >
                {fmtMoney(booked, currency, true)}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-dim">
                {current.date !== today
                  ? "not started"
                  : hitToday
                    ? "target met"
                    : `${(progress * 100).toFixed(0)}% of the way`}
              </div>
            </div>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div data-bar className={`h-full w-full rounded-full ${hitToday ? "bg-up" : "bg-chalk"}`} />
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- ladder -- */}
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h3 className="font-display text-sm font-semibold">The ladder</h3>
          <div className="flex items-center gap-3 font-mono text-[11px] text-dim">
            <Legend kind="hit" /> hit {p.hits}
            <Legend kind="missed" /> short {p.misses}
            <Legend kind="breached" /> down {p.breaches}
          </div>
        </div>

        <div className="max-h-[460px] overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="border-b border-line text-[10px] uppercase tracking-[0.16em] text-ash">
                <th className="px-4 py-2 text-left font-normal">Day</th>
                <th className="px-3 py-2 text-left font-normal">Date</th>
                <th className="px-3 py-2 text-right font-normal">Target</th>
                <th className="px-3 py-2 text-right font-normal">Booked</th>
                <th className="px-3 py-2 text-right font-normal">Balance</th>
                <th className="px-4 py-2 text-right font-normal">Plan</th>
              </tr>
            </thead>
            <tbody>
              {p.rungs.map(r => (
                <LadderRow
                  key={r.day}
                  rung={r}
                  currency={currency}
                  isCurrent={current != null && r.day === current.day}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-[11px] text-ash">
        The plan never rebases — a short day leaves you behind rather than quietly lowering
        tomorrow&rsquo;s target. Only days with a closed trade advance the ladder.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ parts -- */

/**
 * Status is carried by the dot's shape, not its hue: colour in this app always
 * means money, so a filled green dot is a day that made its number and a hollow
 * one is a day that made money but fell short.
 */
function Legend({ kind }: { kind: Rung["status"] }) {
  const base = "inline-block h-2 w-2 rounded-full align-middle";
  if (kind === "hit") return <span className={`${base} bg-up`} />;
  if (kind === "breached") return <span className={`${base} bg-down`} />;
  if (kind === "missed") return <span className={`${base} border border-ash`} />;
  return <span className={`${base} bg-line`} />;
}

function LadderRow({ rung, currency, isCurrent }: { rung: Rung; currency: string; isCurrent: boolean }) {
  const done = rung.status !== "pending";

  return (
    <tr
      className={`border-b border-line/60 last:border-0 ${
        isCurrent ? "bg-raise" : done ? "" : "opacity-55"
      }`}
    >
      <td className="px-4 py-2">
        <span className="flex items-center gap-2 font-mono tabular-nums">
          <Legend kind={rung.status} />
          <span className={isCurrent ? "font-semibold text-chalk" : "text-ash"}>{rung.day}</span>
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-ash">{rung.date ?? "—"}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-ash">
        {fmtMoney(rung.plannedTarget, currency, true)}
      </td>
      <td
        className={`px-3 py-2 text-right font-mono tabular-nums ${
          rung.actualPnl == null
            ? "text-dim"
            : rung.actualPnl > 0
              ? "text-up"
              : rung.actualPnl < 0
                ? "text-down"
                : "text-chalk"
        }`}
      >
        {rung.actualPnl == null ? "—" : fmtMoney(rung.actualPnl, currency, true)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-chalk">
        {rung.actualEnd == null ? "—" : fmtMoney(rung.actualEnd, currency)}
      </td>
      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-dim">
        {fmtMoney(rung.plannedEnd, currency)}
      </td>
    </tr>
  );
}
