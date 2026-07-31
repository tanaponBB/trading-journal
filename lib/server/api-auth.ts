import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * API routes accept two callers:
 *  - machines (the scraper / n8n / cron) via `x-api-key` or `Authorization: Bearer`
 *  - the dashboard itself, via the NextAuth session cookie
 */

export type AuthResult = { ok: true; via: "api-key" | "session" } | { ok: false; response: NextResponse };

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

export async function authorize(req: Request): Promise<AuthResult> {
  const configured = process.env.IMPORT_API_KEY?.trim();
  const presented = presentedKey(req);

  if (presented) {
    if (!configured) {
      return { ok: false, response: jsonError(503, "api_key_not_configured", "IMPORT_API_KEY is not set on the server.") };
    }
    if (!safeEqual(presented, configured)) {
      return { ok: false, response: jsonError(401, "invalid_api_key", "The provided API key is not valid.") };
    }
    return { ok: true, via: "api-key" };
  }

  const session = await auth();
  if (session?.user) return { ok: true, via: "session" };

  return {
    ok: false,
    response: jsonError(401, "unauthorized", "Provide an x-api-key header or sign in to the dashboard first."),
  };
}
