"use client";

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

  return (
    <section className="rounded-2xl border border-hedge bg-pine p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold">{date}</h3>
          {hasClosed && (
            <p className={`font-mono text-sm ${dayPnl >= 0 ? "text-leaf" : "text-blood"}`}>
              Day net {fmtMoney(dayPnl, currency, true)}
            </p>
          )}
        </div>
        <button onClick={onAdd} className="rounded-xl bg-leaf px-4 py-2 font-display text-sm font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-[0.98]">
          + Trade
        </button>
      </div>

      {trades.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hedge p-6 text-center text-sm text-sage">
          No trades on this day yet. Add your first order.
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
              <li key={t.id} className="rounded-xl border border-hedge bg-moss/50 p-3 transition-colors hover:border-fern">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`rounded-md px-2 py-0.5 font-display text-xs font-bold ${long ? "bg-leaf/15 text-leaf" : "bg-blood/15 text-blood"}`}>
                      {long ? "▲ LONG" : "▼ SHORT"}
                    </span>
                    <span className="font-mono text-sm font-semibold">{t.symbol}</span>
                    <span className="font-mono text-xs text-sage">{fmtNum(t.lots)} lot</span>
                    {t.status === "OPEN" && (
                      <span className="rounded-md border border-gold/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gold">open</span>
                    )}
                  </div>
                  {pnl != null ? (
                    <span className={`font-mono text-sm font-semibold ${pnl >= 0 ? "text-leaf" : "text-blood"}`}>
                      {fmtMoney(pnl, currency, true)}
                    </span>
                  ) : floating != null ? (
                    <span className="text-right">
                      <span className={`font-mono text-sm font-semibold ${floating >= 0 ? "text-leaf" : "text-blood"}`}>
                        {fmtMoney(floating, currency, true)}
                      </span>
                      <span className="block font-mono text-[10px] text-gold/80">live @ {fmtNum(goldPrice!)}</span>
                    </span>
                  ) : (
                    <span className="font-mono text-sm font-semibold text-sage">running…</span>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-sage sm:grid-cols-4">
                  <span>Entry <span className="text-fog">{fmtNum(t.entry)}</span></span>
                  <span>SL <span className="text-fog">{t.sl != null ? fmtNum(t.sl) : "—"}</span></span>
                  <span>TP <span className="text-fog">{t.tp != null ? fmtNum(t.tp) : "—"}</span></span>
                  <span>
                    {t.status === "CLOSED"
                      ? <>Exit <span className="text-fog">{t.exit != null ? fmtNum(t.exit) : "—"}</span></>
                      : rr != null ? <>R:R <span className="text-gold">1:{rr.toFixed(2)}</span></> : <>R:R —</>}
                  </span>
                </div>

                {t.notes && <p className="mt-2 border-t border-hedge/60 pt-2 text-xs text-sage">{t.notes}</p>}

                <div className="mt-2.5 flex gap-2">
                  <button onClick={() => onEdit(t)} className="rounded-lg border border-hedge px-3 py-1 text-xs text-sage transition-colors hover:border-fern hover:text-fog">
                    {t.status === "OPEN" ? "Close / edit" : "Edit"}
                  </button>
                  <button onClick={() => onDelete(t.id)} className="rounded-lg border border-hedge px-3 py-1 text-xs text-sage transition-colors hover:border-blood/60 hover:text-blood">
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
