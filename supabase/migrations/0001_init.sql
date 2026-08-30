-- Trading Journal — initial schema.
--
-- Access model: the Next.js server is the only client. It connects with the
-- service-role key and derives the acting user from the NextAuth session (or
-- from IMPORT_API_KEY for machine callers). RLS is therefore defence-in-depth,
-- not the primary gate: every table denies anon/authenticated outright, so a
-- leaked anon key reads nothing. See lib/server/supabase.ts.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums ----
-- Mirrors lib/types.ts. Adding a value is `alter type ... add value '...'`.
create type trade_direction as enum ('LONG', 'SHORT');
create type trade_status    as enum ('OPEN', 'CLOSED');
create type trade_source    as enum ('manual', 'xm');
create type setup_status    as enum ('WATCHING', 'TAKEN', 'CANCELLED');

-- ---------------------------------------------------------------- users ----
-- NextAuth uses stateless JWT sessions, so this is the only user record.
-- Rows are created on demand the first time an email signs in.
create table app_users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now(),
  -- Emails are compared case-insensitively everywhere; store them folded so a
  -- plain unique index is enough (no citext extension required).
  constraint app_users_email_lowercase check (email = lower(email))
);

-- --------------------------------------------------------------- trades ----
create table trades (
  user_id       uuid not null references app_users(id) on delete cascade,

  -- Application-supplied id, not a surrogate key: the browser generates a uuid
  -- for manual trades and the importer generates `xm-<deal_id>`. Scoping the
  -- primary key by user keeps broker deal ids from colliding across accounts
  -- and lets the importer upsert on (user_id, id) with no extra lookup.
  id            text not null,

  date          date not null,
  symbol        text not null,
  contract_size numeric(20, 8) not null,
  direction     trade_direction not null,
  lots          numeric(20, 8) not null,
  entry_price   numeric(20, 8) not null,
  sl            numeric(20, 8),
  tp            numeric(20, 8),
  exit_price    numeric(20, 8),
  fees          numeric(20, 4),
  status        trade_status not null,
  notes         text,
  source        trade_source not null default 'manual',

  -- Broker deal id, before the `xm-` prefix. Kept as its own column so the
  -- dedupe guarantee is enforced by the database, not just by id convention.
  external_id   text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Realized P/L, maintained by Postgres so the day rollups the ladder needs
  -- can be done in SQL instead of pulling every row into Node.
  -- NOTE: this expression must stay in step with tradePnl() in lib/calc.ts.
  pnl numeric(20, 4) generated always as (
    case
      when status = 'CLOSED' and exit_price is not null then
        (exit_price - entry_price)
          * contract_size
          * lots
          * (case when direction = 'LONG' then 1 else -1 end)
        - coalesce(fees, 0)
    end
  ) stored,

  primary key (user_id, id),

  constraint trades_symbol_not_blank  check (length(trim(symbol)) > 0),
  constraint trades_lots_positive     check (lots > 0),
  constraint trades_contract_positive check (contract_size > 0),
  -- The trade modal already refuses to save a closed trade without an exit;
  -- this keeps the importer and any future caller honest too.
  constraint trades_closed_has_exit   check (status = 'OPEN' or exit_price is not null)
);

-- The calendar and the ladder both scan by date.
create index trades_user_date_idx on trades (user_id, date desc);

-- Open positions are re-read on every gold tick for floating P/L.
create index trades_user_open_idx on trades (user_id) where status = 'OPEN';

create index trades_user_symbol_idx on trades (user_id, symbol);

-- Re-importing the same XM history is a no-op: one row per broker deal.
create unique index trades_user_external_idx
  on trades (user_id, source, external_id)
  where external_id is not null;

-- --------------------------------------------------------------- setups ----
-- A setup is a trade planned but not yet entered.
create table setups (
  user_id       uuid not null references app_users(id) on delete cascade,
  id            text not null,
  created_at    timestamptz not null default now(),
  valid_days    integer not null default 7,
  symbol        text not null,
  contract_size numeric(20, 8) not null,
  direction     trade_direction not null,
  lots          numeric(20, 8) not null,
  entry_price   numeric(20, 8) not null,
  sl            numeric(20, 8),
  tp            numeric(20, 8),
  reason        text,
  status        setup_status not null default 'WATCHING',
  -- Set once the setup has been promoted into a real trade. Not a foreign key:
  -- the trade may be deleted while the plan-vs-outcome trail stays readable.
  trade_id      text,
  updated_at    timestamptz not null default now(),

  primary key (user_id, id),
  constraint setups_valid_days_positive check (valid_days > 0),
  constraint setups_lots_positive       check (lots > 0)
);

create index setups_user_status_idx on setups (user_id, status, created_at desc);

-- ---------------------------------------------------------- preferences ----
-- One row per user holding everything that is configuration rather than record.
--
-- `missions` and `plan` are jsonb on purpose. Both are read and written whole,
-- never queried field by field, and their shape is still moving — normalising
-- them into tables would buy nothing and cost a migration every time a mission
-- kind is added. Trades are relational because they are queried; config is not.
create table preferences (
  user_id     uuid primary key references app_users(id) on delete cascade,
  base_wallet numeric(20, 4) not null default 1000,
  currency    text not null default 'USD',
  -- MissionConfig[] from lib/missions.ts
  missions    jsonb not null default '[]'::jsonb,
  -- PlanConfig from lib/plan.ts — the daily ladder's three parameters
  plan        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),

  constraint preferences_currency_iso  check (currency ~ '^[A-Z]{3}$'),
  constraint preferences_wallet_signed check (base_wallet >= 0),
  constraint preferences_missions_array check (jsonb_typeof(missions) = 'array'),
  constraint preferences_plan_object    check (jsonb_typeof(plan) = 'object')
);

-- ---------------------------------------------------------- import runs ----
-- Audit trail for POST /api/import/xm. The route already computes every one of
-- these counters; persisting them makes a bad scrape diagnosable after the fact.
create table import_runs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_users(id) on delete cascade,
  source     trade_source not null default 'xm',
  dry_run    boolean not null default false,
  received   integer not null default 0,
  normalized integer not null default 0,
  skipped    integer not null default 0,
  created    integer not null default 0,
  updated    integer not null default 0,
  warnings   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index import_runs_user_time_idx on import_runs (user_id, created_at desc);

-- ------------------------------------------------------------- triggers ----
create or replace function touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trades_touch_updated_at
  before update on trades
  for each row execute function touch_updated_at();

create trigger setups_touch_updated_at
  before update on setups
  for each row execute function touch_updated_at();

create trigger preferences_touch_updated_at
  before update on preferences
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------------ RLS ----
-- Enabled with no permissive policies: PostgREST's anon and authenticated roles
-- can reach nothing, while the service-role key used by the Next.js server
-- bypasses RLS entirely. If you later move to Supabase Auth, add policies here
-- scoped to auth.uid() rather than loosening the grants below.
alter table app_users   enable row level security;
alter table trades      enable row level security;
alter table setups      enable row level security;
alter table preferences enable row level security;
alter table import_runs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- The revokes above only touch tables that exist right now. This makes the
-- posture stick for anything a later migration adds.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Nudge PostgREST to pick up the new tables without waiting for its own reload.
notify pgrst, 'reload schema';
