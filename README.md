# PineLedger — Trading Journal

Calendar-style trading journal with automatic P/L calculation and equity tracking.
Next.js 15 (App Router) · TypeScript · Tailwind CSS · Recharts. Data lives in a local JSON store on the server (no external database needed).

## Run

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Features

- **Calendar view** — monthly grid, daily net P/L heat cells (green/red intensity), weekly totals column, open-position indicator (gold dot)
- **Trade orders** — Long/Short, lot size, entry, SL, TP, exit, fees, notes
- **Auto calculation**
  - P/L = (exit − entry) × contract size × lots × direction (− fees)
  - Live "At TP / At SL / R:R" preview while typing
  - Symbol presets: XAUUSD (100), EURUSD (100k), BTCUSD (1), … editable per trade
- **Wallet** — set base wallet; Balance = base + cumulative realized P/L (click the gold Balance card to edit)
- **Charts** — equity curve (with base-wallet reference line) and daily P/L bars
- **Stats** — net P/L, win rate, profit factor, best/worst trade, open positions
- **Broker import** — `POST /api/import/xm` takes the XM history scraper payload, dedupes on
  `deal_id` and lands the trades in the calendar. See [docs/API.md](docs/API.md).

## Notes

- P/L is in the quote/account currency; contract size is editable if your broker differs.
- Trades, setups and preferences are written to `.data/users/<id>.json` (override the directory
  with `TJ_DATA_DIR`), one file per account. `localStorage` is only a cache so the calendar
  paints instantly and stays readable offline — the server wins once it answers.
- The store is a single module, `lib/server/store.ts`. The route handlers use nothing else, so
  moving to a database later means rewriting that one file and nothing above it.
- Machine callers (the scraper / n8n / cron) authenticate with `IMPORT_API_KEY`.
# trading-journal
