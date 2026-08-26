"use client";

import { useMemo } from "react";
import { DUR, EASE, gsap, useCountUp, useGsap } from "@/lib/anim";
import { balanceAsOf, expectedBalance, fmtMoney, tradePnl, tradingDayCount } from "@/lib/calc";
import { MissionConfig, dailyTargetPct } from "@/lib/missions";
import { Trade } from "@/lib/types";

interface Props {
  trades: Trade[];
  dayTrades: Trade[];
  date: string;
  baseWallet: number;
  currency: string;
  missions: MissionConfig[];
  onOpenMissions: () => void;
}

/**
 * Today's profit target and where the account should be if it is hit every
 * trading day. The rate is the PROFIT_TARGET mission's own target, so there is
 * one number to change, not two that can disagree.
 */
export default function TargetsPanel({
  trades, dayTrades, date, baseWallet, currency, missions, onOpenMissions,
}: Props) {
  const pct = dailyTargetPct(missions);

  const startBalance = useMemo(() => balanceAsOf(trades, date, baseWallet), [trades, date, baseWallet]);
  const dayPnl = useMemo(() => dayTrades.reduce((a, t) => a + (tradePnl(t) ?? 0), 0), [dayTrades]);
  const days = useMemo(() => tradingDayCount(trades), [trades]);

  const actual = useMemo(
    () => baseWallet + trades.reduce((a, t) => a + (tradePnl(t) ?? 0), 0),
    [trades, baseWallet],
  );
  const expected = pct != null ? expectedBalance(baseWallet, pct, days) : null;
  const drift = expected != null ? actual - expected : null;

  const targetCash = pct != null ? (startBalance * pct) / 100 : null;
  const progress = targetCash && targetCash > 0 ? Math.max(0, Math.min(1, dayPnl / targetCash)) : 0;
  const hit = targetCash != null && dayPnl >= targetCash;

  const pnlRef = useCountUp<HTMLDivElement>(dayPnl, n => fmtMoney(n, currency, true));
  const expRef = useCountUp<HTMLDivElement>(expected ?? 0, n => fmtMoney(n, currency));
  const actRef = useCountUp<HTMLDivElement>(actual, n => fmtMoney(n, currency));

  const scope = useGsap<HTMLElement>((_self, el) => {
    const bar = el.querySelector("[data-bar]");
    if (bar) {
      gsap.fromTo(bar, { scaleX: 0 }, { scaleX: progress, duration: DUR.slow, ease: EASE, transformOrigin: "left center" });
    }
  }, [progress, date]);

  if (pct == null) {
    return (
      <section className="panel p-5 text-center">
        <h3 className="font-display text-base font-semibold">No daily profit target</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-dim">
          Enable the <span className="text-ash">Make at least +N% on the day</span> mission to set a
          daily target and project where the balance should be.
        </p>
        <button onClick={onOpenMissions} className="btn-solid mx-auto mt-4 px-4 py-2">Set a target</button>
      </section>
    );
  }

  return (
    <section ref={scope} className="panel p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold">Targets</h3>
          <p className="mt-0.5 font-mono text-xs text-ash">
            +{pct}% a day · compounding over {days} trading day{days === 1 ? "" : "s"}
          </p>
        </div>
        <button onClick={onOpenMissions} className="btn-ghost">Edit</button>
      </div>

      {/* today */}
      <div className="rounded-lg border border-line bg-raise/60 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-ash">Target today</div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-chalk">
              {fmtMoney(targetCash ?? 0, currency, true)}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-dim">
              {pct}% of {fmtMoney(startBalance, currency)} at open
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.16em] text-ash">Booked today</div>
            <div
              ref={pnlRef}
              className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${hit ? "text-up" : dayPnl < 0 ? "text-down" : "text-chalk"}`}
            >
              {fmtMoney(dayPnl, currency, true)}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-dim">
              {hit ? "target met" : `${(progress * 100).toFixed(0)}% of the way`}
            </div>
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div data-bar className={`h-full w-full rounded-full ${hit ? "bg-up" : "bg-chalk"}`} />
        </div>
      </div>

      {/* pace */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-ash">Expected balance</div>
          <div ref={expRef} className="mt-1 font-mono text-lg font-semibold tabular-nums text-chalk">
            {fmtMoney(expected ?? 0, currency)}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-dim">
            {fmtMoney(baseWallet, currency)} × {(1 + pct / 100).toFixed(4)}<sup>{days}</sup>
          </div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-ash">Actual balance</div>
          <div ref={actRef} className="mt-1 font-mono text-lg font-semibold tabular-nums text-chalk">
            {fmtMoney(actual, currency)}
          </div>
          <div className={`mt-0.5 font-mono text-[11px] ${drift != null && drift >= 0 ? "text-up" : "text-down"}`}>
            {drift == null ? "—" : `${fmtMoney(drift, currency, true)} vs plan`}
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-ash">
        *the plan compounds only on days you traded — sitting out does not put you behind
      </p>
    </section>
  );
}
