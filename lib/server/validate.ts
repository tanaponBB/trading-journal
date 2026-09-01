import { MissionConfig } from "@/lib/missions";
import { PlanConfig, normalizePlan } from "@/lib/plan";
import { Direction, Settings, Setup, SetupStatus, Trade, TradeSource, TradeStatus } from "@/lib/types";
import { Preferences } from "./store";

/**
 * Input validation for the write endpoints. Payloads reach the store from the
 * dashboard *and* from machine callers, so none can be trusted just because it
 * came from our own UI — these checks are what stands between a request and the
 * file on disk, rejecting a bad row with a readable message instead of letting
 * it land malformed.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DIRECTIONS: Direction[] = ["LONG", "SHORT"];
const STATUSES: TradeStatus[] = ["OPEN", "CLOSED"];
const SOURCES: TradeSource[] = ["manual", "xm"];
const SETUP_STATUSES: SetupStatus[] = ["WATCHING", "TAKEN", "CANCELLED"];

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Finite number, accepting the numeric strings a form post can produce. */
function finite(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const blank = (v: unknown) => v == null || v === "";

export function parseTrade(input: unknown, index?: number): Parsed<Trade> {
  const at = index == null ? "" : `trade[${index}]: `;
  const errors: string[] = [];
  const push = (m: string) => errors.push(`${at}${m}`);

  if (!isRecord(input)) return { ok: false, errors: [`${at}must be an object.`] };

  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) push("`id` is required and must be a non-empty string.");

  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (!ISO_DATE.test(date)) push("`date` must be YYYY-MM-DD.");

  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  if (!symbol) push("`symbol` is required.");

  const contractSize = finite(input.contractSize);
  if (contractSize == null || contractSize <= 0) push("`contractSize` must be a number greater than 0.");

  const direction = input.direction as Direction;
  if (!DIRECTIONS.includes(direction)) push("`direction` must be LONG or SHORT.");

  const lots = finite(input.lots);
  if (lots == null || lots <= 0) push("`lots` must be a number greater than 0.");

  const entry = finite(input.entry);
  if (entry == null) push("`entry` must be a number.");

  const status = input.status as TradeStatus;
  if (!STATUSES.includes(status)) push("`status` must be OPEN or CLOSED.");

  // Optional numerics: present-but-unparsable is an error, absent is fine.
  const optional: Record<string, number | undefined> = {};
  for (const key of ["sl", "tp", "exit", "fees"] as const) {
    if (blank(input[key])) continue;
    const value = finite(input[key]);
    if (value == null) push(`\`${key}\` must be a number when present.`);
    else optional[key] = value;
  }

  if (status === "CLOSED" && optional.exit == null) push("closed trades need an `exit` price.");

  const source = blank(input.source) ? "manual" : (input.source as TradeSource);
  if (!SOURCES.includes(source)) push(`\`source\` must be one of ${SOURCES.join(", ")}.`);

  if (!blank(input.notes) && typeof input.notes !== "string") push("`notes` must be a string.");
  if (!blank(input.externalId) && typeof input.externalId !== "string") push("`externalId` must be a string.");

  if (errors.length) return { ok: false, errors };

  const notes = typeof input.notes === "string" ? input.notes.trim() : "";

  return {
    ok: true,
    value: {
      id,
      date,
      symbol,
      contractSize: contractSize as number,
      direction,
      lots: lots as number,
      entry: entry as number,
      ...(optional.sl != null ? { sl: optional.sl } : {}),
      ...(optional.tp != null ? { tp: optional.tp } : {}),
      // An open trade never carries an exit price, whatever the client sent.
      ...(status === "CLOSED" && optional.exit != null ? { exit: optional.exit } : {}),
      ...(optional.fees != null ? { fees: optional.fees } : {}),
      status,
      ...(notes ? { notes } : {}),
      source,
      ...(typeof input.externalId === "string" && input.externalId.trim()
        ? { externalId: input.externalId.trim() }
        : {}),
    },
  };
}

export function parseTrades(input: unknown): Parsed<Trade[]> {
  if (!Array.isArray(input)) return { ok: false, errors: ["Expected a `trades` array."] };

  const errors: string[] = [];
  const trades: Trade[] = [];
  const seen = new Set<string>();

  input.forEach((raw, i) => {
    const parsed = parseTrade(raw, i);
    if (!parsed.ok) return errors.push(...parsed.errors);
    if (seen.has(parsed.value.id)) return errors.push(`trade[${i}]: duplicate id "${parsed.value.id}" in payload.`);
    seen.add(parsed.value.id);
    trades.push(parsed.value);
  });

  return errors.length ? { ok: false, errors } : { ok: true, value: trades };
}

export function parseSetup(input: unknown, index?: number): Parsed<Setup> {
  const at = index == null ? "" : `setup[${index}]: `;
  const errors: string[] = [];
  const push = (m: string) => errors.push(`${at}${m}`);

  if (!isRecord(input)) return { ok: false, errors: [`${at}must be an object.`] };

  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) push("`id` is required.");

  const createdAt = typeof input.createdAt === "string" ? input.createdAt : "";
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) push("`createdAt` must be an ISO timestamp.");

  const validDays = finite(input.validDays);
  if (validDays == null || validDays <= 0) push("`validDays` must be a number greater than 0.");

  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  if (!symbol) push("`symbol` is required.");

  const contractSize = finite(input.contractSize);
  if (contractSize == null || contractSize <= 0) push("`contractSize` must be greater than 0.");

  const direction = input.direction as Direction;
  if (!DIRECTIONS.includes(direction)) push("`direction` must be LONG or SHORT.");

  const lots = finite(input.lots);
  if (lots == null || lots <= 0) push("`lots` must be greater than 0.");

  const entry = finite(input.entry);
  if (entry == null) push("`entry` must be a number.");

  const status = blank(input.status) ? "WATCHING" : (input.status as SetupStatus);
  if (!SETUP_STATUSES.includes(status)) push(`\`status\` must be one of ${SETUP_STATUSES.join(", ")}.`);

  const optional: Record<string, number | undefined> = {};
  for (const key of ["sl", "tp"] as const) {
    if (blank(input[key])) continue;
    const value = finite(input[key]);
    if (value == null) push(`\`${key}\` must be a number when present.`);
    else optional[key] = value;
  }

  if (errors.length) return { ok: false, errors };

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  return {
    ok: true,
    value: {
      id,
      createdAt,
      validDays: validDays as number,
      symbol,
      contractSize: contractSize as number,
      direction,
      lots: lots as number,
      entry: entry as number,
      ...(optional.sl != null ? { sl: optional.sl } : {}),
      ...(optional.tp != null ? { tp: optional.tp } : {}),
      ...(reason ? { reason } : {}),
      status,
      ...(typeof input.tradeId === "string" && input.tradeId.trim()
        ? { tradeId: input.tradeId.trim() }
        : {}),
    },
  };
}

export function parseSetups(input: unknown): Parsed<Setup[]> {
  if (!Array.isArray(input)) return { ok: false, errors: ["Expected a `setups` array."] };

  const errors: string[] = [];
  const setups: Setup[] = [];
  input.forEach((raw, i) => {
    const parsed = parseSetup(raw, i);
    if (!parsed.ok) errors.push(...parsed.errors);
    else setups.push(parsed.value);
  });

  return errors.length ? { ok: false, errors } : { ok: true, value: setups };
}

function parseSettings(input: unknown, errors: string[]): Settings | null {
  if (!isRecord(input)) {
    errors.push("`settings` must be an object.");
    return null;
  }

  const baseWallet = finite(input.baseWallet);
  if (baseWallet == null || baseWallet < 0) errors.push("`settings.baseWallet` must be 0 or more.");

  const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("`settings.currency` must be a 3-letter ISO code.");

  return baseWallet == null ? null : { baseWallet, currency };
}

function parseMissions(input: unknown, errors: string[]): MissionConfig[] {
  if (!Array.isArray(input)) {
    errors.push("`missions` must be an array.");
    return [];
  }

  const out: MissionConfig[] = [];
  input.forEach((raw, i) => {
    if (!isRecord(raw)) return errors.push(`missions[${i}]: must be an object.`);
    const kind = raw.kind;
    const target = finite(raw.target);
    if (typeof kind !== "string" || !kind) errors.push(`missions[${i}]: \`kind\` is required.`);
    if (target == null) errors.push(`missions[${i}]: \`target\` must be a number.`);
    if (typeof raw.enabled !== "boolean") errors.push(`missions[${i}]: \`enabled\` must be a boolean.`);
    if (typeof kind === "string" && target != null && typeof raw.enabled === "boolean") {
      out.push({ kind: kind as MissionConfig["kind"], target, enabled: raw.enabled });
    }
  });
  return out;
}

/**
 * Preferences are written as one object — settings, missions and the plan
 * ladder travel together because the dashboard always has all three in hand.
 */
export function parsePreferences(input: unknown): Parsed<Preferences> {
  if (!isRecord(input)) return { ok: false, errors: ["Body must be an object."] };

  const errors: string[] = [];
  const settings = parseSettings(input.settings, errors);
  const missions = parseMissions(input.missions, errors);

  if (!isRecord(input.plan)) errors.push("`plan` must be an object.");
  // normalizePlan clamps rather than rejects: a ladder is always representable,
  // and silently fixing an out-of-range percent beats refusing the whole save.
  const plan: PlanConfig = normalizePlan(isRecord(input.plan) ? (input.plan as Partial<PlanConfig>) : null);

  if (errors.length || !settings) return { ok: false, errors };
  return { ok: true, value: { settings, missions, plan } };
}
