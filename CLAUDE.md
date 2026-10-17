# CLAUDE.md

@AGENTS.md

Keystone Monitor: partners follow external MT5 accounts (V100, Cycle
Method). Standalone; shares nothing with any other project. `README.md` is
the architecture reference.

- Plain JavaScript, Next.js 16 App Router, React 19, Tailwind 4 (tokens in
  `src/app/globals.css`), Supabase, Recharts, pdfkit.
- `npm test`, `npm run lint`, `npm run build` before every push. CI runs all
  three.
- `supabase/schema.sql` is applied by hand and must stay re-runnable.
  `tests/schema.test.mjs` runs it against PGlite.
- Every figure goes through `src/lib/accountStats.js`, so screens and PDFs
  cannot disagree.
- The EA must never trade. `tests/ea.test.mjs` enforces it; do not weaken it.
- The service-role client (`src/lib/supabase/admin.js`) is server-only and
  used only after `requireAdmin()` (the admin page and its actions) or a
  sync-key check (`/api/sync`). Every other read goes through the user's own
  client, so row-level security applies.
- Business logic in `src/lib/*.js` with a matching `tests/<name>.test.mjs`.
- Double quotes, semicolons. Commit subjects are imperative sentences, no
  prefixes.

## Working across machines

Worked on from more than one laptop and from cloud sessions.
`docs/NEW-MACHINE.md` is the setup guide.

1. **`git pull` before the first edit**, every session, then
   `git fetch --prune && git branch -r`: work from a cloud session may be
   on a `claude/...` branch rather than `main`.
2. **Read `docs/handoff.md`** before touching code. Newest entry at the top.
3. **`main` is production.** Once Vercel is linked, every push to `main`
   deploys. Half-finished work goes on a `wip/` branch.
4. **Commit author must be `281717050+karamveergill3@users.noreply.github.com`.**
   Vercel's free plan silently refuses to deploy a private repository's
   commits by anyone else (the repository is public today; set it anyway).
   If a push does not go live, check the last commit's author first. A cloud
   session starts as `Claude <noreply@anthropic.com>`: before its first
   commit, run `git config user.name "Karam Gill"` and
   `git config user.email "281717050+karamveergill3@users.noreply.github.com"`
   in the clone.
5. **Commit and push before stopping.** Stashes and untracked files do not
   leave the machine they are on.
6. **Write a handoff entry** at the top of `docs/handoff.md` when wrapping up.
7. **There is one database.** `npm run dev` with a filled-in `.env.local`
   reads and writes the live Supabase project, and its admin screen makes
   links that start `http://localhost`. Make accounts, keys and invites on
   the live site only.
8. **The repository is public.** Never commit a secret, a customer's name
   or anything that names other projects.
