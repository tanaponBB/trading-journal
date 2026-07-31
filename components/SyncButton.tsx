"use client";

import { SyncState } from "@/lib/useJournal";

interface Props {
  sync: SyncState;
  onSync: () => void;
}

/** Pulls broker-imported trades from /api/trades into the journal. */
export default function SyncButton({ sync, onSync }: Props) {
  const label =
    sync.status === "syncing"
      ? "Syncing…"
      : sync.status === "error"
        ? "Sync failed"
        : sync.status === "ok" && (sync.added || sync.updated)
          ? `+${sync.added} new${sync.updated ? ` · ${sync.updated} upd` : ""}`
          : "Sync broker";

  return (
    <button
      onClick={onSync}
      disabled={sync.status === "syncing"}
      title={sync.error ?? (sync.at ? `Last sync ${new Date(sync.at).toLocaleTimeString()}` : "Pull imported trades")}
      className={`rounded-xl border px-4 py-2.5 font-display text-sm font-semibold transition-colors disabled:opacity-60 ${
        sync.status === "error"
          ? "border-blood/50 text-blood hover:border-blood"
          : "border-hedge text-sage hover:border-leaf hover:text-leaf"
      }`}
    >
      {label}
    </button>
  );
}
