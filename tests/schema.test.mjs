// Runs supabase/schema.sql against a real Postgres (PGlite, in process),
// with just enough of Supabase's auth schema stubbed in to exercise the
// row-level security and the two views.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SCHEMA = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

const ADMIN = "00000000-0000-0000-0000-000000000001";
const STRANGER = "00000000-0000-0000-0000-000000000002";

// What Supabase provides before any project SQL runs.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`;

let db;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(SCHEMA);
  // Re-runnable: the whole file again must not fail or duplicate anything.
  await db.exec(SCHEMA);

  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}'), ('${STRANGER}');
    insert into public.members (user_id, email, role) values ('${ADMIN}', 'a@example.com', 'admin');
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

async function as(userId, aal, sql) {
  await db.exec("reset role");
  const claims = userId ? JSON.stringify({ sub: userId, aal, role: "authenticated" }) : "";
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec("set role authenticated");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}

test("both projects are seeded once", async () => {
  const { rows } = await db.query("select slug from public.projects order by sort");
  assert.deepEqual(rows.map((r) => r.slug), ["v100", "cycle-method"]);
});

test("account_daily buckets by London day and keeps cash and credit out of P&L", async () => {
  const { rows } = await db.query(
    "select day::text as day, trade_pnl::float8 as trade_pnl, cash_flow::float8 as cash_flow, closed::int as closed, wins::int as wins from public.account_daily order by day"
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
    "select side, symbol, open_price::float8 as open_price, close_price::float8 as close_price, net::float8 as net, volume_in::float8 as volume_in from public.account_positions"
  );
  assert.deepEqual(rows, [{ side: "buy", symbol: "XAUUSD", open_price: 2650, close_price: 2655, net: 49.3, volume_in: 0.1 }]);
});

test("a member with two-factor reads everything", async () => {
  const accounts = await as(ADMIN, "aal2", "select id from public.accounts");
  assert.equal(accounts.rows.length, 1);
  const deals = await as(ADMIN, "aal2", "select ticket from public.deals");
  assert.equal(deals.rows.length, 5);
  const daily = await as(ADMIN, "aal2", "select * from public.account_daily");
  assert.equal(daily.rows.length, 2);
});

test("a password alone reads nothing but its own member row", async () => {
  assert.equal((await as(ADMIN, "aal1", "select id from public.accounts")).rows.length, 0);
  assert.equal((await as(ADMIN, "aal1", "select * from public.account_daily")).rows.length, 0);
  const me = await as(ADMIN, "aal1", "select role from public.members");
  assert.deepEqual(me.rows, [{ role: "admin" }]);
});

test("a signed-in stranger reads nothing", async () => {
  assert.equal((await as(STRANGER, "aal2", "select id from public.accounts")).rows.length, 0);
  assert.equal((await as(STRANGER, "aal2", "select * from public.members")).rows.length, 0);
});

test("nobody signed in can write, and sync keys are never readable", async () => {
  await assert.rejects(as(ADMIN, "aal2", "select key_hash from public.account_keys"), /permission denied/);
  await assert.rejects(
    as(ADMIN, "aal2", "insert into public.members (user_id, email, role) values ('" + STRANGER + "', 'x', 'admin')"),
    /row-level security/
  );
  const upd = await as(ADMIN, "aal2", "update public.accounts set label = 'hacked' returning id");
  assert.equal(upd.rows.length, 0);
});

test("every table has row-level security on", async () => {
  const { rows } = await db.query(
    "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"
  );
  assert.deepEqual(rows, []);
});
