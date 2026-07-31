import { promises as fs } from "fs";
import path from "path";
import { Trade } from "@/lib/types";

/**
 * Flat-file store for imported trades — the landing zone between the broker
 * scraper (server side) and the dashboard (localStorage, browser side).
 * Swap this module for a database later; the route handlers only use these
 * five functions.
 */

const DATA_DIR = process.env.TJ_DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "trades.json");

interface StoreFile {
  version: 1;
  updatedAt: string;
  trades: Trade[];
}

const EMPTY: StoreFile = { version: 1, updatedAt: new Date(0).toISOString(), trades: [] };

// Serialise writes so two concurrent imports can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function read(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    return { ...EMPTY, ...parsed, trades: Array.isArray(parsed.trades) ? parsed.trades : [] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

async function write(file: StoreFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
  await fs.rename(tmp, FILE); // atomic swap — never leaves a half-written file
}

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

export async function listTrades(filter: TradeFilter = {}): Promise<{ trades: Trade[]; updatedAt: string }> {
  const file = await read();
  const trades = file.trades
    .filter(t => matches(t, filter))
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  return { trades, updatedAt: file.updatedAt };
}

/** Insert-or-replace by `id`. Idempotent: re-posting the same payload is a no-op. */
export async function upsertTrades(incoming: Trade[]): Promise<{ created: number; updated: number; total: number }> {
  return withLock(async () => {
    const file = await read();
    const byId = new Map(file.trades.map(t => [t.id, t]));

    let created = 0;
    let updated = 0;
    for (const t of incoming) {
      const prev = byId.get(t.id);
      if (!prev) created++;
      else if (JSON.stringify(prev) !== JSON.stringify(t)) updated++;
      byId.set(t.id, t);
    }

    const next: StoreFile = { version: 1, updatedAt: new Date().toISOString(), trades: [...byId.values()] };
    await write(next);
    return { created, updated, total: next.trades.length };
  });
}

export async function deleteTrades(filter: TradeFilter & { id?: string }): Promise<{ deleted: number; total: number }> {
  return withLock(async () => {
    const file = await read();
    const keep = file.trades.filter(t => (filter.id ? t.id !== filter.id : !matches(t, filter)));
    const deleted = file.trades.length - keep.length;

    if (deleted > 0) await write({ version: 1, updatedAt: new Date().toISOString(), trades: keep });
    return { deleted, total: keep.length };
  });
}

export const storePath = FILE;
