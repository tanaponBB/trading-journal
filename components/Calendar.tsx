"use client";

import { useMemo } from "react";
import { DUR, EASE, gsap, useGsap } from "@/lib/anim";
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

  // Grid re-deals itself whenever the month changes.
  const scope = useGsap<HTMLElement>((_self, el) => {
    gsap.fromTo(
      el.querySelectorAll("[data-cell]"),
      { autoAlpha: 0, y: 8, scale: 0.965 },
      {
        autoAlpha: 1, y: 0, scale: 1,
        duration: DUR.fast, ease: EASE,
        stagger: { each: 0.012, from: "start", grid: "auto" },
        clearProps: "transform",
      },
    );
    gsap.fromTo(
      el.querySelector("[data-month-label]"),
      { autoAlpha: 0, y: 6 },
      { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE, clearProps: "transform" },
    );
  }, [year, month]);

  return (
    <section ref={scope} className="panel p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div data-month-label className="flex items-baseline gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {MONTHS[month]} <span className="text-ash">{year}</span>
          </h2>
          <span className={`font-mono text-sm tabular-nums ${monthPnl > 0 ? "text-up" : monthPnl < 0 ? "text-down" : "text-dim"}`}>
            {monthPnl === 0 ? "" : fmtMoney(monthPnl, currency, true)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onPrev} aria-label="Previous month" className="btn-ghost">←</button>
          <button onClick={onToday} className="btn-ghost">Today</button>
          <button onClick={onNext} aria-label="Next month" className="btn-ghost">→</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 md:grid-cols-[repeat(7,1fr)_64px]">
        {WEEKDAYS.map(d => (
          <div key={d} className="pb-1.5 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-dim">{d}</div>
        ))}
        <div className="hidden pb-1.5 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-dim md:block">Week</div>

        {cells.map((d, i) => {
          const rowEnd = i % 7 === 6;
          const cell = d != null ? daily.get(iso(year, month, d)) : undefined;
          const pnl = cell?.pnl ?? 0;
          const hasClosed = cell != null && cell.count > cell.open;
          // Monochrome heat: profit lifts toward off-white, loss sinks toward black.
          const intensity = hasClosed ? 0.05 + 0.16 * Math.min(1, Math.abs(pnl) / maxAbs) : 0;
          const isToday = d != null && iso(year, month, d) === todayIso;
          const isSelected = d != null && iso(year, month, d) === selectedDate;

          return (
            <FragmentRow key={i} showWeek={rowEnd} weekPnl={weeklyPnl[(i / 7) | 0]} currency={currency}>
              {d == null ? (
                <div className="aspect-square rounded-lg border border-transparent sm:aspect-[4/3]" />
              ) : (
                <button
                  data-cell
                  onClick={() => onSelectDate(iso(year, month, d))}
                  aria-label={`Day ${d}`}
                  aria-current={isToday ? "date" : undefined}
                  className={`group relative flex aspect-square flex-col justify-between overflow-hidden rounded-lg border p-1.5 text-left transition-colors sm:aspect-[4/3] sm:p-2
                    ${isSelected
                      ? "border-chalk"
                      : isToday
                        ? "border-edge"
                        : "border-line hover:border-edge"}`}
                  style={hasClosed ? {
                    backgroundColor: pnl >= 0
                      ? `rgba(242, 240, 234, ${intensity})`
                      : `rgba(0, 0, 0, ${intensity * 2.2})`,
                  } : undefined}
                >
                  <div className="flex w-full items-start justify-between">
                    <span className={`font-mono text-xs tabular-nums ${isToday ? "text-chalk" : "text-dim"}`}>{d}</span>
                    {cell && cell.open > 0 && (
                      <span className="mt-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-chalk" title={`${cell.open} open`} />
                    )}
                  </div>
                  {cell && (
                    <div className="w-full">
                      {hasClosed && (
                        <div className={`truncate font-mono text-[10px] font-semibold tabular-nums sm:text-xs ${pnl >= 0 ? "text-up" : "text-down"}`}>
                          {fmtMoney(pnl, currency, true)}
                        </div>
                      )}
                      <div className="text-[9px] text-dim sm:text-[10px]">{cell.count} trade{cell.count > 1 ? "s" : ""}</div>
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

/** Renders the cell, plus the weekly-total column at each row end (desktop). */
function FragmentRow({ children, showWeek, weekPnl, currency }: {
  children: React.ReactNode; showWeek: boolean; weekPnl: number; currency: string;
}) {
  return (
    <>
      {children}
      {showWeek && (
        <div data-cell className="hidden items-center justify-center rounded-lg border border-line/70 bg-raise/50 md:flex">
          <span className={`font-mono text-[10px] font-medium tabular-nums ${weekPnl > 0 ? "text-up" : weekPnl < 0 ? "text-down" : "text-dim"}`}>
            {weekPnl === 0 ? "·" : fmtMoney(weekPnl, currency, true)}
          </span>
        </div>
      )}
    </>
  );
}
