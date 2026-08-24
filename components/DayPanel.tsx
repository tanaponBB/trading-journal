"use client";

import { DUR, EASE, gsap, useGsap } from "@/lib/anim";
import { Trade } from "@/lib/types";
import { fmtMoney, fmtNum, isGoldSymbol, riskReward, tradePnl, unrealizedPnl } from "@/lib/calc";

interface Props {
  date: string;
  trades: Trade[];
  currency: string;
  goldPrice: number | null; // live XAU/USD, null while loading/unavailable
  onAdd: () => void;
  onEdit: (t: Trade) => void;
  onDelete: (id: string) => void;
}

export default function DayPanel({ date, trades, currency, goldPrice, onAdd, onEdit, onDelete }: Props) {
  const dayPnl = trades.reduce((s, t) => s + (tradePnl(t) ?? 0), 0);
  const hasClosed = trades.some(t => t.status === "CLOSED");

  // Re-deal the list whenever the selected day changes.
  const scope = useGsap<HTMLElement>((_self, el) => {
    gsap.fromTo(
      el.querySelectorAll("[data-row]"),
      { autoAlpha: 0, x: 12 },
      { autoAlpha: 1, x: 0, duration: DUR.base, ease: EASE, stagger: 0.05, clearProps: "transform" },
    );
    gsap.fromTo(
      el.querySelector("[data-day-head]"),
      { autoAlpha: 0, y: 6 },
      { autoAlpha: 1, y: 0, duration: DUR.fast, ease: EASE, clearProps: "transform" },
    );
  }, [date, trades.length]);

  return (
    <section ref={scope} className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div data-day-head>
          <h3 className="font-display text-base font-semibold">{date}</h3>
          {hasClosed && (
            <p className={`font-mono text-sm tabular-nums ${dayPnl >= 0 ? "text-up" : "text-down"}`}>
              Day net {fmtMoney(dayPnl, currency, true)}
            </p>
          )}
        </div>
        <button onClick={onAdd} className="btn-solid px-4 py-2">+ Trade</button>
      </div>

      {trades.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-dim">
          No trades on this day yet.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {trades.map(t => {
            const pnl = tradePnl(t);
            const floating = t.status === "OPEN" && isGoldSymbol(t.symbol) && goldPrice != null
              ? unrealizedPnl(t, goldPrice)
              : null;
            const rr = riskReward(t);
            const long = t.direction === "LONG";
            return (
              <li
                key={t.id}
                data-row
                className="rounded-lg border border-line bg-raise/60 p-3 transition-colors hover:border-edge"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`rounded px-2 py-0.5 font-display text-xs font-bold tracking-wide ${
                        long ? "bg-chalk text-canvas" : "border border-edge text-ash"
                      }`}
                    >
                      {long ? "▲ LONG" : "▼ SHORT"}
                    </span>
                    <span className="font-mono text-sm font-semibold">{t.symbol}</span>
                    <span className="font-mono text-xs text-ash">{fmtNum(t.lots)} lot</span>
                    {t.status === "OPEN" && (
                      <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-ash">
                        open
                      </span>
                    )}
                  </div>
                  {pnl != null ? (
                    <span className={`font-mono text-sm font-semibold tabular-nums ${pnl >= 0 ? "text-up" : "text-down"}`}>
                      {fmtMoney(pnl, currency, true)}
                    </span>
                  ) : floating != null ? (
                    <span className="text-right">
                      <span className={`font-mono text-sm font-semibold tabular-nums ${floating >= 0 ? "text-up" : "text-down"}`}>
                        {fmtMoney(floating, currency, true)}
                      </span>
                      <span className="block font-mono text-[10px] text-dim">live @ {fmtNum(goldPrice!)}</span>
                    </span>
                  ) : (
                    <span className="font-mono text-sm font-semibold text-dim">running…</span>
                  )}
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-ash sm:grid-cols-4">
                  <span>Entry <span className="text-chalk">{fmtNum(t.entry)}</span></span>
                  <span>SL <span className="text-chalk">{t.sl != null ? fmtNum(t.sl) : "—"}</span></span>
                  <span>TP <span className="text-chalk">{t.tp != null ? fmtNum(t.tp) : "—"}</span></span>
                  <span>
                    {t.status === "CLOSED"
                      ? <>Exit <span className="text-chalk">{t.exit != null ? fmtNum(t.exit) : "—"}</span></>
                      : rr != null ? <>R:R <span className="text-chalk">1:{rr.toFixed(2)}</span></> : <>R:R —</>}
                  </span>
                </div>

                {t.notes && <p className="mt-2.5 border-t border-line pt-2.5 text-xs text-ash">{t.notes}</p>}

                <div className="mt-3 flex gap-2">
                  <button onClick={() => onEdit(t)} className="btn-ghost px-3 py-1 text-xs">
                    {t.status === "OPEN" ? "Close / edit" : "Edit"}
                  </button>
                  <button
                    onClick={() => onDelete(t.id)}
                    className="rounded-lg border border-line px-3 py-1 text-xs text-dim transition-colors hover:border-edge hover:text-chalk"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
