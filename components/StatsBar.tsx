"use client";

import { useCountUp } from "@/lib/anim";
import { Stats, fmtMoney } from "@/lib/calc";

interface Props {
  stats: Stats;
  baseWallet: number;
  currency: string;
  onOpenSettings: () => void;
}

export default function StatsBar({ stats, baseWallet, currency, onOpenSettings }: Props) {
  const balance = baseWallet + stats.realized;
  const growth = baseWallet > 0 ? (stats.realized / baseWallet) * 100 : 0;

  const balanceRef = useCountUp<HTMLDivElement>(balance, n => fmtMoney(n, currency));
  const netRef = useCountUp(stats.realized, n => fmtMoney(n, currency, true));
  const winRef = useCountUp(stats.winRate * 100, n => `${n.toFixed(1)}%`);
  const growthRef = useCountUp<HTMLDivElement>(growth, n => `${n >= 0 ? "+" : ""}${n.toFixed(2)}% of base`);

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {/* Balance — the one cell that gets extra weight */}
      <button
        onClick={onOpenSettings}
        className="group col-span-2 rounded-panel border border-edge bg-raise p-4 text-left shadow-lift transition-colors hover:border-chalk/40 lg:col-span-1"
        title="Click to change base wallet"
      >
        <div className="text-[11px] uppercase tracking-[0.16em] text-ash">Balance</div>
        <div ref={balanceRef} className="mt-1 font-mono text-2xl font-semibold tabular-nums text-chalk">
          {fmtMoney(balance, currency)}
        </div>
        <div className="mt-1 font-mono text-xs text-dim">
          base {fmtMoney(baseWallet, currency)}
          <span className="ml-2 underline decoration-dotted underline-offset-2 transition-colors group-hover:text-chalk">edit</span>
        </div>
      </button>

      <Cell label="Net P/L">
        <span
          ref={netRef}
          className={`font-mono text-xl font-semibold tabular-nums ${stats.realized >= 0 ? "text-up" : "text-down"}`}
        >
          {fmtMoney(stats.realized, currency, true)}
        </span>
        <div ref={growthRef} className={`mt-1 font-mono text-xs tabular-nums ${growth >= 0 ? "text-ash" : "text-down"}`}>
          {growth >= 0 ? "+" : ""}{growth.toFixed(2)}% of base
        </div>
      </Cell>

      <Cell label="Win rate">
        <span ref={winRef} className="font-mono text-xl font-semibold tabular-nums text-chalk">
          {(stats.winRate * 100).toFixed(1)}%
        </span>
        <div className="mt-1 font-mono text-xs text-ash">
          <span className="text-chalk">{stats.wins}W</span>
          <span className="text-dim"> · </span>
          <span className="text-down">{stats.losses}L</span>
          {stats.breakeven > 0 && <span className="text-dim"> · {stats.breakeven}BE</span>}
        </div>
        {/* win/loss ratio as a hairline bar — no colour needed to read it */}
        <div className="mt-2 h-px w-full bg-line">
          <div
            className="h-px bg-chalk transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(0, Math.min(100, stats.winRate * 100))}%` }}
          />
        </div>
      </Cell>

      <Cell label="Profit factor">
        <span className="font-mono text-xl font-semibold tabular-nums text-chalk">
          {stats.profitFactor == null ? "—" : stats.profitFactor.toFixed(2)}
        </span>
        <div className="mt-1 font-mono text-xs text-ash">gross win / gross loss</div>
      </Cell>

      <Cell label="Best / worst">
        <div className="font-mono text-sm font-semibold tabular-nums text-up">
          ▲ {fmtMoney(stats.best, currency, true)}
        </div>
        <div className="font-mono text-sm font-semibold tabular-nums text-down">
          ▼ {fmtMoney(stats.worst, currency, true)}
        </div>
        {stats.open > 0 && (
          <div className="mt-1 font-mono text-xs text-ash">
            {stats.open} position{stats.open > 1 ? "s" : ""} open
          </div>
        )}
      </Cell>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4 transition-colors hover:border-edge">
      <div className="text-[11px] uppercase tracking-[0.16em] text-ash">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
