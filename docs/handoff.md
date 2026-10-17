# Handoff log

Newest entry first. Write one when you wrap up a session, before you switch
machines. Keep the four headings.

---
## 2026-10-17 (cloud session): Built, reviewed, database live; not yet deployed

### What changed

- The whole app: sign-in with mandatory two-factor, overview of both
  projects, project and account pages, P&L by day/week/month, trade
  history, PDF reports, admin screen for accounts and partners, the
  `/api/sync` endpoint and the read-only EA (`public/ea/KeystoneSync.mq5`).
- A five-reviewer adversarial review before launch. Every confirmed
  finding is fixed (see commit `fd7130c` and the two after it), including
  invite links surviving WhatsApp/Telegram previews and the win rate
  being counted per trade.
- Supabase project `avsfygkauoipytiqraau` (London) created and
  `supabase/schema.sql` applied, including the corrected views.
- Repo renamed on GitHub to `Keystone-Monitor`; `origin` points there.

### Why

Business partners need to follow the external V100 and Cycle Method MT5
accounts, fully separate from ForexDNA.

### Watch out

- **There is one database.** Running the site locally uses the same data
  as the live site.
- **Pushes to `main` deploy** once Vercel is linked. Commits must be
  authored by `281717050+karamveergill3@users.noreply.github.com` or Vercel
  refuses to deploy them.
- The EA has not been compiled yet: that needs MetaEditor on Windows.
- `schema.sql` must stay re-runnable, and view columns may only be added at
  the end (see the note in section 6 of the file).

### Still needs a human

- [ ] Vercel: import `karamveergill3/Keystone-Monitor` as project
      `keystone-monitor` with the four environment variables in
      `.env.local.example` (service-role key from the Supabase dashboard).
- [ ] Supabase: rename the project from "Pipsqueak" to "Keystone Monitor";
      Authentication: turn off new sign-ups, set Site URL to the live
      address, check TOTP is on.
- [ ] First admin: Supabase Authentication > Users > Add user (auto
      confirm), then in the SQL editor
      `insert into public.members (user_id, email, display_name, role) select id, email, 'Admin', 'admin' from auth.users where email = '...';`
- [ ] Sign in, set up two-factor, add the first account on the Admin screen,
      compile the EA in MetaEditor and attach it to that account's terminal.
- [ ] Invite partners from the Admin screen.
