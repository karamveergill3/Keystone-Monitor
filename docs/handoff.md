# Handoff log

Newest entry first. Write one when you wrap up a session, before you switch
machines. Keep the four headings.

---
## 2026-10-17 (Claude Code, Mac): Distance to stop-out; highlights cut to the green closable flag (18 Oct)

### What changed

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

- Since 18 Oct nothing on the site says an account is near stop-out,
  offline or unchecked: read the figures. Until a terminal runs EA
  2026.10.17.5 its Margin and stop-out section has no distances (it says
  the EA does not send the broker's levels), and the panel says nothing
  about it.
- The demo account is never synced, so its sync dot is a hollow ring
  (offline) after 10 minutes; nothing else marks it.
- The 18 Oct change was checked with `npm test`, `npm run lint` and a
  server render of the changed components; `npm run build` was not run.

### Still needs a human

- Compile EA 2026.10.17.5 in MetaEditor (not compiled here) and attach it
  to every terminal.

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
