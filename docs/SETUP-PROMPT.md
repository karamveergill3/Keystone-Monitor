# Setup prompt for the dashboard steps

For setting the site up again from nothing: a new Vercel project, or a new
Supabase project. The live deployment is already set up (see
`docs/handoff.md`).

Paste everything below the line into a Claude session that can use Chrome:
`claude --chrome` in a terminal, or the Desktop app's Code tab with
Environment: Local. See `docs/NEW-MACHINE.md`, step 7. No secrets are in
this file. The secret key is copied from Supabase to Vercel inside the
browser and the admin password is typed by you, never into the chat.

---

Use Claude in Chrome to set up my site "Keystone Monitor". The code is done and on GitHub; you only need the Vercel and Supabase dashboards, which I'm signed in to in Chrome. Work in new tabs. Only touch the Supabase project with ID avsfygkauoipytiqraau and the Vercel project keystone-monitor: if a step would change any other project, stop and ask me. Never paste the secret key or the admin password into this chat or anywhere except the Vercel fields below.

The site has no sign-in: anyone with the link sees it. Only /admin asks for a password, ADMIN_PASSWORD. Supabase Auth is not used, so skip everything under Authentication.

Facts you need:
- GitHub repo: karamveergill3/Keystone-Monitor (branch main)
- Vercel account: karamveergill3 (Hobby). Project name to use: keystone-monitor
- Supabase project ID avsfygkauoipytiqraau, named "Keystone Monitor", URL https://avsfygkauoipytiqraau.supabase.co

Steps (skip any that are already done, and tell me which):

1. Supabase, project avsfygkauoipytiqraau:
   a. SQL Editor: run the whole of supabase/schema.sql from the repo (it is re-runnable). Then check with: select count(*) from pg_policies where schemaname = 'public'; which must be 0.
   b. Project Settings > API Keys > "Publishable and secret API keys" tab > Secret keys: I will reveal and copy the "default" secret key (it starts sb_secret_) myself for step 2. Do not reveal it yourself and do not show it to me.

2. Vercel: go to https://vercel.com/new and import karamveergill3/Keystone-Monitor (if it is not listed, ask me before using "Adjust GitHub App Permissions"). Project name keystone-monitor, framework Next.js, root directory the repo root. Before deploying, add these Environment Variables for Production and Preview:
   - NEXT_PUBLIC_SUPABASE_URL = https://avsfygkauoipytiqraau.supabase.co
   - APP_URL = https://keystone-monitor.vercel.app
   - SUPABASE_SERVICE_ROLE_KEY = leave the value empty for me to paste the secret key from step 1b; Sensitive
   - ADMIN_PASSWORD = leave the value empty for me to type a long, random password of at least 12 characters; Sensitive
   Wait until I say both are filled in, then deploy. When it finishes, note the production address (Settings > Domains). If it is not keystone-monitor.vercel.app, set APP_URL to the real address and redeploy.

3. Open the production address. It should show the "Overview" page straight away, with no sign-in. Then open /admin: it should ask for the admin password. Report the address and what each showed.

Stop and ask me if any page looks different from these steps, asks for payment, or asks to delete or pause anything.
