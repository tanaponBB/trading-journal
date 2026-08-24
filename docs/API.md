# PineLedger Import API

Push broker orders into the journal from a scraper, n8n flow, or cron job.
The dashboard then pulls them into its calendar, stats and charts.

```
XM scraper ──POST /api/import/xm──▶ .data/trades.json ──GET /api/trades──▶ dashboard
  orders[]        normalise + upsert       server store        merge into localStorage
                  (dedupe by deal_id)
```

The trade list in the browser still lives in `localStorage`; the server store is
the landing zone that survives between scrapes. The dashboard pulls it in
silently on load — there is no sync control in the UI.

---

## Setup

Add a key to `.env.local` (already generated for you):

```env
IMPORT_API_KEY=VwoDEBZVGcIiDPlc8ckBJkignJuTC_4l
# optional — where the store file lives (default: <project>/.data)
TJ_DATA_DIR=/var/lib/pineledger
```

Restart `npm run dev` after changing it.

## Authentication

Every endpoint accepts either:

| Caller | Header |
|--------|--------|
| Machine (scraper, n8n, cron) | `x-api-key: <IMPORT_API_KEY>` or `Authorization: Bearer <IMPORT_API_KEY>` |
| Browser (the dashboard) | the NextAuth session cookie — nothing to send |

Failures return JSON, never a redirect:

```json
{ "ok": false, "error": { "code": "invalid_api_key", "message": "The provided API key is not valid." } }
```

| Code | Status | Meaning |
|------|--------|---------|
| `unauthorized` | 401 | No API key and no session |
| `invalid_api_key` | 401 | Key doesn't match `IMPORT_API_KEY` |
| `api_key_not_configured` | 503 | A key was sent but the server has none set |
| `invalid_json` | 400 | Body isn't JSON |
| `missing_orders` | 400 | No `orders` array in the body |
| `invalid_option` | 400 | Bad `dateBasis` / `timeSource` |
| `invalid_date` / `invalid_limit` | 400 | Bad query parameter |
| `too_many_orders` | 413 | More than 5000 orders in one request |
| `missing_filter` | 400 | `DELETE` without a filter |

---

## `POST /api/import/xm`

Normalise scraped XM orders and upsert them, keyed on `deal_id`.
**Idempotent** — re-posting the same scrape changes nothing, so you can run it
on a schedule without creating duplicates.

### Request

Send the scraper payload as-is (extra fields like `summary`, `scrapedAt`, `url`
are ignored), or a bare array of orders.

```json
{
  "ok": true,
  "count": 9,
  "orders": [ { "deal_id": "254598363", "symbol": "GOLD", "side_en": "SELL", "...": "..." } ],
  "options": { "dateBasis": "open", "timeSource": "local" }
}
```

Per-order fields used (all optional except the four marked ●):

| Field | Used for |
|-------|----------|
| `deal_id` ● (falls back to `order_id`) | dedupe key → trade id `xm-<deal_id>` |
| `symbol` ● | mapped to journal symbol (`GOLD` → `XAUUSD`) |
| `side_en` / `side` ● | `BUY`/`ซื้อ` → LONG, `SELL`/`ขาย` → SHORT |
| `volume_num` + `volume` ● | position size (see *Volume* below) |
| `open_price_num` / `open_price` ● | entry |
| `close_price_num` / `close_price` | exit — absent ⇒ the trade is stored as **OPEN** |
| `sl_num`, `tp_num` (or the string forms) | SL / TP |
| `pl_num`, `net_num`, `swap_num`, `commission_num` | fees, so journal P/L lands exactly on the broker's net |
| `open_time`, `close_time`, `server_open_time`, `server_close_time` | calendar date |
| `close_reason` | trade note |

### Query parameters

| Param | Values | Default | Purpose |
|-------|--------|---------|---------|
| `dryRun` | `1` | off | Normalise and return the trades **without writing**. Also returns `trades`. |
| `dateBasis` | `open` \| `close` | `open` | Which timestamp decides the calendar day |
| `timeSource` | `local` \| `server` | `local` | Broker local time vs. `server_*` columns |
| `include` | `trades` | off | Include the normalised trades in the response |

`options` in the body does the same thing; query parameters win.
`options.symbolMap` (body only) adds broker→journal symbol mappings, e.g.
`{ "GOLD#": "XAUUSD" }`.

### Response `200`

```json
{
  "ok": true,
  "dryRun": false,
  "received": 9,
  "normalized": 9,
  "skipped": 0,
  "created": 9,
  "updated": 0,
  "unchanged": 0,
  "stored": 9,
  "summary": {
    "realized": 65.19, "wins": 7, "losses": 2, "breakeven": 0, "open": 0,
    "winRate": 0.7778, "profitFactor": 30.1, "best": 21.89, "worst": -2.22
  },
  "warnings": []
}
```

`summary` covers the orders **in this request** — compare it against the
scraper's own `summary.net` as a checksum. On a dry run the write counters are
`null`.

Unusable rows never fail the request; they land in `warnings` and count towards
`skipped`:

```json
{ "index": 4, "deal_id": null, "message": "missing deal_id/order_id — cannot dedupe, skipped" }
```

Reasons a row is skipped: no deal/order id, no symbol, unrecognised side, no
open price, zero volume, unparsable timestamps, duplicate `deal_id` in the same
payload.

---

## `GET /api/trades`

What the dashboard reads on load. Sorted by date ascending.

| Param | Values | Default |
|-------|--------|---------|
| `from`, `to` | `YYYY-MM-DD`, inclusive | — |
| `symbol` | e.g. `XAUUSD` (journal symbol, not the broker's) | — |
| `source` | `xm` \| `manual` | — |
| `status` | `OPEN` \| `CLOSED` | — |
| `order` | `asc` \| `desc` | `asc` |
| `limit` | 1–5000 | 500 |

```json
{
  "ok": true,
  "count": 9,
  "matched": 9,
  "truncated": false,
  "updatedAt": "2026-07-31T07:13:31.667Z",
  "summary": { "realized": 65.19, "wins": 7, "...": "..." },
  "trades": [
    {
      "id": "xm-254598363",
      "date": "2026-07-31",
      "symbol": "XAUUSD",
      "contractSize": 100,
      "direction": "SHORT",
      "lots": 0.05,
      "entry": 4079.69,
      "tp": 4078.6,
      "exit": 4078.55,
      "status": "CLOSED",
      "notes": "ทำกำไร (Take Profit) · 31/07/26, 12:15:00 → 31/07/26, 12:38:04 · deal 254598363",
      "source": "xm",
      "externalId": "254598363"
    }
  ]
}
```

`summary` reflects everything matched by the filter, not just the returned page.

## `DELETE /api/trades`

Needs at least one filter — `id`, `source`, `symbol`, `from`/`to`, or `all=1`.

```bash
curl -X DELETE -H "x-api-key: $KEY" "$BASE/api/trades?id=xm-254456167"
curl -X DELETE -H "x-api-key: $KEY" "$BASE/api/trades?source=xm"          # re-import from scratch
curl -X DELETE -H "x-api-key: $KEY" "$BASE/api/trades?from=2026-07-01&to=2026-07-31"
```

```json
{ "ok": true, "deleted": 8, "remaining": 0 }
```

Deleting from the server does **not** remove rows already merged into the
browser — clear those from the day panel, or wipe `localStorage`.

---

## Field mapping in detail

### Symbols

`GOLD → XAUUSD`, `SILVER → XAGUSD`, `OIL → USOIL`, `US30CASH → US30`,
`NAS100CASH → NAS100`. Anything else is uppercased with punctuation stripped.
`XAUUSD` matters: the live gold ticker only shows floating P/L for symbols
containing `XAU`. Add your own via `options.symbolMap`.

### Volume

XM reports metals in troy ounces and FX in lots; the journal stores
`contractSize × lots`.

| `volume` string | Stored as |
|-----------------|-----------|
| `"5 Troy Ounce(s)"` | `contractSize: 100, lots: 0.05` (5 oz ÷ 100 oz per lot) |
| `"0.1 Lots"` | `contractSize: 100, lots: 0.1` |
| unrecognised unit | treated as lots + a warning |

Contract sizes come from `SYMBOL_PRESETS` in [lib/types.ts](../lib/types.ts).

### P/L and fees

The journal computes `(exit − entry) × contractSize × lots × direction − fees`.
The importer sets `fees = priceP/L − net_num`, folding in swap, commission and
broker rounding, so the dashboard total matches the broker to the cent. A
**negative** `fees` is a credit (e.g. positive swap).

Verified against the sample scrape: 9 orders, net **$65.19**, win rate 77.8%,
profit factor 30.1 — identical to the scraper's own summary.

### Dates

Timestamps are parsed as wall-clock text (`31/07/26, 12:38:04` → `2026-07-31`),
never through `Date`, so the calendar day can't drift with the server timezone.
ISO (`2026-07-31T06:48:49Z`) and `31/07/2026 12:38` also parse.

---

## Use cases

### 1. Scrape → import (curl / cron)

```bash
BASE=http://localhost:3000
KEY=VwoDEBZVGcIiDPlc8ckBJkignJuTC_4l

curl -X POST "$BASE/api/import/xm" \
  -H "x-api-key: $KEY" \
  -H 'content-type: application/json' \
  --data-binary @xm-history.json
```

Then open the dashboard — it pulls imported trades in on load.

### 2. Check the mapping before writing anything

```bash
curl -X POST "$BASE/api/import/xm?dryRun=1" \
  -H "x-api-key: $KEY" -H 'content-type: application/json' \
  --data-binary @xm-history.json | jq '{normalized, skipped, warnings, net: .summary.realized}'
```

### 3. n8n / Make HTTP node

```
Method:  POST
URL:     https://your-host/api/import/xm
Headers: x-api-key: <IMPORT_API_KEY>
         content-type: application/json
Body:    {{ $json }}          ← the scraper node's output, unchanged
```

Add an IF node on `{{ $json.skipped > 0 }}` to alert yourself about rows that
didn't map.

### 4. Node scraper posting directly

```js
const res = await fetch(`${process.env.JOURNAL_URL}/api/import/xm`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": process.env.IMPORT_API_KEY },
  body: JSON.stringify(payload), // { ok, count, orders: [...] }
});
const r = await res.json();
if (!r.ok) throw new Error(r.error.message);
console.log(`+${r.created} new, ${r.updated} updated, ${r.skipped} skipped`);
```

### 5. Run it every 15 minutes

Because the import is keyed on `deal_id`, a cron that re-posts the last 24h of
history is safe — only genuinely new deals are created, and edits to a deal
(e.g. a corrected close price) come through as `updated`.

```cron
*/15 * * * * /usr/local/bin/scrape-xm.sh | curl -sS -X POST "$BASE/api/import/xm" \
  -H "x-api-key: $KEY" -H 'content-type: application/json' --data-binary @- >/dev/null
```

### 6. Bucket trades by close date instead of open date

Useful for overnight positions — order #5 in the sample opened 30 July and
closed 31 July.

```bash
curl -X POST "$BASE/api/import/xm?dateBasis=close&timeSource=server" ...
```

### 7. Re-import everything cleanly

```bash
curl -X DELETE -H "x-api-key: $KEY" "$BASE/api/trades?source=xm"
curl -X POST -H "x-api-key: $KEY" -H 'content-type: application/json' \
  --data-binary @full-history.json "$BASE/api/import/xm"
```

### 8. Month report without opening the browser

```bash
curl -s -H "x-api-key: $KEY" \
  "$BASE/api/trades?from=2026-07-01&to=2026-07-31&status=CLOSED" | jq .summary
```

---

## Notes & limits

- **Storage** is a JSON file (`.data/trades.json`, atomic writes, serialised).
  Fine for one account. On Vercel the filesystem is ephemeral — point
  `TJ_DATA_DIR` at a volume or swap [lib/server/store.ts](../lib/server/store.ts)
  for a database; the route handlers only use `listTrades`, `upsertTrades`,
  `deleteTrades`.
- **Manual trades** typed into the dashboard stay in the browser and are never
  touched by an import. On each load, imported rows win on prices but your
  edited **notes** are kept.
- **Open positions** — an order without a close price is stored as `OPEN`, so the
  gold ticker shows its floating P/L live.
- **No rate limiting.** Keep `IMPORT_API_KEY` secret; it grants read, write and
  delete on the store.
- Max 5000 orders per request; `GET` returns at most 5000.
