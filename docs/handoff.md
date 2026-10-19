# Handoff log

Newest entry first. Write one when you wrap up a session, before you switch
machines. Keep the four headings.

---
## 2026-10-19 (Claude Code, Mac): Fleet summary redesigned as a one-page overview

### What changed

- `/api/reports/fleet` (and **Print fleet summary**) is now one portrait A4
  page laid out like the owner's sample: masthead, Purpose, How it works
  (each algorithm's accounts, trades, realised profit and win rate), the
  fleet's cumulative realised profit, nine headline figures and a Fleet
  performance panel saying how they were worked out. It replaces the
  landscape per-account table; the closable-basket list is no longer
  printed (it is still on the overview).
- New figures: `fleetReportModel` in `src/lib/reportModel.js`;
  `pooledReturns` in `src/lib/accountStats.js` (several accounts chained
  as one, time-weighted). Floating drawdown comes from two new read-only
  SQL functions in schema section 4, `floating_worst` and
  `equity_sample_gaps` (service role only), via `floatingHistoryFor` in
  `src/lib/data.js`.
- The page always fits one sheet: text is measured first, optional lines
  are dropped in a set order, and the chart takes the height left.
- Reviewed by a multi-agent pass; its eight confirmed findings were fixed
  (pooled return made time-weighted, drawdown coverage stated per account,
  overflow, empty chart axis, masthead alignment, docs).

### State

- Committed and pushed; the two SQL functions are applied to the live
  database (applied before the push: the route calls them).

### Next

- Optional: a page 2 with the per-account table, if the office wants it.

### Watch out for

- Equity samples only began on 19 Oct (tracking restarted), so the
  drawdown record is short for now; the page says so.

---
## 2026-10-19 (Claude Code, Mac): Algorithms on the admin page; office printing

### What changed

- Admin: an **Algorithms** card adds, renames and (when empty) deletes a
  project, so a new bot sits beside V100 and Cycle Method.
- Printing (`docs/print-agent.md`): **Print fleet summary** in the header
  and **Print** beside **Download PDF** in the project and account report
  boxes, admins only. Pull-only: `POST /api/print` queues a row in
  `print_jobs` (with the report's `path`); `scripts/print-agent.mjs` on the
  office Mac polls `/api/print-queue` with its own key (SHA-256 in
  `print_agent_keys`), prints with `lp` and reports back. One queued job per
  report, so a repeat click while the Mac sleeps prints once.
- Fleet summary PDF at `/api/reports/fleet` (landscape A4). Section titles
  keep room for what follows, so none is left alone at a page foot.
- Schema section 9 (print) is applied to the live database; the functions'
  md5 matches the repo.

### State

- Committed and pushed. The agent is installed on the office Mac as
  `office-mac` (LaunchAgent `keystone-monitor.printagent`, script copied to
  `~/Library/Application Support/Keystone Monitor/`, key in
  `~/.keystone-monitor-print.env`, its hash the one row in
  `print_agent_keys`). Test job 1, a fleet summary, printed in 6 seconds.

### Next

- Keep the office Mac from sleeping on mains power (`sudo pmset -c sleep 0`,
  needs the owner's password), or Print says offline while it sleeps.
- After changing `scripts/print-agent.mjs`, copy it to the folder above and
  `launchctl kickstart -k gui/$(id -u)/keystone-monitor.printagent`.

### Watch out for

- The agent prints only addresses under `/api/reports/` on its own
  `PRINT_AGENT_URL`; the table's check allows nothing else either.

---
## 2026-10-17 (Claude Code, Mac): Distance to stop-out; highlights cut to the green closable flag (18 Oct); admin PIN with a lockout (19 Oct)

### What changed

- (19 Oct) The admin page is a calm list: an "Add an account" card (name
  and a V100 / Cycle Method choice), then each project's accounts as rows
  (status, name, login, last sync, EA) with one "Manage" panel each:
  rename or move, Make/New key, resync history, archive, and delete for
  one that never synced. Archived accounts fold away at the bottom.
  `AdminAccountRow.js` and `AdminAccountPanel.js` are new.
- (19 Oct) "Copy the code for MetaEditor" is gone, by the owner's choice
  (a long paste turns into "message.txt" in chat apps): the only way is
  the ready-made `.mq5` download KeyReveal offers after Make/New key, saved
  as a binary download so no browser renames it to .txt. `EaCodeBox.js`
  is deleted; the blank EA stays as a link in admin's EA section.
- (19 Oct) The accounts table's Floating DD shows the money under the
  percentage (equity less balance, credit out).
- (19 Oct) All eight demo accounts were deleted from the live database by
  the owner's choice; `supabase/demo-account.sql` still makes them.
- (19 Oct) `ADMIN_PASSWORD` can be a 4-digit PIN, by the owner's choice
  (`MIN_PASSWORD_LENGTH` is 4; shorter or missing still switches admin
  off). Because the Admin link is on every page, the PIN is guarded by a
  lockout in the database: `schema.sql` section 7 adds the
  `admin_guard` table (one row per password tag) and `admin_attempt(p_tag, p_ok, p_max, p_lock)`
  (service role only; later sections renumbered 8 to 10). After 5 wrong
  tries in a row, from anyone, every attempt is refused for 1 hour, the
  right PIN included, and the count is left alone while locked; a right
  PIN when not locked resets it. The row stores a tag of the current
  password, an HMAC keyed by `SUPABASE_SERVICE_ROLE_KEY` (`adminTag()` in
  `src/lib/adminAuth.js`); each tag keeps its own count, so a new PIN
  starts unlocked (changing `ADMIN_PASSWORD` in Vercel and redeploying
  unlocks admin at once) and an old deployment or a local copy with
  another PIN never resets the current one's count. The
  admin cookie's HMAC is now keyed by the pepper and the password
  together (same format and 30-day life), so a stolen cookie cannot be
  used to try PINs offline. The sign-in action decides in
  `src/lib/adminGuard.js` (`checkAdminAttempt()`, tested with a fake rpc):
  locked says the London time it unlocks; wrong keeps the 1-second pause
  and says how many tries are left; a failed database call refuses with
  "Admin sign-in is unavailable right now" (fail closed). The form's
  label is "Admin PIN" with a numeric keypad.
- (18 Oct) Eight demo accounts instead of one, for more of an overview:
  `supabase/demo-account.sql` now (re)creates d001 to d008 (all `DEMO ·`,
  account numbers 90000001 to 90000007): "Test account · 50k" kept as it
  was, plus V100 100k, 25k (a losing week) and 10k (nothing open), and
  Cycle Method 30k GBP, 75k (a deep US30 basket), 20k (last synced six
  hours ago) and a new account that has never synced. One generator
  (`pg_temp.demo_account`, fed a JSON list of the eight) builds each one;
  market time is now general (`pg_temp.demo_m`/`demo_t`, market seconds,
  any number of weekends). Each account's realised P&L for this London
  week comes out at a fixed figure to the cent on any run day, via a last
  balancing basket inside the week, so the closable flags never change:
  d001 EURUSD; d002 GBPUSD and US30; d003 and d004 none; d005 XAUUSD and
  GBPUSD; d006 EURUSD; d007 XAUUSD. Checked in PGlite as of a Monday
  00:03 and 00:20, Monday 03:00, Wednesday, Friday 21:50, Saturday 09:00
  and 12:00, Sunday 22:05 and 22:14:59 (just after the market opens) and
  Sunday 23:00 (a clock-change day), and run twice: about 3 to 8 seconds
  a run there. Every closed basket sits inside the sampled 30 days and is
  never deeper than the equity chart went; d007 always reads 6 hours
  since its last sync. README step 6 describes it. Loaded on the live
  database on 19 Oct.
- (18 Oct) Every warning is gone, by the owner's choice: the green
  closable basket flag is the only highlight on the site. Nothing is
  flagged or coloured for an offline terminal, stop-out or margin call
  (near or reached), floating drawdown, stop-out not checked, a position
  list cut short, an old EA or a terminal waiting for its first sync.
  `src/lib/attention.js` keeps only `accountAttention()` (`{ level:
  "green", reasons: [basket-closable] }` or `{ level: null, reasons: [] }`;
  archived accounts get nothing), `attentionItems()` (closable accounts
  only, by label) and `distanceLabel()`; `LIMITS`, `LEVELS_ORDER`,
  `stopOutLevel()` and `floatingDdLevel()` are removed, and
  `accountAttention()` no longer takes `risk` or `now`. The panel on the
  overview and project pages shows only "{n} account(s) can close a basket
  and stay up for the week", or one quiet line, "No basket can be closed
  in profit right now."; the accounts table tints and tags a row green
  only for the flag (Floating DD is a plain figure); the account page's
  banner shows only the flag. The Margin and stop-out section keeps every
  figure, uncoloured, with no icons or Act now/Watch labels. The sync dot
  keeps its shapes (filled, hollow ring, dashed ring) in one neutral
  colour, and Archived is muted. `src/components/AttentionBanner.js`
  exports `CLOSABLE`, `CheckIcon`, `ClosableIcon` and `ReasonLine` in
  place of `LEVELS`, `levelStyle`, `worstLevel`, `distanceLevel` and
  `ReasonIcon`; `WarnIcon.js` is deleted. The closable flag itself is
  unchanged, including that nothing is closable while the EA's list is
  cut short.
- (18 Oct) The basket flag is now green, not red: a basket is marked
  closable when it is in loss and this week's realised profit is more than
  that loss, so closing it now still leaves the week up (made +1,500, a
  basket at -1,200: closable, keeps +300). Anything else about a basket
  marks nothing. `canCloseInProfit()` and `closeReason()` in
  `src/lib/baskets.js` replace `isDeeperThanWeek()` and `flagReason()`;
  `accountBaskets()` gives `closable` (and per basket `closable`,
  `leftover`) in place of `flagged` and `banked`; attention's red
  `basket-week` reason is now the green `basket-closable` one (later the
  same day, the only one: see above).
- No alerts of any kind, by the owner's choice. (Removed 18 Oct, see the
  first bullet: what follows is how it was on 17 Oct.) The site
  highlighted what needed looking at: `src/lib/attention.js` gave each
  account its reasons (red: under 2% from stop-out, at margin call,
  floating drawdown from 10%; amber: under 5% from stop-out, floating
  drawdown from 5%, stop-out not checked, a position list cut short at
  500, offline, EA too old, waiting for a first sync; green, from 18 Oct:
  a basket closable with the week still up), shown in a Needs attention
  panel on the overview and project pages, as tinted rows with reason
  tags in the accounts table, and as a banner on the account page, with
  thresholds in `LIMITS`.
- Distance to stop-out (`src/lib/risk.js`): per symbol, net lots times the
  point value against the equity above the broker's margin call and
  stop-out, shown in the account page's Margin and stop-out section. The
  Open baskets table had a To stop-out column too; the owner had it taken
  out (18 Oct).
- EA 2026.10.17.5 sends the broker's levels (ACCOUNT_MARGIN_SO_MODE,
  _SO_CALL, _SO_SO) and each position's point value (tick value on loss /
  tick size). Stored as accounts.stop_out_mode, margin_call_level,
  stop_out_level and open_positions.point_value.
- `replace_open_positions()` is dropped; `sync_open_positions()` is the
  only write path for open positions.

### Why

Grid bots fail by trending into stop-out, so every account's margin and
distance to stop-out is on its page. On 18 Oct the owner chose to have no
warnings at all, only the green flag for a basket that can be closed with
the week still up.

### Watch out

- (19 Oct) Apply `supabase/schema.sql` before the admin PIN code deploys:
  until `admin_attempt` exists, every sign-in is refused as unavailable.
  The deploy signs every browser out of admin once (the cookie key
  changed), and so will rotating `SUPABASE_SERVICE_ROLE_KEY`, which also
  clears the lock. A bot can keep admin locked by sending five wrong tries each hour;
  changing the PIN is the way back in. Local `npm run dev` shares the
  lockout with the live site (one database).
- Since 18 Oct nothing on the site says an account is near stop-out,
  offline or unchecked: read the figures. Until a terminal runs EA
  2026.10.17.5 its Margin and stop-out section has no distances (it says
  the EA does not send the broker's levels), and the panel says nothing
  about it.
- The demo accounts are never synced, so their sync dots read offline
  10 minutes after the file is run (d007 at once, d008 waiting), and
  their week resets each Monday until it is run again. Run in the first
  quarter hour of a Monday, d007 still reads online and the balancing
  baskets open and close at 00:00 exactly: the week is that young.
  (18 Oct)
- The 18 Oct change was checked with `npm test`, `npm run lint` and a
  server render of the changed components; `npm run build` was not run.

### Still needs a human

- (19 Oct) Run `supabase/schema.sql` on the live database, then set
  `ADMIN_PASSWORD` in Vercel to the 4-digit PIN (Sensitive) and redeploy.
  `npm run build` was not run for this change, and the sign-in was not
  tried against the live database.
- Compile EA 2026.10.17.5 in MetaEditor (not compiled here) and attach it
  to every terminal.
- (18 Oct) Run the new `supabase/demo-account.sql` on the live database
  (SQL editor or connector) to load the eight demo accounts; it replaces
  the old one.

---
## 2026-10-17 (Claude Code, Mac): Grid baskets tracked and flagged, new charts, paged lists; all live

### What changed

- Grid-bot baskets. A basket is every open position on one account with
  the same symbol and side (magic ignored on purpose). The account page
  lists the open ones (positions, lots, average price, floating, drawdown,
  worst so far) and the closed ones (worst drawdown, result from their
  deals), and flags a basket whose floating loss is more than the week's
  realised profit (any loss, when the week has banked nothing). The
  overview and project pages show a red alert for every flagged basket and
  a Baskets column. Logic in `src/lib/baskets.js`. (18 Oct: that red flag
  is gone; a basket is now marked green when it can be closed with the
  week still up. See the entry above.)
- The database tracks each basket's life: `baskets`, `basket_results`
  and `sync_open_positions()`, which replaces the snapshot and tracks the
  baskets in one locked step, ignores a sync older than the last snapshot,
  and keeps the snapshot if tracking fails. `replace_open_positions()` is
  superseded and kept only for the rollout window. Equity samples now keep
  broker credit, which the chart takes out.
- EA 2026.10.17.4 sends each position's POSITION_IDENTIFIER. Older EAs
  from 2026.10.17.2 are still tracked (the ticket stands in).
- Charts: balance is a step line with deposit and withdrawal markers; the
  equity chart shades the floating drawdown, marks the deepest point and
  keeps the deepest reading in each window, with round axis figures.
- Trade history and closed baskets show 10 and 5 a page with arrows; the
  accounts table's figures are centred; figures use Oxanium.
- The demo account was reloaded with grid baskets (gold flagged; its loss
  is deeper than the week, so since 18 Oct it is not marked closable).

### Why

The accounts being tracked run mean reversion grid bots: what matters is
how deep each basket goes and whether one could wipe out the week.

### Watch out

- Apply `supabase/schema.sql` before deploying code that needs it (this
  time it was applied first, via the Supabase connector).
- Two EAs on one login are survivable now, but still one chart per login.

### Still needs a human

- Compile EA 2026.10.17.4 in MetaEditor (not compiled here) and attach it.
- Drop `replace_open_positions()` (schema, grants, tests) in a later change.

---
## 2026-10-17 (Claude Code, Mac): Logo, pastel-futuristic look, one-step terminal setup, open positions; all live

### What changed

- A pastel, futuristic look to go with the logo: a cool light base under
  a soft pastel aurora with fine grain, a holographic rule under the
  header, HUD corner brackets (`.hud`), Space Grotesk with figures (`.num`
  and the chart axes) in Oxanium, whose digits are all one width; code and
  keys use the system monospace. Teal and orchid chart lines; every text colour at least
  5:1 on its surface (tokens in `src/app/globals.css`). Sync status is a
  filled dot, a hollow ring (offline) or a dashed ring (waiting), so it
  reads without colour.
- Each overview row has a **Breakdown** link to that account's page.
- The logo (`src/lib/logo.js`, `src/app/icon.svg`, `src/app/apple-icon.js`)
  is the owner's neon winged keystone, redrawn as SVG; the original is in
  `public/brand`.
- Right after a key is made, the admin screen offers **Download the EA for
  <account>**: the EA with that account's SyncUrl and SyncKey filled in as
  its inputs (`src/lib/eaFile.js`), beside numbered terminal steps and the
  WebRequest address with a Copy button. Nothing is typed at the terminal.
- `next.config.mjs` turns off Turbopack's on-disk build cache: Vercel
  restored it and the first restyle deploy kept the old stylesheet.
- The EA (2026.10.17.3) now sends every open position, up to 500, on each
  sync: ticket, symbol, side, lots, open and current price, SL, TP, swap,
  profit, open time (UTC, same offset as deals), magic and comment.
  `BuildOpen()` only reads; `tests/ea.test.mjs` still forbids any trading
  call and now also checks the position fields are sent.
- New table `open_positions` (section 5 of `schema.sql`; later sections
  renumbered), RLS on, no policies, refused to the browser roles. Each sync
  that carries positions replaces the account's rows through
  `replace_open_positions()`, one transaction (service role only), so a
  failure keeps the previous list; a sync from an older EA (no `open` in
  the payload) leaves them. Each row is stamped with its sync's time.
- The account page has an "Open positions" section after the charts:
  margin, free margin and margin level as of the last sync, then the table.
  `src/lib/openPositions.js` decides what it shows: rows older than the
  account's last sync (an older EA took over) are never listed as current,
  and with positions open but none listed it says the EA is older, or, if
  the EA is already 2026.10.17.2 or later, that the next sync shows them.
- `tests/ea.test.mjs` now checks each builder (`BuildAccount`, `BuildDeals`,
  `BuildOpen`, `SendPage`) sends its own fields, not just the file as a
  whole.

### Why

The owner wants the site to show what each terminal has open right now,
along with the margin figures the EA already sent.

### Watch out

- The `open_positions` table and `replace_open_positions()` were added to
  the live database before this was pushed (checked: RLS on, execute for
  service_role only, no browser grants). Run `schema.sql` again after any
  change to it, as before.
- `OPEN_POSITIONS_EA` in `src/lib/openPositions.js` is the first EA build
  that lists positions. Later builds compare above it; a test checks the
  EA's own `EA_VERSION` does.
- MQL5 cannot be compiled here. The new code uses only position reads
  (`PositionsTotal`, `PositionGetTicket`, `PositionGetString/Integer/Double`),
  but compile it once in MetaEditor before handing it out. Terminals on the
  older EA keep syncing; they just do not list open positions until they
  get the new file (New key, then download).

- The live site has a demo account, "DEMO · Test account · 50k" in V100,
  loaded from `supabase/demo-account.sql`. Remove it when real accounts
  are in (the delete is at the top of that file), or archive it.

### Still needs a human

- [ ] Run `supabase/schema.sql` in the Supabase SQL editor, then deploy.
- [ ] Compile the new EA in MetaEditor and replace it on each terminal
      (download it again from the admin screen). Check the chart's corner
      reads "... positions open" after a sync.

---
## 2026-10-17 (Claude Code, Mac): Open to anyone with the link; live on Vercel

### What changed

- No sign-in of any kind. Every page and PDF is open to anyone with the
  link; the site still asks search engines not to list it. Login, invites,
  password links, two-factor, the members list, the session proxy and
  `@supabase/ssr` are all deleted.
- Pages read through the service role on the server (`src/lib/db.js`). The
  schema now has no policies and refuses `anon` and `authenticated`
  outright, so the browser cannot query Supabase at all. A re-run drops the
  old `members` table, `is_member()` and the members-only policies.
- `/admin` is kept for accounts and sync keys, behind one shared password,
  `ADMIN_PASSWORD` (12+ characters). The cookie is an HMAC keyed by it, so
  changing the password signs everyone out. Logic in `src/lib/adminAuth.js`;
  `tests/adminActions.test.mjs` fails if an admin action stops checking it.
- Vercel project `keystone-monitor` (Hobby) imported from `main` and live
  at https://keystone-monitor.vercel.app, with `ADMIN_PASSWORD` set.
- `docs/SETUP-PROMPT.md` rewritten for the open site.

### Why

The owner wants the site open to everyone with the link: no sign-up, no
accounts, no two-factor. Asked how accounts and EA keys should be added
without one, the owner asked for an admin screen; one shared password keeps
strangers from changing them.

### Watch out

- The new `schema.sql` was run on the live database before this was
  pushed (checked: no policies, no `members`, no `is_member()`, no grants
  to the browser roles). Run it again after any change to it, as before.
- MT5 login numbers and servers are shown publicly, by the owner's choice.
- Vercel holds the legacy `service_role` key in `SUPABASE_SERVICE_ROLE_KEY`.
  Swap it for the `sb_secret_` key before Supabase retires legacy keys at
  the end of 2026. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is still set on Vercel
  but nothing uses it now. The variables are for Production and Preview;
  `ADMIN_PASSWORD` is Production only.
- Supabase Auth settings (sign-ups, Site URL, TOTP) no longer matter: the
  site does not use Supabase Auth. The older entry's Auth and first-admin
  items are obsolete.
- The Supabase project sits in an organization shared with another
  project, so that organization's members can open it, and it shows "Grace
  period is over" (Free plan quota).

### Still needs a human

- [ ] Add the first account at `/admin`, compile the EA in MetaEditor and
      attach it to that account's terminal.
- [ ] Before the end of 2026: put the `sb_secret_` key in Vercel's
      `SUPABASE_SERVICE_ROLE_KEY`, redeploy, check the site.
- [ ] Decide whether the GitHub repository should be private.

---
## 2026-10-17 (cloud session): Built, reviewed, database live; not yet deployed

Conversation: cloud session "External account tracking project",
https://claude.ai/code/session_012wmEgp6CufrfPoWiuw8Q5V (opens from any
device signed in to the same Claude account).

### What changed

- The whole app: sign-in with mandatory two-factor, overview of both
  projects, project and account pages, P&L by day/week/month, trade
  history, PDF reports, admin screen for accounts and partners, the
  `/api/sync` endpoint and the read-only EA (`public/ea/KeystoneSync.mq5`).
- A five-reviewer adversarial review before launch. Every confirmed
  finding is fixed (commit `fd7130c` and the two after it), including
  invite links surviving WhatsApp/Telegram previews and the win rate being
  counted per trade.
- Supabase project `avsfygkauoipytiqraau` (London) created, named
  "Keystone Monitor", and `supabase/schema.sql` applied, including the
  corrected views.
- `docs/NEW-MACHINE.md` (tested on a fresh clone) and
  `docs/SETUP-PROMPT.md` for the dashboard steps.

### Why

Business partners need to follow the external V100 and Cycle Method MT5
accounts, completely separate from every other project.

### Watch out

- **The GitHub repository is public.** Nothing secret is in it (the
  Supabase key in `.env.local.example` is the public publishable key), but
  code and docs are readable by anyone. Its history also still names
  another project, in commits `d86b819`, `fd7130c` and `b175582`: removing
  the words from today's files does not hide them; making the repository
  private does (GitHub, the repo's Settings, General, Danger Zone, Change
  visibility).
- **Supabase keys.** The two Supabase variables keep their names but should
  hold the new keys: the publishable key (`sb_publishable_`) in
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the secret key (`sb_secret_`) in
  `SUPABASE_SERVICE_ROLE_KEY`. If Vercel was first set up with the legacy
  `anon`/`service_role` keys, they work until Supabase retires them at the
  end of 2026: before then, swap the two values on Vercel, redeploy, check
  the site, and only then deactivate the legacy keys in Supabase. No code
  change is needed; the client library sends either kind correctly.
- **New sign-ups are still switched on in Supabase** until step 1a of the
  setup prompt is done. A stranger who signs up still sees nothing (they
  are not a member), but turn it off first.
- **There is one database.** Running the site locally uses the same data
  as the live site.
- **Pushes to `main` deploy** once Vercel is linked. Keep commits authored
  by `281717050+karamveergill3@users.noreply.github.com`: once the
  repository is private, Vercel refuses to deploy anyone else's.
- The EA has not been compiled yet: that needs MetaEditor on Windows (see
  `docs/NEW-MACHINE.md`).
- `schema.sql` must stay re-runnable, and view columns may only be added
  at the end (see the note in the views section of the file).

### Still needs a human

To have Claude do the first four in your browser: in a session with Chrome
(`docs/NEW-MACHINE.md`, step 7), paste the prompt in `docs/SETUP-PROMPT.md`.

- [x] Supabase project renamed to "Keystone Monitor".
- [ ] **Supabase Authentication: turn off new sign-ups**, set Site URL to
      the live address, check TOTP is on.
- [ ] Vercel: import `karamveergill3/Keystone-Monitor` as project
      `keystone-monitor` with the four environment variables in
      `.env.local.example` (the secret key from the Supabase dashboard).
- [ ] First admin, by the dashboard route in the setup prompt (Supabase
      Authentication, Users, Add user, then the SQL insert). This needs no
      local secrets; `scripts/create-admin.mjs` is the alternative only for
      a laptop with a filled-in `.env.local`.
- [ ] Sign in, set up two-factor, add the first account on the Admin screen,
      compile the EA in MetaEditor and attach it to that account's terminal.
- [ ] Invite partners from the Admin screen.
- [ ] Decide whether the GitHub repository should be private.
- [ ] Before the end of 2026: make sure Vercel holds the new publishable
      and secret keys, not the legacy ones (see Watch out).
