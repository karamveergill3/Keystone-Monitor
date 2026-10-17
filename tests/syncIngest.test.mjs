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
  // Keyed account_id:ticket, the table's primary key.
  const open = new Map();

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

  // replace_open_positions from schema.sql: all of an account's rows out
  // and the new ones in, or, on any error, nothing changed at all.
  async function rpc(name, args) {
    if (name !== "replace_open_positions") throw new Error(`fake db: unhandled rpc ${name}`);
    const { p_account: accountId, p_rows: rows, p_at: at } = args;
    const ids = rows.map((r) => `${accountId}:${r.ticket}`);
    if (new Set(ids).size !== ids.length) {
      return { data: null, error: { message: "duplicate key value violates unique constraint" } };
    }
    for (const [id, r] of open) if (r.account_id === accountId) open.delete(id);
    rows.forEach((r, i) => open.set(ids[i], { account_id: accountId, ...pick(r, OPEN_COLUMNS), updated_at: at }));
    return { data: null, error: null };
  }

  return { from, rpc, accounts, keys, deals, samples, open };
}

// The columns replace_open_positions reads out of each row; anything else
// in a row is dropped, as jsonb_to_recordset drops it.
const OPEN_COLUMNS = [
  "ticket", "symbol", "side", "volume", "open_price", "current_price", "sl", "tp",
  "swap", "profit", "open_time", "magic", "comment",
];

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
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

function openTickets(db, accountId = "acc-1") {
  return [...db.open.values()].filter((r) => r.account_id === accountId).map((r) => r.ticket).sort();
}

test("open positions are stored as a snapshot that each sync replaces", async () => {
  const { db, key } = setup();
  // Another account's positions are never touched by this one's sync.
  db.open.set("acc-2:9", { account_id: "acc-2", ticket: "9", symbol: "EURUSD" });

  await sync(db, key, payload());
  assert.deepEqual(openTickets(db), ["1004", "1005"]);
  const stored = db.open.get("acc-1:1004");
  assert.equal(stored.symbol, "XAUUSD");
  assert.equal(stored.side, "buy");
  assert.equal(stored.profit, -48);
  assert.equal(stored.open_time, "2026-10-03T07:30:00.123Z");
  assert.equal(stored.updated_at, new Date(T0).toISOString());

  // 1004 closed and a new one opened: only what the terminal has now.
  const [, eur] = payload().open;
  const added = { ...eur, ticket: "1010", profit: 3.2 };
  const res = await sync(db, key, payload({ open: [eur, added] }), T0 + 60_000);
  assert.equal(res.status, 200);
  assert.deepEqual(openTickets(db), ["1005", "1010"]);
  assert.equal(db.open.get("acc-1:1010").profit, 3.2);
  assert.equal(db.open.get("acc-1:1005").updated_at, new Date(T0 + 60_000).toISOString());

  // Everything closed.
  await sync(db, key, payload({ open: [] }), T0 + 120_000);
  assert.deepEqual(openTickets(db), []);
  assert.deepEqual(openTickets(db, "acc-2"), ["9"]);
});

test("a sync from an EA that does not report positions leaves them alone", async () => {
  const { db, key } = setup();
  await sync(db, key, payload());
  const old = payload({ ea: "2026.10.17" });
  delete old.open;
  const res = await sync(db, key, old, T0 + 60_000);
  assert.equal(res.status, 200);
  assert.deepEqual(openTickets(db), ["1004", "1005"]);
  assert.equal(db.open.get("acc-1:1004").updated_at, new Date(T0).toISOString());
  assert.equal(db.accounts.get("acc-1").ea_version, "2026.10.17");
});

test("a failed open positions replace is a 500 the EA retries, and keeps the last snapshot", async () => {
  const { db, key } = setup();
  await sync(db, key, payload());
  const before = { ...db.accounts.get("acc-1") };

  // The replace is one call, so it either happens whole or not at all: the
  // positions from the last good sync stay, and the account row (its
  // position count and last_sync_at) still matches them.
  db.rpc = async () => ({ data: null, error: { message: "statement timeout" } });
  const [, eur] = payload().open;
  await assert.rejects(
    sync(db, key, payload({ open: [eur] }), T0 + 60_000),
    /open positions replace failed: statement timeout/
  );
  assert.deepEqual(openTickets(db), ["1004", "1005"]);
  assert.equal(db.open.get("acc-1:1004").updated_at, new Date(T0).toISOString());
  assert.deepEqual(db.accounts.get("acc-1"), before);
});

test("every open position row carries the time of the sync that sent it", async () => {
  const { db, key } = setup();
  await sync(db, key, payload(), T0 + 5_000);
  const at = db.accounts.get("acc-1").last_sync_at;
  assert.equal(at, new Date(T0 + 5_000).toISOString());
  for (const r of db.open.values()) assert.equal(r.updated_at, at);
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
