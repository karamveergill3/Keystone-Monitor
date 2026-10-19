// The print queue (schema.sql, section 9) against a real Postgres
// (PGlite), as /api/print-queue and /api/print use it.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

const hash = (key) => createHash("sha256").update(key, "utf8").digest("hex");
const GOOD = hash("a".repeat(64));
const BAD = hash("b".repeat(64));

let db;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(SCHEMA);
  await db.exec(SCHEMA);
  await db.query("insert into public.print_agent_keys (key_hash, label) values ($1, 'office Mac')", [GOOD]);
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec("delete from public.print_jobs; delete from public.print_agents;");
});

async function asServer(sql, params) {
  await db.exec("set role service_role");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

async function asBrowser(role, sql) {
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}

const claim = (keyHash = GOOD, agent = "office-mac") =>
  asServer("select * from public.claim_print_job($1, $2, 'Brother_HL_L3220CW_series', '1.0.0')", [keyHash, agent]);

const finish = (id, ok, error = null, keyHash = GOOD) =>
  asServer("select public.finish_print_job($1, $2, $3, $4) as done", [keyHash, id, ok, error]);

// Each its own report, as only one job per report may wait at a time.
let queued = 0;
async function queue(copies = 1, ago = "0 seconds") {
  const { rows } = await asServer(
    `insert into public.print_jobs (kind, path, copies, requested_at)
     values ('project_report', $3, $1, now() - $2::interval) returning id`,
    [copies, ago, `/api/reports/project/p${++queued}`]
  );
  return Number(rows[0].id);
}

async function job(id) {
  const { rows } = await db.query("select status, agent, error, claimed_at, finished_at from public.print_jobs where id = $1", [id]);
  return rows[0];
}

test("a good key claims the oldest queued job and records the agent", async () => {
  const older = await queue(2, "30 seconds");
  const newer = await queue(1);
  const { rows } = await claim();
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].id), older);
  assert.equal(rows[0].copies, 2);
  assert.equal(rows[0].status, "printing");
  assert.equal(rows[0].agent, "office-mac");
  assert.ok(rows[0].claimed_at);
  assert.equal((await job(newer)).status, "queued");

  const agents = await db.query("select name, printer, version, last_seen_at > now() - interval '5 seconds' as fresh from public.print_agents");
  assert.deepEqual(agents.rows, [{ name: "office-mac", printer: "Brother_HL_L3220CW_series", version: "1.0.0", fresh: true }]);
});

test("a poll with nothing queued returns no row but still counts as a heartbeat", async () => {
  const { rows } = await claim();
  assert.deepEqual(rows, []);
  const agents = await db.query("select count(*)::int as n from public.print_agents");
  assert.equal(agents.rows[0].n, 1);
});

test("an unknown key hash is refused with 28000 and changes nothing", async () => {
  const id = await queue();
  await assert.rejects(claim(BAD), (err) => err.code === "28000" && /unknown print agent key/.test(err.message));
  await assert.rejects(claim(null), (err) => err.code === "28000");
  await assert.rejects(finish(id, true, null, BAD), (err) => err.code === "28000");
  assert.equal((await job(id)).status, "queued");
  const agents = await db.query("select count(*)::int as n from public.print_agents");
  assert.equal(agents.rows[0].n, 0);
});

test("an empty agent name is refused", async () => {
  await assert.rejects(claim(GOOD, "  "), (err) => err.code === "22023");
});

test("a job is claimed once: the next poll gets the next job or nothing", async () => {
  const a = await queue(1, "10 seconds");
  const b = await queue();
  assert.equal(Number((await claim(GOOD, "one")).rows[0].id), a);
  assert.equal(Number((await claim(GOOD, "two")).rows[0].id), b);
  assert.deepEqual((await claim(GOOD, "three")).rows, []);
  assert.equal((await job(a)).agent, "one");
  assert.equal((await job(b)).agent, "two");
});

test("the claim skips rows another transaction has locked", async () => {
  const { rows } = await db.query(
    "select pg_get_functiondef('public.claim_print_job(text, text, text, text)'::regprocedure) as def"
  );
  assert.match(rows[0].def, /for update skip locked/i);
});

test("finish marks a printing job printed, or failed with the reason trimmed to 300", async () => {
  const a = await queue();
  const b = await queue();
  await claim();
  await claim();
  assert.equal((await finish(a, true)).rows[0].done, true);
  assert.deepEqual(
    { status: (await job(a)).status, error: (await job(a)).error, finished: Boolean((await job(a)).finished_at) },
    { status: "printed", error: null, finished: true }
  );
  assert.equal((await finish(b, false, `  lp: ${"x".repeat(400)}  `)).rows[0].done, true);
  const failed = await job(b);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.length, 300);
  assert.ok(failed.error.startsWith("lp: x"));
});

test("finish leaves a job that is not printing alone", async () => {
  const queued = await queue();
  assert.equal((await finish(queued, true)).rows[0].done, false);
  assert.equal((await job(queued)).status, "queued");

  await claim();
  await finish(queued, true);
  assert.equal((await finish(queued, false, "late")).rows[0].done, false);
  assert.equal((await job(queued)).status, "printed");
  assert.equal((await finish(999_999, true)).rows[0].done, false);
});

test("a job stuck printing for over 10 minutes is failed by the next poll", async () => {
  const stuck = await queue();
  await claim();
  await db.query("update public.print_jobs set claimed_at = now() - interval '11 minutes' where id = $1", [stuck]);
  const recent = await queue();
  await claim();
  await db.query("update public.print_jobs set claimed_at = now() - interval '9 minutes' where id = $1", [recent]);

  assert.deepEqual((await claim()).rows, []);
  const s = await job(stuck);
  assert.equal(s.status, "failed");
  assert.match(s.error, /10 minutes/);
  assert.ok(s.finished_at);
  assert.equal((await job(recent)).status, "printing");
});

test("a job still queued after 24 hours is failed, not printed", async () => {
  const old = await queue(1, "25 hours");
  const fresh = await queue(1, "23 hours");
  const { rows } = await claim();
  assert.equal(Number(rows[0].id), fresh);
  const o = await job(old);
  assert.equal(o.status, "failed");
  assert.match(o.error, /24 hours/);
});

test("the table refuses a kind, copies or status it does not know", async () => {
  await assert.rejects(asServer("insert into public.print_jobs (kind) values ('everything')"), /check/);
  await assert.rejects(asServer("insert into public.print_jobs (kind, copies) values ('fleet_summary', 6)"), /check/);
  await assert.rejects(asServer("insert into public.print_jobs (kind, copies) values ('fleet_summary', 0)"), /check/);
  await assert.rejects(asServer("insert into public.print_jobs (kind, status) values ('fleet_summary', 'lost')"), /check/);
  await assert.rejects(asServer("insert into public.print_agent_keys (key_hash) values ('not-a-hash')"), /check/);
});

test("a job's path is a report on this site, and its kind says which", async () => {
  const ok = [
    ["fleet_summary", "/api/reports/fleet"],
    ["project_report", "/api/reports/project/v100"],
    ["project_report", "/api/reports/project/v100?from=2026-09-01&to=2026-09-30"],
    ["account_report", "/api/reports/account/0b6f8c3e-1d2a-4c5b-9e7f-123456789abc?to=2026-09-30"],
  ];
  for (const [kind, path] of ok) {
    await asServer("insert into public.print_jobs (kind, path, status) values ($1, $2, 'printed')", [kind, path]);
  }
  for (const [kind, path] of [
    ["fleet_summary", "https://elsewhere.test/api/reports/fleet"],
    ["fleet_summary", "/api/reports/fleet?from=2026-09-01"],
    ["project_report", "/api/reports/project/../../admin"],
    ["project_report", "/api/reports/project/v100?from=soon"],
    ["account_report", "/api/reports/account/not-a-uuid"],
    ["project_report", "/api/reports/fleet"],
    ["account_report", "/api/reports/project/v100"],
  ]) {
    await assert.rejects(asServer("insert into public.print_jobs (kind, path) values ($1, $2)", [kind, path]), /check/, path);
  }
});

test("only one job per report may wait; once claimed, the same report queues again", async () => {
  const path = "/api/reports/project/v100?from=2026-09-01";
  await asServer("insert into public.print_jobs (kind, path) values ('project_report', $1)", [path]);
  await assert.rejects(
    asServer("insert into public.print_jobs (kind, path) values ('project_report', $1)", [path]),
    (err) => err.code === "23505"
  );
  await asServer("insert into public.print_jobs (kind, path) values ('project_report', '/api/reports/project/v100')");
  await claim();
  await asServer("insert into public.print_jobs (kind, path) values ('project_report', $1)", [path]);
});

test("a browser can neither read nor write the print tables, nor run the functions", async () => {
  await queue();
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["print_jobs", "print_agents", "print_agent_keys"]) {
      await assert.rejects(asBrowser(role, `select * from public.${table}`), /permission denied/, `${role}: ${table}`);
    }
    await assert.rejects(asBrowser(role, "insert into public.print_jobs (kind) values ('fleet_summary')"), /permission denied/);
    await assert.rejects(asBrowser(role, `insert into public.print_agent_keys (key_hash) values ('${BAD}')`), /permission denied/);
    await assert.rejects(asBrowser(role, `select * from public.claim_print_job('${GOOD}', 'x', null, null)`), /permission denied/);
    await assert.rejects(asBrowser(role, `select public.finish_print_job('${GOOD}', 1, true, null)`), /permission denied/);
  }
  for (const fn of [
    "public.claim_print_job(text, text, text, text)",
    "public.finish_print_job(text, bigint, boolean, text)",
  ]) {
    const { rows } = await db.query(
      `select has_function_privilege('anon', '${fn}', 'execute') as anon,
              has_function_privilege('authenticated', '${fn}', 'execute') as authenticated,
              has_function_privilege('service_role', '${fn}', 'execute') as server`
    );
    assert.deepEqual(rows, [{ anon: false, authenticated: false, server: true }], fn);
  }
  const { rows } = await db.query(
    "select relname from pg_class where relname in ('print_jobs', 'print_agents', 'print_agent_keys') and not relrowsecurity"
  );
  assert.deepEqual(rows, []);
});
