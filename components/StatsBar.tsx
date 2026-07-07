"use client";

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

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {/* Balance — the hero cell */}
      <button
        onClick={onOpenSettings}
        className="group col-span-2 rounded-2xl border border-gold/30 bg-gradient-to-br from-moss to-pine p-4 text-left shadow-goldglow transition-colors hover:border-gold/60 lg:col-span-1 lg:row-span-1"
        title="Click to change base wallet"
      >
        <div className="text-[11px] uppercase tracking-[0.16em] text-gold/80">Balance</div>
        <div className="mt-1 font-mono text-2xl font-semibold text-gold">{fmtMoney(balance, currency)}</div>
        <div className="mt-1 font-mono text-xs text-sage">
          base {fmtMoney(baseWallet, currency)}
          <span className="ml-2 text-sage/70 underline decoration-dotted underline-offset-2 group-hover:text-gold">edit</span>
        </div>
      </button>

      <Cell label="Net P/L">
        <span className={`font-mono text-xl font-semibold ${stats.realized >= 0 ? "text-leaf" : "text-blood"}`}>
          {fmtMoney(stats.realized, currency, true)}
        </span>
        <div className={`mt-1 font-mono text-xs ${growth >= 0 ? "text-leaf/80" : "text-blood/80"}`}>
          {growth >= 0 ? "+" : ""}{growth.toFixed(2)}% of base
        </div>
      </Cell>

      <Cell label="Win rate">
        <span className="font-mono text-xl font-semibold text-fog">{(stats.winRate * 100).toFixed(1)}%</span>
        <div className="mt-1 font-mono text-xs text-sage">
          <span className="text-leaf">{stats.wins}W</span> · <span className="text-blood">{stats.losses}L</span>
          {stats.breakeven > 0 && <> · {stats.breakeven}BE</>}
        </div>
      </Cell>

      <Cell label="Profit factor">
        <span className="font-mono text-xl font-semibold text-fog">
          {stats.profitFactor == null ? "—" : stats.profitFactor.toFixed(2)}
        </span>
        <div className="mt-1 font-mono text-xs text-sage">gross win / gross loss</div>
      </Cell>

      <Cell label="Best / worst">
        <div className="font-mono text-sm font-semibold">
          <span className="text-leaf">{fmtMoney(stats.best, currency, true)}</span>
        </div>
        <div className="font-mono text-sm font-semibold">
          <span className="text-blood">{fmtMoney(stats.worst, currency, true)}</span>
        </div>
        {stats.open > 0 && <div className="mt-1 font-mono text-xs text-gold">{stats.open} position{stats.open > 1 ? "s" : ""} open</div>}
      </Cell>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-hedge bg-pine p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-sage">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
