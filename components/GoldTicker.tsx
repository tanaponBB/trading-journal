"use client";

import { fmtMoney, fmtNum } from "@/lib/calc";
import { GoldPriceState } from "@/lib/useGoldPrice";

interface Props {
  gold: GoldPriceState;
  floating: number | null; // total floating P/L on open gold trades
  currency: string;
}

export default function GoldTicker({ gold, floating, currency }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gold/30 bg-pine px-4 py-2">
      <div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-gold/80">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${gold.error ? "bg-blood" : "bg-leaf animate-pulse"}`} />
          XAU/USD live
        </div>
        <div className="font-mono text-lg font-semibold text-gold">
          {gold.price != null ? fmtNum(gold.price) : gold.loading ? "…" : "—"}
        </div>
      </div>
      {floating != null && (
        <div className="border-l border-hedge pl-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-sage">Floating P/L</div>
          <div className={`font-mono text-lg font-semibold ${floating >= 0 ? "text-leaf" : "text-blood"}`}>
            {fmtMoney(floating, currency, true)}
          </div>
        </div>
      )}
      <button
        onClick={gold.refresh}
        title={gold.error ? "Price feed unavailable — retry" : "Refresh price"}
        className="ml-1 rounded-lg border border-hedge px-2 py-1 text-xs text-sage transition-colors hover:border-fern hover:text-fog"
      >
        ↻
      </button>
    </div>
  );
}
