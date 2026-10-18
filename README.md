# Keystone Monitor

A site where business partners follow external MT5 accounts for the
**V100** and **Cycle Method** projects: balance, equity, drawdown, P&L by
day, week and month, every closed trade, what is open right now, and PDF
reports for any date range.
Anyone with the link can see it; only the admin screen asks for a password.

It is a standalone app with its own database and hosting. It shares no code,
data or credentials with any other system.

## How it works

```
MT5 terminal                       This site (Vercel)                 Supabase
KeystoneSync.mq5  --- HTTPS --->   /api/sync  (per-account key)  -->  accounts, deals,
(read-only EA)                                                        equity_samples,
                                                                      open_positions, baskets
                                   Pages, PDFs  <-- server reads ---  account_daily view
Anyone with the link       --->                                       account_positions view
                                                                      basket_results view
```

- **The EA only reads.** `public/ea/KeystoneSync.mq5` has no trading code at
  all, and `tests/ea.test.mjs` fails if any is ever added. It posts the
  account's state (balance, equity, margin, the broker's margin call and
  stop-out levels), its open positions and its deals every two minutes,
  and straight away when a deal lands. It runs beside any trading EA.
- **Open positions are a snapshot.** Each sync replaces the account's
  `open_positions` rows with what the terminal has open, in one transaction
  (`sync_open_positions` in `schema.sql`), so the account page shows them
  as of the last sync and a failed sync keeps the previous list. Two syncs
  for one login can overlap (the EA on two charts, or two terminals); the
  account's row is locked so they take turns, and one older than the list
  already stored changes nothing. An EA older
  than 2026.10.17.2 does not send them; its syncs leave the table alone, and
  the page, seeing rows older than the last sync, hides them and says to
  update the EA. From 2026.10.17.4 it also sends each position's
  `POSITION_IDENTIFIER` (`position_id`), the number its deals carry.
- **Margin call and stop-out.** The current EA, 2026.10.17.5, also sends
  the broker's levels (`so_mode`, `margin_call`, `stop_out`: MT5's
  `ACCOUNT_MARGIN_SO_MODE`, `ACCOUNT_MARGIN_SO_CALL`, `ACCOUNT_MARGIN_SO_SO`)
  and, with each open position, its symbol's `point_value`: what a 1.0
  move in price is worth on 1 lot in the account's currency
  (`SYMBOL_TRADE_TICK_VALUE_LOSS` over `SYMBOL_TRADE_TICK_SIZE`, 0 when the
  terminal cannot say). Together they say how far price can move against
  each symbol's open lots before the broker calls margin or closes
  positions, the main risk for a grid. The account page's Margin and
  stop-out section shows those distances as plain figures; nothing is
  coloured or flagged however close they get. They are stored as
  `accounts.stop_out_mode` (`percent`, a margin level, or `money`, an
  equity figure), `margin_call_level` and `stop_out_level`, and
  `open_positions.point_value`. An older EA sends none of them; its syncs
  leave the stored levels as they are, and its positions have no point
  value.
- **Grid baskets are tracked for their drawdown.** A basket is every open
  position on one account with the same symbol and side, whatever their
  magic numbers (a grid EA may give each level its own; merging two EAs'
  positions overstates a basket, the safe direction for a risk figure).
  Its floating P&L is profit + swap over its positions; its drawdown is how
  far that is below zero. With each snapshot, in the same transaction,
  `track_baskets` in `schema.sql` keeps one `baskets` row per basket's
  life: its depth now,
  the most positions and lots it reached, and its worst floating with when
  it happened and the balance then. A basket closes at the first complete
  sync without it (not one cut short at the EA's 500, nor one shorter than
  the terminal's own count), or when its key comes back with none of the
  same positions. `basket_results` adds what its deals realised: those of
  every position a sync saw in it, and of any level opened on its symbol
  and side while it was open (one opened and closed between two syncs was
  never listed), counting only the deals on its side (on a netting account
  a reversal keeps the position id, and its close belongs to the side it
  closed). A tracking failure is undone on its own and logged in the
  database; the snapshot is still stored and the sync still succeeds. Like
  the account's max drawdown, a dip between two syncs is not seen.
- **A basket is marked closable, in green,** when it is in loss and this
  week's realised profit (closed trades since Monday, London, deposits and
  withdrawals excluded) is more than that loss: closing it now would still
  leave the week up. A week of +1,500 and a basket at -1,200 is closable,
  keeping +300. Each basket is judged against the week on its own, to the
  cent as shown; a loss that would take the week to zero or below, a basket
  in profit, a flat or losing week, an archived account and a position list
  cut short at the EA's 500 mark nothing at all. Logic in
  `src/lib/baskets.js` (`canCloseInProfit`) and `src/lib/attention.js`.
- **That green flag is the site's only highlight.** It shows in a panel on
  the overview and project pages (one quiet line when no basket can be
  closed), as a green row and chip in the accounts table, in the Baskets
  column, as a banner on the account page and on the basket itself. There
  are no notifications and no other warnings, by the owner's choice: an
  offline terminal, a deep floating drawdown, an account near margin call
  or stop-out, an old EA or a list cut short is never coloured or listed.
  Those figures are still shown, plainly: sync status is a dot in one
  neutral colour (filled syncing, hollow ring offline, dashed ring
  waiting), and margin and stop-out are figures on the account page.
  Colour anywhere else labels a figure and never warns: P&L by its sign,
  buy and sell, and the charts. Deposit, withdrawal and part-closed tags
  are plain grey.
- **One key per account.** Made on the admin screen, shown once, stored only
  as a SHA-256. The first sync binds the key to that login and server; the
  same key from a different login is refused.
- **Every deal is stored**, deposits and withdrawals included, so trading
  P&L and money moved in or out are always told apart.
- **The site is open; the database is not.** There is no sign-in and no
  sign-up: anyone with the link sees every account, figure and report. The
  server reads with the service role, and the database refuses the browser
  roles outright, so nobody can query it directly or see more than the
  pages show. The site asks search engines not to list it.
- **One admin password.** `/admin` asks for `ADMIN_PASSWORD`, set in
  Vercel, at least 12 characters. There are no admin accounts. Every write
  goes through the service role after that check, or after `/api/sync`'s
  key check.

## What the figures mean

| Figure | Definition |
|---|---|
| Days, weeks, months | London days. Weeks start Monday. |
| Trading P&L | Profit + swap + commission + fees on every trade, plus broker charges and interest. Never deposits, withdrawals or credit. |
| Gain | Time-weighted, like Myfxbook's Gain: each day's P&L over its opening balance, chained. Deposits and withdrawals do not move it. |
| Floating drawdown | How far equity is below balance right now. |
| Open positions, margin | As the terminal reported them at its last sync. Margin level is MT5's own figure, equity over margin. |
| Basket drawdown | How far a basket's floating P&L (profit + swap of its positions) is below zero, in the account's currency and as a share of balance. Its worst is the lowest seen at any sync while it was open. |
| Closable basket | A basket in loss whose floating loss is smaller than this week's realised trading P&L, so closing it now leaves the week up; what it would keep is shown. Nothing else about a basket is flagged. |
| Max drawdown (account) | Largest fall in equity from its peak, sampled at every sync since the account was first connected. Deposits and withdrawals move the peak, so taking money out is not a drawdown. Broker credit is excluded. |
| Max drawdown (reports) | Largest day-end fall of the gain index within the report's dates. |
| Totals | Added up per currency. Accounts in different currencies are never summed together. |

Past balances are walked back from today's balance, so the figures stay
right even if a terminal only ever sent part of its history.

## Setting it up

These steps are for a fresh install somewhere new. **The live deployment
already has its Supabase project and schema:** do not create a second
project. What is still pending for it is in `docs/handoff.md`, and
`docs/SETUP-PROMPT.md` does it in a browser.

### 1. Supabase

1. Create a new project.
2. SQL Editor: paste and run `supabase/schema.sql`. It is re-runnable; run it
   again after any change to it.

**Schema first, then code.** When a change touches `supabase/schema.sql`,
apply it in the SQL editor *before* the code that goes with it deploys
(before the push to `main`, or before promoting the deployment). The new
pages and `/api/sync` read and call what the schema adds, so code that
lands first fails until the schema catches up; the schema is written so the
code still running keeps working against it in the meantime. For the
margin and stop-out change, that means applying the schema, then
deploying: it adds the broker's levels to `accounts` and `point_value` to
`open_positions`, and `sync_open_positions` (same arguments) starts
storing each position's point value; the site still running never names
the new columns. The same run drops `replace_open_positions`, which
nothing has called since the basket tracking change went live: the site
calls `sync_open_positions` only.

Supabase Auth is not used, so nothing under Authentication needs setting.

### 2. Vercel

1. Import this repository as a new project.
2. Set the variables in `.env.local.example`: the Supabase URL, the secret
   key (in `SUPABASE_SERVICE_ROLE_KEY`; Project Settings, API Keys,
   "Publishable and secret API keys"; the legacy `service_role` key also
   works until Supabase retires it at the end of 2026), `APP_URL` and
   `ADMIN_PASSWORD`. Mark the secret key and `ADMIN_PASSWORD` Sensitive, and
   make the password long and random: it is the only thing guarding
   `/admin`.
3. Deploy, and add your domain if you have one.

### 3. The admin screen

Open `/admin` and enter `ADMIN_PASSWORD`. To change the password, change it
in Vercel and redeploy; every browser is signed out of admin.

### 4. Adding an account

1. Admin -> Accounts: choose the project, name the account, **Add account**.
2. **Download the EA for <account>**. The file has that account's SyncUrl
   and SyncKey built in (the key is shown only then; only its hash is
   stored).
3. On the terminal: File -> Open Data Folder -> `MQL5/Experts`, put the file
   there, then right-click Expert Advisors in the Navigator -> Refresh (or
   open it in MetaEditor and press Compile).
4. Tools -> Options -> Expert Advisors: tick **Allow WebRequest for listed
   URL** and add the site's origin (`APP_URL`; the admin screen shows it
   with a Copy button).
5. Drag the EA onto one chart of that account and press OK; nothing needs
   typing. The chart's corner shows each sync's result, and the account
   fills in on the site within a couple of minutes, full history included.

The blank EA (top of the admin screen) and the two values under "Setting it
up by hand" are there for doing it the old way.

A lost key, or a terminal to set up again: **New key** on the admin screen
and download the EA again; the old key stops working at once. A gap in
history: **Resync history** makes the EA send everything again; nothing is
duplicated.

### 5. Sharing the site

Send the link. Anyone who has it sees everything; there is nothing to set
up for them.

## Development

**On a new laptop, start with [`docs/NEW-MACHINE.md`](docs/NEW-MACHINE.md).**
Where things stand is in [`docs/handoff.md`](docs/handoff.md), newest first.

```bash
npm ci
npm test         # unit tests, plus the schema run against an in-process Postgres
npm run lint
npm run build
npm run dev
```

Node 22 or later (CI uses 24). Plain JavaScript, Next.js 16 App Router,
React 19, Tailwind CSS 4, Supabase, Recharts, pdfkit.

| Path | What |
|---|---|
| `supabase/schema.sql` | Tables, RLS, views, the function /api/sync calls. Applied by hand, before the code that needs it deploys. |
| `src/app/api/sync/route.js` | The EA's endpoint. Logic in `src/lib/syncIngest.js`. |
| `src/lib/accountStats.js` | Every figure, for screens and PDFs alike. |
| `src/lib/db.js` | The server's database client, for every page and report. |
| `src/lib/access.js` | The admin password check (`src/lib/adminAuth.js`). |
| `src/app/(app)/admin/actions.js` | Every write the admin screen makes. |
| `src/lib/reportPdf.js` | The PDF reports. |
| `public/ea/KeystoneSync.mq5` | The read-only MT5 EA. |

## Known limits

- Deal times are converted to UTC with the broker's offset at the moment
  they are sent. History resent after a daylight-saving change can be an
  hour out for deals from before it, which can move a deal near midnight
  onto the next or previous day.
- MT5 only. An MT4 version of the EA would need writing.
- Max equity drawdown is only as fine as the sync interval: a dip and
  recovery between two syncs is not seen. The day-end figure in reports
  does not depend on it.
- Hosting: two-minute syncs are about 22,000 requests a month per terminal,
  so a dozen terminals fit comfortably inside Vercel's free allowance.
