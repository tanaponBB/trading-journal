import { SYMBOL_PRESETS, Trade } from "./types";

/**
 * Raw order row as produced by the XM trade-history scraper.
 * Everything is optional — the normaliser falls back to the formatted string
 * variants whenever the `*_num` fields are missing or empty.
 */
export interface XmOrder {
  index?: number;
  deal_id?: string | number;
  order_id?: string | number;
  symbol?: string;
  side?: string;
  side_en?: string;
  type?: string;
  volume?: string;
  volume_num?: number | string;
  open_price?: string;
  open_price_num?: number | string;
  close_price?: string;
  close_price_num?: number | string;
  sl?: string;
  sl_num?: number | string;
  tp?: string;
  tp_num?: number | string;
  pl?: string;
  pl_num?: number | string;
  net_num?: number | string;
  swap_num?: number | string;
  commission_num?: number | string;
  open_time?: string;
  close_time?: string;
  server_open_time?: string;
  server_close_time?: string;
  close_reason?: string;
}

export interface XmPayload {
  ok?: boolean;
  count?: number;
  orders?: XmOrder[];
  accountTotalPnl?: string;
  scrapedAt?: string;
  url?: string;
  summary?: Record<string, unknown>;
}

export interface NormalizeOptions {
  /** Bucket the trade on its open date (default) or its close date. */
  dateBasis?: "open" | "close";
  /** Use the broker's local timestamps (default) or the `server_*` ones. */
  timeSource?: "local" | "server";
  /** Extra broker-symbol → journal-symbol mappings, merged over the defaults. */
  symbolMap?: Record<string, string>;
}

export interface NormalizeWarning {
  index: number | null;
  deal_id: string | null;
  message: string;
}

export interface NormalizeResult {
  trades: Trade[];
  warnings: NormalizeWarning[];
  skipped: number;
}

/** Broker symbols that don't match the journal's naming. */
const SYMBOL_ALIASES: Record<string, string> = {
  GOLD: "XAUUSD",
  XAU: "XAUUSD",
  SILVER: "XAGUSD",
  XAG: "XAGUSD",
  OIL: "USOIL",
  US30CASH: "US30",
  NAS100CASH: "NAS100",
};

/** Volume units that mean "instrument units", not lots (troy ounces, barrels, shares…). */
const UNIT_VOLUME = /ounce|oz|unit|share|barrel|contract|coin|token/i;
const LOT_VOLUME = /lot/i;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Tolerant number parse: accepts 4079.69, "4,079.69", "$21.68", "-$2.22", "" → null. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[^0-9.\-+]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "+") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a broker wall-clock stamp without going through `Date`, so the calendar
 * day never shifts with the server's timezone.
 * Handles "31/07/26, 12:38:04", "31/07/2026 12:38", "2026-07-31T06:48:49Z".
 */
export function parseWallClock(raw?: string): { date: string; time: string | null } | null {
  if (!raw) return null;
  const s = raw.trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, time: iso[4] ?? null };

  const dmy = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:[,\s]+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (!dmy) return null;

  const [, d, m, y, time] = dmy;
  const year = y.length <= 2 ? 2000 + Number(y) : Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    time: time ?? null,
  };
}

function resolveSymbol(raw: string, extra?: Record<string, string>): string {
  const base = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const map = { ...SYMBOL_ALIASES, ...(extra ?? {}) };
  return map[base] ?? map[raw.trim().toUpperCase()] ?? base;
}

function resolveDirection(o: XmOrder): "LONG" | "SHORT" | null {
  const raw = `${o.side_en ?? ""} ${o.side ?? ""}`.toUpperCase();
  if (/BUY|LONG|ซื้อ/.test(raw)) return "LONG";
  if (/SELL|SHORT|ขาย/.test(raw)) return "SHORT";
  return null;
}

/**
 * XM reports metals in troy ounces and FX in lots. Convert either into the
 * journal's (contractSize × lots) model so the P/L formula stays untouched.
 */
function resolveSize(o: XmOrder, contractSize: number): { lots: number; unitWarning: boolean } | null {
  const v = num(o.volume_num) ?? num(o.volume);
  if (v == null || v <= 0) return null;

  const label = o.volume ?? "";
  if (UNIT_VOLUME.test(label)) return { lots: v / contractSize, unitWarning: false };
  if (LOT_VOLUME.test(label)) return { lots: v, unitWarning: false };
  // No recognisable unit — assume lots, the broker-standard default.
  return { lots: v, unitWarning: label.trim().length > 0 };
}

/** Convert one scraped order into a journal trade. Returns null when unusable. */
function normalizeOrder(
  o: XmOrder,
  opts: Required<Pick<NormalizeOptions, "dateBasis" | "timeSource">> & { symbolMap?: Record<string, string> },
  warn: (message: string) => void,
): Trade | null {
  const externalId = o.deal_id != null ? String(o.deal_id) : o.order_id != null ? String(o.order_id) : null;
  if (!externalId) {
    warn("missing deal_id/order_id — cannot dedupe, skipped");
    return null;
  }

  if (!o.symbol) {
    warn("missing symbol, skipped");
    return null;
  }
  const symbol = resolveSymbol(o.symbol, opts.symbolMap);
  const contractSize = SYMBOL_PRESETS[symbol] ?? 1;

  const direction = resolveDirection(o);
  if (!direction) {
    warn(`unrecognised side "${o.side_en ?? o.side ?? ""}", skipped`);
    return null;
  }

  const entry = num(o.open_price_num) ?? num(o.open_price);
  if (entry == null) {
    warn("missing open price, skipped");
    return null;
  }

  const size = resolveSize(o, contractSize);
  if (!size) {
    warn("missing or zero volume, skipped");
    return null;
  }
  if (size.unitWarning) warn(`unrecognised volume unit "${o.volume}" — treated as lots`);

  const exit = num(o.close_price_num) ?? num(o.close_price);
  const openStamp = parseWallClock(opts.timeSource === "server" ? o.server_open_time ?? o.open_time : o.open_time);
  const closeStamp = parseWallClock(opts.timeSource === "server" ? o.server_close_time ?? o.close_time : o.close_time);

  const stamp = opts.dateBasis === "close" ? closeStamp ?? openStamp : openStamp ?? closeStamp;
  if (!stamp) {
    warn("no parsable open/close time, skipped");
    return null;
  }

  const swap = num(o.swap_num) ?? 0;
  const commission = num(o.commission_num) ?? 0;
  const gross = num(o.pl_num) ?? num(o.pl);
  const net = num(o.net_num) ?? (gross != null ? gross + swap + commission : null);

  // The journal derives P/L from prices, so fold swap/commission (and any broker
  // rounding) into `fees` — that makes tradePnl() land exactly on the broker's net.
  // A negative value is a credit, e.g. positive swap.
  let fees: number | undefined;
  if (exit != null && net != null) {
    const grossFromPrices = (exit - entry) * contractSize * size.lots * (direction === "LONG" ? 1 : -1);
    fees = round2(grossFromPrices - net);
  } else if (swap || commission) {
    fees = round2(-(swap + commission));
  }

  const sl = num(o.sl_num) ?? num(o.sl);
  const tp = num(o.tp_num) ?? num(o.tp);

  const notes = [
    o.close_reason?.trim(),
    o.open_time && o.close_time ? `${o.open_time} → ${o.close_time}` : o.open_time,
    `deal ${externalId}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: `xm-${externalId}`,
    date: stamp.date,
    symbol,
    contractSize,
    direction,
    lots: size.lots,
    entry,
    ...(sl != null ? { sl } : {}),
    ...(tp != null ? { tp } : {}),
    ...(exit != null ? { exit } : {}),
    ...(fees != null && fees !== 0 ? { fees } : {}),
    status: exit != null ? "CLOSED" : "OPEN",
    notes,
    source: "xm",
    externalId,
  };
}

/**
 * Normalise a scraper payload (or a bare `orders` array) into journal trades.
 * Bad rows are skipped with a warning rather than failing the whole import.
 */
export function normalizeXmPayload(input: XmPayload | XmOrder[], options: NormalizeOptions = {}): NormalizeResult {
  const orders = Array.isArray(input) ? input : input?.orders ?? [];
  const opts = {
    dateBasis: options.dateBasis ?? ("open" as const),
    timeSource: options.timeSource ?? ("local" as const),
    symbolMap: options.symbolMap,
  };

  const warnings: NormalizeWarning[] = [];
  const trades: Trade[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  orders.forEach((order, i) => {
    const index = order?.index ?? i + 1;
    const dealId = order?.deal_id != null ? String(order.deal_id) : null;
    const warn = (message: string) => warnings.push({ index, deal_id: dealId, message });

    const trade = order ? normalizeOrder(order, opts, warn) : null;
    if (!trade) {
      skipped++;
      return;
    }
    if (seen.has(trade.id)) {
      warnings.push({ index, deal_id: dealId, message: `duplicate deal ${trade.externalId} in payload, skipped` });
      skipped++;
      return;
    }
    seen.add(trade.id);
    trades.push(trade);
  });

  return { trades, warnings, skipped };
}
