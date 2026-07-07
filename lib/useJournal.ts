"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, Trade } from "./types";

const TRADES_KEY = "tj.trades.v1";
const SETTINGS_KEY = "tj.settings.v1";

const DEFAULT_SETTINGS: Settings = { baseWallet: 1000, currency: "USD" };

export function useJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

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

  return { ready, trades, settings, setSettings, addTrade, updateTrade, deleteTrade };
}
