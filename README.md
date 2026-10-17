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
                                                                      open_positions
                                   Pages, PDFs  <-- server reads ---  account_daily view
Anyone with the link       --->                                       account_positions view
```

- **The EA only reads.** `public/ea/KeystoneSync.mq5` has no trading code at
  all, and `tests/ea.test.mjs` fails if any is ever added. It posts the
  account's state (balance, equity, margin), its open positions and its
  deals every two minutes, and straight away when a deal lands. It runs
  beside any trading EA.
- **Open positions are a snapshot.** Each sync replaces the account's
  `open_positions` rows with what the terminal has open, in one transaction
  (`replace_open_positions` in `schema.sql`), so the account page shows them
  as of the last sync and a failed sync keeps the previous list. An EA older
  than 2026.10.17.2 does not send them; its syncs leave the table alone, and
  the page, seeing rows older than the last sync, hides them and says to
  update the EA.
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
| `supabase/schema.sql` | Tables, RLS, views. Applied by hand. |
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
