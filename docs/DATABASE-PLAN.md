# Database Plan v2 — a complete trading journal

> **Status: design only, except where noted.** v1
> ([supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql)) is
> live — trades, setups, preferences and the plan ladder. This document is the
> target we build toward, in phases. Read [DATABASE.md](DATABASE.md) first.

## Why v2

v1 stores a trade the way the UI displays one. That is enough for a calendar and
a ladder, and not enough for a journal you review. v1 **cannot record**:

| Missing | Why it matters |
|---------|----------------|
| More than one account | Live vs demo vs prop challenge all pile into one balance |
| Deposits and withdrawals | `baseWallet` is a single number — the moment you top up, every equity figure is wrong |
| Partial entries and exits | Scaling in/out becomes one fake average fill |
| Commission and swap separately | v1 folds both into one `fees` figure; the breakdown is destroyed |
| Risk per trade | Without it there is no R-multiple — the one number that makes trades comparable |
| MAE / MFE | No way to ask "was my stop too tight?" |
| Strategy / setup classification | Cannot answer "which setup actually makes money?" |
| Tags, mistakes, emotions | No process review, only a P/L list |
| Screenshots | The chart at entry is the journal for most traders |
| Daily plan and review | Pre-market intent vs post-market outcome |
| Risk rules and breaches | No way to see "I broke my daily loss limit 6 times" |

## Shape

```
app_users
   ├── accounts ──────┬── cash_transactions      (deposits, withdrawals, credits)
   │                  ├── balance_snapshots      (end-of-day equity, for drawdown)
   │                  └── plans ── plan_days     (the ladder, persisted per day)
   ├── instruments ── instrument_aliases         (GOLD -> XAUUSD, per broker)
   ├── strategies ── setups                      (the playbook)
   ├── tags / mistakes / risk_rules ── rule_violations
   ├── trades ────────┬── executions             (the actual fills)
   │                  ├── trade_tags / trade_mistakes
   │                  └── attachments            (screenshots, Supabase Storage)
   ├── journal_entries ── attachments            (daily plan + review)
   ├── preferences
   └── import_runs
```

Every table keeps the v1 rule: a `user_id` column, RLS enabled, no permissive
policies, access only through the route handlers.

---

## 1. Accounts and money

### `accounts`

| Column | Notes |
|--------|-------|
| `name`, `broker`, `account_number` | "XM Live", "FTMO 10k Phase 1" |
| `kind` | `live` \| `demo` \| `prop_challenge` \| `prop_funded` \| `backtest` |
| `currency`, `leverage` | Account currency, not the quote currency |
| `starting_balance`, `opened_on` | |
| `status` | `active` \| `archived` \| `blown` \| `passed` |

Backtest is a `kind` on purpose — replayed trades belong in the same tables, just
never mixed into live stats.

### `cash_transactions`

**Balance stops being a stored number and becomes a derived one.** The single
most important correction in v2.

`kind`: `deposit` \| `withdrawal` \| `bonus` \| `credit` \| `adjustment` \| `fee`,
with a signed `amount` and an `occurred_at`.

```
balance(account, t) = starting_balance
                    + sum(cash_transactions.amount where occurred_at <= t)
                    + sum(trades.net_pnl    where closed_at    <= t)
```

`preferences.base_wallet` is retired — it becomes `accounts.starting_balance`.

### `balance_snapshots`

One row per account per day: `balance`, `equity`, `open_positions`,
`margin_used`. Two jobs: true max-drawdown (which needs intraday equity, not just
closed P/L), and reconciliation against the broker.

---

## 2. Instruments

`instruments` replaces the hardcoded `SYMBOL_PRESETS` in
[lib/types.ts](../lib/types.ts): `symbol`, `asset_class`, `contract_size`,
`tick_size`, `tick_value`, `digits`, `quote_currency`. Contract specs belong in
data — they differ per broker and change over time.

`instrument_aliases` maps `(account_id, broker_symbol) -> instrument_id`, taking
over from `SYMBOL_ALIASES` in [lib/xm.ts](../lib/xm.ts).

---

## 3. Trades

Still `(user_id, id)` as the primary key. New columns by purpose:

**Timing** — `opened_at` / `closed_at` (`timestamptz`; v1 has only a `date`),
`trade_date` generated in the account timezone, `session` generated
(`asia`/`london`/`newyork`/`overlap`), `holding_period`.

**Position** — `avg_entry` / `avg_exit` **derived from `executions`**,
`lots`, `units`, `order_type`.

**The plan, recorded at entry and never edited** — `initial_sl`, `initial_tp`,
`risk_amount`, `risk_pct`, `planned_rr`.

**The outcome** — `gross_pnl`, then `commission`, `swap`, `other_fees` **split
out** rather than folded into one number; `net_pnl` and `realized_r`
(`net_pnl / risk_amount`) as generated columns; `mae` / `mfe`; `close_reason`.

**The review** — `strategy_id`, `timeframe`, `followed_plan`, `grade` (A–F,
execution quality independent of profit), `emotion_before` / `emotion_after`,
`plan_day_id`.

> A trade that made money while breaking your rules is a losing trade.
> `followed_plan` and `grade` are what let the journal say so.

### `executions`

The biggest fidelity gain in v2. A real trade is rarely one fill.

`trade_id`, `leg` (`entry`/`exit`), `price`, `volume`, `executed_at`,
`commission`, `swap`, `external_id`. Trade-level prices and P/L become rollups of
this table.

This also fixes XM dedupe properly: XM reports *deals*, and several deals can
belong to one position — v1 turns each deal into a separate trade.

---

## 4. Process

- **`strategies`** — playbook entries with a `rules` jsonb checklist and a
  `status` (`testing`/`active`/`retired`). Unlocks expectancy per strategy.
- **`tags` / `trade_tags`** — free-form labels.
- **`mistakes` / `trade_mistakes`** — a *fixed* catalogue (`moved_stop`,
  `no_stop`, `oversized`, `revenge_entry`, `early_exit`, `chased`) so mistakes
  are countable: "moved my stop 14 times this month, cost $312."
- **`journal_entries`** — one row per day: `pre_market`, `post_market`, `mood`,
  `sleep_hours`, `discipline_score`, `lessons`.
- **`risk_rules` / `rule_violations`** — `max_risk_pct_per_trade`,
  `max_daily_loss`, `max_trades_per_day`, `min_rr`, `no_trade_windows`. Turns
  "be disciplined" into a number you can chart.
- **`attachments`** — Supabase Storage path plus `trade_id` **or**
  `journal_entry_id` (exactly one, enforced by CHECK).

---

## 5. The daily plan ladder — **shipped**

Built in v1 as [lib/plan.ts](../lib/plan.ts) + the **Ladder** tab, currently
stored as jsonb in `preferences.plan`.

### Audit of the source table

The rule is **25% per day, compounded, from $10.00**. Three balance cells in the
original hand-typed table were transcription errors:

| Day | As typed | Should be | Note |
|----:|---------:|----------:|------|
| 12 | $161.41 | $116.41 | Digits transposed — **$45 off** |
| 18 | $444.28 | $444.24 | 4c |
| 30 | $6,464.63 | $6,464.70 | 7c |

Day 12 is instructive: its own Profit Target ($29.10) is 25% of **$116.41**, not
of $161.41 — the arithmetic was right and only the printed cell was wrong.

**This is why the ladder is generated from three parameters, never stored as
thirty rows.** Per-row rounding also drifted; run consistently (half-up each day)
the ladder ends at **$8,087.19** against the table's $8,080.79.

### When it moves to its own table

`plans` (`start_balance`, `daily_target_pct`, `days`, `start_date`,
`skip_weekends`, `mode`, `status`) and `plan_days` (`day_no`, `plan_date`,
`planned_start/target/end`, `actual_start/pnl/end`, `status`, `notes`).

Persisting `plan_days` buys per-day notes and a history of past plans — neither
of which the current jsonb config can hold.

### The decision the schema has to make: a bad day

| Mode | Behaviour | Consequence |
|------|-----------|-------------|
| `fixed` | Ladder frozen at creation. Day 13 still says $145.57 whatever day 12 did. | **Current behaviour.** You can be visibly behind, which is honest. |
| `adaptive` | Each target is 25% of your *actual* morning balance. | Never behind, but the target silently shrinks after a loss and the goal moves. |

The shipped ladder is `fixed`; the adaptive view is worth computing on read so
you get both, plus a days-ahead/behind figure.

> The ladder assumes thirty consecutive winning days. A single bad day at $10
> compounds backwards as fast as it compounds forwards — `plan_days.status` and
> `rule_violations` are what make that visible early rather than on day 20.

---

## 6. Derived values — computed, never typed

| Value | Formula | Where |
|-------|---------|-------|
| `net_pnl` | `gross_pnl - commission - swap - other_fees` | generated column |
| `realized_r` | `net_pnl / risk_amount` | generated column |
| `trade_date` | `(opened_at at time zone tz)::date` | generated column |
| `balance` | starting + cash + closed P/L | view |
| `expectancy` | `avg(realized_r)` per strategy | view |
| `max_drawdown` | peak-to-trough on `balance_snapshots` | view |

Views to build: `v_account_balance`, `v_daily_pnl`, `v_equity_curve`,
`v_strategy_performance`, `v_plan_progress`, `v_tag_performance`.

Rule of thumb: **if it can be computed, it is a view or a generated column.**
The $45 typo on day 12 is what happens when a derived number gets typed.

---

## 7. Migration from v1

1. Create `accounts`; make one row from `preferences.base_wallet`. Point every
   existing trade at it.
2. Create `instruments`, seeded from `SYMBOL_PRESETS`; `instrument_aliases` from
   `SYMBOL_ALIASES`.
3. Add new `trades` columns as nullable — old rows simply have no strategy, no
   risk, no R.
4. Backfill `executions`: one `entry` and one `exit` per closed trade, then flip
   `avg_entry`/`avg_exit` to rollups.
5. Split v1's `fees`. It cannot be unmixed retroactively — put the whole figure
   in `other_fees` and let new imports populate `commission` and `swap`
   properly. [lib/xm.ts](../lib/xm.ts) already parses `swap_num` and
   `commission_num` separately and then discards the split; stop discarding it.
6. Move `preferences.base_wallet` to `accounts.starting_balance` plus a
   `deposit` cash transaction.
7. Add the process tables — purely additive.
8. Move `preferences.plan` into `plans` / `plan_days`.

Step 5 is the only lossy one, and it is lossy already in v1.

---

## 8. Build order

| Phase | Delivers | Why |
|------:|----------|-----|
| 1 | `accounts`, `cash_transactions`, `instruments` | Balance stops being a lie |
| 2 | `trades` expansion + `executions` | Risk, R-multiple, real fills |
| 3 | `plans` / `plan_days` | Ladder history and per-day notes |
| 4 | `strategies`, `tags`, `mistakes`, `journal_entries` | Review, not just recording |
| 5 | `risk_rules`, `rule_violations`, `balance_snapshots` | Discipline made measurable |
| 6 | `attachments` + Supabase Storage | Screenshots |

---

## 9. Open decisions

1. **Day boundary** — a trade opened 23:50 Bangkok and closed 01:10: which day's
   target does it count toward? Open time, close time, or broker server day?
   Affects `trade_date` and every ladder rollup.
2. **Weekends** — should the ladder only count trading days (current behaviour),
   or run on a calendar deadline?
3. **Multi-currency** — a USD account trading a JPY-quoted pair needs an FX rate
   at close. Store it per trade, or assume USD throughout?
4. **Ladder scope** — one plan per account, or several at once?
5. **Prop-firm rules** — should `risk_rules` model FTMO-style constraints as
   first-class, given `accounts.kind` already has `prop_challenge`?

---

## Appendix — the ladder, generated

25% daily, `$10.00` start, round half-up each day — the output of
[lib/plan.ts](../lib/plan.ts), not a transcription:

| Day | Balance | Profit Target | Expected Balance |
| --: | ------: | ------------: | ---------------: |
|  1 |     $10.00 |      $2.50 |     $12.50 |
|  2 |     $12.50 |      $3.13 |     $15.63 |
|  3 |     $15.63 |      $3.91 |     $19.54 |
|  4 |     $19.54 |      $4.89 |     $24.43 |
|  5 |     $24.43 |      $6.11 |     $30.54 |
|  6 |     $30.54 |      $7.64 |     $38.18 |
|  7 |     $38.18 |      $9.55 |     $47.73 |
|  8 |     $47.73 |     $11.93 |     $59.66 |
|  9 |     $59.66 |     $14.92 |     $74.58 |
| 10 |     $74.58 |     $18.65 |     $93.23 |
| 11 |     $93.23 |     $23.31 |    $116.54 |
| 12 |    $116.54 |     $29.14 |    $145.68 |
| 13 |    $145.68 |     $36.42 |    $182.10 |
| 14 |    $182.10 |     $45.53 |    $227.63 |
| 15 |    $227.63 |     $56.91 |    $284.54 |
| 16 |    $284.54 |     $71.14 |    $355.68 |
| 17 |    $355.68 |     $88.92 |    $444.60 |
| 18 |    $444.60 |    $111.15 |    $555.75 |
| 19 |    $555.75 |    $138.94 |    $694.69 |
| 20 |    $694.69 |    $173.67 |    $868.36 |
| 21 |    $868.36 |    $217.09 |  $1,085.45 |
| 22 |  $1,085.45 |    $271.36 |  $1,356.81 |
| 23 |  $1,356.81 |    $339.20 |  $1,696.01 |
| 24 |  $1,696.01 |    $424.00 |  $2,120.01 |
| 25 |  $2,120.01 |    $530.00 |  $2,650.01 |
| 26 |  $2,650.01 |    $662.50 |  $3,312.51 |
| 27 |  $3,312.51 |    $828.13 |  $4,140.64 |
| 28 |  $4,140.64 |  $1,035.16 |  $5,175.80 |
| 29 |  $5,175.80 |  $1,293.95 |  $6,469.75 |
| 30 |  $6,469.75 |  $1,617.44 |  $8,087.19 |

Day 30 closes at **$8,087.19**.
