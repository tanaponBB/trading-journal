"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
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

  const save = (close: () => void) => {
    const n = Number(baseWallet);
    onSave({ baseWallet: Number.isFinite(n) && n >= 0 ? n : settings.baseWallet, currency });
    close();
  };

  return (
    <Modal label="Wallet settings" onClose={onClose} cardClassName="max-w-sm">
      {close => (
        <>
          <h2 className="mb-5 font-display text-lg font-semibold">Wallet settings</h2>

          <label className="field-label" htmlFor="tj-base">Base wallet (initial deposit)</label>
          <input id="tj-base" className="field mb-4" type="number" step="any" value={baseWallet}
            onChange={e => setBaseWallet(e.target.value)} placeholder="1000" />

          <label className="field-label" htmlFor="tj-currency">Currency</label>
          <select id="tj-currency" className="field mb-6" value={currency} onChange={e => setCurrency(e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="flex gap-3">
            <button onClick={() => save(close)} className="btn-solid flex-1 py-2.5">Save</button>
            <button onClick={close} className="btn-ghost px-5 py-2.5">Cancel</button>
          </div>
        </>
      )}
    </Modal>
  );
}
