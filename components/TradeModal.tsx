"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { useCountUp } from "@/lib/anim";
import { Direction, SYMBOL_PRESETS, Trade, TradeStatus } from "@/lib/types";
import { fmtMoney, pnlAtSl, pnlAtTp, riskReward, tradePnl } from "@/lib/calc";

interface Props {
  date: string;
  currency: string;
  initial?: Trade;
  onSave: (t: Omit<Trade, "id">) => void;
  onClose: () => void;
}

const num = (s: string): number | undefined => {
  if (s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export default function TradeModal({ date, currency, initial, onSave, onClose }: Props) {
  const [symbol, setSymbol] = useState(initial?.symbol ?? "XAUUSD");
  const [contractSize, setContractSize] = useState(String(initial?.contractSize ?? SYMBOL_PRESETS["XAUUSD"]));
  const [direction, setDirection] = useState<Direction>(initial?.direction ?? "LONG");
  const [lots, setLots] = useState(initial?.lots != null ? String(initial.lots) : "0.01");
  const [entry, setEntry] = useState(initial?.entry != null ? String(initial.entry) : "");
  const [sl, setSl] = useState(initial?.sl != null ? String(initial.sl) : "");
  const [tp, setTp] = useState(initial?.tp != null ? String(initial.tp) : "");
  const [status, setStatus] = useState<TradeStatus>(initial?.status ?? "OPEN");
  const [exit, setExit] = useState(initial?.exit != null ? String(initial.exit) : "");
  const [fees, setFees] = useState(initial?.fees != null ? String(initial.fees) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");

  const draft = useMemo(() => ({
    direction,
    contractSize: num(contractSize) ?? 0,
    lots: num(lots) ?? 0,
    entry: num(entry) ?? NaN,
    sl: num(sl),
    tp: num(tp),
  }), [direction, contractSize, lots, entry, sl, tp]);

  const validBase = Number.isFinite(draft.entry) && draft.lots > 0 && draft.contractSize > 0;
  const atTp = validBase ? pnlAtTp(draft) : null;
  const atSl = validBase ? pnlAtSl(draft) : null;
  const rr = validBase ? riskReward(draft) : null;

  const livePnl = useMemo(() => {
    if (!validBase || status !== "CLOSED") return null;
    const e = num(exit);
    if (e == null) return null;
    return tradePnl({
      id: "x", date, symbol, status: "CLOSED",
      direction, contractSize: draft.contractSize, lots: draft.lots,
      entry: draft.entry, exit: e, fees: num(fees),
    });
  }, [validBase, status, exit, fees, draft, date, symbol, direction]);

  // The projection row tweens as you type instead of snapping.
  const tpRef = useCountUp(atTp ?? 0, n => fmtMoney(n, currency, true), 0.35);
  const slRef = useCountUp(atSl ?? 0, n => fmtMoney(n, currency, true), 0.35);
  const realizedRef = useCountUp(livePnl ?? 0, n => fmtMoney(n, currency, true), 0.35);

  const applySymbol = (s: string) => {
    setSymbol(s.toUpperCase());
    const preset = SYMBOL_PRESETS[s.toUpperCase()];
    if (preset != null) setContractSize(String(preset));
  };

  const save = (close: () => void) => {
    if (!validBase) return setError("Entry price, lot size and contract size are required.");
    if (status === "CLOSED" && num(exit) == null) return setError("Closed trades need an exit price.");
    setError("");
    onSave({
      date, symbol: symbol || "—",
      contractSize: draft.contractSize,
      direction, lots: draft.lots, entry: draft.entry,
      sl: draft.sl, tp: draft.tp,
      exit: status === "CLOSED" ? num(exit) : undefined,
      fees: num(fees), status, notes: notes.trim() || undefined,
    });
    close();
  };

  const tone = (n: number | null) => (n == null ? "text-dim" : n >= 0 ? "text-up" : "text-down");

  return (
    <Modal label={initial ? "Edit trade" : "New trade"} onClose={onClose} cardClassName="max-w-lg">
      {close => (
        <>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">{initial ? "Edit trade" : "New trade"}</h2>
              <p className="font-mono text-xs text-ash">{date}</p>
            </div>
            <button onClick={close} className="btn-ghost px-2.5 py-1" aria-label="Close">✕</button>
          </div>

          {/* Direction — the selected side inverts to off-white */}
          <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
            {(["LONG", "SHORT"] as const).map(d => (
              <button
                key={d}
                role="radio"
                aria-checked={direction === d}
                onClick={() => setDirection(d)}
                className={`rounded-lg border py-2.5 font-display text-sm font-semibold tracking-wide transition-colors ${
                  direction === d
                    ? "border-chalk bg-chalk text-canvas"
                    : "border-line text-ash hover:border-edge hover:text-chalk"
                }`}
              >
                {d === "LONG" ? "▲ LONG" : "▼ SHORT"}
              </button>
            ))}
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="field-label" htmlFor="tj-symbol">Symbol</label>
              <input id="tj-symbol" className="field" list="tj-symbols" value={symbol}
                onChange={e => applySymbol(e.target.value)} placeholder="XAUUSD" />
              <datalist id="tj-symbols">
                {Object.keys(SYMBOL_PRESETS).map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="field-label" htmlFor="tj-contract">Contract / lot</label>
              <input id="tj-contract" className="field" type="number" step="any" value={contractSize}
                onChange={e => setContractSize(e.target.value)} />
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="tj-lots">Lot size</label>
              <input id="tj-lots" className="field" type="number" step="any" value={lots}
                onChange={e => setLots(e.target.value)} placeholder="0.01" />
            </div>
            <div>
              <label className="field-label" htmlFor="tj-entry">Entry price</label>
              <input id="tj-entry" className="field" type="number" step="any" value={entry}
                onChange={e => setEntry(e.target.value)} placeholder="2650.00" />
            </div>
            <div>
              <label className="field-label" htmlFor="tj-sl">Stop loss</label>
              <input id="tj-sl" className="field" type="number" step="any" value={sl}
                onChange={e => setSl(e.target.value)} placeholder="optional" />
            </div>
            <div>
              <label className="field-label" htmlFor="tj-tp">Take profit</label>
              <input id="tj-tp" className="field" type="number" step="any" value={tp}
                onChange={e => setTp(e.target.value)} placeholder="optional" />
            </div>
          </div>

          {/* Live projection */}
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-line bg-raise/60 p-3 font-mono text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-ash">At TP</div>
              {atTp == null
                ? <span className="text-dim">—</span>
                : <span ref={tpRef} className={`tabular-nums ${tone(atTp)}`}>{fmtMoney(atTp, currency, true)}</span>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-ash">At SL</div>
              {atSl == null
                ? <span className="text-dim">—</span>
                : <span ref={slRef} className={`tabular-nums ${tone(atSl)}`}>{fmtMoney(atSl, currency, true)}</span>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-ash">R : R</div>
              {rr == null ? <span className="text-dim">—</span> : <span className="text-chalk">1 : {rr.toFixed(2)}</span>}
            </div>
          </div>

          {/* Status + exit */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="tj-status">Status</label>
              <select id="tj-status" className="field" value={status} onChange={e => setStatus(e.target.value as TradeStatus)}>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="tj-exit">Exit price</label>
              <input id="tj-exit" className="field disabled:opacity-40" type="number" step="any" value={exit}
                onChange={e => setExit(e.target.value)} disabled={status !== "CLOSED"}
                placeholder={status === "CLOSED" ? "2662.50" : "—"} />
            </div>
            <div>
              <label className="field-label" htmlFor="tj-fees">Fees / swap</label>
              <input id="tj-fees" className="field" type="number" step="any" value={fees}
                onChange={e => setFees(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex flex-col justify-end">
              <div className="rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm">
                <span className="mr-2 text-[10px] uppercase tracking-widest text-ash">Realized</span>
                {livePnl == null
                  ? <span className="text-dim">—</span>
                  : <span ref={realizedRef} className={`tabular-nums ${tone(livePnl)}`}>{fmtMoney(livePnl, currency, true)}</span>}
              </div>
            </div>
          </div>

          <div className="mb-5">
            <label className="field-label" htmlFor="tj-notes">Notes</label>
            <textarea id="tj-notes" className="field min-h-[64px] resize-y font-body" value={notes}
              onChange={e => setNotes(e.target.value)} placeholder="Setup, confluence, session…" />
          </div>

          {error && (
            <p className="mb-3 rounded-lg border border-edge bg-raise px-3 py-2 text-sm text-chalk">{error}</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => save(close)} className="btn-solid flex-1 py-2.5">
              {initial ? "Save changes" : "Add trade"}
            </button>
            <button onClick={close} className="btn-ghost px-5 py-2.5">Cancel</button>
          </div>
        </>
      )}
    </Modal>
  );
}
