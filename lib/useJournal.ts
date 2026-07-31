"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, Trade } from "./types";

const TRADES_KEY = "tj.trades.v1";
const SETTINGS_KEY = "tj.settings.v1";

const DEFAULT_SETTINGS: Settings = { baseWallet: 1000, currency: "USD" };

export interface SyncState {
  status: "idle" | "syncing" | "ok" | "error";
  added: number;
  updated: number;
  at?: string;
  error?: string;
}

/**
 * Merge server-imported trades into the local list, keyed by trade id.
 * Locally edited notes win — everything else comes from the broker.
 */
function mergeImported(local: Trade[], incoming: Trade[]) {
  const byId = new Map(local.map(t => [t.id, t]));
  let added = 0;
  let updated = 0;

  for (const t of incoming) {
    const prev = byId.get(t.id);
    const next = prev?.notes ? { ...t, notes: prev.notes } : t;
    if (!prev) added++;
    else if (JSON.stringify(prev) !== JSON.stringify(next)) updated++;
    byId.set(t.id, next);
  }

  return { merged: [...byId.values()], added, updated };
}

export function useJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState>({ status: "idle", added: 0, updated: 0 });

  // Lets syncImported() diff against the current list without re-creating itself.
  const tradesRef = useRef<Trade[]>(trades);
  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  useEffect(() => {
    try {
      const t = localStorage.getItem(TRADES_KEY);
      if (t) setTrades(JSON.parse(t));
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
    } catch {
      // corrupted storage — start fresh
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
  }, [trades, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, ready]);

  const addTrade = useCallback((t: Omit<Trade, "id">) => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);
    setTrades(prev => [...prev, { ...t, id }]);
  }, []);

  const updateTrade = useCallback((id: string, patch: Partial<Trade>) => {
    setTrades(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const deleteTrade = useCallback((id: string) => {
    setTrades(prev => prev.filter(t => t.id !== id));
  }, []);

  /** Pull broker-imported trades from /api/trades and merge them in. */
  const syncImported = useCallback(async () => {
    setSync(s => ({ ...s, status: "syncing", error: undefined }));
    try {
      const res = await fetch(`/api/trades?limit=5000`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? `Sync failed (${res.status})`);
      }

      const { merged, added, updated } = mergeImported(tradesRef.current, (json.trades ?? []) as Trade[]);
      if (added || updated) setTrades(merged);
      setSync({ status: "ok", added, updated, at: new Date().toISOString() });
    } catch (err) {
      setSync({ status: "error", added: 0, updated: 0, error: (err as Error).message });
    }
  }, []);

  // Pick up anything the scraper pushed while the tab was closed.
  useEffect(() => {
    if (ready) void syncImported();
  }, [ready, syncImported]);

  return { ready, trades, settings, setSettings, addTrade, updateTrade, deleteTrade, sync, syncImported };
}
