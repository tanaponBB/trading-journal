import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { MissionConfig } from "@/lib/missions";
import { PlanConfig, normalizePlan } from "@/lib/plan";
import { Settings, Setup, Trade, TradeSource } from "@/lib/types";

/**
 * Local-file store — the source of truth for trades, planned setups and
 * configuration.
 *
 * One JSON file per user under `.data/users/<userId>.json` (gitignored, or set
 * `TJ_DATA_DIR` to put it elsewhere). Every call carries the `userId` it acts
 * as, and nothing in here can read across users.
 *
 * The route handlers use nothing but the functions exported below, so the
 * storage engine stays swappable: moving to a database later means rewriting
 * this one file and leaving the rest of the app alone.
 */

const DATA_DIR = process.env.TJ_DATA_DIR || path.join(process.cwd(), ".data");
const USERS_DIR = path.join(DATA_DIR, "users");

export const DEFAULT_SETTINGS: Settings = { baseWallet: 1000, currency: "USD" };

/** Import audit rows kept per user — enough to debug the last few runs. */
const MAX_IMPORT_RUNS = 50;

// ------------------------------------------------------------------ file --

export interface Preferences {
  settings: Settings;
  missions: MissionConfig[];
  plan: PlanConfig;
}

interface UserFile {
  version: 1;
  updatedAt: string;
  trades: Trade[];
  setups: Setup[];
  /** null until the user saves anything — distinct from "saved the defaults". */
  preferences: Preferences | null;
  importRuns: (ImportRun & { at: string })[];
}

const EMPTY: UserFile = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  trades: [],
  setups: [],
  preferences: null,
  importRuns: [],
};

function fileFor(userId: string): string {
  // userId comes from resolveUserId — hex only — but pin it anyway so a bad
  // caller can never walk out of the data directory.
  if (!/^[0-9a-f-]{8,64}$/.test(userId)) throw new Error("Invalid userId.");
  return path.join(USERS_DIR, `${userId}.json`);
}

async function read(userId: string): Promise<UserFile> {
  try {
    const raw = await fs.readFile(fileFor(userId), "utf8");
    const parsed = JSON.parse(raw) as Partial<UserFile>;
    return {
      ...EMPTY,
      ...parsed,
      trades: Array.isArray(parsed.trades) ? parsed.trades : [],
      setups: Array.isArray(parsed.setups) ? parsed.setups : [],
      importRuns: Array.isArray(parsed.importRuns) ? parsed.importRuns : [],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

async function write(userId: string, file: UserFile): Promise<void> {
  await fs.mkdir(USERS_DIR, { recursive: true });
  const target = fileFor(userId);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ ...file, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  await fs.rename(tmp, target); // atomic swap — never leaves a half-written file
}

/**
 * Serialise writes per user so two concurrent imports can't clobber each
 * other: a read-modify-write here is only safe if nothing interleaves.
 */
const queues = new Map<string, Promise<unknown>>();

function withLock<T>(userId: string, fn: (file: UserFile) => Promise<T>): Promise<T> {
  const prior = queues.get(userId) ?? Promise.resolve();
  const run = prior.then(
    () => read(userId).then(fn),
    () => read(userId).then(fn),
  );
  queues.set(
    userId,
    run.catch(() => undefined),
  );
  return run;
}

// ------------------------------------------------------------------ users --

/**
 * The id every table is keyed by, derived from the email.
 *
 * The database version inserted a row and handed back its uuid; here the id is
 * a hash of the email instead, so it is stable across restarts without a
 * registry file to keep in sync (and without a race on first sign-in).
 */
export async function resolveUserId(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("resolveUserId requires a non-empty email.");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

// ----------------------------------------------------------------- trades --

export interface TradeFilter {
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
  symbol?: string;
  source?: string;
  status?: string;
}

function matches(t: Trade, f: TradeFilter): boolean {
  if (f.from && t.date < f.from) return false;
  if (f.to && t.date > f.to) return false;
  if (f.symbol && t.symbol.toUpperCase() !== f.symbol.toUpperCase()) return false;
  if (f.source && (t.source ?? "manual") !== f.source) return false;
  if (f.status && t.status !== f.status) return false;
  return true;
}

/** Canonical form, so `symbol` case and absent-vs-undefined don't fake a change. */
function normalizeTrade(t: Trade): Trade {
  return {
    id: t.id,
    date: t.date,
    symbol: t.symbol.toUpperCase(),
    contractSize: t.contractSize,
    direction: t.direction,
    lots: t.lots,
    entry: t.entry,
    ...(t.sl != null ? { sl: t.sl } : {}),
    ...(t.tp != null ? { tp: t.tp } : {}),
    ...(t.exit != null ? { exit: t.exit } : {}),
    ...(t.fees != null ? { fees: t.fees } : {}),
    status: t.status,
    ...(t.notes ? { notes: t.notes } : {}),
    source: t.source ?? "manual",
    ...(t.externalId ? { externalId: t.externalId } : {}),
  };
}

const sameTrade = (a: Trade, b: Trade) => JSON.stringify(normalizeTrade(a)) === JSON.stringify(normalizeTrade(b));

const byDateThenId = (a: Trade, b: Trade) =>
  a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date);

export async function listTrades(
  userId: string,
  filter: TradeFilter = {},
): Promise<{ trades: Trade[]; updatedAt: string }> {
  const file = await read(userId);
  return {
    trades: file.trades.filter(t => matches(t, filter)).sort(byDateThenId),
    updatedAt: file.updatedAt,
  };
}

export interface UpsertOptions {
  /**
   * Keep the notes already on a row instead of overwriting them.
   *
   * The XM importer synthesises a note (close reason, timestamps, deal id) for
   * every order, so without this a re-import would wipe whatever the user wrote
   * on that trade. Imports set it; dashboard edits do not, because there the
   * new note *is* the user's intent.
   */
  preserveNotes?: boolean;
}

/**
 * Insert-or-replace by `id`. Idempotent: re-posting the same payload reports
 * everything as unchanged and writes nothing new.
 */
export async function upsertTrades(
  userId: string,
  incoming: Trade[],
  options: UpsertOptions = {},
): Promise<{ created: number; updated: number; total: number }> {
  if (incoming.length === 0) {
    const file = await read(userId);
    return { created: 0, updated: 0, total: file.trades.length };
  }

  return withLock(userId, async file => {
    const byId = new Map(file.trades.map(t => [t.id, t]));

    let created = 0;
    let updated = 0;
    for (const raw of incoming) {
      const prev = byId.get(raw.id);
      const next = normalizeTrade(
        options.preserveNotes && prev?.notes ? { ...raw, notes: prev.notes } : raw,
      );

      if (!prev) created++;
      else if (!sameTrade(prev, next)) updated++;
      byId.set(next.id, next);
    }

    const trades = [...byId.values()].sort(byDateThenId);
    if (created > 0 || updated > 0) await write(userId, { ...file, trades });
    return { created, updated, total: trades.length };
  });
}

/** Delete by id, or by filter. An empty filter deletes everything for the user. */
export async function deleteTrades(
  userId: string,
  filter: TradeFilter & { id?: string } = {},
): Promise<{ deleted: number; total: number }> {
  return withLock(userId, async file => {
    const keep = file.trades.filter(t => (filter.id ? t.id !== filter.id : !matches(t, filter)));
    const deleted = file.trades.length - keep.length;

    if (deleted > 0) await write(userId, { ...file, trades: keep });
    return { deleted, total: keep.length };
  });
}

// ----------------------------------------------------------------- setups --

function normalizeSetup(s: Setup): Setup {
  return {
    id: s.id,
    createdAt: s.createdAt,
    validDays: s.validDays,
    symbol: s.symbol.toUpperCase(),
    contractSize: s.contractSize,
    direction: s.direction,
    lots: s.lots,
    entry: s.entry,
    ...(s.sl != null ? { sl: s.sl } : {}),
    ...(s.tp != null ? { tp: s.tp } : {}),
    ...(s.reason ? { reason: s.reason } : {}),
    status: s.status,
    ...(s.tradeId ? { tradeId: s.tradeId } : {}),
  };
}

export async function listSetups(userId: string): Promise<Setup[]> {
  const file = await read(userId);
  return [...file.setups].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function upsertSetups(userId: string, setups: Setup[]): Promise<number> {
  if (setups.length === 0) return 0;

  return withLock(userId, async file => {
    const byId = new Map(file.setups.map(s => [s.id, s]));
    for (const s of setups) byId.set(s.id, normalizeSetup(s));

    await write(userId, { ...file, setups: [...byId.values()] });
    return setups.length;
  });
}

export async function deleteSetup(userId: string, id: string): Promise<boolean> {
  return withLock(userId, async file => {
    const keep = file.setups.filter(s => s.id !== id);
    if (keep.length === file.setups.length) return false;

    await write(userId, { ...file, setups: keep });
    return true;
  });
}

// ------------------------------------------------------------ preferences --

export async function getPreferences(userId: string, fallbackMissions: MissionConfig[]): Promise<Preferences> {
  const file = await read(userId);
  const saved = file.preferences;

  if (!saved) {
    return { settings: { ...DEFAULT_SETTINGS }, missions: fallbackMissions, plan: normalizePlan(null) };
  }

  return {
    settings: {
      baseWallet: saved.settings?.baseWallet ?? DEFAULT_SETTINGS.baseWallet,
      currency: saved.settings?.currency ?? DEFAULT_SETTINGS.currency,
    },
    // An empty array means "never saved", not "every mission disabled" — a
    // settings-only write leaves the list untouched.
    missions: saved.missions && saved.missions.length > 0 ? saved.missions : fallbackMissions,
    plan: normalizePlan(saved.plan),
  };
}

export async function savePreferences(userId: string, prefs: Preferences): Promise<Preferences> {
  return withLock(userId, async file => {
    const preferences: Preferences = {
      settings: {
        baseWallet: prefs.settings.baseWallet,
        currency: prefs.settings.currency.toUpperCase(),
      },
      missions: prefs.missions,
      plan: normalizePlan(prefs.plan),
    };

    await write(userId, { ...file, preferences });
    return preferences;
  });
}

// ------------------------------------------------------------ import runs --

export interface ImportRun {
  source?: TradeSource;
  dryRun: boolean;
  received: number;
  normalized: number;
  skipped: number;
  created: number;
  updated: number;
  warnings: unknown[];
}

/**
 * Audit row for one import. Best-effort: a failure here must not fail an import
 * whose trades already landed, so the error is swallowed and logged.
 */
export async function recordImportRun(userId: string, run: ImportRun): Promise<void> {
  try {
    await withLock(userId, async file => {
      const entry = { ...run, source: run.source ?? "xm", at: new Date().toISOString() } as ImportRun & { at: string };
      const importRuns = [entry, ...file.importRuns].slice(0, MAX_IMPORT_RUNS);
      await write(userId, { ...file, importRuns });
    });
  } catch (err) {
    console.error("import run record failed:", err);
  }
}

/** Where a user's journal lives on disk — handy in errors and tooling. */
export const storePathFor = (userId: string) => fileFor(userId);
