# Database — Supabase (Postgres)

> **Not currently wired up.** Storage is a local JSON store — `lib/server/store.ts`
> writing `.data/users/<id>.json`, one file per account. This document and
> `supabase/migrations/0001_init.sql` are kept as the schema of record for when the
> journal moves back to Postgres; nothing in the running app reads them today.
>
> To switch back: reinstall `@supabase/supabase-js`, restore the client and the
> Supabase `store.ts` from commit `2dc3e4c`, and set `SUPABASE_URL` /
> `SUPABASE_SERVICE_ROLE_KEY`. The exported store functions are unchanged, so no
> route handler or component has to move.

Supabase was the source of truth for trades, planned setups, and configuration
(wallet settings, daily missions, and the plan ladder).

Before that, everything lived in the browser's `localStorage` and broker imports
landed in a flat `.data/trades.json`; the two never reconciled, and a cleared
browser meant a lost journal. The local store keeps that reconciliation — one
server-side source, `localStorage` demoted to a cache — without the hosted
database.

## How access works

```
Browser ──session cookie──▶ /api/*  ──service-role key──▶ Supabase
Scraper ──x-api-key───────▶ /api/*  ──service-role key──▶ Supabase
```

The browser never talks to Supabase directly. Every request authenticates at the
route handler — NextAuth cookie for you, `IMPORT_API_KEY` for machines — and the
handler resolves that to a `user_id` before touching a table. The service-role
key stays server-side; the env vars are deliberately **not** prefixed with
`NEXT_PUBLIC_`.

RLS is enabled on every table with **no permissive policies**. That is
intentional: `anon` and `authenticated` can read nothing, so a leaked anon key is
inert, while `service_role` bypasses RLS. RLS here is defence-in-depth — the
route handlers are the primary gate.

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste [supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql), run it.
3. **Project Settings → Data API** for the URL, **API Keys** for the `service_role` key.
4. Put both in `.env.local`:

   ```env
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   ```

5. Restart `npm run dev`.

Until those are set, every `/api` route answers `503 database_not_configured`
and the dashboard shows its cached journal with an "Offline" note rather than
crashing.

## Tables

| Table | Holds |
|-------|-------|
| `app_users` | One row per signed-in email. NextAuth uses stateless JWTs, so this is the only user record. |
| `trades` | Every trade, manual or imported. |
| `setups` | Trades planned but not yet entered. |
| `preferences` | Wallet settings, daily missions, and the plan ladder — one row per user. |
| `import_runs` | Audit trail for each XM import. |

### `trades`

**Primary key is `(user_id, id)`**, not a surrogate uuid. That keeps the id the
app already generates (a uuid for manual trades, `xm-<deal_id>` for imports),
scopes broker deal ids so they can't collide between accounts, and lets the
importer upsert with no extra lookup.

`pnl` is a **stored generated column** mirroring `tradePnl()` in
[lib/calc.ts](../lib/calc.ts), so the per-day rollups the plan ladder needs can
be done in SQL rather than by pulling every row into Node. **If you change that
formula, change both.**

Indexes match real access paths:

| Index | Serves |
|-------|--------|
| `(user_id, date desc)` | Calendar month scans, the ladder's day rollup |
| `(user_id) where status = 'OPEN'` | Floating P/L on every gold tick |
| `(user_id, symbol)` | Per-symbol filters |
| `(user_id, source, external_id)` unique | Re-importing the same XM history is a no-op |

Constraints: `lots > 0`, `contract_size > 0`, non-blank symbol, and
`status = 'CLOSED'` requires an `exit_price` — the rule the trade modal already
enforced, now guaranteed for every caller.

### `preferences`

`missions` and `plan` are **jsonb on purpose**. Both are read and written whole,
never queried field by field, and their shape is still moving — normalising them
into tables would buy nothing and cost a migration every time a mission kind is
added. Trades are relational because they get queried; configuration does not.

The plan ladder stores only its three parameters (`startBalance`, `dailyPct`,
`days`, plus an optional `startDate`). The 30 rows are generated from them by
[lib/plan.ts](../lib/plan.ts) — never stored, because a hand-typed ladder drifts.

## Migrating your existing journal

Automatic. On first load after you configure Supabase, the dashboard pushes any
`localStorage` trades and setups the database has never seen, carries over
customised settings, then sets `tj.migrated.v1` so it never runs again. Nothing
is deleted from the browser — the old data stays as a cache.

To re-run it:

```js
localStorage.removeItem("tj.migrated.v1");
```

## Handy queries

```sql
-- Net P/L per day — what the plan ladder grades each rung against
select date, sum(pnl) as net, count(*) as trades
from trades where user_id = '<uuid>' and pnl is not null
group by date order by date;

-- Open positions
select id, symbol, direction, lots, entry_price
from trades where user_id = '<uuid>' and status = 'OPEN';

-- Last few imports
select created_at, received, normalized, created, updated, skipped
from import_runs where user_id = '<uuid>' order by created_at desc limit 10;
```

## Changing the schema

Add a new numbered file under `supabase/migrations/` and run it in the SQL
editor. Keep `0001_init.sql` as the record of what a fresh project needs.

## What's next

[DATABASE-PLAN.md](DATABASE-PLAN.md) is the v2 design — multiple accounts,
deposits and withdrawals, partial fills, risk and R-multiples, strategies, tags,
mistakes, daily reviews and risk rules. Design only; nothing in it is applied.
