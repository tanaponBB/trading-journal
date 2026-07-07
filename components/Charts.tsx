"use client";

import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Trade } from "@/lib/types";
import { equityCurve, fmtMoney, pnlByDay } from "@/lib/calc";

interface Props {
  trades: Trade[];
  baseWallet: number;
  currency: string;
}

type Tab = "equity" | "daily";

export default function Charts({ trades, baseWallet, currency }: Props) {
  const [tab, setTab] = useState<Tab>("equity");

  const equity = useMemo(() => equityCurve(trades, baseWallet), [trades, baseWallet]);
  const daily = useMemo(
    () => [...pnlByDay(trades).entries()]
      .filter(([, v]) => v.count > v.open)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, pnl: Number(v.pnl.toFixed(2)) })),
    [trades],
  );

  const tooltipStyle = {
    backgroundColor: "#0D1A12",
    border: "1px solid #1D3527",
    borderRadius: 12,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
  } as const;

  return (
    <section className="rounded-2xl border border-hedge bg-pine p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">Performance</h3>
        <div className="flex rounded-lg border border-hedge p-0.5">
          {(["equity", "daily"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                tab === t ? "bg-leaf/15 text-leaf" : "text-sage hover:text-fog"
              }`}
            >
              {t === "equity" ? "Equity curve" : "Daily P/L"}
            </button>
          ))}
        </div>
      </div>

      {equity.length <= 1 ? (
        <p className="flex h-64 items-center justify-center rounded-xl border border-dashed border-hedge text-sm text-sage">
          Close a trade to start drawing the curve.
        </p>
      ) : (
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            {tab === "equity" ? (
              <AreaChart data={equity} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34D399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34D399" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1D3527" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#7E9C8A", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#1D3527" }} minTickGap={28} />
                <YAxis tick={{ fill: "#7E9C8A", fontSize: 11 }} tickLine={false} axisLine={false} width={72}
                  domain={["auto", "auto"]} tickFormatter={(v: number) => fmtMoney(v, currency)} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#7E9C8A" }}
                  formatter={(v) => [fmtMoney(Number(v), currency), "Equity"]} />
                <ReferenceLine y={baseWallet} stroke="#E8C468" strokeDasharray="4 6"
                  label={{ value: "base", fill: "#E8C468", fontSize: 10, position: "insideTopRight" }} />
                <Area type="monotone" dataKey="equity" stroke="#34D399" strokeWidth={2} fill="url(#equityFill)"
                  dot={{ r: 2.5, fill: "#34D399", strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </AreaChart>
            ) : (
              <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="#1D3527" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#7E9C8A", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#1D3527" }} minTickGap={28} />
                <YAxis tick={{ fill: "#7E9C8A", fontSize: 11 }} tickLine={false} axisLine={false} width={72}
                  tickFormatter={(v: number) => fmtMoney(v, currency)} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#7E9C8A" }} cursor={{ fill: "rgba(52,211,153,0.06)" }}
                  formatter={(v) => [fmtMoney(Number(v), currency, true), "Net P/L"]} />
                <ReferenceLine y={0} stroke="#1D3527" />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {daily.map((d, i) => (
                    <Cell key={i} fill={d.pnl >= 0 ? "#34D399" : "#F87171"} fillOpacity={0.85} />
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
