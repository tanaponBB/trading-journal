import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MISSIONS } from "@/lib/missions";
import { authorize, jsonError } from "@/lib/server/api-auth";
import { getPreferences, savePreferences } from "@/lib/server/store";
import { parsePreferences } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wallet settings, daily missions and the plan ladder — previously all
 * browser-only. Moving them server-side is what makes the journal read the same
 * on every device. They travel as one object because the dashboard always holds
 * all three and writes them together.
 */

/** GET /api/preferences — the caller's config, or the defaults if never saved. */
export async function GET(req: NextRequest) {
  const authed = await authorize(req);
  if (!authed.ok) return authed.response;

  const preferences = await getPreferences(authed.actor.userId, DEFAULT_MISSIONS);
  return NextResponse.json({ ok: true, ...preferences });
}

/** PUT /api/preferences — replace the caller's config. */
export async function PUT(req: NextRequest) {
  const authed = await authorize(req);
  if (!authed.ok) return authed.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = parsePreferences(body);
  if (!parsed.ok) return jsonError(400, "invalid_preferences", "Preferences are invalid.", parsed.errors);

  const preferences = await savePreferences(authed.actor.userId, parsed.value);
  return NextResponse.json({ ok: true, ...preferences });
}

// POST behaves the same as PUT — convenient for clients that don't send PUT.
export const POST = PUT;
