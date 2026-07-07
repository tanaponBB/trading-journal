"use client";

import { useMemo } from "react";
import { Trade } from "@/lib/types";
import { fmtMoney, pnlByDay } from "@/lib/calc";

interface Props {
  year: number;
  month: number; // 0-11
  trades: Trade[];
  currency: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function Calendar({ year, month, trades, currency, selectedDate, onSelectDate, onPrev, onNext, onToday }: Props) {
  const daily = useMemo(() => pnlByDay(trades), [trades]);

  const { cells, weeklyPnl, monthPnl } = useMemo(() => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday-first offset
    const cells: (number | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    let monthPnl = 0;
    const weeklyPnl: number[] = [];
    for (let w = 0; w < cells.length / 7; w++) {
      let sum = 0;
      for (let i = 0; i < 7; i++) {
        const d = cells[w * 7 + i];
        if (d == null) continue;
        sum += daily.get(iso(year, month, d))?.pnl ?? 0;
      }
      weeklyPnl.push(sum);
      monthPnl += sum;
    }
    return { cells, weeklyPnl, monthPnl };
  }, [year, month, daily]);

  const today = new Date();
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

  // heat intensity relative to the biggest day of the visible month
  const maxAbs = useMemo(() => {
    let m = 0;
    for (const d of cells) {
      if (d == null) continue;
      const v = Math.abs(daily.get(iso(year, month, d))?.pnl ?? 0);
      if (v > m) m = v;
    }
    return m || 1;
  }, [cells, daily, year, month]);

  return (
    <section className="rounded-2xl border border-hedge bg-pine p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">{MONTHS[month]} <span className="text-sage">{year}</span></h2>
          <span className={`font-mono text-sm ${monthPnl > 0 ? "text-leaf" : monthPnl < 0 ? "text-blood" : "text-sage"}`}>
            {monthPnl === 0 ? "" : fmtMoney(monthPnl, currency, true)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onPrev} aria-label="Previous month" className="rounded-lg border border-hedge px-3 py-1.5 text-sm text-sage transition-colors hover:border-fern hover:text-fog">←</button>
          <button onClick={onToday} className="rounded-lg border border-hedge px-3 py-1.5 text-sm text-sage transition-colors hover:border-fern hover:text-fog">Today</button>
          <button onClick={onNext} aria-label="Next month" className="rounded-lg border border-hedge px-3 py-1.5 text-sm text-sage transition-colors hover:border-fern hover:text-fog">→</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 md:grid-cols-[repeat(7,1fr)_64px]">
        {WEEKDAYS.map(d => (
          <div key={d} className="pb-1 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-sage">{d}</div>
        ))}
        <div className="hidden pb-1 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-gold/80 md:block">Week</div>

        {cells.map((d, i) => {
          const rowEnd = i % 7 === 6;
          const cell = d != null ? daily.get(iso(year, month, d)) : undefined;
          const pnl = cell?.pnl ?? 0;
          const hasClosed = cell != null && cell.count > cell.open;
          const intensity = hasClosed ? 0.12 + 0.28 * Math.min(1, Math.abs(pnl) / maxAbs) : 0;
          const isToday = d != null && iso(year, month, d) === todayIso;
          const isSelected = d != null && iso(year, month, d) === selectedDate;

          return (
            <FragmentRow key={i} showWeek={rowEnd} weekPnl={weeklyPnl[(i / 7) | 0]} currency={currency}>
              {d == null ? (
                <div className="aspect-square rounded-xl border border-transparent sm:aspect-[4/3]" />
              ) : (
                <button
                  onClick={() => onSelectDate(iso(year, month, d))}
                  aria-label={`Day ${d}`}
                  className={`group relative flex aspect-square flex-col justify-between overflow-hidden rounded-xl border p-1.5 text-left transition-all sm:aspect-[4/3] sm:p-2
                    ${isSelected ? "border-gold shadow-goldglow" : isToday ? "border-leaf/70" : "border-hedge hover:border-fern"}`}
                  style={hasClosed ? {
                    backgroundColor: pnl >= 0
                      ? `rgba(52, 211, 153, ${intensity})`
                      : `rgba(248, 113, 113, ${intensity})`,
                  } : undefined}
                >
                  <div className="flex w-full items-start justify-between">
                    <span className={`font-mono text-xs ${isToday ? "text-leaf" : "text-sage"}`}>{d}</span>
                    {cell && cell.open > 0 && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" title={`${cell.open} open`} />
                    )}
                  </div>
                  {cell && (
                    <div className="w-full">
                      {hasClosed && (
                        <div className={`truncate font-mono text-[10px] font-semibold sm:text-xs ${pnl >= 0 ? "text-leaf" : "text-blood"}`}>
                          {fmtMoney(pnl, currency, true)}
                        </div>
                      )}
                      <div className="text-[9px] text-sage/80 sm:text-[10px]">{cell.count} trade{cell.count > 1 ? "s" : ""}</div>
                    </div>
                  )}
                </button>
              )}
            </FragmentRow>
          );
        })}
      </div>
    </section>
  );
}

/** Renders the cell, plus the gold weekly-total column at each row end (desktop). */
function FragmentRow({ children, showWeek, weekPnl, currency }: {
  children: React.ReactNode; showWeek: boolean; weekPnl: number; currency: string;
}) {
  return (
    <>
      {children}
      {showWeek && (
        <div className="hidden items-center justify-center rounded-xl border border-hedge/60 bg-moss/40 md:flex">
          <span className={`font-mono text-[10px] font-medium ${weekPnl > 0 ? "text-leaf" : weekPnl < 0 ? "text-blood" : "text-sage/50"}`}>
            {weekPnl === 0 ? "·" : fmtMoney(weekPnl, currency, true)}
          </span>
        </div>
      )}
    </>
  );
}
