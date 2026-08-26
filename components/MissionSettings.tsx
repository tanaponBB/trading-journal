"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { MISSION_DEFS, MISSION_ORDER, MissionConfig, MissionKind } from "@/lib/missions";

interface Props {
  missions: MissionConfig[];
  onSave: (m: MissionConfig[]) => void;
  onClose: () => void;
}

export default function MissionSettings({ missions, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<MissionConfig[]>(missions);

  const byKind = (k: MissionKind) =>
    draft.find(m => m.kind === k) ?? { kind: k, target: 0, enabled: false };

  const patch = (k: MissionKind, p: Partial<MissionConfig>) =>
    setDraft(prev => {
      const found = prev.some(m => m.kind === k);
      return found
        ? prev.map(m => (m.kind === k ? { ...m, ...p } : m))
        : [...prev, { ...byKind(k), ...p }];
    });

  const enabledCount = draft.filter(m => m.enabled).length;

  return (
    <Modal label="Daily missions" onClose={onClose} cardClassName="max-w-lg">
      {close => (
        <>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Daily missions</h2>
              <p className="text-xs text-ash">Graded automatically from the day&apos;s trades.</p>
            </div>
            <button onClick={close} className="btn-ghost px-2.5 py-1" aria-label="Close">✕</button>
          </div>

          <ul className="space-y-2">
            {MISSION_ORDER.map(kind => {
              const def = MISSION_DEFS[kind];
              const cfg = byKind(kind);
              return (
                <li
                  key={kind}
                  className={`rounded-lg border p-3 transition-colors ${
                    cfg.enabled ? "border-edge bg-raise/60" : "border-line"
                  }`}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={cfg.enabled}
                      onChange={e => patch(kind, { enabled: e.target.checked })}
                      className="mt-0.5 h-4 w-4 flex-none accent-chalk"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium ${cfg.enabled ? "text-chalk" : "text-ash"}`}>
                        {def.label(cfg.target)}
                      </span>
                      <span className="mt-0.5 block text-xs text-dim">{def.blurb}</span>
                    </span>
                  </label>

                  {def.hasTarget && cfg.enabled && (
                    <div className="mt-3 flex items-center gap-3 pl-7">
                      <input
                        type="range"
                        min={def.min}
                        max={def.max}
                        step={def.step}
                        value={cfg.target}
                        onChange={e => patch(kind, { target: Number(e.target.value) })}
                        className="h-1 flex-1 accent-chalk"
                        aria-label={`Target for ${def.label(cfg.target)}`}
                      />
                      <span className="w-28 flex-none text-right font-mono text-xs text-chalk">
                        {cfg.target}
                        <span className="text-dim"> {def.unit}</span>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {enabledCount === 0 && (
            <p className="mt-4 rounded-lg border border-edge bg-raise px-3 py-2 text-xs text-chalk">
              With no missions enabled there is nothing to pass — days will stay unstamped.
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <button onClick={() => { onSave(draft); close(); }} className="btn-solid flex-1 py-2.5">
              Save missions
            </button>
            <button onClick={close} className="btn-ghost px-5 py-2.5">Cancel</button>
          </div>
        </>
      )}
    </Modal>
  );
}
