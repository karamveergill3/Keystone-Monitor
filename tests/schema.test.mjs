// Runs supabase/schema.sql against a real Postgres (PGlite, in process),
// with just enough of Supabase's roles and auth schema stubbed in to
// exercise the row-level security and the two views.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SCHEMA = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

const VISITOR = "00000000-0000-0000-0000-000000000001";

// What Supabase provides before any project SQL runs.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

let db;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(SCHEMA);
  // Re-runnable: the whole file again must not fail or duplicate anything.
  await db.exec(SCHEMA);

  await db.exec(`
    insert into auth.users (id) values ('${VISITOR}');
    insert into public.accounts (id, project_id, label, balance)
      select '10000000-0000-0000-0000-000000000001', id, 'V100 #1', 10049.1 from public.projects where slug = 'v100';
    insert into public.account_keys (account_id, key_hash, key_hint)
      values ('10000000-0000-0000-0000-000000000001', 'hash', 'abcd');
    insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, commission, net) values
      ('10000000-0000-0000-0000-000000000001', '1', null, '2026-07-01 08:00Z', 'balance', 'in', 'cash', null, 0, 0, 10000, 0, 10000),
      ('10000000-0000-0000-0000-000000000001', '2', '2', '2026-07-01 22:30Z', 'buy', 'in', 'trade', 'XAUUSD', 0.1, 2650, 0, -0.35, -0.35),
      ('10000000-0000-0000-0000-000000000001', '3', '2', '2026-07-01 23:30Z', 'sell', 'out', 'trade', 'XAUUSD', 0.1, 2655, 50, -0.35, 49.65),
      ('10000000-0000-0000-0000-000000000001', '4', null, '2026-07-02 00:00Z', 'credit', 'in', 'credit', null, 0, 0, 500, 0, 500),
      ('10000000-0000-0000-0000-000000000001', '5', null, '2026-07-02 00:05Z', 'commission', 'in', 'other', null, 0, 0, -0.2, 0, -0.2);
  `);
});

after(async () => {
  await db?.close();
});

// Runs sql as Supabase would for a browser: signed in as userId, or with
// the anon key alone when there is no user.
async function as(userId, sql) {
  await db.exec("reset role");
  const claims = userId ? JSON.stringify({ sub: userId, aal: "aal1", role: "authenticated" }) : "";
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec(userId ? "set role authenticated" : "set role anon");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}

// Runs sql as the site's server does, with the service role.
async function asServer(sql) {
  await db.exec("set role service_role");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}

const READABLE = ["accounts", "deals", "equity_samples", "account_daily", "account_positions", "projects"];

test("both projects are seeded once", async () => {
  const { rows } = await db.query("select slug from public.projects order by sort");
  assert.deepEqual(rows.map((r) => r.slug), ["v100", "cycle-method"]);
});

test("account_daily buckets by London day and keeps cash and credit out of P&L", async () => {
  const { rows } = await db.query(
    "select day::text as day, trade_pnl::float8 as trade_pnl, cash_flow::float8 as cash_flow, closed::int as closed, wins::int as wins from public.account_daily where account_id = '10000000-0000-0000-0000-000000000001' order by day"
  );
  // 22:30Z and 23:30Z on 1 July are 23:30 and 00:30 London (BST):
  // the opening commission is on the 1st, the close and the charge on the 2nd.
  assert.deepEqual(rows, [
    { day: "2026-07-01", trade_pnl: -0.35, cash_flow: 10000, closed: 0, wins: 0 },
    { day: "2026-07-02", trade_pnl: 49.45, cash_flow: 0, closed: 1, wins: 1 },
  ]);
});

test("account_positions joins the open and close of a position", async () => {
  const { rows } = await db.query(
    "select side, symbol, open_price::float8 as open_price, close_price::float8 as close_price, net::float8 as net, volume_in::float8 as volume_in from public.account_positions where account_id = '10000000-0000-0000-0000-000000000001'"
  );
  assert.deepEqual(rows, [{ side: "buy", symbol: "XAUUSD", open_price: 2650, close_price: 2655, net: 49.3, volume_in: 0.1 }]);
});

test("the trade record counts positions, not closing deals", async () => {
  await db.exec(`
    insert into public.accounts (id, project_id, label)
      select '20000000-0000-0000-0000-000000000002', id, 'Record' from public.projects where slug = 'v100';
    insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, commission, net) values
      -- Commission both sides: the exit deal is +1.50 but the trade lost 2.00.
      ('20000000-0000-0000-0000-000000000002', '11', '11', '2026-08-03 09:00Z', 'buy',  'in',  'trade', 'EURUSD', 1, 1.1000, 0, -3.5, -3.5),
      ('20000000-0000-0000-0000-000000000002', '12', '11', '2026-08-03 10:00Z', 'sell', 'out', 'trade', 'EURUSD', 1, 1.1001, 5, -3.5,  1.5),
      -- One lot closed in two halves: one trade, not two.
      ('20000000-0000-0000-0000-000000000002', '13', '13', '2026-08-03 09:00Z', 'buy',  'in',  'trade', 'XAUUSD', 1, 2600, 0, 0, 0),
      ('20000000-0000-0000-0000-000000000002', '14', '13', '2026-08-03 11:00Z', 'sell', 'out', 'trade', 'XAUUSD', 0.5, 2601, 50, 0, 50),
      ('20000000-0000-0000-0000-000000000002', '15', '13', '2026-08-03 12:00Z', 'sell', 'out', 'trade', 'XAUUSD', 0.5, 2603, 150, 0, 150),
      -- A deposit and a withdrawal on the same day are both reported.
      ('20000000-0000-0000-0000-000000000002', '16', null, '2026-08-03 08:00Z', 'balance', 'in', 'cash', null, 0, 0, 5000, 0, 5000),
      ('20000000-0000-0000-0000-000000000002', '17', null, '2026-08-03 18:00Z', 'balance', 'in', 'cash', null, 0, 0, -2000, 0, -2000);
  `);
  const { rows } = await db.query(
    `select closed::int, wins::int, losses::int, gross_profit::float8, gross_loss::float8, lots::float8,
            trade_pnl::float8, cash_flow::float8, deposits::float8, withdrawals::float8
       from public.account_daily where account_id = '20000000-0000-0000-0000-000000000002'`
  );
  assert.deepEqual(rows, [
    { closed: 2, wins: 1, losses: 1, gross_profit: 200, gross_loss: -2, lots: 2, trade_pnl: 198, cash_flow: 3000, deposits: 5000, withdrawals: -2000 },
  ]);
});

test("a netting reversal splits into the part closed and the part opened", async () => {
  await db.exec(`
    insert into public.accounts (id, project_id, label)
      select '30000000-0000-0000-0000-000000000003', id, 'Netting' from public.projects where slug = 'v100';
    insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, net) values
      ('30000000-0000-0000-0000-000000000003', '21', '21', '2026-08-04 09:00Z', 'buy',  'in',    'trade', 'EURUSD', 1, 1.10, 0, 0),
      ('30000000-0000-0000-0000-000000000003', '22', '21', '2026-08-04 10:00Z', 'sell', 'inout', 'trade', 'EURUSD', 2, 1.11, 100, 100);
  `);
  const q = `select volume_in::float8, volume_out::float8, open_price::float8, close_price::float8
               from public.account_positions where account_id = '30000000-0000-0000-0000-000000000003'`;
  // 1 lot bought, then a 2-lot sell: 1 lot closed at 1.11 and 1 lot sold
  // short at 1.11, still open.
  assert.deepEqual((await db.query(q)).rows, [{ volume_in: 2, volume_out: 1, open_price: 1.105, close_price: 1.11 }]);
  await db.exec(`
    insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, net) values
      ('30000000-0000-0000-0000-000000000003', '23', '21', '2026-08-04 11:00Z', 'buy', 'out', 'trade', 'EURUSD', 1, 1.12, -100, -100);
  `);
  assert.deepEqual((await db.query(q)).rows, [{ volume_in: 2, volume_out: 2, open_price: 1.105, close_price: 1.115 }]);
  const lots = await db.query(
    "select sum(lots)::float8 as lots from public.account_daily where account_id = '30000000-0000-0000-0000-000000000003'"
  );
  assert.equal(lots.rows[0].lots, 2);
});

test("the server reads and writes everything, sync keys included", async () => {
  await asServer(`
    insert into public.equity_samples (account_id, at, balance, equity)
      values ('10000000-0000-0000-0000-000000000001', '2026-07-02 00:15Z', 10549.1, 10549.1)
  `);
  for (const table of [...READABLE, "account_keys"]) {
    const all = (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;
    assert.ok(all > 0, table);
    assert.equal((await asServer(`select * from public.${table}`)).rows.length, all, table);
  }
  const upd = await asServer("update public.account_keys set key_hint = 'abcd' returning account_id");
  assert.equal(upd.rows.length, 1);
});

test("a browser reads nothing, signed in or not", async () => {
  for (const table of [...READABLE, "account_keys"]) {
    await assert.rejects(as(VISITOR, `select * from public.${table}`), /permission denied/, `signed in: ${table}`);
    await assert.rejects(as(null, `select * from public.${table}`), /permission denied/, `anon: ${table}`);
  }
});

test("a browser writes nothing", async () => {
  for (const userId of [VISITOR, null]) {
    await assert.rejects(as(userId, "update public.accounts set label = 'hacked'"), /permission denied/);
    await assert.rejects(
      as(userId, "insert into public.account_keys (account_id, key_hash, key_hint) values ('10000000-0000-0000-0000-000000000001', 'x', 'x')"),
      /permission denied/
    );
  }
});

test("every table has row-level security on", async () => {
  const { rows } = await db.query(
    "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"
  );
  assert.deepEqual(rows, []);
});

test("no table has a policy, so RLS lets no browser role through", async () => {
  const { rows } = await db.query("select tablename, policyname from pg_policies where schemaname = 'public'");
  assert.deepEqual(rows, []);
});

// The live database was first set up for signed-in partners. A re-run must
// leave it exactly like a fresh one: no members table, no is_member(), no
// policies, and the browser roles still refused.
test("a re-run clears what an older, sign-in database still has", async () => {
  await db.exec(`
    create table public.members (user_id uuid primary key references auth.users (id) on delete cascade, email text not null);
    alter table public.members enable row level security;
    create function public.is_member() returns boolean language sql stable security definer set search_path = '' as
      $$ select exists (select 1 from public.members m where m.user_id = auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'; $$;
    create policy "members read own row or all when verified" on public.members for select to authenticated
      using (user_id = auth.uid() or public.is_member());
    create policy "members read projects" on public.projects for select to authenticated using (public.is_member());
    create policy "members read accounts" on public.accounts for select to authenticated using (public.is_member());
    create policy "members read deals" on public.deals for select to authenticated using (public.is_member());
    create policy "members read equity samples" on public.equity_samples for select to authenticated using (public.is_member());
    grant select on public.projects, public.accounts, public.deals, public.equity_samples,
      public.account_daily, public.account_positions to authenticated;
    insert into public.members (user_id, email) values ('${VISITOR}', 'v@example.com');
  `);

  await db.exec(SCHEMA);

  const leftovers = await db.query(
    "select to_regclass('public.members') as members, to_regprocedure('public.is_member()') as is_member, (select count(*)::int from pg_policies where schemaname = 'public') as policies"
  );
  assert.deepEqual(leftovers.rows, [{ members: null, is_member: null, policies: 0 }]);
  for (const table of READABLE) {
    await assert.rejects(as(VISITOR, `select * from public.${table}`), /permission denied/, table);
  }
  assert.ok((await asServer("select id from public.accounts")).rows.length > 0);
});
