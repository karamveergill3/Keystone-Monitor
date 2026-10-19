// The fleet summary's floating drawdown record (schema.sql, section 4)
// against a real Postgres (PGlite), as floatingHistoryFor in
// src/lib/data.js calls it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SCHEMA = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

// The same stand-in for Supabase's roles as tests/schema.test.mjs.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const A = "20000000-0000-0000-0000-000000000001";
const B = "20000000-0000-0000-0000-000000000002";
const C = "20000000-0000-0000-0000-000000000003";

let db;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(SCHEMA);
  await db.exec(SCHEMA);
  const { rows } = await db.query("select id from public.projects order by sort limit 1");
  for (const id of [A, B, C]) {
    await db.query("insert into public.accounts (id, project_id, label, balance) values ($1, $2, $3, 10000)", [id, rows[0].id, id]);
  }
  const sample = (id, at, balance, equity, credit = 0) =>
    db.query("insert into public.equity_samples (account_id, at, balance, equity, credit) values ($1, $2, $3, $4, $5)", [id, at, balance, equity, credit]);
  // A: worst is 2,000 down on 10,000, then recovers. Credit is not the
  // account's money: the 500 below would otherwise hide 500 of the loss.
  await sample(A, "2026-09-01T10:00:00Z", 10000, 9500);
  await sample(A, "2026-09-01T10:15:00Z", 10000, 8500, 500);
  await sample(A, "2026-09-10T10:00:00Z", 11000, 11000);
  // B: never below its balance, so its worst is 0, not a gain.
  await sample(B, "2026-09-02T09:00:00Z", 5000, 5200);
  await sample(B, "2026-09-03T09:00:00Z", 5000, 5000);
  // C has no samples at all.
});

after(async () => {
  await db?.close();
});

async function asServer(sql, params) {
  await db.exec("set role service_role");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

test("floating_worst: each account's deepest open-trade loss over its balance, credit taken off", async () => {
  const { rows } = await asServer(
    "select account_id, worst_pct::float8 as worst, first_at from public.floating_worst($1::uuid[]) order by account_id",
    [[A, B, C]]
  );
  assert.deepEqual(
    rows.map((r) => [r.account_id, Math.round(r.worst * 1e6) / 1e6, new Date(r.first_at).toISOString()]),
    [
      [A, -0.2, "2026-09-01T10:00:00.000Z"],
      [B, 0, "2026-09-02T09:00:00.000Z"],
    ]
  );
  // Only the accounts asked for.
  const one = await asServer("select account_id from public.floating_worst($1::uuid[])", [[B]]);
  assert.deepEqual(one.rows.map((r) => r.account_id), [B]);
});

test("equity_sample_gaps: each account's own stretches with no sample, the last running to now", async () => {
  const gaps = async (ids, longer) =>
    (await asServer("select account_id, gap_from, gap_to from public.equity_sample_gaps($1::uuid[], $2::interval)", [ids, longer])).rows.map(
      (r) => [r.account_id, new Date(r.gap_from).toISOString(), new Date(r.gap_to).getTime()]
    );
  const now = Date.now();
  const toNow = (t) => Math.abs(t - now) < 60_000;
  const g = await gaps([A, B], "3 days");
  // A: 1 Sep to 10 Sep, then quiet since 10 Sep. B: quiet since 3 Sep.
  // B's samples on 2 and 3 Sep do not fill A's gap: each account is its own.
  assert.deepEqual(g.map(([id, from]) => [id, from]), [
    [A, "2026-09-01T10:15:00.000Z"],
    [B, "2026-09-03T09:00:00.000Z"],
    [A, "2026-09-10T10:00:00.000Z"],
  ]);
  assert.equal(g[0][2], Date.parse("2026-09-10T10:00:00Z"));
  assert.ok(toNow(g[1][2]) && toNow(g[2][2]));
  // Only the accounts asked for; none for an account with no samples.
  assert.deepEqual((await gaps([B], "3 days")).map(([id]) => id), [B]);
  assert.deepEqual(await gaps([C], "1 hour"), []);
  // Nothing longer than ten thousand days.
  assert.deepEqual(await gaps([A, B], "10000 days"), []);
});

test("a browser can run neither function", async () => {
  for (const fn of ["public.floating_worst(uuid[])", "public.equity_sample_gaps(uuid[], interval)"]) {
    const { rows } = await db.query(
      `select has_function_privilege('anon', '${fn}', 'execute') as anon,
              has_function_privilege('authenticated', '${fn}', 'execute') as authenticated,
              has_function_privilege('service_role', '${fn}', 'execute') as server`
    );
    assert.deepEqual(rows, [{ anon: false, authenticated: false, server: true }], fn);
  }
  await db.exec("set role anon");
  try {
    await assert.rejects(db.query(`select * from public.floating_worst(array['${A}']::uuid[])`), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});
