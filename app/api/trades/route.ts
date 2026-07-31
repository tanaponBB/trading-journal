import { NextRequest, NextResponse } from "next/server";
import { computeStats } from "@/lib/calc";
import { authorize, jsonError } from "@/lib/server/api-auth";
import { deleteTrades, listTrades } from "@/lib/server/store";

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

  const { trades, updatedAt } = await listTrades({
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

  const { deleted, total } = await deleteTrades(all ? {} : filter);
  return NextResponse.json({ ok: true, deleted, remaining: total });
}
