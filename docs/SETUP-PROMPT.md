# Setup prompt for the dashboard steps

Paste everything below the line into a Claude session that can use Chrome:
`claude --chrome` in a terminal, or the Desktop app's Code tab with
Environment: Local. See `docs/NEW-MACHINE.md`, step 7. No secrets are in
this file; the service-role key is copied from Supabase to Vercel inside
the browser and never typed into the chat.

Tick the items off in `docs/handoff.md` as they are done.

---

Use Claude in Chrome to finish setting up my site "Keystone Monitor". The code is done and on GitHub; you only need the Vercel and Supabase dashboards, which I'm signed in to in Chrome. Work in new tabs. Only touch the Supabase project with ID avsfygkauoipytiqraau and the Vercel project keystone-monitor: if a step would change any other project, stop and ask me. Never paste the service-role key into this chat or anywhere except the Vercel field below.

Facts you need:
- GitHub repo: karamveergill3/Keystone-Monitor (branch main)
- Vercel account: karamveergill3 (Hobby). Project name to use: keystone-monitor
- Supabase project ID avsfygkauoipytiqraau, named "Keystone Monitor", URL https://avsfygkauoipytiqraau.supabase.co
- Publishable key (public, safe to show): sb_publishable_K6LHHbTUldpH9PMg2sPvmQ_9wPTn6Ze

Steps (skip any that are already done, and tell me which):

1. Supabase, project avsfygkauoipytiqraau:
   a. Authentication > Sign In / Providers > Email: turn OFF "Allow new users to sign up". Leave email sign-in itself enabled.
   b. Authentication > URL Configuration: Site URL = https://keystone-monitor.vercel.app (if step 2 gives a different address, use that instead).
   c. Authentication > Multi-Factor: make sure TOTP (authenticator app) is enabled.
   d. Project Settings > API Keys > "Publishable and secret API keys" tab > Secret keys: reveal and copy the "default" secret key (it starts sb_secret_), for step 2. If there is no secret key, create one named default. Do not show it to me. Use these new keys, not the Legacy API keys tab: Supabase retires legacy keys at the end of 2026.

2. Vercel: go to https://vercel.com/new and import karamveergill3/Keystone-Monitor (if it is not listed, use "Adjust GitHub App Permissions" and grant access to that repo). Project name keystone-monitor, framework Next.js, root directory the repo root. Before deploying, add these Environment Variables. NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and APP_URL go in all environments. SUPABASE_SERVICE_ROLE_KEY goes in Production and Preview only, marked Sensitive: Vercel does not allow a Sensitive variable in Development. If the import page has no Sensitive switch, add it there for Production and Preview, then after the first deploy edit it under Settings > Environment Variables to Sensitive and Redeploy.
   - NEXT_PUBLIC_SUPABASE_URL = https://avsfygkauoipytiqraau.supabase.co
   - NEXT_PUBLIC_SUPABASE_ANON_KEY = the publishable key above (the variable keeps its old name)
   - SUPABASE_SERVICE_ROLE_KEY = the secret key from step 1d (Production and Preview only, Sensitive; the variable keeps its old name)
   - APP_URL = https://keystone-monitor.vercel.app
   Deploy. When it finishes, note the production address (Settings > Domains). If it is not keystone-monitor.vercel.app, set APP_URL to the real address, redeploy, and fix the Supabase Site URL from step 1b.

3. Open the production address. It should redirect to /login and show a "Keystone Monitor" sign-in card. Report the address and whether it loaded.

4. My admin login. Ask me which email address to use. In Supabase > Authentication > Users > Add user > Create new user, enter that email, let ME type the password myself in the browser, and tick "Auto Confirm User". Then in Supabase > SQL Editor run, replacing the email:

   insert into public.members (user_id, email, display_name, role)
   select id, email, 'Admin', 'admin' from auth.users where email = 'ME@EXAMPLE.COM'
   on conflict (user_id) do update set role = 'admin';

   Then check it with: select email, role from public.members;

5. Tell me to open the site, sign in with that email and password, and scan the two-factor QR code with an authenticator app.

Stop and ask me if any page looks different from these steps, asks for payment, or asks to delete or pause anything.
