import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestSync, syncIntervalSec } from "@/lib/syncIngest";
import { generateSyncKey, hashSyncKey } from "@/lib/syncKeys";
import { payload } from "./fixtures.mjs";

// Just the parts of supabase-js that ingestSync uses, over plain maps.
function fakeDb() {
  const accounts = new Map();
  const keys = new Map();
  const deals = new Map();
  const samples = [];

  function from(table) {
    const q = { table, filters: [] };
    const api = {
      select(cols) {
        q.select = cols;
        return api;
      },
      eq(col, val) {
        q.filters.push([col, val]);
        return api;
      },
      upsert(rows, opts = {}) {
        q.upsert = { rows, opts };
        return api;
      },
      update(obj) {
        q.update = obj;
        return api;
      },
      async maybeSingle() {
        const [, hash] = q.filters[0];
        const k = keys.get(hash);
        return { data: k ? { account_id: k, accounts: { ...accounts.get(k) } } : null, error: null };
      },
      then(resolve, reject) {
        return run().then(resolve, reject);
      },
    };
    async function run() {
      if (table === "deals" && q.upsert) {
        const inserted = [];
        for (const r of q.upsert.rows) {
          const id = `${r.account_id}:${r.ticket}`;
          if (deals.has(id) && q.upsert.opts.ignoreDuplicates) continue;
          deals.set(id, r);
          inserted.push(r);
        }
        return { data: inserted, error: null };
      }
      if (table === "equity_samples") {
        samples.push(...q.upsert.rows);
        return { data: null, error: null };
      }
      if (table === "accounts" && q.update) {
        const [, id] = q.filters[0];
        accounts.set(id, { ...accounts.get(id), ...q.update });
        return { data: null, error: null };
      }
      throw new Error(`fake db: unhandled ${table}`);
    }
    return api;
  }

  return { from, accounts, keys, deals, samples };
}

function setup() {
  const db = fakeDb();
  const key = generateSyncKey();
  db.accounts.set("acc-1", {
    id: "acc-1",
    label: "V100 #1",
    account_number: null,
    server: null,
    archived_at: null,
    tracking_since: null,
    peak_equity: null,
    max_drawdown_pct: 0,
    max_drawdown_at: null,
    last_sample_at: null,
    resync_requested: false,
  });
  db.keys.set(hashSyncKey(key), "acc-1");
  return { db, key };
}

const T0 = Date.parse("2026-10-17T12:00:00Z");

function sync(db, key, body, now = T0) {
  return ingestSync(db, { authorization: `Bearer ${key}`, rawBody: JSON.stringify(body), now, env: {} });
}

test("the first sync binds the account and stores its history", async () => {
  const { db, key } = setup();
  const res = await sync(db, key, payload());
  assert.equal(res.status, 200);
  // The binding sync asks for the whole history, in case this terminal
  // already sent the login somewhere else and its watermark has moved on.
  assert.deepEqual(res.body, { ok: true, stored: 3, resync: true, interval: 120 });
  const acc = db.accounts.get("acc-1");
  assert.equal(acc.account_number, "51234567");
  assert.equal(acc.server, "Broker-Live");
  assert.equal(acc.balance, 10_000);
  assert.equal(acc.peak_equity, 9_950.5);
  assert.equal(acc.tracking_since, new Date(T0).toISOString());
  assert.equal(db.deals.size, 3);
  assert.equal(db.samples.length, 1);
});

test("a resent deal is not stored twice and a sample waits 15 minutes", async () => {
  const { db, key } = setup();
  await sync(db, key, payload());
  const res = await sync(db, key, payload(), T0 + 60_000);
  assert.equal(res.body.stored, 0);
  assert.equal(db.deals.size, 3);
  assert.equal(db.samples.length, 1);
  await sync(db, key, payload(), T0 + 16 * 60_000);
  assert.equal(db.samples.length, 2);
});

test("a withdrawal after tracking began moves the peak, not the drawdown", async () => {
  const { db, key } = setup();
  await sync(db, key, payload({ deals: [] }));
  const withdrawal = {
    ticket: "2001", position: "0", time: "2026-10-17T12:05:00Z", type: "DEAL_TYPE_BALANCE",
    entry: "DEAL_ENTRY_IN", profit: -5_000, swap: 0, commission: 0, fee: 0,
  };
  const p = payload({ deals: [withdrawal] });
  p.account.balance = 5_000;
  p.account.equity = 4_950.5;
  await sync(db, key, p, T0 + 10 * 60_000);
  const acc = db.accounts.get("acc-1");
  assert.equal(acc.peak_equity, 4_950.5);
  assert.equal(acc.max_drawdown_pct, 0);
});

test("another login on the same key is refused", async () => {
  const { db, key } = setup();
  await sync(db, key, payload());
  const p = payload();
  p.account.login = "99999999";
  const res = await sync(db, key, p);
  assert.equal(res.status, 409);
  assert.equal(db.accounts.get("acc-1").account_number, "51234567");
});

test("unknown keys, archived accounts and bad bodies are refused", async () => {
  const { db, key } = setup();
  assert.equal((await sync(db, generateSyncKey(), payload())).status, 401);
  assert.equal((await ingestSync(db, { authorization: null, rawBody: "{}" })).status, 401);
  assert.equal((await ingestSync(db, { authorization: `Bearer ${key}`, rawBody: "{nope" })).status, 400);
  db.accounts.get("acc-1").archived_at = "2026-10-01T00:00:00Z";
  assert.equal((await sync(db, key, payload())).status, 403);
});

test("a requested resync is sent once and then cleared", async () => {
  const { db, key } = setup();
  await sync(db, key, payload());
  assert.equal((await sync(db, key, payload())).body.resync, false);
  db.accounts.get("acc-1").resync_requested = true;
  assert.equal((await sync(db, key, payload())).body.resync, true);
  assert.equal((await sync(db, key, payload())).body.resync, false);
});

test("a backlog sent in pages does not record a drawdown that never happened", async () => {
  const { db, key } = setup();
  // Tracked at 10,000.
  const first = payload({ deals: [] });
  first.account.balance = first.account.equity = 10_000;
  await sync(db, key, first);

  // An outage, during which 10,000 is deposited. Page 1 of the backlog
  // carries today's 20,000 equity but only older deals; page 2 the deposit.
  const deposit = {
    ticket: "3001", position: "0", time: "2026-10-17T13:00:00Z", type: "DEAL_TYPE_BALANCE",
    entry: "DEAL_ENTRY_IN", profit: 10_000, swap: 0, commission: 0, fee: 0,
  };
  const page1 = payload({ deals: [], more: true });
  page1.account.balance = page1.account.equity = 20_000;
  const page2 = payload({ deals: [deposit], more: false });
  page2.account.balance = page2.account.equity = 20_000;
  await sync(db, key, page1, T0 + 3_600_000);
  await sync(db, key, page2, T0 + 3_600_000 + 1000);

  const acc = db.accounts.get("acc-1");
  assert.equal(acc.max_drawdown_pct, 0);
  assert.equal(acc.peak_equity, 20_000);
});

test("a trailing NUL from MQL5 is tolerated", async () => {
  const { db, key } = setup();
  const res = await ingestSync(db, {
    authorization: `Bearer ${key}`,
    rawBody: JSON.stringify(payload()) + "\u0000",
    now: T0,
    env: {},
  });
  assert.equal(res.status, 200);
});

test("the sync interval is bounded", () => {
  assert.equal(syncIntervalSec({}), 120);
  assert.equal(syncIntervalSec({ SYNC_INTERVAL_SEC: "5" }), 30);
  assert.equal(syncIntervalSec({ SYNC_INTERVAL_SEC: "9999" }), 600);
  assert.equal(syncIntervalSec({ SYNC_INTERVAL_SEC: "90" }), 90);
});
