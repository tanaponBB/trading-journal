import { NextRequest, NextResponse } from "next/server";
import { computeStats } from "@/lib/calc";
import { authorize, jsonError } from "@/lib/server/api-auth";
import { recordImportRun, upsertTrades } from "@/lib/server/store";
import { NormalizeOptions, XmOrder, XmPayload, normalizeXmPayload } from "@/lib/xm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ORDERS = 5000;

/**
 * POST /api/import/xm
 * Accepts the XM history scraper payload (or a bare `orders` array), normalises
 * it into journal trades and upserts them by deal id. Safe to re-post.
 */
export async function POST(req: NextRequest) {
  const authed = await authorize(req);
  if (!authed.ok) return authed.response;

  let body: XmPayload | XmOrder[];
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const orders = Array.isArray(body) ? body : body?.orders;
  if (!Array.isArray(orders)) {
    return jsonError(400, "missing_orders", "Expected an `orders` array (or a bare array as the body).");
  }
  if (orders.length > MAX_ORDERS) {
    return jsonError(413, "too_many_orders", `At most ${MAX_ORDERS} orders per request, got ${orders.length}.`);
  }

  const q = req.nextUrl.searchParams;
  const bodyOptions = (Array.isArray(body) ? undefined : (body as { options?: NormalizeOptions }).options) ?? {};
  const options: NormalizeOptions = {
    dateBasis: (q.get("dateBasis") as NormalizeOptions["dateBasis"]) ?? bodyOptions.dateBasis,
    timeSource: (q.get("timeSource") as NormalizeOptions["timeSource"]) ?? bodyOptions.timeSource,
    symbolMap: bodyOptions.symbolMap,
  };
  if (options.dateBasis && !["open", "close"].includes(options.dateBasis)) {
    return jsonError(400, "invalid_option", "dateBasis must be `open` or `close`.");
  }
  if (options.timeSource && !["local", "server"].includes(options.timeSource)) {
    return jsonError(400, "invalid_option", "timeSource must be `local` or `server`.");
  }

  const dryRun = q.get("dryRun") === "1" || q.get("dryRun") === "true";
  const { trades, warnings, skipped } = normalizeXmPayload(body, options);

  const written = dryRun ? null : await upsertTrades(authed.actor.userId, trades, { preserveNotes: true });

  // Audit trail — best-effort, never fails the import.
  await recordImportRun(authed.actor.userId, {
    source: "xm",
    dryRun,
    received: orders.length,
    normalized: trades.length,
    skipped,
    created: written?.created ?? 0,
    updated: written?.updated ?? 0,
    warnings,
  });

  return NextResponse.json({
    ok: true,
    dryRun,
    received: orders.length,
    normalized: trades.length,
    skipped,
    created: written?.created ?? null,
    updated: written?.updated ?? null,
    unchanged: written ? trades.length - written.created - written.updated : null,
    stored: written?.total ?? null,
    summary: computeStats(trades),
    warnings,
    ...(dryRun || q.get("include") === "trades" ? { trades } : {}),
  });
}
