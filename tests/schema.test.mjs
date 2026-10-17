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

test("a member with two-factor reads everything", async () => {
  for (const table of ["accounts", "deals", "account_daily", "account_positions", "projects"]) {
    const all = (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;
    const seen = await as(ADMIN, "aal2", `select * from public.${table}`);
    assert.ok(all > 0, table);
    assert.equal(seen.rows.length, all, table);
  }
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
