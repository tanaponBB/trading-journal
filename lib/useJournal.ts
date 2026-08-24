"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, Trade } from "./types";

const TRADES_KEY = "tj.trades.v1";
const SETTINGS_KEY = "tj.settings.v1";

const DEFAULT_SETTINGS: Settings = { baseWallet: 1000, currency: "USD" };

/**
 * Merge server-imported trades into the local list, keyed by trade id.
 * Locally edited notes win — everything else comes from the broker.
 */
function mergeImported(local: Trade[], incoming: Trade[]) {
  const byId = new Map(local.map(t => [t.id, t]));
  let changed = false;

  for (const t of incoming) {
    const prev = byId.get(t.id);
    const next = prev?.notes ? { ...t, notes: prev.notes } : t;
    if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) changed = true;
    byId.set(t.id, next);
  }

  return { merged: [...byId.values()], changed };
}

export function useJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  // Lets the import pass diff against the current list without re-creating itself.
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

  /**
   * One silent pass on load: pull anything the broker importer pushed while the
   * tab was closed. No UI — trades simply appear in the calendar.
   */
  const pullImported = useCallback(async () => {
    try {
      const res = await fetch(`/api/trades?limit=5000`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;

      const { merged, changed } = mergeImported(tradesRef.current, (json.trades ?? []) as Trade[]);
      if (changed) setTrades(merged);
    } catch {
      // offline or importer not configured — the journal works fine without it
    }
  }, []);

  useEffect(() => {
    if (ready) void pullImported();
  }, [ready, pullImported]);

  return { ready, trades, settings, setSettings, addTrade, updateTrade, deleteTrade };
}
