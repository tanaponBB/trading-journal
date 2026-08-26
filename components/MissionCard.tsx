"use client";

import MissionSeal from "@/components/MissionSeal";
import Wordmark from "@/components/Wordmark";
import { DUR, EASE, gsap, useGsap } from "@/lib/anim";
import { DayVerdict, referenceCode } from "@/lib/missions";

interface Props {
  date: string; // YYYY-MM-DD
  verdict: DayVerdict;
  streak: number;
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

/**
 * The day's pass card. Structure mirrors the reference card the user supplied:
 * header band, instruction line, stamp block, reference code, a boxed result
 * panel, and an asterisked footnote.
 */
export default function MissionCard({ date, verdict, streak }: Props) {
  const { status, passed, total } = verdict;
  const passedDay = status === "PASS";
  const code = referenceCode(date, passed, total);

  const scope = useGsap<HTMLElement>((_self, el) => {
    const tl = gsap.timeline();
    tl.fromTo(el, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE, clearProps: "transform" });
    const stamp = el.querySelector("[data-stamp]");
    if (stamp && passedDay) {
      // the stamp lands rather than fades — it is the reward
      tl.fromTo(stamp, { scale: 0.82, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, duration: 0.55, ease: "back.out(1.7)", clearProps: "transform" }, "-=0.2");
    }
  }, [date, status, passed]);

  return (
    <section ref={scope} className="panel overflow-hidden">
      {/* header band */}
      <div className="flex items-center justify-between gap-3 border-b border-line bg-raise px-5 py-3">
        <span className="font-display text-sm font-bold uppercase tracking-[0.16em] text-chalk">
          Daily mission
        </span>
        <Wordmark className="text-sm" />
      </div>

      <div className="px-5 py-6 text-center">
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-ash">
          {passedDay
            ? "Every mission cleared. This is today's stamp."
            : status === "FAIL"
              ? "Clear every mission to earn today's stamp."
              : "No trades recorded yet today. The stamp is issued on days you trade."}
        </p>

        {/* stamp block — the reference card's QR panel */}
        <div className="mt-5 flex justify-center">
          {passedDay ? (
            <div data-stamp className="rounded-lg bg-chalk p-3">
              <MissionSeal seed={code} className="h-32 w-32 text-canvas" />
            </div>
          ) : (
            <div className="flex h-[152px] w-[152px] items-center justify-center rounded-lg border border-dashed border-line">
              <span className="font-mono text-4xl font-semibold tabular-nums text-dim">
                {total === 0 ? "—" : `${passed}/${total}`}
              </span>
            </div>
          )}
        </div>

        {passedDay && (
          <>
            <div className="mt-5 text-[11px] uppercase tracking-[0.16em] text-ash">Reference</div>
            <div className="mt-1 break-all px-4 font-mono text-[11px] tracking-wider text-dim">{code}</div>
          </>
        )}

        {/* boxed result panel */}
        <div className="mx-auto mt-5 max-w-xs rounded-lg border border-line bg-raise/60 px-4 py-4">
          <div className="font-mono text-sm text-ash">
            <span className={passedDay ? "text-up" : "text-chalk"}>{passed}</span>
            <span className="text-dim"> / {total}</span> missions
          </div>
          <div className={`mt-1 font-display text-lg font-bold tracking-wide ${passedDay ? "text-up" : status === "FAIL" ? "text-down" : "text-ash"}`}>
            {passedDay ? "PASSED" : status === "FAIL" ? "NOT PASSED" : "REST DAY"}
          </div>
          <div className="mt-1 text-xs text-ash">on</div>
          <div className="font-mono text-sm text-chalk">{longDate(date)}</div>
        </div>

        <p className="mt-5 text-[11px] text-ash">
          *streak counts only days you traded —{" "}
          <span className="font-mono text-chalk">
            {streak} day{streak === 1 ? "" : "s"}
          </span>{" "}
          running
        </p>
      </div>
    </section>
  );
}
