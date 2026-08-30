import { NextRequest, NextResponse } from "next/server";
import { computeStats } from "@/lib/calc";
import { authorize, jsonError } from "@/lib/server/api-auth";
import { deleteTrades, listTrades, upsertTrades } from "@/lib/server/store";
import { parseTrades } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/trades — imported trades, newest last. The dashboard polls this on load. */
export async function GET(req: NextRequest) {
  const authed = await authorize(req);
  if (!authed.ok) return authed.response;

  const q = req.nextUrl.searchParams;
  const from = q.get("from") ?? undefined;
  const to = q.get("to") ?? undefined;
  for (const [name, value] of [["from", from], ["to", to]] as const) {
    if (value && !ISO_DATE.test(value)) return jsonError(400, "invalid_date", `\`${name}\` must be YYYY-MM-DD.`);
  }

  const rawLimit = q.get("limit");
  const limit = rawLimit ? Number(rawLimit) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return jsonError(400, "invalid_limit", `\`limit\` must be an integer between 1 and ${MAX_LIMIT}.`);
  }

  const { trades, updatedAt } = await listTrades(authed.actor.userId, {
    from,
    to,
    symbol: q.get("symbol") ?? undefined,
    source: q.get("source") ?? undefined,
    status: q.get("status") ?? undefined,
  });

  const order = q.get("order") === "desc" ? "desc" : "asc";
  const ordered = order === "desc" ? [...trades].reverse() : trades;
  const page = ordered.slice(0, limit);

  return NextResponse.json({
    ok: true,
    count: page.length,
    matched: trades.length,
    truncated: trades.length > page.length,
    updatedAt,
    summary: computeStats(trades),
    trades: page,
  });
}

const MAX_WRITE = 5000;

/**
 * POST /api/trades — insert or replace trades by id.
 * Accepts `{ trades: [...] }`, a bare array, or a single trade object, so the
 * dashboard can push one edit or migrate its whole localStorage journal in one
 * call. Idempotent: re-posting the same rows changes nothing.
 */
export async function POST(req: NextRequest) {
  const authed = await authorize(req);
  if (!authed.ok) return authed.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const raw = Array.isArray(body)
    ? body
    : (body as { trades?: unknown })?.trades ?? (body ? [body] : null);

  if (!Array.isArray(raw)) {
    return jsonError(400, "missing_trades", "Expected a `trades` array, a bare array, or a single trade object.");
  }
  if (raw.length > MAX_WRITE) {
    return jsonError(413, "too_many_trades", `At most ${MAX_WRITE} trades per request, got ${raw.length}.`);
  }

  const parsed = parseTrades(raw);
  if (!parsed.ok) return jsonError(400, "invalid_trade", "One or more trades are invalid.", parsed.errors);

  const { created, updated, total } = await upsertTrades(authed.actor.userId, parsed.value);

  return NextResponse.json({
    ok: true,
    received: parsed.value.length,
    created,
    updated,
    unchanged: parsed.value.length - created - updated,
    stored: total,
    summary: computeStats(parsed.value),
  });
}

/** DELETE /api/trades?id=… | ?source=xm | ?from=&to= | ?all=1 */
export async function DELETE(req: NextRequest) {
  const authed = await authorize(req);
  if (!authed.ok) return authed.response;

  const q = req.nextUrl.searchParams;
  const filter = {
    id: q.get("id") ?? undefined,
    from: q.get("from") ?? undefined,
    to: q.get("to") ?? undefined,
    symbol: q.get("symbol") ?? undefined,
    source: q.get("source") ?? undefined,
  };
  const all = q.get("all") === "1" || q.get("all") === "true";

  if (!all && !Object.values(filter).some(Boolean)) {
    return jsonError(400, "missing_filter", "Pass id, source, symbol, from/to — or all=1 to wipe the store.");
  }

  const { deleted, total } = await deleteTrades(authed.actor.userId, all ? {} : filter);
  return NextResponse.json({ ok: true, deleted, remaining: total });
}
