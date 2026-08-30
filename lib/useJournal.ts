"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MISSIONS, MissionConfig } from "./missions";
import { DEFAULT_PLAN, PlanConfig, normalizePlan } from "./plan";
import { Settings, Setup, Trade } from "./types";

/**
 * Journal state, backed by Supabase through the /api routes.
 *
 * localStorage is still written on every change, but it is now a *cache*, not
 * the source of truth: it paints the last-known journal instantly on load and
 * keeps the app readable when the network is down. The server always wins once
 * it answers.
 *
 * Writes are optimistic — the UI updates immediately and rolls back if the
 * request fails — so editing feels the same as it did against localStorage.
 */

const TRADES_KEY = "tj.trades.v1";
const SETUPS_KEY = "tj.setups.v1";
const MISSIONS_KEY = "tj.missions.v1";
const SETTINGS_KEY = "tj.settings.v1";
const PLAN_KEY = "tj.plan.v1";
/** Set once the browser's pre-database journal has been pushed to the server. */
const MIGRATED_KEY = "tj.migrated.v1";

const DEFAULT_SETTINGS: Settings = { baseWallet: 1000, currency: "USD" };

export type SyncState = "idle" | "syncing" | "offline" | "error";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);

function readCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback; // corrupted storage — start fresh
  }
}

function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota or private mode — the cache is optional, the server has the data
  }
}

/** Thin fetch wrapper: throws on transport failure or a non-ok API envelope. */
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init?.headers } : init?.headers,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error?.message ?? `Request to ${url} failed (${res.status}).`);
  }
  return json as T;
}

interface PrefsResponse {
  settings: Settings;
  missions: MissionConfig[];
  plan: PlanConfig;
}

export function useJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [setups, setSetups] = useState<Setup[]>([]);
  const [missions, setMissionsState] = useState<MissionConfig[]>(DEFAULT_MISSIONS);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [plan, setPlanState] = useState<PlanConfig>(DEFAULT_PLAN);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  // Refs let async handlers roll back against state as it was, without
  // re-creating every callback each time something changes.
  const tradesRef = useRef(trades);
  const setupsRef = useRef(setups);
  const settingsRef = useRef(settings);
  const missionsRef = useRef(missions);
  const planRef = useRef(plan);
  useEffect(() => { tradesRef.current = trades; }, [trades]);
  useEffect(() => { setupsRef.current = setups; }, [setups]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { missionsRef.current = missions; }, [missions]);
  useEffect(() => { planRef.current = plan; }, [plan]);

  // ------------------------------------------------------------- caching --

  useEffect(() => { if (ready) writeCache(TRADES_KEY, trades); }, [trades, ready]);
  useEffect(() => { if (ready) writeCache(SETUPS_KEY, setups); }, [setups, ready]);
  useEffect(() => { if (ready) writeCache(MISSIONS_KEY, missions); }, [missions, ready]);
  useEffect(() => { if (ready) writeCache(SETTINGS_KEY, settings); }, [settings, ready]);
  useEffect(() => { if (ready) writeCache(PLAN_KEY, plan); }, [plan, ready]);

  // --------------------------------------------------------- initial load --

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      // 1. Paint from cache immediately so the calendar isn't blank while we
      //    talk to the server.
      const cachedTrades = readCache<Trade[]>(TRADES_KEY, []);
      const cachedSetups = readCache<Setup[]>(SETUPS_KEY, []);
      const cachedMissions = readCache<MissionConfig[]>(MISSIONS_KEY, DEFAULT_MISSIONS);
      const cachedSettings = { ...DEFAULT_SETTINGS, ...readCache<Partial<Settings>>(SETTINGS_KEY, {}) };
      const cachedPlan = normalizePlan(readCache<Partial<PlanConfig>>(PLAN_KEY, {}));

      if (!cancelled) {
        setTrades(cachedTrades);
        setSetups(cachedSetups);
        setMissionsState(cachedMissions);
        setSettingsState(cachedSettings);
        setPlanState(cachedPlan);
        setReady(true);
      }

      // 2. Reconcile with the database.
      setSync("syncing");
      try {
        const [tradeRes, prefsRes, setupRes] = await Promise.all([
          api<{ trades: Trade[] }>(`/api/trades?limit=5000`),
          api<PrefsResponse>(`/api/preferences`),
          api<{ setups: Setup[] }>(`/api/setups`),
        ]);
        if (cancelled) return;

        let serverTrades = tradeRes.trades ?? [];
        let serverSetups = setupRes.setups ?? [];
        let serverPrefs = prefsRes;

        // 3. One-time hand-off from the pre-database build.
        if (localStorage.getItem(MIGRATED_KEY) !== "1") {
          const serverTradeIds = new Set(serverTrades.map(t => t.id));
          const orphanTrades = cachedTrades.filter(t => !serverTradeIds.has(t.id));
          if (orphanTrades.length) {
            await api(`/api/trades`, { method: "POST", body: JSON.stringify({ trades: orphanTrades }) });
            serverTrades = (await api<{ trades: Trade[] }>(`/api/trades?limit=5000`)).trades ?? [];
          }

          const serverSetupIds = new Set(serverSetups.map(s => s.id));
          const orphanSetups = cachedSetups.filter(s => !serverSetupIds.has(s.id));
          if (orphanSetups.length) {
            await api(`/api/setups`, { method: "POST", body: JSON.stringify({ setups: orphanSetups }) });
            serverSetups = (await api<{ setups: Setup[] }>(`/api/setups`)).setups ?? [];
          }

          // Config carries over only if it was actually customised.
          const customised =
            cachedSettings.baseWallet !== DEFAULT_SETTINGS.baseWallet ||
            cachedSettings.currency !== DEFAULT_SETTINGS.currency ||
            JSON.stringify(cachedPlan) !== JSON.stringify(DEFAULT_PLAN) ||
            JSON.stringify(cachedMissions) !== JSON.stringify(DEFAULT_MISSIONS);

          if (customised) {
            serverPrefs = await api<PrefsResponse>(`/api/preferences`, {
              method: "PUT",
              body: JSON.stringify({
                settings: cachedSettings,
                missions: cachedMissions,
                plan: cachedPlan,
              }),
            });
          }

          localStorage.setItem(MIGRATED_KEY, "1");
        }

        if (cancelled) return;
        setTrades(serverTrades);
        setSetups(serverSetups);
        setSettingsState(serverPrefs.settings ?? DEFAULT_SETTINGS);
        setMissionsState(serverPrefs.missions ?? DEFAULT_MISSIONS);
        setPlanState(normalizePlan(serverPrefs.plan));
        setSync("idle");
        setSyncError(null);
      } catch (err) {
        if (cancelled) return;
        // Keep showing the cache — the journal stays readable offline.
        setSync("offline");
        setSyncError(err instanceof Error ? err.message : "Could not reach the server.");
      }
    };

    void boot();
    return () => { cancelled = true; };
  }, []);

  // -------------------------------------------------------------- writes --

  /** Run a persist call, reporting sync state; roll back through `undo` on failure. */
  const persist = useCallback(async (run: () => Promise<unknown>, undo: () => void) => {
    setSync("syncing");
    try {
      await run();
      setSync("idle");
      setSyncError(null);
    } catch (err) {
      undo();
      setSync("error");
      setSyncError(err instanceof Error ? err.message : "Could not save the change.");
    }
  }, []);

  const putTrades = (list: Trade[]) =>
    api(`/api/trades`, { method: "POST", body: JSON.stringify({ trades: list }) });

  const addTrade = useCallback((t: Omit<Trade, "id">) => {
    const trade: Trade = { ...t, id: newId(), source: t.source ?? "manual" };
    const rollback = tradesRef.current;
    setTrades(prev => [...prev, trade]);
    void persist(() => putTrades([trade]), () => setTrades(rollback));
    return trade.id;
  }, [persist]);

  const updateTrade = useCallback((id: string, patch: Partial<Trade>) => {
    const current = tradesRef.current.find(t => t.id === id);
    if (!current) return;
    const merged: Trade = { ...current, ...patch, id };
    const rollback = tradesRef.current;
    setTrades(prev => prev.map(t => (t.id === id ? merged : t)));
    void persist(() => putTrades([merged]), () => setTrades(rollback));
  }, [persist]);

  const deleteTrade = useCallback((id: string) => {
    const rollback = tradesRef.current;
    setTrades(prev => prev.filter(t => t.id !== id));
    void persist(
      () => api(`/api/trades?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
      () => setTrades(rollback),
    );
  }, [persist]);

  // ------------------------------------------------------------- setups --

  const putSetups = (list: Setup[]) =>
    api(`/api/setups`, { method: "POST", body: JSON.stringify({ setups: list }) });

  const addSetup = useCallback((s: Omit<Setup, "id" | "createdAt" | "status">) => {
    const setup: Setup = { ...s, id: newId(), createdAt: new Date().toISOString(), status: "WATCHING" };
    const rollback = setupsRef.current;
    setSetups(prev => [setup, ...prev]);
    void persist(() => putSetups([setup]), () => setSetups(rollback));
  }, [persist]);

  const updateSetup = useCallback((id: string, patch: Partial<Setup>) => {
    const current = setupsRef.current.find(s => s.id === id);
    if (!current) return;
    const merged: Setup = { ...current, ...patch, id };
    const rollback = setupsRef.current;
    setSetups(prev => prev.map(s => (s.id === id ? merged : s)));
    void persist(() => putSetups([merged]), () => setSetups(rollback));
  }, [persist]);

  const deleteSetup = useCallback((id: string) => {
    const rollback = setupsRef.current;
    setSetups(prev => prev.filter(s => s.id !== id));
    void persist(
      () => api(`/api/setups?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
      () => setSetups(rollback),
    );
  }, [persist]);

  /**
   * Promote a planned setup into a real open trade on `date`, and keep the
   * setup around (marked TAKEN) so the plan-vs-outcome trail survives.
   * Both writes go up together — a half-applied promotion would leave a setup
   * pointing at a trade that was never saved.
   */
  const takeSetup = useCallback((setup: Setup, date: string) => {
    if (setup.status !== "WATCHING") return;

    const tradeId = newId();
    const trade: Trade = {
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
    };
    const taken: Setup = { ...setup, status: "TAKEN", tradeId };

    const rollbackTrades = tradesRef.current;
    const rollbackSetups = setupsRef.current;
    setTrades(prev => [...prev, trade]);
    setSetups(prev => prev.map(s => (s.id === setup.id ? taken : s)));

    void persist(
      async () => {
        await putTrades([trade]);
        await putSetups([taken]);
      },
      () => { setTrades(rollbackTrades); setSetups(rollbackSetups); },
    );
    return tradeId;
  }, [persist]);

  // --------------------------------------------------------- preferences --

  /**
   * Settings, missions and the plan share one row, so every config write sends
   * all three — merged from refs so a save never clobbers a sibling that
   * changed a moment earlier.
   */
  const savePrefs = useCallback((patch: Partial<PrefsResponse>) => {
    const before = {
      settings: settingsRef.current,
      missions: missionsRef.current,
      plan: planRef.current,
    };
    const next: PrefsResponse = { ...before, ...patch };

    if (patch.settings) setSettingsState(patch.settings);
    if (patch.missions) setMissionsState(patch.missions);
    if (patch.plan) setPlanState(normalizePlan(patch.plan));

    void persist(
      async () => {
        const saved = await api<PrefsResponse>(`/api/preferences`, {
          method: "PUT",
          body: JSON.stringify(next),
        });
        setSettingsState(saved.settings);
        setMissionsState(saved.missions);
        setPlanState(normalizePlan(saved.plan));
      },
      () => {
        setSettingsState(before.settings);
        setMissionsState(before.missions);
        setPlanState(before.plan);
      },
    );
  }, [persist]);

  const setSettings = useCallback((s: Settings) => savePrefs({ settings: s }), [savePrefs]);
  const setMissions = useCallback((m: MissionConfig[]) => savePrefs({ missions: m }), [savePrefs]);
  const setPlan = useCallback((p: PlanConfig) => savePrefs({ plan: normalizePlan(p) }), [savePrefs]);

  return {
    ready, trades, settings, setSettings, addTrade, updateTrade, deleteTrade,
    setups, addSetup, updateSetup, deleteSetup, takeSetup,
    missions, setMissions,
    plan, setPlan,
    sync, syncError,
  };
}
