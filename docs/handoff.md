# Handoff log

Newest entry first. Write one when you wrap up a session, before you switch
machines. Keep the four headings.

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
  at the end (see the note in section 6 of the file).

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
