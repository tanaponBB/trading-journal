"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { fmtMoney } from "@/lib/calc";
import { PLAN_LIMITS, PlanConfig, buildLadder, normalizePlan } from "@/lib/plan";

interface Props {
  plan: PlanConfig;
  currency: string;
  onSave: (p: PlanConfig) => void;
  onClose: () => void;
}

const num = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * The whole ladder comes from three numbers, so this is all there is to edit.
 * The preview recomputes as you type — the point being that the table is
 * generated, never transcribed.
 */
export default function PlanModal({ plan, currency, onSave, onClose }: Props) {
  const [startBalance, setStartBalance] = useState(String(plan.startBalance));
  const [dailyPct, setDailyPct] = useState(String(plan.dailyPct));
  const [days, setDays] = useState(String(plan.days));
  const [startDate, setStartDate] = useState(plan.startDate ?? "");

  const draft = useMemo(
    () => normalizePlan({
      startBalance: num(startBalance),
      dailyPct: num(dailyPct),
      days: num(days),
      startDate: startDate || undefined,
    }),
    [startBalance, dailyPct, days, startDate],
  );

  const ladder = useMemo(() => buildLadder(draft), [draft]);
  const goal = ladder[ladder.length - 1]?.plannedEnd ?? draft.startBalance;

  const save = (close: () => void) => {
    onSave(draft);
    close();
  };

  return (
    <Modal label="Daily plan" onClose={onClose} cardClassName="max-w-md">
      {close => (
        <>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Daily plan</h2>
            <button onClick={close} className="btn-ghost px-2.5 py-1" aria-label="Close">✕</button>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="tj-plan-start">Start balance</label>
              <input
                id="tj-plan-start" className="field" type="number" step="any"
                min={PLAN_LIMITS.startBalance.min} max={PLAN_LIMITS.startBalance.max}
                value={startBalance} onChange={e => setStartBalance(e.target.value)} placeholder="10"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="tj-plan-pct">Daily target %</label>
              <input
                id="tj-plan-pct" className="field" type="number" step="any"
                min={PLAN_LIMITS.dailyPct.min} max={PLAN_LIMITS.dailyPct.max}
                value={dailyPct} onChange={e => setDailyPct(e.target.value)} placeholder="25"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="tj-plan-days">Trading days</label>
              <input
                id="tj-plan-days" className="field" type="number" step="1"
                min={PLAN_LIMITS.days.min} max={PLAN_LIMITS.days.max}
                value={days} onChange={e => setDays(e.target.value)} placeholder="30"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="tj-plan-from">Count trades from</label>
              <input
                id="tj-plan-from" className="field" type="date"
                value={startDate} onChange={e => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <p className="mb-4 text-[11px] text-ash">
            Leave <span className="text-chalk">Count trades from</span> empty to use your whole
            history. Set it to the day the plan began so older trades don&rsquo;t fill the first rungs.
          </p>

          {/* preview */}
          <div className="mb-5 rounded-lg border border-line bg-raise/60 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-ash">Preview</div>
            <div className="space-y-1 font-mono text-xs tabular-nums">
              {[0, 1, 2].map(i => ladder[i] && (
                <div key={i} className="flex justify-between text-dim">
                  <span>Day {ladder[i].day}</span>
                  <span>{fmtMoney(ladder[i].plannedStart, currency)}</span>
                  <span className="text-ash">+{fmtMoney(ladder[i].plannedTarget, currency)}</span>
                  <span className="text-chalk">{fmtMoney(ladder[i].plannedEnd, currency)}</span>
                </div>
              ))}
              {draft.days > 3 && <div className="text-center text-dim">⋮</div>}
              <div className="flex justify-between border-t border-line pt-1.5 text-chalk">
                <span>Day {draft.days}</span>
                <span className="font-semibold">{fmtMoney(goal, currency)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => save(close)} className="btn-solid flex-1 py-2.5">Save plan</button>
            <button onClick={close} className="btn-ghost px-5 py-2.5">Cancel</button>
          </div>
        </>
      )}
    </Modal>
  );
}
