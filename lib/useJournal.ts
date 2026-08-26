"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MISSIONS, MissionConfig } from "./missions";
import { Settings, Setup, Trade } from "./types";

const TRADES_KEY = "tj.trades.v1";
const SETUPS_KEY = "tj.setups.v1";
const MISSIONS_KEY = "tj.missions.v1";
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

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);

export function useJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [setups, setSetups] = useState<Setup[]>([]);
  const [missions, setMissions] = useState<MissionConfig[]>(DEFAULT_MISSIONS);
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
      const p = localStorage.getItem(SETUPS_KEY);
      if (p) setSetups(JSON.parse(p));
      const m = localStorage.getItem(MISSIONS_KEY);
      if (m) setMissions(JSON.parse(m));
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

  useEffect(() => {
    if (ready) localStorage.setItem(SETUPS_KEY, JSON.stringify(setups));
  }, [setups, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(MISSIONS_KEY, JSON.stringify(missions));
  }, [missions, ready]);

  const addTrade = useCallback((t: Omit<Trade, "id">) => {
    const id = newId();
    setTrades(prev => [...prev, { ...t, id }]);
    return id;
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

  const addSetup = useCallback((s: Omit<Setup, "id" | "createdAt" | "status">) => {
    setSetups(prev => [
      { ...s, id: newId(), createdAt: new Date().toISOString(), status: "WATCHING" },
      ...prev,
    ]);
  }, []);

  const updateSetup = useCallback((id: string, patch: Partial<Setup>) => {
    setSetups(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const deleteSetup = useCallback((id: string) => {
    setSetups(prev => prev.filter(s => s.id !== id));
  }, []);

  /**
   * Promote a planned setup into a real open trade on `date`, and keep the
   * setup around (marked TAKEN) so the plan-vs-outcome trail survives.
   */
  const takeSetup = useCallback((setup: Setup, date: string) => {
    if (setup.status !== "WATCHING") return;
    const tradeId = newId();
    setTrades(prev => [...prev, {
      id: tradeId,
      date,
      symbol: setup.symbol,
      contractSize: setup.contractSize,
      direction: setup.direction,
      lots: setup.lots,
      entry: setup.entry,
      sl: setup.sl,
      tp: setup.tp,
      status: "OPEN",
      notes: setup.reason,
      source: "manual",
    }]);
    setSetups(prev => prev.map(s => (s.id === setup.id ? { ...s, status: "TAKEN", tradeId } : s)));
    return tradeId;
  }, []);

  return {
    ready, trades, settings, setSettings, addTrade, updateTrade, deleteTrade,
    setups, addSetup, updateSetup, deleteSetup, takeSetup,
    missions, setMissions,
  };
}
