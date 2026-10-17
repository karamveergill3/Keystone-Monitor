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
