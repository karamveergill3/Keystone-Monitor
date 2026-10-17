# Handoff log

Newest entry first. Write one when you wrap up a session, before you switch
machines. Keep the four headings.

---
## 2026-10-17 (Claude Code, Mac): Open positions on the account page

### What changed

- The EA (2026.10.17.2) now sends every open position, up to 200, on each
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

- **Run `supabase/schema.sql` on the live database before this reaches
  `main`.** Until the table and `replace_open_positions()` exist the account
  page fails its read and a new EA's syncs get a 500 (old EAs keep
  syncing).
- `OPEN_POSITIONS_EA` in `src/lib/openPositions.js` is the first EA build
  that lists positions. Later builds compare above it; a test checks the
  EA's own `EA_VERSION` does.
- MQL5 cannot be compiled here. The new code uses only position reads
  (`PositionsTotal`, `PositionGetTicket`, `PositionGetString/Integer/Double`),
  but compile it once in MetaEditor before handing it out.

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
