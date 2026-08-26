"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { useCountUp } from "@/lib/anim";
import { Direction, SYMBOL_PRESETS, Setup } from "@/lib/types";
import { fmtMoney, pnlAtSl, pnlAtTp, riskReward } from "@/lib/calc";

interface Props {
  currency: string;
  initial?: Setup;
  onSave: (s: Omit<Setup, "id" | "createdAt" | "status">) => void;
  onClose: () => void;
}

const num = (s: string): number | undefined => {
  if (s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const VALID_DAYS = [1, 3, 7, 14, 30];

export default function SetupModal({ currency, initial, onSave, onClose }: Props) {
  const [symbol, setSymbol] = useState(initial?.symbol ?? "XAUUSD");
  const [contractSize, setContractSize] = useState(String(initial?.contractSize ?? SYMBOL_PRESETS["XAUUSD"]));
  const [direction, setDirection] = useState<Direction>(initial?.direction ?? "LONG");
  const [lots, setLots] = useState(initial?.lots != null ? String(initial.lots) : "0.01");
  const [entry, setEntry] = useState(initial?.entry != null ? String(initial.entry) : "");
  const [sl, setSl] = useState(initial?.sl != null ? String(initial.sl) : "");
  const [tp, setTp] = useState(initial?.tp != null ? String(initial.tp) : "");
  const [validDays, setValidDays] = useState(String(initial?.validDays ?? 7));
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [error, setError] = useState("");

  const draft = useMemo(() => ({
    direction,
    contractSize: num(contractSize) ?? 0,
    lots: num(lots) ?? 0,
    entry: num(entry) ?? NaN,
    sl: num(sl),
    tp: num(tp),
  }), [direction, contractSize, lots, entry, sl, tp]);

  const valid = Number.isFinite(draft.entry) && draft.lots > 0 && draft.contractSize > 0;
  const atTp = valid ? pnlAtTp(draft) : null;
  const atSl = valid ? pnlAtSl(draft) : null;
  const rr = valid ? riskReward(draft) : null;

  const tpRef = useCountUp(atTp ?? 0, n => fmtMoney(n, currency, true), 0.35);
  const slRef = useCountUp(atSl ?? 0, n => fmtMoney(n, currency, true), 0.35);

  const applySymbol = (s: string) => {
    setSymbol(s.toUpperCase());
    const preset = SYMBOL_PRESETS[s.toUpperCase()];
    if (preset != null) setContractSize(String(preset));
  };

  const save = (close: () => void) => {
    if (!valid) return setError("Entry price, lot size and contract size are required.");
    setError("");
    onSave({
      symbol: symbol || "—",
      contractSize: draft.contractSize,
      direction,
      lots: draft.lots,
      entry: draft.entry,
      sl: draft.sl,
      tp: draft.tp,
      validDays: Number(validDays) || 7,
      reason: reason.trim() || undefined,
    });
    close();
  };

  return (
    <Modal label={initial ? "Edit setup" : "New setup"} onClose={onClose} cardClassName="max-w-lg">
      {close => (
        <>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">{initial ? "Edit setup" : "New setup"}</h2>
              <p className="text-xs text-ash">A trade you are waiting for — not one you have taken.</p>
            </div>
            <button onClick={close} className="btn-ghost px-2.5 py-1" aria-label="Close">✕</button>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
            {(["LONG", "SHORT"] as const).map(d => (
              <button
                key={d}
                role="radio"
                aria-checked={direction === d}
                onClick={() => setDirection(d)}
                className={`rounded-lg border py-2.5 font-display text-sm font-semibold tracking-wide transition-colors ${
                  direction === d
                    ? d === "LONG"
                      ? "border-up bg-up text-canvas"
                      : "border-down bg-down text-canvas"
                    : "border-line text-ash hover:border-edge hover:text-chalk"
                }`}
              >
                {d === "LONG" ? "▲ LONG" : "▼ SHORT"}
              </button>
            ))}
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="field-label" htmlFor="tj-s-symbol">Symbol</label>
              <input id="tj-s-symbol" className="field" list="tj-s-symbols" value={symbol}
                onChange={e => applySymbol(e.target.value)} placeholder="XAUUSD" />
              <datalist id="tj-s-symbols">
                {Object.keys(SYMBOL_PRESETS).map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="field-label" htmlFor="tj-s-contract">Contract / lot</label>
              <input id="tj-s-contract" className="field" type="number" step="any" value={contractSize}
                onChange={e => setContractSize(e.target.value)} />
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="tj-s-lots">Lot size</label>
              <input id="tj-s-lots" className="field" type="number" step="any" value={lots}
                onChange={e => setLots(e.target.value)} placeholder="0.01" />
            </div>
            <div>
              <label className="field-label" htmlFor="tj-s-entry">Planned entry</label>
              <input id="tj-s-entry" className="field" type="number" step="any" value={entry}
                onChange={e => setEntry(e.target.value)} placeholder="2650.00" />
            </div>
            <div>
              <label className="field-label" htmlFor="tj-s-sl">Stop loss</label>
              <input id="tj-s-sl" className="field" type="number" step="any" value={sl}
                onChange={e => setSl(e.target.value)} placeholder="optional" />
            </div>
            <div>
              <label className="field-label" htmlFor="tj-s-tp">Take profit</label>
              <input id="tj-s-tp" className="field" type="number" step="any" value={tp}
                onChange={e => setTp(e.target.value)} placeholder="optional" />
            </div>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-line bg-raise/60 p-3 font-mono text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-ash">At TP</div>
              {atTp == null
                ? <span className="text-dim">—</span>
                : <span ref={tpRef} className="tabular-nums text-up">{fmtMoney(atTp, currency, true)}</span>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-ash">At SL</div>
              {atSl == null
                ? <span className="text-dim">—</span>
                : <span ref={slRef} className="tabular-nums text-down">{fmtMoney(atSl, currency, true)}</span>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-ash">R : R</div>
              {rr == null ? <span className="text-dim">—</span> : <span className="text-chalk">1 : {rr.toFixed(2)}</span>}
            </div>
          </div>

          <div className="mb-4">
            <label className="field-label" htmlFor="tj-s-valid">Valid for</label>
            <select id="tj-s-valid" className="field" value={validDays} onChange={e => setValidDays(e.target.value)}>
              {VALID_DAYS.map(d => (
                <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>
              ))}
            </select>
          </div>

          <div className="mb-5">
            <label className="field-label" htmlFor="tj-s-reason">Reason</label>
            <textarea id="tj-s-reason" className="field min-h-[64px] resize-y font-body" value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Level, confluence, session, invalidation…" />
          </div>

          {error && (
            <p className="mb-3 rounded-lg border border-edge bg-raise px-3 py-2 text-sm text-chalk">{error}</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => save(close)} className="btn-solid flex-1 py-2.5">
              {initial ? "Save changes" : "Add setup"}
            </button>
            <button onClick={close} className="btn-ghost px-5 py-2.5">Cancel</button>
          </div>
        </>
      )}
    </Modal>
  );
}
