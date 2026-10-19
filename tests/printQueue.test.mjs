import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  agentKey, agentRequest, hashAgentKey, parseCopies, printJobState, printTarget, queuePrint, JOBS_PER_MINUTE, MAX_AGENT_BODY,
} from "@/lib/printQueue";

const NOW = Date.parse("2026-10-19T13:00:00Z");
const TODAY = "2026-10-19";
const ACCOUNT = "0b6f8c3e-1d2a-4c5b-9e7f-123456789abc";
const KEY = "a".repeat(64);
const GOOD = createHash("sha256").update(KEY).digest("hex");

// Just the parts of supabase-js the queue uses, over plain arrays, with
// the two functions behaving as schema.sql's do (tests/printSchema.test.mjs
// runs the real ones).
function fakeDb({ jobs = [], agents = [], projects = [{ id: 1, slug: "v100" }], accounts = [{ id: ACCOUNT }], raceOnInsert = null } = {}) {
  const calls = [];
  let nextId = 100;
  const tables = { print_jobs: jobs, print_agents: agents, projects, accounts };
  function from(table) {
    const q = { filters: [] };
    const rows = () => tables[table].filter((r) => q.filters.every(([op, col, v]) => (op === "gte" ? r[col] >= v : r[col] === v)));
    const api = {
      select(cols, opts) {
        q.head = opts?.head;
        return api;
      },
      gte(col, v) {
        q.filters.push(["gte", col, v]);
        return api;
      },
      eq(col, v) {
        q.filters.push(["eq", col, v]);
        return api;
      },
      insert(row) {
        q.insert = row;
        return api;
      },
      async single() {
        // Another click's insert landing first, as the unique index sees it.
        if (raceOnInsert) {
          jobs.push(raceOnInsert);
          raceOnInsert = null;
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        const row = { id: nextId++, status: "queued", requested_at: new Date(NOW).toISOString(), ...q.insert };
        jobs.push(row);
        return { data: { id: row.id }, error: null };
      },
      async maybeSingle() {
        return { data: rows()[0] ?? null, error: null };
      },
      then(resolve) {
        return Promise.resolve(q.head ? { count: rows().length, error: null } : { data: rows(), error: null }).then(resolve);
      },
    };
    return api;
  }
  async function rpc(name, args) {
    calls.push([name, args]);
    if (args.p_key_hash !== GOOD) return { data: null, error: { code: "28000", message: "unknown print agent key" } };
    if (name === "claim_print_job") {
      const job = jobs.find((j) => j.status === "queued");
      if (!job) return { data: [], error: null };
      job.status = "printing";
      return { data: [job], error: null };
    }
    const job = jobs.find((j) => j.id === args.p_id && j.status === "printing");
    if (job) Object.assign(job, { status: args.p_ok ? "printed" : "failed", error: args.p_error });
    return { data: Boolean(job), error: null };
  }
  return { from, rpc, calls, jobs };
}

const ago = (ms) => new Date(NOW - ms).toISOString();

test("copies: 1 to 5, 1 when left out", () => {
  assert.equal(parseCopies({}), 1);
  assert.equal(parseCopies(undefined), 1);
  assert.equal(parseCopies({ copies: 3 }), 3);
  for (const bad of [0, 6, 1.5, "2", -1]) assert.equal(parseCopies({ copies: bad }), null, String(bad));
});

test("the agent key is read from a Bearer header and hashed to hex", () => {
  assert.equal(agentKey(`Bearer ${KEY}`), KEY);
  assert.equal(agentKey(`bearer   ${KEY}  `), KEY);
  assert.equal(agentKey("Bearer short"), null);
  assert.equal(agentKey(KEY), null);
  assert.equal(agentKey(null), null);
  assert.equal(hashAgentKey(KEY), GOOD);
});

const queue = (db, body) => queuePrint(db, { body, now: NOW, today: TODAY });

test("each report has its own path, with the box's dates", () => {
  assert.deepEqual(printTarget({ report: "fleet", from: "2026-01-01" }, TODAY), { kind: "fleet_summary", path: "/api/reports/fleet" });
  assert.equal(printTarget({ report: "project", target: "v100" }, TODAY).path, "/api/reports/project/v100");
  assert.equal(
    printTarget({ report: "account", target: ACCOUNT.toUpperCase(), from: "2026-09-01", to: "2026-09-30" }, TODAY).path,
    `/api/reports/account/${ACCOUNT}?from=2026-09-01&to=2026-09-30`
  );
  assert.equal(printTarget({ report: "project", target: "v100", to: "2026-09-30" }, TODAY).path, "/api/reports/project/v100?to=2026-09-30");
  assert.deepEqual(printTarget({ report: "project", target: "v100", from: "2026-10-02", to: "2026-10-01" }, TODAY), { error: "From is after To." });
  assert.deepEqual(printTarget({ report: "project", target: "v100", from: "1/10/2026" }, TODAY), { error: "From is not a date (YYYY-MM-DD)." });
  assert.deepEqual(printTarget({ report: "account", target: "../fleet" }, TODAY), { error: "no such account" });
  assert.deepEqual(printTarget({ report: "project", target: "V 100" }, TODAY), { error: "no such project" });
  assert.deepEqual(printTarget({ report: "everything" }, TODAY), { error: "report must be fleet, project or account" });
});

test("queueing adds a job and says whether an agent polled in the last 30 seconds", async () => {
  const db = fakeDb({ agents: [{ name: "office-mac", last_seen_at: ago(10_000) }] });
  const r = await queue(db, { report: "fleet", copies: 2 });
  assert.deepEqual(r, { status: 200, body: { jobId: 100, online: true, reused: false } });
  assert.deepEqual(db.jobs.map((j) => [j.kind, j.path, j.copies]), [["fleet_summary", "/api/reports/fleet", 2]]);

  const asleep = fakeDb({ agents: [{ name: "office-mac", last_seen_at: ago(31_000) }] });
  assert.deepEqual((await queue(asleep, { report: "fleet" })).body, { jobId: 100, online: false, reused: false });
  assert.equal((await queue(fakeDb(), { report: "fleet" })).body.online, false);

  const reports = fakeDb();
  await queue(reports, { report: "project", target: "v100", from: "2026-09-01" });
  await queue(reports, { report: "account", target: ACCOUNT });
  assert.deepEqual(reports.jobs.map((j) => [j.kind, j.path]), [
    ["project_report", "/api/reports/project/v100?from=2026-09-01"],
    ["account_report", `/api/reports/account/${ACCOUNT}`],
  ]);
});

test("the same report already waiting is handed back, not queued twice", async () => {
  const db = fakeDb();
  const first = await queue(db, { report: "project", target: "v100", from: "2026-09-01" });
  const again = await queue(db, { report: "project", target: "v100", from: "2026-09-01" });
  assert.deepEqual(again.body, { jobId: first.body.jobId, online: false, reused: true });
  assert.equal(db.jobs.length, 1);
  // Other dates are another report.
  assert.equal((await queue(db, { report: "project", target: "v100" })).body.reused, false);
  // Once it has printed, the same report queues afresh.
  db.jobs[0].status = "printed";
  assert.equal((await queue(db, { report: "project", target: "v100", from: "2026-09-01" })).body.reused, false);

  // Two clicks racing: the index refuses the second insert, which gets the first job.
  const raced = fakeDb({ raceOnInsert: { id: 55, status: "queued", path: "/api/reports/fleet", requested_at: ago(0) } });
  assert.deepEqual((await queue(raced, { report: "fleet" })).body, { jobId: 55, online: false, reused: true });
});

test("queueing refuses bad copies, a missing report and a fourth job inside a minute", async () => {
  assert.equal((await queue(fakeDb(), { report: "fleet", copies: 9 })).status, 400);
  assert.equal((await queue(fakeDb(), { report: "project", target: "v100", from: "soon" })).status, 400);
  assert.equal((await queue(fakeDb(), {})).status, 400);
  assert.deepEqual(await queue(fakeDb(), { report: "project", target: "cycle" }), { status: 404, body: { error: "no such project" } });
  assert.equal((await queue(fakeDb({ accounts: [] }), { report: "account", target: ACCOUNT })).status, 404);

  const jobs = Array.from({ length: JOBS_PER_MINUTE }, (_, i) => ({ id: i + 1, status: "printed", requested_at: ago(10_000 * (i + 1)) }));
  const db = fakeDb({ jobs });
  const r = await queue(db, { report: "fleet" });
  assert.equal(r.status, 429);
  assert.equal(db.jobs.length, JOBS_PER_MINUTE);
  // An old one does not count.
  jobs[0].requested_at = ago(61_000);
  assert.equal((await queue(db, { report: "fleet" })).status, 200);
});

test("a job's state is what the button polls", async () => {
  const db = fakeDb({ jobs: [{ id: 7, status: "failed", error: "lp: printer is out of paper" }], agents: [{ name: "m", last_seen_at: ago(1000) }] });
  assert.deepEqual(await printJobState(db, { id: "7", now: NOW }), { status: 200, body: { status: "failed", error: "lp: printer is out of paper", online: true } });
  assert.equal((await printJobState(db, { id: "8", now: NOW })).status, 404);
  assert.equal((await printJobState(db, { id: "abc", now: NOW })).status, 404);
  assert.equal((await printJobState(db, { id: "0", now: NOW })).status, 404);
});

const agent = (db, body, key = KEY) =>
  agentRequest(db, { authorization: `Bearer ${key}`, rawBody: typeof body === "string" ? body : JSON.stringify(body), appUrl: "https://example.test/" });

test("a poll claims the next job and gives the document's absolute address", async () => {
  const db = fakeDb({ jobs: [{ id: 3, status: "queued", copies: 2, path: "/api/reports/fleet" }] });
  const r = await agent(db, { action: "poll", agent: "office-mac", printer: "Brother_HL_L3220CW_series", version: "1.0.0" });
  assert.deepEqual(r, { status: 200, body: { job: { id: 3, copies: 2, url: "https://example.test/api/reports/fleet" } } });
  assert.deepEqual(db.calls[0], ["claim_print_job", { p_key_hash: GOOD, p_agent: "office-mac", p_printer: "Brother_HL_L3220CW_series", p_version: "1.0.0" }]);
  assert.deepEqual(await agent(db, { action: "poll", agent: "office-mac", printer: null }), { status: 200, body: { job: null } });

  db.jobs.push({ id: 4, status: "queued", copies: 1, path: `/api/reports/account/${ACCOUNT}?from=2026-09-01&to=2026-09-30` });
  assert.equal(
    (await agent(db, { action: "poll", agent: "office-mac" })).body.job.url,
    `https://example.test/api/reports/account/${ACCOUNT}?from=2026-09-01&to=2026-09-30`
  );
});

test("a report finishes the job", async () => {
  const db = fakeDb({ jobs: [{ id: 3, status: "printing", copies: 1 }] });
  assert.deepEqual(await agent(db, { action: "report", jobId: 3, ok: false, error: "lp: no such printer" }), { status: 200, body: { ok: true } });
  assert.equal(db.jobs[0].status, "failed");
  assert.deepEqual(db.calls[0], ["finish_print_job", { p_key_hash: GOOD, p_id: 3, p_ok: false, p_error: "lp: no such printer" }]);
  await agent(db, { action: "report", jobId: 4, ok: true });
  assert.equal(db.calls[1][1].p_error, null);
});

test("a bad or missing key is 401; bad input is 400", async () => {
  const db = fakeDb();
  assert.equal((await agent(db, { action: "poll", agent: "m" }, "b".repeat(64))).status, 401);
  assert.equal((await agent(db, { action: "report", jobId: 1, ok: true }, "b".repeat(64))).status, 401);
  assert.equal((await agentRequest(db, { authorization: null, rawBody: "{}" })).status, 401);
  assert.equal((await agentRequest(db, { authorization: "Bearer x", rawBody: "{}" })).status, 401);
  for (const body of [
    "not json", "[]", "null", {}, { action: "dance" },
    { action: "poll" }, { action: "poll", agent: "" }, { action: "poll", agent: "x".repeat(65) }, { action: "poll", agent: "m", printer: 5 },
    { action: "report", jobId: "3", ok: true }, { action: "report", jobId: 3 }, { action: "report", jobId: 0, ok: true },
    { action: "report", jobId: 3, ok: false, error: 42 },
  ]) {
    assert.equal((await agent(db, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await agent(db, "x".repeat(MAX_AGENT_BODY + 1))).status, 400);
  // Refused input never reaches the database.
  assert.deepEqual(db.calls.map((c) => c[0]), ["claim_print_job", "finish_print_job"]);
});
