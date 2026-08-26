"use client";

import { useMemo, useState } from "react";
import SetupCard from "@/components/SetupCard";
import SetupModal from "@/components/SetupModal";
import { DUR, EASE, gsap, useGsap } from "@/lib/anim";
import { isSetupStale, riskReward } from "@/lib/calc";
import { Setup } from "@/lib/types";

interface Props {
  setups: Setup[];
  currency: string;
  /** Date a taken setup is recorded against — always today. */
  takeDate: string;
  onAdd: (s: Omit<Setup, "id" | "createdAt" | "status">) => void;
  onUpdate: (id: string, patch: Partial<Setup>) => void;
  onDelete: (id: string) => void;
  onTake: (s: Setup) => void;
}

type Filter = "active" | "all";

export default function PlanBoard({ setups, currency, takeDate, onAdd, onUpdate, onDelete, onTake }: Props) {
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<Setup | undefined>(undefined);
  const [showModal, setShowModal] = useState(false);

  const shown = useMemo(() => {
    const list = filter === "active"
      ? setups.filter(s => s.status === "WATCHING")
      : setups;
    // freshest plans first, stale ones sink
    return [...list].sort((a, b) => {
      const staleDiff = Number(isSetupStale(a)) - Number(isSetupStale(b));
      if (staleDiff !== 0) return staleDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [setups, filter]);

  const summary = useMemo(() => {
    const watching = setups.filter(s => s.status === "WATCHING");
    const live = watching.filter(s => !isSetupStale(s));
    const rrs = live.map(s => riskReward(s)).filter((n): n is number => n != null);
    return {
      live: live.length,
      stale: watching.length - live.length,
      taken: setups.filter(s => s.status === "TAKEN").length,
      avgRr: rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null,
    };
  }, [setups]);

  const scope = useGsap<HTMLElement>((_self, el) => {
    gsap.fromTo(
      el.querySelectorAll("[data-setup]"),
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: DUR.base, ease: EASE, stagger: 0.05, clearProps: "transform" },
    );
  }, [shown.length, filter]);

  const openNew = () => { setEditing(undefined); setShowModal(true); };

  const save = (draft: Omit<Setup, "id" | "createdAt" | "status">) => {
    if (editing) onUpdate(editing.id, draft);
    else onAdd(draft);
  };

  return (
    <section ref={scope} className="space-y-4 sm:space-y-5">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <h2 className="font-display text-base font-semibold">Setups</h2>
          <p className="mt-1 font-mono text-xs text-ash">
            <span className="text-chalk">{summary.live}</span> watching
            {summary.stale > 0 && <span className="text-dim"> · {summary.stale} expired</span>}
            <span className="text-dim"> · {summary.taken} taken</span>
            {summary.avgRr != null && <span className="text-dim"> · avg 1:{summary.avgRr.toFixed(2)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line p-0.5">
            {(["active", "all"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  filter === f ? "bg-chalk text-canvas" : "text-ash hover:text-chalk"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button onClick={openNew} className="btn-solid px-4 py-2">+ New setup</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="panel p-10 text-center">
          <p className="text-sm text-ash">
            {filter === "active" ? "No setups on the watchlist." : "No setups yet."}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-dim">
            Plan the trade before you take it — symbol, level, stop, target and why. Take it in one
            click when price arrives, and it lands in Record as an open position.
          </p>
          <button onClick={openNew} className="btn-solid mx-auto mt-5 px-4 py-2">+ New setup</button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(s => (
            <SetupCard
              key={s.id}
              setup={s}
              currency={currency}
              onTake={onTake}
              onEdit={t => { setEditing(t); setShowModal(true); }}
              onCancel={id => onUpdate(id, { status: "CANCELLED" })}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      <p className="text-center font-mono text-[11px] text-dim">
        Taking a setup records it as an open trade on {takeDate}, and opens it in Record.
      </p>

      {showModal && (
        <SetupModal
          currency={currency}
          initial={editing}
          onSave={save}
          onClose={() => setShowModal(false)}
        />
      )}
    </section>
  );
}
