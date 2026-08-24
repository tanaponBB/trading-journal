"use client";

import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { DUR, EASE, gsap, riseOnScroll, useGsap } from "@/lib/anim";
import { Trade } from "@/lib/types";
import { equityCurve, fmtMoney, pnlByDay } from "@/lib/calc";

interface Props {
  trades: Trade[];
  baseWallet: number;
  currency: string;
}

type Tab = "equity" | "daily";

/** Chart ink, mirrored from the Tailwind tokens. Neutral shell, coloured P/L. */
const INK = {
  chalk: "#F2F0EA",
  ash: "#8A8681",
  line: "#2C2C2C",
  edge: "#454545",
  panel: "#1A1A1A",
  up: "#3FCF8E",
  down: "#F0655F",
} as const;

export default function Charts({ trades, baseWallet, currency }: Props) {
  const [tab, setTab] = useState<Tab>("equity");

  const equity = useMemo(() => equityCurve(trades, baseWallet), [trades, baseWallet]);
  // the curve takes the colour of where the account currently sits vs. its base wallet
  const curveInk = (equity[equity.length - 1]?.equity ?? baseWallet) >= baseWallet ? INK.up : INK.down;
  const daily = useMemo(
    () => [...pnlByDay(trades).entries()]
      .filter(([, v]) => v.count > v.open)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, pnl: Number(v.pnl.toFixed(2)) })),
    [trades],
  );

  // The panel reveals when it scrolls into view…
  const scope = useGsap<HTMLElement>((_self, el) => {
    riseOnScroll(el, el, 0);
  }, []);

  // …and the plot cross-fades whenever the tab changes.
  const plot = useGsap<HTMLDivElement>((_self, el) => {
    gsap.fromTo(el, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE, clearProps: "transform" });
  }, [tab]);

  const tooltipStyle = {
    backgroundColor: INK.panel,
    border: `1px solid ${INK.edge}`,
    borderRadius: 10,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
  } as const;

  return (
    <section ref={scope} className="panel p-4 sm:p-5">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">Performance</h3>
        <div className="flex rounded-lg border border-line p-0.5">
          {(["equity", "daily"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                tab === t ? "bg-chalk text-base" : "text-ash hover:text-chalk"
              }`}
            >
              {t === "equity" ? "Equity curve" : "Daily P/L"}
            </button>
          ))}
        </div>
      </div>

      {equity.length <= 1 ? (
        <p className="flex h-64 items-center justify-center rounded-lg border border-dashed border-line text-sm text-dim">
          Close a trade to start drawing the curve.
        </p>
      ) : (
        <div ref={plot} className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            {tab === "equity" ? (
              <AreaChart data={equity} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={curveInk} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={curveInk} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={INK.line} strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: INK.ash, fontSize: 11 }} tickLine={false} axisLine={{ stroke: INK.line }} minTickGap={28} />
                <YAxis tick={{ fill: INK.ash, fontSize: 11 }} tickLine={false} axisLine={false} width={72}
                  domain={["auto", "auto"]} tickFormatter={(v: number) => fmtMoney(v, currency)} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: INK.ash }} itemStyle={{ color: curveInk }}
                  cursor={{ stroke: INK.edge, strokeDasharray: "3 3" }}
                  formatter={(v) => [fmtMoney(Number(v), currency), "Equity"]} />
                <ReferenceLine y={baseWallet} stroke={INK.edge} strokeDasharray="4 6"
                  label={{ value: "base", fill: INK.ash, fontSize: 10, position: "insideTopRight" }} />
                <Area type="monotone" dataKey="equity" stroke={curveInk} strokeWidth={1.75} fill="url(#equityFill)"
                  dot={{ r: 2, fill: curveInk, strokeWidth: 0 }} activeDot={{ r: 4, fill: curveInk }} />
              </AreaChart>
            ) : (
              <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={INK.line} strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: INK.ash, fontSize: 11 }} tickLine={false} axisLine={{ stroke: INK.line }} minTickGap={28} />
                <YAxis tick={{ fill: INK.ash, fontSize: 11 }} tickLine={false} axisLine={false} width={72}
                  tickFormatter={(v: number) => fmtMoney(v, currency)} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: INK.ash }} itemStyle={{ color: INK.chalk }}
                  cursor={{ fill: "rgba(242,240,234,0.04)" }}
                  formatter={(v) => [fmtMoney(Number(v), currency, true), "Net P/L"]} />
                <ReferenceLine y={0} stroke={INK.edge} />
                {/* green up-days, red down-days */}
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={36}>
                  {daily.map((d, i) => (
                    <Cell key={i} fill={d.pnl >= 0 ? INK.up : INK.down} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
