"use client";

import { Setup } from "@/lib/types";
import { fmtMoney, fmtNum, isSetupStale, pnlAtSl, pnlAtTp, riskReward, setupDaysLeft, setupExpiry } from "@/lib/calc";

interface Props {
  setup: Setup;
  currency: string;
  onTake: (s: Setup) => void;
  onEdit: (s: Setup) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Layout follows the reference card the user supplied: a header band, a centred
 * focal block, a muted monospace reference line, and an asterisked validity
 * footnote. Here the focal block is the entry price rather than a QR code.
 */
export default function SetupCard({ setup, currency, onTake, onEdit, onCancel, onDelete }: Props) {
  const long = setup.direction === "LONG";
  const rr = riskReward(setup);
  const atTp = pnlAtTp(setup);
  const atSl = pnlAtSl(setup);
  const stale = isSetupStale(setup);
  const daysLeft = setupDaysLeft(setup);
  const watching = setup.status === "WATCHING";

  return (
    <li
      data-setup
      className={`flex flex-col overflow-hidden rounded-panel border bg-panel transition-colors ${
        stale || !watching ? "border-line opacity-60 hover:opacity-100" : "border-line hover:border-edge"
      }`}
    >
      {/* header band */}
      <div className="flex items-center justify-between gap-2 border-b border-line bg-raise px-4 py-2.5">
        <span
          className={`rounded px-2 py-0.5 font-display text-xs font-bold tracking-wide ${
            long ? "bg-up text-canvas" : "bg-down text-canvas"
          }`}
        >
          {long ? "▲ LONG" : "▼ SHORT"}
        </span>
        <span className="font-mono text-sm font-semibold">{setup.symbol}</span>
      </div>

      {/* focal block — the entry you are waiting for */}
      <div className="px-4 py-5 text-center">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ash">Entry</div>
        <div className="mt-1 font-mono text-3xl font-semibold tabular-nums text-chalk">
          {fmtNum(setup.entry)}
        </div>
        <div className="mt-1 font-mono text-xs text-dim">{fmtNum(setup.lots)} lot</div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 font-mono text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-ash">SL</div>
            <div className="mt-0.5 tabular-nums text-chalk">{setup.sl != null ? fmtNum(setup.sl) : "—"}</div>
            {atSl != null && (
              <div className="tabular-nums text-down">{fmtMoney(atSl, currency, true)}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-ash">TP</div>
            <div className="mt-0.5 tabular-nums text-chalk">{setup.tp != null ? fmtNum(setup.tp) : "—"}</div>
            {atTp != null && (
              <div className="tabular-nums text-up">{fmtMoney(atTp, currency, true)}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-ash">R : R</div>
            <div className="mt-0.5 tabular-nums text-chalk">{rr == null ? "—" : `1 : ${rr.toFixed(2)}`}</div>
          </div>
        </div>
      </div>

      {setup.reason && (
        <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ash">{setup.reason}</p>
      )}

      {/* reference line + validity footnote, mirroring the reference card */}
      <div className="mt-auto border-t border-line px-4 py-3 text-center">
        <div className="font-mono text-[10px] tracking-wider text-dim">{setup.id.replace(/-/g, "").slice(0, 24)}</div>
        <p className="mt-1 text-[11px] text-ash">
          {setup.status === "TAKEN"
            ? "*taken — now tracked in Record"
            : setup.status === "CANCELLED"
              ? "*cancelled"
              : stale
                ? `*expired ${fmtDate(setupExpiry(setup))}`
                : `*valid until ${fmtDate(setupExpiry(setup))} · ${daysLeft}d left`}
        </p>
      </div>

      <div className="flex gap-2 border-t border-line px-4 py-3">
        {watching ? (
          <>
            <button onClick={() => onTake(setup)} className="btn-solid flex-1 px-3 py-1.5 text-xs">
              Take trade
            </button>
            <button onClick={() => onEdit(setup)} className="btn-ghost px-3 py-1.5 text-xs">Edit</button>
            <button
              onClick={() => onCancel(setup.id)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-dim transition-colors hover:border-edge hover:text-chalk"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => onDelete(setup.id)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-dim transition-colors hover:border-edge hover:text-chalk"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}
