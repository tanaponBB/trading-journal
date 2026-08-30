import { NextRequest, NextResponse } from "next/server";
import { authorize, jsonError } from "@/lib/server/api-auth";
import { deleteSetup, listSetups, upsertSetups } from "@/lib/server/store";
import { parseSetups } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WRITE = 500;

/** GET /api/setups — planned trades not yet entered, newest first. */
export async function GET(req: NextRequest) {
  const authed = await authorize(req);
  if (!authed.ok) return authed.response;

  const setups = await listSetups(authed.actor.userId);
  return NextResponse.json({ ok: true, count: setups.length, setups });
}

/** POST /api/setups — insert or replace setups by id. */
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
    : (body as { setups?: unknown })?.setups ?? (body ? [body] : null);

  if (!Array.isArray(raw)) {
    return jsonError(400, "missing_setups", "Expected a `setups` array, a bare array, or a single setup object.");
  }
  if (raw.length > MAX_WRITE) {
    return jsonError(413, "too_many_setups", `At most ${MAX_WRITE} setups per request, got ${raw.length}.`);
  }

  const parsed = parseSetups(raw);
  if (!parsed.ok) return jsonError(400, "invalid_setup", "One or more setups are invalid.", parsed.errors);

  const written = await upsertSetups(authed.actor.userId, parsed.value);
  return NextResponse.json({ ok: true, written });
}

/** DELETE /api/setups?id=… */
export async function DELETE(req: NextRequest) {
  const authed = await authorize(req);
  if (!authed.ok) return authed.response;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError(400, "missing_id", "Pass ?id= the setup to delete.");

  const deleted = await deleteSetup(authed.actor.userId, id);
  return NextResponse.json({ ok: true, deleted: deleted ? 1 : 0 });
}
