import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveUserId } from "./store";
import { isSupabaseConfigured } from "./supabase";

/**
 * API routes accept two callers:
 *  - machines (the scraper / n8n / cron) via `x-api-key` or `Authorization: Bearer`
 *  - the dashboard itself, via the NextAuth session cookie
 *
 * Both resolve to a row in `app_users`: the session caller by its own email,
 * the machine caller by ALLOWED_EMAIL — the single account the journal belongs
 * to. Everything downstream is scoped by the `userId` returned here, so a route
 * can never read or write another user's data.
 */

/** Mirrors the gate in auth.ts. */
const ALLOWED_EMAIL = (process.env.ALLOWED_EMAIL ?? "bbtanapon@gmail.com").toLowerCase();

export interface Actor {
  via: "api-key" | "session";
  email: string;
  userId: string;
}

export type AuthResult = { ok: true; actor: Actor } | { ok: false; response: NextResponse };

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, ...(details ? { details } : {}) } }, { status });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function presentedKey(req: Request): string | null {
  const header = req.headers.get("x-api-key");
  if (header) return header.trim();
  const bearer = req.headers.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) return bearer.slice(7).trim();
  return null;
}

type Identified = { ok: true; via: "api-key" | "session"; email: string } | { ok: false; response: NextResponse };

/** Who is calling — checked before the database, so a 401 never leaks config state. */
async function identify(req: Request): Promise<Identified> {
  const configured = process.env.IMPORT_API_KEY?.trim();
  const presented = presentedKey(req);

  if (presented) {
    if (!configured) {
      return { ok: false, response: jsonError(503, "api_key_not_configured", "IMPORT_API_KEY is not set on the server.") };
    }
    if (!safeEqual(presented, configured)) {
      return { ok: false, response: jsonError(401, "invalid_api_key", "The provided API key is not valid.") };
    }
    // The key is a machine credential for the one journal account.
    return { ok: true, via: "api-key", email: ALLOWED_EMAIL };
  }

  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (email) return { ok: true, via: "session", email };

  return {
    ok: false,
    response: jsonError(401, "unauthorized", "Provide an x-api-key header or sign in to the dashboard first."),
  };
}

/** Authenticate the caller and return the user the request acts as. */
export async function authorize(req: Request): Promise<AuthResult> {
  const identified = await identify(req);
  if (!identified.ok) return identified;

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      response: jsonError(
        503,
        "database_not_configured",
        "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.",
      ),
    };
  }

  try {
    const userId = await resolveUserId(identified.email);
    return { ok: true, actor: { via: identified.via, email: identified.email, userId } };
  } catch (err) {
    console.error("resolveUserId failed:", err);
    return { ok: false, response: jsonError(503, "database_unavailable", "Could not reach the database.") };
  }
}
