import { MissionConfig } from "@/lib/missions";
import { PlanConfig, normalizePlan } from "@/lib/plan";
import { Settings, Setup, SetupStatus, Trade, TradeSource, TradeStatus } from "@/lib/types";
import { PAGE_SIZE, chunk, supabase } from "./supabase";

/**
 * Supabase-backed store. The route handlers only use the functions exported
 * here, so the storage engine stays swappable — this module replaced a
 * flat-file implementation with no change to the API surface beyond the
 * `userId` every call now carries.
 *
 * Rows are always scoped by `user_id`; nothing in here can read across users.
 */

const TRADES = "trades";
const SETUPS = "setups";
const PREFERENCES = "preferences";
const USERS = "app_users";
const IMPORT_RUNS = "import_runs";

export const DEFAULT_SETTINGS: Settings = { baseWallet: 1000, currency: "USD" };

const TRADE_COLUMNS =
  "id, date, symbol, contract_size, direction, lots, entry_price, sl, tp, exit_price, fees, status, notes, source, external_id";
const SETUP_COLUMNS =
  "id, created_at, valid_days, symbol, contract_size, direction, lots, entry_price, sl, tp, reason, status, trade_id";

/** Postgres `numeric` can arrive as a string; normalise before it reaches calc.ts. */
const n = (v: number | string | null | undefined): number | undefined =>
  v == null ? undefined : typeof v === "number" ? v : Number(v);

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`Supabase ${context} failed: ${error?.message ?? "unknown error"}`);
}

// ------------------------------------------------------------------ users --

/**
 * Look up the user row for an email, creating it on first sign-in.
 * NextAuth uses stateless JWT sessions, so this is what turns an authenticated
 * email into the `user_id` every other table is keyed by.
 */
export async function resolveUserId(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("resolveUserId requires a non-empty email.");

  const db = supabase();

  const existing = await db.from(USERS).select("id").eq("email", normalized).maybeSingle();
  if (existing.error) fail("user lookup", existing.error);
  if (existing.data) return (existing.data as { id: string }).id;

  // `upsert` rather than `insert` so two concurrent first requests can't race
  // each other into a unique-violation.
  const created = await db
    .from(USERS)
    .upsert({ email: normalized }, { onConflict: "email" })
    .select("id")
    .single();
  if (created.error) fail("user create", created.error);
  return (created.data as { id: string }).id;
}

// ----------------------------------------------------------------- trades --

interface TradeRow {
  id: string;
  date: string;
  symbol: string;
  contract_size: number | string;
  direction: Trade["direction"];
  lots: number | string;
  entry_price: number | string;
  sl: number | string | null;
  tp: number | string | null;
  exit_price: number | string | null;
  fees: number | string | null;
  status: TradeStatus;
  notes: string | null;
  source: TradeSource;
  external_id: string | null;
}

function toTrade(row: TradeRow): Trade {
  const sl = n(row.sl);
  const tp = n(row.tp);
  const exit = n(row.exit_price);
  const fees = n(row.fees);

  return {
    id: row.id,
    date: row.date,
    symbol: row.symbol,
    contractSize: n(row.contract_size) ?? 0,
    direction: row.direction,
    lots: n(row.lots) ?? 0,
    entry: n(row.entry_price) ?? 0,
    ...(sl != null ? { sl } : {}),
    ...(tp != null ? { tp } : {}),
    ...(exit != null ? { exit } : {}),
    ...(fees != null ? { fees } : {}),
    status: row.status,
    ...(row.notes ? { notes: row.notes } : {}),
    source: row.source,
    ...(row.external_id ? { externalId: row.external_id } : {}),
  };
}

function toTradeRow(userId: string, t: Trade): TradeRow & { user_id: string } {
  return {
    user_id: userId,
    id: t.id,
    date: t.date,
    symbol: t.symbol.toUpperCase(),
    contract_size: t.contractSize,
    direction: t.direction,
    lots: t.lots,
    entry_price: t.entry,
    sl: t.sl ?? null,
    tp: t.tp ?? null,
    exit_price: t.exit ?? null,
    fees: t.fees ?? null,
    status: t.status,
    notes: t.notes ?? null,
    source: t.source ?? "manual",
    external_id: t.externalId ?? null,
  };
}

export interface TradeFilter {
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
  symbol?: string;
  source?: string;
  status?: string;
}

/** Apply the shared filter set to a select/delete builder. */
function applyFilter<T>(query: T, filter: TradeFilter): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (filter.from) q = q.gte("date", filter.from);
  if (filter.to) q = q.lte("date", filter.to);
  if (filter.symbol) q = q.ilike("symbol", filter.symbol); // no wildcards → case-insensitive equality
  if (filter.source) q = q.eq("source", filter.source);
  if (filter.status) q = q.eq("status", filter.status);
  return q as T;
}

export async function listTrades(
  userId: string,
  filter: TradeFilter = {},
): Promise<{ trades: Trade[]; updatedAt: string }> {
  const db = supabase();
  const rows: (TradeRow & { updated_at: string })[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await applyFilter(
      db.from(TRADES).select(`${TRADE_COLUMNS}, updated_at`).eq("user_id", userId),
      filter,
    )
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) fail("trade list", error);
    const page = (data ?? []) as (TradeRow & { updated_at: string })[];
    rows.push(...page);
    // A short page means we've reached the end; a full one might not have.
    if (page.length < PAGE_SIZE) break;
  }

  // The old flat file carried a single store-wide `updatedAt`; the equivalent
  // now is the freshest row in the result set.
  const updatedAt = rows.reduce(
    (latest, r) => (r.updated_at > latest ? r.updated_at : latest),
    new Date(0).toISOString(),
  );

  return { trades: rows.map(toTrade), updatedAt };
}

/** Rows the user owns, after `filter`. HEAD count — no rows cross the wire. */
async function countTrades(userId: string, filter: TradeFilter = {}): Promise<number> {
  const { count, error } = await applyFilter(
    supabase().from(TRADES).select("id", { count: "exact", head: true }).eq("user_id", userId),
    filter,
  );
  if (error) fail("trade count", error);
  return count ?? 0;
}

/** True when two trades are identical in every persisted field. */
function sameTrade(a: Trade, b: Trade): boolean {
  return JSON.stringify(toTradeRow("", a)) === JSON.stringify(toTradeRow("", b));
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
 * Insert-or-replace by (user_id, id). Idempotent: re-posting the same payload
 * reports everything as unchanged and writes nothing new.
 */
export async function upsertTrades(
  userId: string,
  incoming: Trade[],
  options: UpsertOptions = {},
): Promise<{ created: number; updated: number; total: number }> {
  const db = supabase();

  if (incoming.length === 0) {
    return { created: 0, updated: 0, total: await countTrades(userId) };
  }

  // Read the rows we're about to touch so created/updated/unchanged stay as
  // accurate as they were under the flat-file store.
  const existing = new Map<string, Trade>();
  for (const ids of chunk(incoming.map(t => t.id))) {
    const { data, error } = await db
      .from(TRADES)
      .select(TRADE_COLUMNS)
      .eq("user_id", userId)
      .in("id", ids);
    if (error) fail("trade preload", error);
    for (const row of (data ?? []) as TradeRow[]) {
      const trade = toTrade(row);
      existing.set(trade.id, trade);
    }
  }

  const resolved = options.preserveNotes
    ? incoming.map(t => {
        const prev = existing.get(t.id);
        return prev?.notes ? { ...t, notes: prev.notes } : t;
      })
    : incoming;

  let created = 0;
  let updated = 0;
  for (const t of resolved) {
    const prev = existing.get(t.id);
    if (!prev) created++;
    else if (!sameTrade(prev, t)) updated++;
  }

  for (const batch of chunk(resolved.map(t => toTradeRow(userId, t)))) {
    const { error } = await db.from(TRADES).upsert(batch, { onConflict: "user_id,id" });
    if (error) fail("trade upsert", error);
  }

  return { created, updated, total: await countTrades(userId) };
}

/** Delete by id, or by filter. An empty filter deletes everything for the user. */
export async function deleteTrades(
  userId: string,
  filter: TradeFilter & { id?: string } = {},
): Promise<{ deleted: number; total: number }> {
  const db = supabase();

  // Count first rather than counting the returned representation: PostgREST
  // caps how many rows a delete echoes back, which would under-report a large
  // wipe even though every row was in fact deleted.
  const before = await countTrades(userId);

  // `user_id` is always pinned, so this can never widen into an unscoped delete.
  let query = db.from(TRADES).delete().eq("user_id", userId);
  if (filter.id) query = query.eq("id", filter.id);
  else query = applyFilter(query, filter);

  const { error } = await query;
  if (error) fail("trade delete", error);

  const total = await countTrades(userId);
  return { deleted: before - total, total };
}

// ----------------------------------------------------------------- setups --

interface SetupRow {
  id: string;
  created_at: string;
  valid_days: number;
  symbol: string;
  contract_size: number | string;
  direction: Setup["direction"];
  lots: number | string;
  entry_price: number | string;
  sl: number | string | null;
  tp: number | string | null;
  reason: string | null;
  status: SetupStatus;
  trade_id: string | null;
}

function toSetup(row: SetupRow): Setup {
  const sl = n(row.sl);
  const tp = n(row.tp);
  return {
    id: row.id,
    createdAt: row.created_at,
    validDays: row.valid_days,
    symbol: row.symbol,
    contractSize: n(row.contract_size) ?? 0,
    direction: row.direction,
    lots: n(row.lots) ?? 0,
    entry: n(row.entry_price) ?? 0,
    ...(sl != null ? { sl } : {}),
    ...(tp != null ? { tp } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
    status: row.status,
    ...(row.trade_id ? { tradeId: row.trade_id } : {}),
  };
}

export async function listSetups(userId: string): Promise<Setup[]> {
  const { data, error } = await supabase()
    .from(SETUPS)
    .select(SETUP_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (error) fail("setup list", error);
  return ((data ?? []) as SetupRow[]).map(toSetup);
}

export async function upsertSetups(userId: string, setups: Setup[]): Promise<number> {
  if (setups.length === 0) return 0;

  const rows = setups.map(s => ({
    user_id: userId,
    id: s.id,
    created_at: s.createdAt,
    valid_days: s.validDays,
    symbol: s.symbol.toUpperCase(),
    contract_size: s.contractSize,
    direction: s.direction,
    lots: s.lots,
    entry_price: s.entry,
    sl: s.sl ?? null,
    tp: s.tp ?? null,
    reason: s.reason ?? null,
    status: s.status,
    trade_id: s.tradeId ?? null,
  }));

  for (const batch of chunk(rows)) {
    const { error } = await supabase().from(SETUPS).upsert(batch, { onConflict: "user_id,id" });
    if (error) fail("setup upsert", error);
  }
  return setups.length;
}

export async function deleteSetup(userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase()
    .from(SETUPS)
    .delete()
    .eq("user_id", userId)
    .eq("id", id)
    .select("id");
  if (error) fail("setup delete", error);
  return (data ?? []).length > 0;
}

// ------------------------------------------------------------ preferences --

export interface Preferences {
  settings: Settings;
  missions: MissionConfig[];
  plan: PlanConfig;
}

interface PreferencesRow {
  base_wallet: number | string;
  currency: string;
  missions: MissionConfig[] | null;
  plan: Partial<PlanConfig> | null;
}

export async function getPreferences(userId: string, fallbackMissions: MissionConfig[]): Promise<Preferences> {
  const { data, error } = await supabase()
    .from(PREFERENCES)
    .select("base_wallet, currency, missions, plan")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("preferences read", error);

  if (!data) {
    return { settings: { ...DEFAULT_SETTINGS }, missions: fallbackMissions, plan: normalizePlan(null) };
  }

  const row = data as PreferencesRow;
  return {
    settings: {
      baseWallet: n(row.base_wallet) ?? DEFAULT_SETTINGS.baseWallet,
      currency: row.currency,
    },
    // An empty array means "never saved", not "every mission disabled" — the
    // column defaults to '[]' when the row is created by a settings-only write.
    missions: row.missions && row.missions.length > 0 ? row.missions : fallbackMissions,
    plan: normalizePlan(row.plan),
  };
}

export async function savePreferences(userId: string, prefs: Preferences): Promise<Preferences> {
  const { data, error } = await supabase()
    .from(PREFERENCES)
    .upsert(
      {
        user_id: userId,
        base_wallet: prefs.settings.baseWallet,
        currency: prefs.settings.currency.toUpperCase(),
        missions: prefs.missions,
        plan: normalizePlan(prefs.plan),
      },
      { onConflict: "user_id" },
    )
    .select("base_wallet, currency, missions, plan")
    .single();
  if (error) fail("preferences write", error);

  const row = data as PreferencesRow;
  return {
    settings: {
      baseWallet: n(row.base_wallet) ?? prefs.settings.baseWallet,
      currency: row.currency,
    },
    missions: row.missions ?? prefs.missions,
    plan: normalizePlan(row.plan),
  };
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
  const { error } = await supabase().from(IMPORT_RUNS).insert({
    user_id: userId,
    source: run.source ?? "xm",
    dry_run: run.dryRun,
    received: run.received,
    normalized: run.normalized,
    skipped: run.skipped,
    created: run.created,
    updated: run.updated,
    warnings: run.warnings,
  });
  if (error) console.error(`import_runs insert failed: ${error.message}`);
}
