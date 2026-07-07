"use client";

import { useEffect, useState } from "react";
import { Settings } from "@/lib/types";

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

const CURRENCIES = ["USD", "THB", "EUR", "GBP", "JPY"];

export default function SettingsModal({ settings, onSave, onClose }: Props) {
  const [baseWallet, setBaseWallet] = useState(String(settings.baseWallet));
  const [currency, setCurrency] = useState(settings.currency);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    const n = Number(baseWallet);
    onSave({ baseWallet: Number.isFinite(n) && n >= 0 ? n : settings.baseWallet, currency });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-hedge bg-pine p-6 shadow-goldglow" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Wallet settings">
        <h2 className="mb-4 font-display text-lg font-semibold">Wallet settings</h2>

        <label className="field-label" htmlFor="tj-base">Base wallet (initial deposit)</label>
        <input id="tj-base" className="field mb-4" type="number" step="any" value={baseWallet} onChange={e => setBaseWallet(e.target.value)} placeholder="1000" />

        <label className="field-label" htmlFor="tj-currency">Currency</label>
        <select id="tj-currency" className="field mb-6" value={currency} onChange={e => setCurrency(e.target.value)}>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex gap-3">
          <button onClick={save} className="flex-1 rounded-xl bg-gold py-2.5 font-display font-semibold text-ink transition-transform hover:scale-[1.01] active:scale-[0.99]">Save</button>
          <button onClick={onClose} className="rounded-xl border border-hedge px-5 py-2.5 text-sage transition-colors hover:border-fern hover:text-fog">Cancel</button>
        </div>
      </div>
    </div>
  );
}
