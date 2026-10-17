# Keystone Monitor

A private site where business partners follow external MT5 accounts for the
**V100** and **Cycle Method** projects: balance, equity, drawdown, P&L by
day, week and month, every closed trade, and PDF reports for any date range.

It is a standalone app with its own database and hosting. It shares no code,
data or credentials with any other system.

## How it works

```
MT5 terminal                       This site (Vercel)                 Supabase
KeystoneSync.mq5  --- HTTPS --->   /api/sync  (per-account key)  -->  accounts, deals,
(read-only EA)                                                        equity_samples
                                   Pages, PDFs  <-- RLS reads ------  account_daily view
Partners (password + 2FA)  --->                                       account_positions view
```

- **The EA only reads.** `public/ea/KeystoneSync.mq5` has no trading code at
  all, and `tests/ea.test.mjs` fails if any is ever added. It posts the
  account's state and its deals every two minutes, and straight away when a
  deal lands. It runs beside any trading EA.
- **One key per account.** Made on the admin screen, shown once, stored only
  as a SHA-256. The first sync binds the key to that login and server; the
  same key from a different login is refused.
- **Every deal is stored**, deposits and withdrawals included, so trading
  P&L and money moved in or out are always told apart.
- **Partners need a password and an authenticator code.** Row-level
  security enforces it in the database too: a session without two-factor
  reads nothing. Nobody writes through the browser; every write goes
  through the service role after a server-side admin check.
- **Invite only, no email needed.** The admin screen makes invite and
  password-reset links to send directly (WhatsApp, Telegram, anything).

## What the figures mean

| Figure | Definition |
|---|---|
| Days, weeks, months | London days. Weeks start Monday. |
| Trading P&L | Profit + swap + commission + fees on every trade, plus broker charges and interest. Never deposits, withdrawals or credit. |
| Gain | Time-weighted, like Myfxbook's Gain: each day's P&L over its opening balance, chained. Deposits and withdrawals do not move it. |
| Floating drawdown | How far equity is below balance right now. |
| Max drawdown (account) | Largest fall in equity from its peak, sampled at every sync since the account was first connected. Deposits and withdrawals move the peak, so taking money out is not a drawdown. Broker credit is excluded. |
| Max drawdown (reports) | Largest day-end fall of the gain index within the report's dates. |
| Totals | Added up per currency. Accounts in different currencies are never summed together. |

Past balances are walked back from today's balance, so the figures stay
right even if a terminal only ever sent part of its history.

## Setting it up

### 1. Supabase

1. Create a new project.
2. SQL Editor: paste and run `supabase/schema.sql`. It is re-runnable; run it
   again after any change to it.
3. Authentication -> Sign In / Providers -> Email: **turn off "Allow new users
   to sign up"**. Accounts are made only by invitation.
4. Authentication -> Multi-Factor: TOTP should be enabled (it is by
   default).
5. Authentication -> URL Configuration: set Site URL to the site's address.

### 2. Vercel

1. Import this repository as a new project.
2. Set the variables in `.env.local.example`: the Supabase URL, anon key,
   service-role key, and `APP_URL`.
3. Deploy, and add your domain if you have one.

### 3. The first admin

```bash
npm ci
cp .env.local.example .env.local   # fill in the same values as on Vercel
node --env-file=.env.local scripts/create-admin.mjs you@example.com "Your Name"
```

Open the printed link, choose a password, scan the QR code with an
authenticator app. Everything else is done from the **Admin** screen.

### 4. Adding an account

1. Admin -> Accounts: choose the project, name the account, **Add account**.
   Copy the SyncKey and SyncUrl it shows; the key is never shown again.
2. On the terminal: download the EA from the Admin screen, copy it to
   `MQL5/Experts`, compile it in MetaEditor.
3. Tools -> Options -> Expert Advisors: tick **Allow WebRequest for listed
   URL** and add the site's origin (`APP_URL`).
4. Attach KeystoneSync to one chart on that account, paste the two values,
   OK. The chart's corner shows each sync's result, and the account fills in
   on the site within a couple of minutes, full history included.

A lost key: **New key** on the admin screen, then paste it into the EA. A
gap in history: **Resync history** makes the EA send everything again;
nothing is duplicated.

### 5. Inviting partners

Admin -> Partners: email, name, role -> **Create invite link**, and send the
link. Partners see everything; admins can also add accounts and invite
people. Lost phone: **Reset 2FA**. Forgotten password: **Password link**.

## Development

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
| `src/lib/access.js` | Sign-in, membership and two-factor checks. |
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
