import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client.
 *
 * The browser never talks to Supabase directly — every read and write goes
 * through a route handler in app/api, which authenticates the caller itself
 * (NextAuth cookie or x-api-key) and then acts with the service-role key.
 * That key bypasses RLS, so it must never reach the client bundle: note the
 * env vars are deliberately *not* prefixed with NEXT_PUBLIC_.
 */

const URL_VAR = "SUPABASE_URL";
const KEY_VAR = "SUPABASE_SERVICE_ROLE_KEY";

let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env[URL_VAR]?.trim() && process.env[KEY_VAR]?.trim());
}

/** Throws when unconfigured — callers should gate on `isSupabaseConfigured()`. */
export function supabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env[URL_VAR]?.trim();
  const key = process.env[KEY_VAR]?.trim();
  if (!url || !key) {
    throw new Error(`Supabase is not configured — set ${URL_VAR} and ${KEY_VAR}.`);
  }

  cached = createClient(url, key, {
    // No cookies, no refresh loop, no session persistence: this client is a
    // short-lived server actor, not a signed-in user.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "trading-journal" } },
  });
  return cached;
}

/**
 * PostgREST carries filter values in the query string, so an `in.(…)` list of a
 * few thousand ids would overflow the request line. Every bulk read and write
 * chunks at this size.
 */
export const BATCH_SIZE = 500;

export function chunk<T>(items: T[], size = BATCH_SIZE): T[][] {
  if (items.length <= size) return items.length ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Page size for reads. A Supabase project caps rows per request (the "Max rows"
 * API setting, 1000 by default) and PostgREST truncates silently rather than
 * erroring — so every list walks explicit ranges instead of trusting one select
 * to return everything.
 */
export const PAGE_SIZE = 1000;
