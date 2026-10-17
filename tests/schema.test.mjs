// Runs supabase/schema.sql against a real Postgres (PGlite, in process),
// with just enough of Supabase's roles and auth schema stubbed in to
// exercise the row-level security and the two views.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { parseSyncPayload } from "@/lib/syncPayload";
import { payload } from "./fixtures.mjs";

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
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
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
    insert into public.open_positions (account_id, ticket, symbol, side, volume, open_price, current_price, sl, tp, swap, profit, open_time, magic, comment) values
      ('10000000-0000-0000-0000-000000000001', '6', 'XAUUSD', 'buy', 0.2, 2660.5, 2658.1, 2640, 2700, -0.5, -48, '2026-07-02 07:30Z', 100, 'grid 1');
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

// Runs sql as the site's server does, with the service role. Either a
// string or { sql, params }.
async function asServer(q) {
  const { sql, params } = typeof q === "string" ? { sql: q, params: undefined } : q;
  await db.exec("set role service_role");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

const READABLE = [
  "accounts", "deals", "equity_samples", "open_positions", "account_daily", "account_positions", "projects",
  "baskets", "basket_results",
];

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

test("open positions are a per-account snapshot that goes with its account", async () => {
  await db.exec(`
    insert into public.accounts (id, project_id, label)
      select '40000000-0000-0000-0000-000000000004', id, 'Snapshot' from public.projects where slug = 'v100';
    insert into public.open_positions (account_id, ticket, symbol, side, open_time) values
      ('40000000-0000-0000-0000-000000000004', '31', 'EURUSD', 'sell', '2026-08-05 09:00Z'),
      ('40000000-0000-0000-0000-000000000004', '32', 'EURUSD', null, '2026-08-05 09:01Z');
  `);
  const updated = await db.query(
    "select updated_at is not null as stamped from public.open_positions where account_id = '40000000-0000-0000-0000-000000000004'"
  );
  assert.deepEqual(updated.rows, [{ stamped: true }, { stamped: true }]);
  // One row per ticket per account, and only buy or sell as a side.
  await assert.rejects(
    db.exec("insert into public.open_positions (account_id, ticket) values ('40000000-0000-0000-0000-000000000004', '31')"),
    /duplicate key/
  );
  await assert.rejects(
    db.exec("insert into public.open_positions (account_id, ticket, side) values ('40000000-0000-0000-0000-000000000004', '33', 'long')"),
    /check constraint/
  );
  await db.exec("delete from public.accounts where id = '40000000-0000-0000-0000-000000000004'");
  const left = await db.query(
    "select count(*)::int as n from public.open_positions where account_id = '40000000-0000-0000-0000-000000000004'"
  );
  assert.equal(left.rows[0].n, 0);
});

const SNAPSHOT = "50000000-0000-0000-0000-000000000005";
const REPLACE = "select public.replace_open_positions($1, $2::jsonb, $3)";

async function snapshotRows() {
  const { rows } = await db.query(
    `select ticket, symbol, side, volume::float8, open_price::float8, current_price::float8, sl::float8, tp::float8,
            swap::float8, profit::float8, to_char(open_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as open_time,
            magic::int, comment, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at,
            position_id
       from public.open_positions where account_id = $1 order by ticket`,
    [SNAPSHOT]
  );
  return rows;
}

test("replace_open_positions swaps an account's snapshot for exactly what the sync parsed", async () => {
  await db.exec(`
    insert into public.accounts (id, project_id, label)
      select '${SNAPSHOT}', id, 'Replace' from public.projects where slug = 'v100';
  `);
  const { open } = parseSyncPayload(payload(), Date.parse("2026-10-17T12:00:00Z"));
  const at = "2026-10-17T12:00:00.000Z";
  await asServer({ sql: REPLACE, params: [SNAPSHOT, JSON.stringify(open), at] });
  // Every field the parser returns lands in its column, nothing dropped.
  assert.deepEqual(await snapshotRows(), open.map((p) => ({ ...p, updated_at: at })));

  // The next sync's list replaces it: 1004 closed, 1005 still open.
  const later = "2026-10-17T12:02:00.000Z";
  await asServer({ sql: REPLACE, params: [SNAPSHOT, JSON.stringify([open[1]]), later] });
  assert.deepEqual((await snapshotRows()).map((r) => [r.ticket, r.updated_at]), [["1005", later]]);

  // Everything closed.
  await asServer({ sql: REPLACE, params: [SNAPSHOT, "[]", later] });
  assert.deepEqual(await snapshotRows(), []);
  // Other accounts' rows are never touched.
  const other = await db.query("select count(*)::int as n from public.open_positions where account_id <> $1", [SNAPSHOT]);
  assert.ok(other.rows[0].n > 0);
});

test("a replace that fails part way keeps the previous snapshot", async () => {
  const { open } = parseSyncPayload(payload(), Date.parse("2026-10-17T12:00:00Z"));
  const at = "2026-10-17T12:04:00.000Z";
  await asServer({ sql: REPLACE, params: [SNAPSHOT, JSON.stringify(open), at] });
  const before = await snapshotRows();
  assert.equal(before.length, 2);
  // The delete runs, then the insert hits a bad row: the delete is undone
  // with it, so the account is never left with no positions.
  const bad = [{ ...open[0], ticket: "1010" }, { ...open[1], ticket: "1011", side: "long" }];
  await assert.rejects(
    asServer({ sql: REPLACE, params: [SNAPSHOT, JSON.stringify(bad), "2026-10-17T12:06:00.000Z"] }),
    /check constraint/
  );
  assert.deepEqual(await snapshotRows(), before);
});

// ---------------------------------------------------------------------------
// Baskets. Each "sync" here is what /api/sync does: one sync_open_positions
// call, as the server, which replaces the snapshot and tracks the baskets
// on it.

const GRID = "60000000-0000-0000-0000-000000000006";
const BYSTANDER = "70000000-0000-0000-0000-000000000007";
const TRACK = "select public.track_baskets($1, $2, $3, $4)";
const SYNC = "select public.sync_open_positions($1, $2::jsonb, $3, $4, $5)";

// One open position as src/lib/syncPayload.js returns it.
function pos(ticket, symbol, side, volume, profit, { swap = 0, positionId = ticket, openTime = "2026-10-12T09:00:00.000Z" } = {}) {
  return {
    ticket, position_id: positionId, symbol, side, volume, open_price: 1, current_price: 1, sl: 0, tp: 0,
    swap, profit, open_time: openTime, magic: 0, comment: null,
  };
}

async function syncOpen(account, rows, at, balance, complete) {
  await asServer({ sql: SYNC, params: [account, JSON.stringify(rows), at, balance, complete] });
}

const T = (hhmm) => `2026-10-12T${hhmm}:00.000Z`;
const ISO = (col) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ${col}`;

// Every basket of an account, oldest first, open ones last.
async function basketRows(account) {
  const { rows } = await db.query(
    `select id, symbol, side, ${ISO("opened_at")}, ${ISO("first_seen_at")}, ${ISO("last_seen_at")}, ${ISO("closed_at")},
            positions, lots::float8, max_positions, max_lots::float8, floating::float8, worst_floating::float8,
            ${ISO("worst_at")}, worst_balance::float8, position_ids
       from public.baskets where account_id = $1
      order by first_seen_at, symbol, side`,
    [account]
  );
  return rows;
}

async function openBasket(account, symbol, side) {
  const rows = (await basketRows(account)).filter((b) => b.symbol === symbol && b.side === side && b.closed_at === null);
  assert.ok(rows.length <= 1, `${symbol} ${side}: more than one open basket`);
  return rows[0];
}

test("track_baskets opens one basket per symbol and side, magic numbers aside", async () => {
  await db.exec(`
    insert into public.accounts (id, project_id, label)
      select '${GRID}', id, 'Grid' from public.projects where slug = 'v100';
    insert into public.accounts (id, project_id, label)
      select '${BYSTANDER}', id, 'Bystander' from public.projects where slug = 'v100';
  `);
  await syncOpen(BYSTANDER, [pos("901", "GBPUSD", "buy", 1, -40)], T("08:00"), 5000, true);

  await syncOpen(GRID, [
    // The first level's POSITION_IDENTIFIER differs from its ticket; the
    // second came from an older EA with none, so its ticket stands in.
    { ...pos("101", "XAUUSD", "buy", 0.1, -10, { swap: -1, positionId: "9101", openTime: T("09:30") }), magic: 1 },
    { ...pos("102", "XAUUSD", "buy", 0.2, -20, { positionId: null, openTime: T("09:00") }), magic: 2 },
    pos("103", "EURUSD", "sell", 0.5, 5),
    // No side or no symbol: in no basket.
    { ...pos("104", "XAUUSD", null, 1, -500) },
    { ...pos("105", null, "buy", 1, -500) },
  ], T("10:00"), 10_000, true);

  const rows = await basketRows(GRID);
  assert.equal(rows.length, 2);
  const xau = await openBasket(GRID, "XAUUSD", "buy");
  assert.match(xau.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual({ ...xau, id: undefined }, {
    id: undefined, symbol: "XAUUSD", side: "buy",
    opened_at: T("09:00"), first_seen_at: T("10:00"), last_seen_at: T("10:00"), closed_at: null,
    positions: 2, lots: 0.3, max_positions: 2, max_lots: 0.3,
    floating: -31, worst_floating: -31, worst_at: T("10:00"), worst_balance: 10_000,
    position_ids: ["102", "9101"],
  });
  const eur = await openBasket(GRID, "EURUSD", "sell");
  assert.equal(eur.floating, 5);
  assert.equal(eur.worst_floating, 5);
});

test("a basket's worst only ever deepens, and it survives a partial close", async () => {
  const xau1 = pos("101", "XAUUSD", "buy", 0.1, -10, { swap: -1, positionId: "9101", openTime: T("09:30") });
  const xau2 = pos("102", "XAUUSD", "buy", 0.2, -20, { positionId: null, openTime: T("09:00") });
  const eur = pos("103", "EURUSD", "sell", 0.5, 5);
  const before = await openBasket(GRID, "XAUUSD", "buy");

  // Deeper, with a new level: worst follows, with its time and balance.
  const xau3 = pos("106", "XAUUSD", "buy", 0.3, -80, { openTime: T("10:30") });
  await syncOpen(GRID, [xau1, { ...xau2, profit: -30 }, xau3, eur], T("11:00"), 9_990, true);
  let b = await openBasket(GRID, "XAUUSD", "buy");
  assert.equal(b.id, before.id);
  assert.deepEqual(
    [b.positions, b.lots, b.max_positions, b.max_lots, b.floating, b.worst_floating, b.worst_at, b.worst_balance],
    [3, 0.6, 3, 0.6, -121, -121, T("11:00"), 9_990]
  );
  assert.deepEqual(b.position_ids, ["102", "106", "9101"]);

  // The first level closes and the rest recover: the basket stays open,
  // its maximums and its worst stay where they were.
  await syncOpen(GRID, [{ ...xau2, profit: -5 }, { ...xau3, profit: 10 }, eur], T("12:00"), 10_020, true);
  b = await openBasket(GRID, "XAUUSD", "buy");
  assert.equal(b.id, before.id);
  assert.deepEqual(
    [b.positions, b.lots, b.max_positions, b.max_lots, b.floating, b.worst_floating, b.worst_at, b.worst_balance],
    [2, 0.5, 3, 0.6, 5, -121, T("11:00"), 9_990]
  );
  assert.equal(b.last_seen_at, T("12:00"));
  assert.equal(b.opened_at, T("09:00"));
  // Every position it ever held, so its closed deals can all be found.
  assert.deepEqual(b.position_ids, ["102", "106", "9101"]);
});

test("a basket missing from a sync closes only when the list is complete", async () => {
  const eur = pos("103", "EURUSD", "sell", 0.5, 5);
  // Not the whole list (cut short, or a count mismatch): nothing closes.
  await syncOpen(GRID, [eur], T("13:00"), 10_020, false);
  let xau = await openBasket(GRID, "XAUUSD", "buy");
  assert.ok(xau);
  assert.equal(xau.last_seen_at, T("12:00"));
  assert.equal((await openBasket(GRID, "EURUSD", "sell")).last_seen_at, T("13:00"));

  // The whole list, and the gold basket is not in it.
  await syncOpen(GRID, [eur], T("13:05"), 10_040, true);
  assert.equal(await openBasket(GRID, "XAUUSD", "buy"), undefined);
  const closed = (await basketRows(GRID)).find((b) => b.id === xau.id);
  assert.equal(closed.closed_at, T("13:05"));
  assert.equal(closed.last_seen_at, T("12:00"));
  assert.equal(closed.worst_floating, -121);
  assert.ok(await openBasket(GRID, "EURUSD", "sell"));
});

test("a key that comes back with none of the same positions is a new basket", async () => {
  const oldEur = await openBasket(GRID, "EURUSD", "sell");
  // Between two syncs, 103 closed and 110 opened; the gold buy is back too.
  // Not a complete list, which does not matter: no position is shared.
  await syncOpen(GRID, [
    pos("110", "EURUSD", "sell", 0.2, -3, { openTime: T("13:20") }),
    pos("120", "XAUUSD", "buy", 0.1, -2, { openTime: T("13:25") }),
  ], T("13:30"), 10_045, false);
  const rows = await basketRows(GRID);
  assert.equal(rows.find((b) => b.id === oldEur.id).closed_at, T("13:30"));
  const eur = await openBasket(GRID, "EURUSD", "sell");
  assert.notEqual(eur.id, oldEur.id);
  assert.deepEqual([eur.first_seen_at, eur.opened_at, eur.position_ids, eur.worst_floating], [T("13:30"), T("13:20"), ["110"], -3]);
  const xau = await openBasket(GRID, "XAUUSD", "buy");
  assert.deepEqual([xau.position_ids, xau.max_positions], [["120"], 1]);
  assert.equal(rows.length, 4);

  // At most one open basket per key, whatever writes it.
  await assert.rejects(
    asServer(`insert into public.baskets (account_id, symbol, side, opened_at, first_seen_at, last_seen_at, positions, lots,
                max_positions, max_lots, floating, worst_floating, worst_at)
              values ('${GRID}', 'EURUSD', 'sell', now(), now(), now(), 1, 1, 1, 1, 0, 0, now())`),
    /duplicate key/
  );
});

test("track_baskets run twice on one sync changes nothing the second time", async () => {
  const at = T("13:30");
  const before = await basketRows(GRID);
  await asServer({ sql: TRACK, params: [GRID, at, 10_045, true] });
  await asServer({ sql: TRACK, params: [GRID, at, 10_045, true] });
  assert.deepEqual(await basketRows(GRID), before);

  // And a resent sync whose reply was lost, snapshot and all.
  const { rows: snapshot } = await db.query(
    `select ticket, position_id, symbol, side, volume::float8, open_price::float8, current_price::float8, sl::float8, tp::float8,
            swap::float8, profit::float8, open_time, magic::int, comment
       from public.open_positions where account_id = $1`,
    [GRID]
  );
  await syncOpen(GRID, snapshot, at, 10_045, true);
  assert.deepEqual(await basketRows(GRID), before);
});

test("one account's syncs never touch another's baskets", async () => {
  const rows = await basketRows(BYSTANDER);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [rows[0].symbol, rows[0].closed_at, rows[0].last_seen_at, rows[0].floating, rows[0].worst_balance],
    ["GBPUSD", null, T("08:00"), -40, 5000]
  );
});

// The tickets in an account's snapshot, with the time they were stamped.
async function snapshotOf(account) {
  const { rows } = await db.query(
    `select ticket, ${ISO("updated_at")} from public.open_positions where account_id = $1 order by ticket`,
    [account]
  );
  return rows.map((r) => [r.ticket, r.updated_at]);
}

async function snapshotAt(account) {
  const { rows } = await db.query(`select ${ISO("open_snapshot_at")} from public.accounts where id = $1`, [account]);
  return rows[0].open_snapshot_at;
}

const RACE = "71000000-0000-0000-0000-000000000071";
const S = (hhmmss) => `2026-10-12T${hhmmss}.000Z`;

test("a sync that arrives after a newer one changes nothing", async () => {
  await db.exec(`
    insert into public.accounts (id, project_id, label)
      select '${RACE}', id, 'Race' from public.projects where slug = 'v100';
  `);
  const lvl = (ticket, profit) => pos(ticket, "XAUUSD", "buy", 0.1, profit, { openTime: S("09:00:00") });
  await syncOpen(RACE, [lvl("1", -100), lvl("2", -400)], S("10:00:00"), 10_000, true);
  const opened = await openBasket(RACE, "XAUUSD", "buy");
  assert.equal(opened.worst_floating, -500);

  // Two terminals on one login sync at almost the same moment. B, the
  // later one, is stored first; A, older, lands after it with a list that
  // would close the basket (and is the whole list, so it could).
  await syncOpen(RACE, [lvl("1", -40), lvl("2", -60)], S("10:02:01"), 10_000, true);
  const afterB = await basketRows(RACE);
  await syncOpen(RACE, [], S("10:02:00"), 10_000, true);

  // A changed nothing: B's rows stand, the basket is still open, once,
  // with its worst.
  assert.deepEqual(await snapshotOf(RACE), [["1", S("10:02:01")], ["2", S("10:02:01")]]);
  assert.equal(await snapshotAt(RACE), S("10:02:01"));
  assert.deepEqual(await basketRows(RACE), afterB);
  const b = await openBasket(RACE, "XAUUSD", "buy");
  assert.equal(b.id, opened.id);
  assert.deepEqual([b.worst_floating, b.worst_at, b.floating, b.last_seen_at], [-500, S("10:00:00"), -100, S("10:02:01")]);
  assert.equal((await basketRows(RACE)).length, 1);

  // An older sync never brings back a deeper reading either.
  await syncOpen(RACE, [lvl("1", -900), lvl("2", -900)], S("10:01:00"), 10_000, true);
  assert.deepEqual(await basketRows(RACE), afterB);
});

test("the same sync sent twice leaves the same rows", async () => {
  const lvl = (ticket, profit) => pos(ticket, "XAUUSD", "buy", 0.1, profit, { openTime: S("09:00:00") });
  const rows = [lvl("1", -300), lvl("2", -350)];
  await syncOpen(RACE, rows, S("10:04:00"), 9_990, true);
  const snapshot = await snapshotOf(RACE);
  const baskets = await basketRows(RACE);
  assert.equal(baskets[0].worst_floating, -650);
  await syncOpen(RACE, rows, S("10:04:00"), 9_990, true);
  assert.deepEqual(await snapshotOf(RACE), snapshot);
  assert.deepEqual(await basketRows(RACE), baskets);
  assert.equal(await snapshotAt(RACE), S("10:04:00"));
});

test("a failed replace in sync_open_positions keeps the previous snapshot and its time", async () => {
  const before = await snapshotOf(RACE);
  const baskets = await basketRows(RACE);
  const bad = [pos("1", "XAUUSD", "buy", 0.1, -1), { ...pos("3", "XAUUSD", "buy", 0.1, -1), side: "long" }];
  await assert.rejects(
    asServer({ sql: SYNC, params: [RACE, JSON.stringify(bad), S("10:06:00"), 10_000, true] }),
    /check constraint/
  );
  assert.deepEqual(await snapshotOf(RACE), before);
  assert.equal(await snapshotAt(RACE), S("10:04:00"));
  assert.deepEqual(await basketRows(RACE), baskets);
  // No such account: refused, never a silent no-op.
  await assert.rejects(
    asServer({ sql: SYNC, params: ["7f000000-0000-0000-0000-00000000007f", "[]", S("10:06:00"), 0, true] }),
    /no account/
  );
});

test("a basket tracking failure is undone alone: the snapshot still lands", async () => {
  // A fault inside track_baskets, part way through its work: any write of
  // a BOOM basket raises, after the close of the gold basket has run.
  await db.exec(`
    create function public.boom() returns trigger language plpgsql as
      $$ begin raise exception 'boom: %', new.symbol; end; $$;
    create trigger boom before insert or update on public.baskets
      for each row when (new.symbol = 'BOOM') execute function public.boom();
  `);
  const baskets = await basketRows(RACE);
  const rows = [pos("8", "BOOM", "sell", 1, -5, { openTime: S("10:07:00") })];
  try {
    // Complete and without the gold basket, so tracking would close it.
    await syncOpen(RACE, rows, S("10:08:00"), 10_000, true);
  } finally {
    await db.exec("drop trigger boom on public.baskets; drop function public.boom();");
  }
  // The new snapshot is stored and stamped...
  assert.deepEqual(await snapshotOf(RACE), [["8", S("10:08:00")]]);
  assert.equal(await snapshotAt(RACE), S("10:08:00"));
  // ...and every basket write of that sync is undone, the close included.
  assert.deepEqual(await basketRows(RACE), baskets);

  // The next good sync puts the baskets right.
  await syncOpen(RACE, rows, S("10:10:00"), 10_000, true);
  const after = await basketRows(RACE);
  assert.equal(after.find((b) => b.symbol === "XAUUSD").closed_at, S("10:10:00"));
  assert.equal((await openBasket(RACE, "BOOM", "sell")).floating, -5);
});

test("basket_results adds what each basket's deals realised", async () => {
  // The closed gold basket held 9101, 102 and 106. A deal of a position
  // that was never in it (777) does not count.
  await db.exec(`
    insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, commission, net) values
      ('${GRID}', '5001', '9101', '2026-10-12 09:30Z', 'buy',  'in',  'trade', 'XAUUSD', 0.1, 1, 0, -0.35, -0.35),
      ('${GRID}', '5002', '102',  '2026-10-12 09:00Z', 'buy',  'in',  'trade', 'XAUUSD', 0.2, 1, 0, -0.7, -0.7),
      ('${GRID}', '5003', '106',  '2026-10-12 10:30Z', 'buy',  'in',  'trade', 'XAUUSD', 0.3, 1, 0, -1.05, -1.05),
      ('${GRID}', '5004', '9101', '2026-10-12 11:30Z', 'sell', 'out', 'trade', 'XAUUSD', 0.1, 1, 12, -0.35, 11.65),
      ('${GRID}', '5005', '102',  '2026-10-12 13:01Z', 'sell', 'out', 'trade', 'XAUUSD', 0.2, 1, 8, -0.7, 7.3),
      ('${GRID}', '5006', '106',  '2026-10-12 13:02Z', 'sell', 'out', 'trade', 'XAUUSD', 0.3, 1, 15, -1.05, 13.95),
      ('${GRID}', '5007', '777',  '2026-10-12 13:03Z', 'sell', 'out', 'trade', 'XAUUSD', 1, 1, 999, 0, 999);
  `);
  const { rows } = await asServer({
    sql: `select symbol, side, closed_at is null as open, realised::float8,
                 to_char(last_close_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as last_close_at
            from public.basket_results where account_id = $1 order by first_seen_at, symbol`,
    params: [GRID],
  });
  assert.deepEqual(rows, [
    { symbol: "EURUSD", side: "sell", open: false, realised: null, last_close_at: null },
    { symbol: "XAUUSD", side: "buy", open: false, realised: 30.8, last_close_at: "2026-10-12T13:02:00.000Z" },
    { symbol: "EURUSD", side: "sell", open: true, realised: null, last_close_at: null },
    { symbol: "XAUUSD", side: "buy", open: true, realised: null, last_close_at: null },
  ]);
});

// Deals for basket_results tests: [ticket, position_id, time, type, entry,
// symbol, volume, net].
async function addDeals(account, rows) {
  for (const [ticket, positionId, time, type, entry, symbol, volume, net] of rows) {
    await db.query(
      `insert into public.deals (account_id, ticket, position_id, time, type, entry, kind, symbol, volume, price, profit, net)
       values ($1, $2, $3, $4, $5, $6, 'trade', $7, $8, 1, $9, $9)`,
      [account, ticket, positionId, time, type, entry, symbol, volume, net]
    );
  }
}

async function results(account) {
  const { rows } = await asServer({
    sql: `select symbol, side, closed_at is null as open, realised::float8, ${ISO("last_close_at")}
            from public.basket_results where account_id = $1 order by first_seen_at, symbol, side`,
    params: [account],
  });
  return rows;
}

test("on a netting account a reversal's deals go to the side each one is on", async () => {
  const NET = "72000000-0000-0000-0000-000000000072";
  await db.exec(`
    insert into public.accounts (id, project_id, label)
      select '${NET}', id, 'Netting baskets' from public.projects where slug = 'v100';
  `);
  const p77 = (side, profit) => [{ ...pos("77", "EURUSD", "buy", 1, profit, { openTime: S("09:00:00") }), side }];
  // Buy 1 lot (position 77); a 2-lot sell reverses it, closing the buy at
  // a loss of 100 and leaving 1 lot short under the same position id; that
  // is bought back later for +100.
  await addDeals(NET, [["1", "77", S("09:00:00"), "buy", "in", "EURUSD", 1, 0]]);
  await syncOpen(NET, p77("buy", -50), S("09:30:00"), 10_000, true);
  await addDeals(NET, [["2", "77", S("10:00:00"), "sell", "inout", "EURUSD", 2, -100]]);
  await syncOpen(NET, p77("sell", 0), S("10:00:05"), 9_900, true);
  await addDeals(NET, [["3", "77", S("12:00:00"), "buy", "out", "EURUSD", 1, 100]]);
  await syncOpen(NET, [], S("12:00:05"), 10_000, true);

  assert.deepEqual(await results(NET), [
    { symbol: "EURUSD", side: "buy", open: false, realised: -100, last_close_at: S("10:00:00") },
    { symbol: "EURUSD", side: "sell", open: false, realised: 100, last_close_at: S("12:00:00") },
  ]);
});

test("a grid level opened and closed between two syncs counts in its basket", async () => {
  const GAP = "73000000-0000-0000-0000-000000000073";
  await db.exec(`
    insert into public.accounts (id, project_id, label)
      select '${GAP}', id, 'Between syncs' from public.projects where slug = 'v100';
  `);
  const lvl1 = pos("1", "XAUUSD", "buy", 0.1, -20, { openTime: S("09:00:00") });
  await addDeals(GAP, [["11", "1", S("09:00:00"), "buy", "in", "XAUUSD", 0.1, -0.35]]);
  await syncOpen(GAP, [lvl1], S("10:00:00"), 10_000, true);
  // Level 2 opens at 10:20 and takes profit at 10:40: no sync ever lists it.
  await addDeals(GAP, [
    ["12", "2", S("10:20:00"), "buy", "in", "XAUUSD", 0.2, -0.7],
    ["13", "2", S("10:40:00"), "sell", "out", "XAUUSD", 0.2, 30],
  ]);
  await syncOpen(GAP, [{ ...lvl1, profit: -5 }], S("11:00:00"), 10_030, true);
  // Then level 1 closes.
  await addDeals(GAP, [["14", "1", S("11:30:00"), "sell", "out", "XAUUSD", 0.1, 10]]);
  await syncOpen(GAP, [], S("11:30:05"), 10_040, true);

  const [b] = await basketRows(GAP);
  assert.deepEqual(b.position_ids, ["1"]);
  // A sell basket opened later on the same symbol, and a deal of another
  // symbol in the window, are not the gold buy basket's.
  await addDeals(GAP, [
    ["15", "3", S("10:30:00"), "sell", "in", "XAUUSD", 0.1, -0.35],
    ["16", "4", S("10:30:00"), "buy", "in", "EURUSD", 0.1, -0.35],
  ]);
  assert.deepEqual(await results(GAP), [
    { symbol: "XAUUSD", side: "buy", open: false, realised: 38.95, last_close_at: S("11:30:00") },
  ]);
});

test("re-running the schema keeps every basket and open position as it was", async () => {
  const baskets = await basketRows(GRID);
  const open = (await db.query("select * from public.open_positions order by account_id, ticket")).rows;
  await db.exec(SCHEMA);
  assert.deepEqual(await basketRows(GRID), baskets);
  assert.deepEqual((await db.query("select * from public.open_positions order by account_id, ticket")).rows, open);
});

test("an older database gains the new columns and keeps its rows", async () => {
  const old = new PGlite();
  try {
    await old.exec(SUPABASE_STUB);
    await old.exec(SCHEMA);
    // As the live database was: open_positions without position_id, no
    // baskets, no snapshot time on accounts and no credit on samples.
    await old.exec(`
      drop view public.basket_results;
      drop function public.sync_open_positions(uuid, jsonb, timestamptz, numeric, boolean);
      drop function public.track_baskets(uuid, timestamptz, numeric, boolean);
      drop table public.baskets;
      alter table public.open_positions drop column position_id;
      alter table public.accounts drop column open_snapshot_at;
      alter table public.equity_samples drop column credit;
      insert into public.accounts (id, project_id, label)
        select '${GRID}', id, 'Old' from public.projects where slug = 'v100';
      insert into public.open_positions (account_id, ticket, symbol, side, volume, profit)
        values ('${GRID}', '1', 'XAUUSD', 'buy', 0.1, -5);
      insert into public.equity_samples (account_id, at, balance, equity)
        values ('${GRID}', '2026-10-12 09:00Z', 1000, 1250);
    `);
    await old.exec(SCHEMA);
    const { rows } = await old.query("select ticket, position_id from public.open_positions");
    assert.deepEqual(rows, [{ ticket: "1", position_id: null }]);
    const samples = await old.query("select equity::float8, credit::float8 from public.equity_samples");
    assert.deepEqual(samples.rows, [{ equity: 1250, credit: 0 }]);
    const acc = await old.query("select open_snapshot_at from public.accounts where id = $1", [GRID]);
    assert.deepEqual(acc.rows, [{ open_snapshot_at: null }]);
    // The old row's ticket stands in for its missing position_id.
    const at = (await old.query("select updated_at from public.open_positions")).rows[0].updated_at;
    await old.query(TRACK, [GRID, at, 1000, true]);
    const b = await old.query("select position_ids, floating::float8 from public.baskets");
    assert.deepEqual(b.rows, [{ position_ids: ["1"], floating: -5 }]);
  } finally {
    await old.close();
  }
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
    await assert.rejects(
      as(userId, "insert into public.open_positions (account_id, ticket) values ('10000000-0000-0000-0000-000000000001', '99')"),
      /permission denied/
    );
    await assert.rejects(as(userId, "delete from public.open_positions"), /permission denied/);
    await assert.rejects(
      as(userId, "select public.replace_open_positions('10000000-0000-0000-0000-000000000001', '[]'::jsonb, now())"),
      /permission denied/
    );
    await assert.rejects(
      as(userId, "select public.track_baskets('10000000-0000-0000-0000-000000000001', now(), 0, true)"),
      /permission denied/
    );
    await assert.rejects(
      as(userId, "select public.sync_open_positions('10000000-0000-0000-0000-000000000001', '[]'::jsonb, now(), 0, true)"),
      /permission denied/
    );
    await assert.rejects(as(userId, "delete from public.baskets"), /permission denied/);
  }
  const left = await db.query(
    "select count(*)::int as n from public.open_positions where account_id = '10000000-0000-0000-0000-000000000001'"
  );
  assert.equal(left.rows[0].n, 1);
  // Refused at the door, not only by the table behind it.
  for (const fn of [
    "public.replace_open_positions(uuid, jsonb, timestamptz)",
    "public.track_baskets(uuid, timestamptz, numeric, boolean)",
    "public.sync_open_positions(uuid, jsonb, timestamptz, numeric, boolean)",
  ]) {
    const { rows } = await db.query(
      `select has_function_privilege('anon', '${fn}', 'execute') as anon,
              has_function_privilege('authenticated', '${fn}', 'execute') as authenticated,
              has_function_privilege('service_role', '${fn}', 'execute') as server`
    );
    assert.deepEqual(rows, [{ anon: false, authenticated: false, server: true }], fn);
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
