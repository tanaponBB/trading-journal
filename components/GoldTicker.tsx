"use client";

import { useCountUp } from "@/lib/anim";
import { fmtMoney, fmtNum } from "@/lib/calc";
import { GoldPriceState } from "@/lib/useGoldPrice";

interface Props {
  gold: GoldPriceState;
  floating: number | null; // total floating P/L on open gold trades
  currency: string;
}

export default function GoldTicker({ gold, floating, currency }: Props) {
  const priceRef = useCountUp<HTMLDivElement>(gold.price ?? 0, n => fmtNum(n), 0.6);
  const floatRef = useCountUp<HTMLDivElement>(floating ?? 0, n => fmtMoney(n, currency, true), 0.6);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-2">
      <div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ash">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${gold.error ? "bg-down" : "bg-chalk animate-pulse"}`}
          />
          XAU/USD live
        </div>
        {gold.price != null ? (
          <div ref={priceRef} className="font-mono text-lg font-semibold tabular-nums text-chalk">
            {fmtNum(gold.price)}
          </div>
        ) : (
          <div className="font-mono text-lg font-semibold text-dim">{gold.loading ? "…" : "—"}</div>
        )}
      </div>

      {floating != null && (
        <div className="border-l border-line pl-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-ash">Floating P/L</div>
          <div
            ref={floatRef}
            className={`font-mono text-lg font-semibold tabular-nums ${floating >= 0 ? "text-up" : "text-down"}`}
          >
            {fmtMoney(floating, currency, true)}
          </div>
        </div>
      )}

      <button
        onClick={gold.refresh}
        title={gold.error ? "Price feed unavailable — retry" : "Refresh price"}
        aria-label="Refresh price"
        className="ml-1 rounded-lg border border-line px-2 py-1 text-xs text-ash transition-colors hover:border-edge hover:text-chalk"
      >
        ↻
      </button>
    </div>
  );
}
