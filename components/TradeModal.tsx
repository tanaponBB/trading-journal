"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  const applySymbol = (s: string) => {
    setSymbol(s.toUpperCase());
    const preset = SYMBOL_PRESETS[s.toUpperCase()];
    if (preset != null) setContractSize(String(preset));
  };

  const save = () => {
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
    onClose();
  };

  const pv = (v: number | null, cls: (n: number) => string) =>
    v == null ? <span className="text-sage/60">—</span> : <span className={cls(v)}>{fmtMoney(v, currency, true)}</span>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-hedge bg-pine p-6 shadow-glow"
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={initial ? "Edit trade" : "New trade"}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">{initial ? "Edit trade" : "New trade"}</h2>
            <p className="font-mono text-xs text-sage">{date}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-hedge px-2.5 py-1 text-sm text-sage transition-colors hover:border-fern hover:text-fog" aria-label="Close">✕</button>
        </div>

        {/* Direction */}
        <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
          {(["LONG", "SHORT"] as const).map(d => (
            <button
              key={d}
              role="radio"
              aria-checked={direction === d}
              onClick={() => setDirection(d)}
              className={`rounded-xl border py-2.5 font-display text-sm font-semibold tracking-wide transition-all ${
                direction === d
                  ? d === "LONG"
                    ? "border-leaf bg-leaf/15 text-leaf shadow-glow"
                    : "border-blood bg-blood/15 text-blood"
                  : "border-hedge text-sage hover:border-fern"
              }`}
            >
              {d === "LONG" ? "▲ LONG" : "▼ SHORT"}
            </button>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="field-label" htmlFor="tj-symbol">Symbol</label>
            <input id="tj-symbol" className="field" list="tj-symbols" value={symbol} onChange={e => applySymbol(e.target.value)} placeholder="XAUUSD" />
            <datalist id="tj-symbols">
              {Object.keys(SYMBOL_PRESETS).map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label className="field-label" htmlFor="tj-contract">Contract / lot</label>
            <input id="tj-contract" className="field" type="number" step="any" value={contractSize} onChange={e => setContractSize(e.target.value)} />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="tj-lots">Lot size</label>
            <input id="tj-lots" className="field" type="number" step="any" value={lots} onChange={e => setLots(e.target.value)} placeholder="0.01" />
          </div>
          <div>
            <label className="field-label" htmlFor="tj-entry">Entry price</label>
            <input id="tj-entry" className="field" type="number" step="any" value={entry} onChange={e => setEntry(e.target.value)} placeholder="2650.00" />
          </div>
          <div>
            <label className="field-label" htmlFor="tj-sl">Stop loss</label>
            <input id="tj-sl" className="field" type="number" step="any" value={sl} onChange={e => setSl(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="field-label" htmlFor="tj-tp">Take profit</label>
            <input id="tj-tp" className="field" type="number" step="any" value={tp} onChange={e => setTp(e.target.value)} placeholder="optional" />
          </div>
        </div>

        {/* Live projection */}
        <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-hedge bg-moss/60 p-3 font-mono text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-sage">At TP</div>
            {pv(atTp, n => (n >= 0 ? "text-leaf" : "text-blood"))}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-sage">At SL</div>
            {pv(atSl, n => (n >= 0 ? "text-leaf" : "text-blood"))}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-sage">R : R</div>
            {rr == null ? <span className="text-sage/60">—</span> : <span className="text-gold">1 : {rr.toFixed(2)}</span>}
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
            <input id="tj-exit" className="field disabled:opacity-40" type="number" step="any" value={exit} onChange={e => setExit(e.target.value)} disabled={status !== "CLOSED"} placeholder={status === "CLOSED" ? "2662.50" : "—"} />
          </div>
          <div>
            <label className="field-label" htmlFor="tj-fees">Fees / swap</label>
            <input id="tj-fees" className="field" type="number" step="any" value={fees} onChange={e => setFees(e.target.value)} placeholder="0.00" />
          </div>
          <div className="flex flex-col justify-end">
            <div className="rounded-lg border border-hedge bg-ink px-3 py-2 font-mono text-sm">
              <span className="mr-2 text-[10px] uppercase tracking-widest text-sage">Realized</span>
              {livePnl == null
                ? <span className="text-sage/60">—</span>
                : <span className={livePnl >= 0 ? "text-leaf" : "text-blood"}>{fmtMoney(livePnl, currency, true)}</span>}
            </div>
          </div>
        </div>

        <div className="mb-5">
          <label className="field-label" htmlFor="tj-notes">Notes</label>
          <textarea id="tj-notes" className="field min-h-[64px] resize-y font-body" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Setup, confluence, session…" />
        </div>

        {error && <p className="mb-3 rounded-lg border border-blood/40 bg-blood/10 px-3 py-2 text-sm text-blood">{error}</p>}

        <div className="flex gap-3">
          <button onClick={save} className="flex-1 rounded-xl bg-leaf py-2.5 font-display font-semibold text-ink transition-transform hover:scale-[1.01] active:scale-[0.99]">
            {initial ? "Save changes" : "Add trade"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-hedge px-5 py-2.5 text-sage transition-colors hover:border-fern hover:text-fog">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
