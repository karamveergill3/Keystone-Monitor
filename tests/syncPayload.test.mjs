import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSyncPayload, SyncPayloadError, MAX_DEALS_PER_SYNC, MAX_OPEN_PER_SYNC } from "@/lib/syncPayload";
import { payload } from "./fixtures.mjs";

const NOW = Date.parse("2026-10-17T12:00:00Z");

test("a good payload is read into rows", () => {
  const p = parseSyncPayload(payload(), NOW);
  assert.equal(p.account.login, "51234567");
  assert.equal(p.account.currency, "USD");
  assert.equal(p.deals.length, 3);
  const [deposit, open, close] = p.deals;
  assert.equal(deposit.kind, "cash");
  assert.equal(deposit.position_id, null);
  assert.equal(open.kind, "trade");
  assert.equal(open.entry, "in");
  assert.equal(close.entry, "out");
  assert.equal(close.net, 49.55);
  assert.equal(close.time, "2026-10-02T10:00:00.000Z");
});

test("bad payloads are refused whole", () => {
  const bad = [
    null,
    [],
    { ...payload(), v: 2 },
    payload({ account: { ...payload().account, balance: "abc" } }),
    payload({ account: { ...payload().account, equity: undefined } }),
    payload({ account: { ...payload().account, login: "12a" } }),
    payload({ account: { ...payload().account, server: "" } }),
    payload({ deals: "nope" }),
    payload({ deals: [{ ...payload().deals[0], ticket: "x" }] }),
    payload({ deals: [{ ...payload().deals[0], time: "yesterday" }] }),
    payload({ deals: [{ ...payload().deals[0], time: "2026-11-30T00:00:00Z" }] }),
    payload({ deals: [{ ...payload().deals[0], profit: "NaN" }] }),
    payload({ deals: [{ ...payload().deals[0], type: "DEAL_TYPE_<b>" }] }),
    payload({ deals: new Array(MAX_DEALS_PER_SYNC + 1).fill(payload().deals[0]) }),
  ];
  for (const b of bad) {
    assert.throws(() => parseSyncPayload(b, NOW), SyncPayloadError, JSON.stringify(b)?.slice(0, 80));
  }
});

test("a ticket sent twice in one batch is stored once", () => {
  const d = payload().deals[1];
  const p = parseSyncPayload(payload({ deals: [d, { ...d, comment: "again" }] }), NOW);
  assert.equal(p.deals.length, 1);
  assert.equal(p.deals[0].comment, "again");
});

test("control characters and long strings are cleaned", () => {
  const d = { ...payload().deals[1], comment: "a\u0000b\nc" + "x".repeat(200) };
  const p = parseSyncPayload(payload({ deals: [d] }), NOW);
  assert.equal(p.deals[0].comment.length, 80);
  assert.ok(p.deals[0].comment.startsWith("abc"));
});

test("open positions are read into rows", () => {
  const p = parseSyncPayload(payload(), NOW);
  assert.equal(p.open.length, 2);
  assert.deepEqual(p.open[0], {
    ticket: "1004",
    position_id: "1004",
    symbol: "XAUUSD",
    side: "buy",
    volume: 0.2,
    open_price: 2660.5,
    current_price: 2658.1,
    sl: 2640,
    tp: 2700,
    swap: -0.5,
    profit: -48,
    open_time: "2026-10-03T07:30:00.123Z",
    magic: 100,
    comment: "grid 1",
    point_value: 100,
  });
  assert.equal(p.open[1].side, "sell");
  assert.equal(p.open[1].comment, null);
});

test("an EA that does not report open positions is told apart from one with none open", () => {
  const old = payload();
  delete old.open;
  assert.equal(parseSyncPayload(old, NOW).open, null);
  assert.equal(parseSyncPayload(payload({ open: null }), NOW).open, null);
  assert.deepEqual(parseSyncPayload(payload({ open: [] }), NOW).open, []);
});

test("a payload with a bad open position is refused whole", () => {
  const pos = payload().open[0];
  const bad = [
    payload({ open: "nope" }),
    payload({ open: {} }),
    payload({ open: [null] }),
    payload({ open: [[]] }),
    payload({ open: [{ ...pos, ticket: "x" }] }),
    payload({ open: [{ ...pos, ticket: undefined }] }),
    payload({ open: [{ ...pos, volume: "abc" }] }),
    payload({ open: [{ ...pos, profit: "NaN" }] }),
    payload({ open: [{ ...pos, sl: "Infinity" }] }),
    payload({ open: [{ ...pos, open_time: "yesterday" }] }),
    payload({ open: [{ ...pos, open_time: undefined }] }),
    payload({ open: [{ ...pos, open_time: "2026-11-30T00:00:00Z" }] }),
    payload({ open: [pos, { ...pos, ticket: "1006", magic: "lots" }] }),
    payload({ open: [{ ...pos, position_id: "abc" }] }),
    payload({ open: [{ ...pos, position_id: "-5" }] }),
    payload({ open: [{ ...pos, position_id: "" }] }),
  ];
  for (const b of bad) {
    assert.throws(() => parseSyncPayload(b, NOW), SyncPayloadError, JSON.stringify(b.open)?.slice(0, 80));
  }
});

test("too many open positions are refused", () => {
  const pos = payload().open[0];
  const many = Array.from({ length: MAX_OPEN_PER_SYNC + 1 }, (_, i) => ({ ...pos, ticket: String(5000 + i) }));
  assert.throws(() => parseSyncPayload(payload({ open: many }), NOW), SyncPayloadError);
  assert.equal(parseSyncPayload(payload({ open: many.slice(0, MAX_OPEN_PER_SYNC) }), NOW).open.length, MAX_OPEN_PER_SYNC);
});

test("an open position's side is buy, sell or unknown, and a ticket sent twice is kept once", () => {
  const pos = payload().open[0];
  const p = parseSyncPayload(payload({ open: [{ ...pos, side: "POSITION_TYPE_BUY" }, { ...pos, ticket: "1007", side: "<b>" }] }), NOW);
  assert.deepEqual(p.open.map((o) => o.side), [null, null]);
  const twice = parseSyncPayload(payload({ open: [pos, { ...pos, profit: -10 }] }), NOW);
  assert.equal(twice.open.length, 1);
  assert.equal(twice.open[0].profit, -10);
});

test("an open position's position_id is read, and is null from an EA that does not send it", () => {
  const pos = payload().open[0];
  const { open } = parseSyncPayload(
    payload({ open: [{ ...pos, position_id: 98765432101 }, { ...pos, ticket: "1008", position_id: " 0042 " }] }),
    NOW
  );
  // A number is taken as its digits, and leading zeros go, as with tickets.
  assert.deepEqual(open.map((o) => o.position_id), ["98765432101", "42"]);
  const older = { ...pos };
  delete older.position_id;
  assert.equal(parseSyncPayload(payload({ open: [older] }), NOW).open[0].position_id, null);
  assert.equal(parseSyncPayload(payload({ open: [{ ...pos, position_id: null }] }), NOW).open[0].position_id, null);
});

test("the broker's margin call and stop-out levels are read with their unit", () => {
  const { account } = parseSyncPayload(payload(), NOW);
  assert.deepEqual(
    [account.stop_out_mode, account.margin_call_level, account.stop_out_level],
    ["percent", 100, 50]
  );
  const money = parseSyncPayload(payload({ account: { ...payload().account, so_mode: 1, margin_call: "2500", stop_out: 1000 } }), NOW);
  assert.deepEqual(
    [money.account.stop_out_mode, money.account.margin_call_level, money.account.stop_out_level],
    ["money", 2500, 1000]
  );
  // The mode as a string of its digit, as JSON from some other sender might.
  assert.equal(parseSyncPayload(payload({ account: { ...payload().account, so_mode: "1" } }), NOW).account.stop_out_mode, "money");
});

test("levels in an unknown unit, or from an EA that does not send them, are null", () => {
  for (const so_mode of [2, -1, 0.5, "percent", "", null, true, [0]]) {
    const { account } = parseSyncPayload(payload({ account: { ...payload().account, so_mode } }), NOW);
    assert.equal(account.stop_out_mode, null, JSON.stringify(so_mode));
  }
  const older = { ...payload().account };
  delete older.so_mode;
  delete older.margin_call;
  delete older.stop_out;
  const { account } = parseSyncPayload(payload({ account: older }), NOW);
  assert.deepEqual([account.stop_out_mode, account.margin_call_level, account.stop_out_level], [null, null, null]);
});

test("a level that is not a number is refused whole", () => {
  const a = payload().account;
  for (const bad of [{ margin_call: "abc" }, { stop_out: "NaN" }, { stop_out: "Infinity" }, { margin_call: {} }]) {
    assert.throws(() => parseSyncPayload(payload({ account: { ...a, ...bad } }), NOW), SyncPayloadError, JSON.stringify(bad));
  }
});

test("an open position's point value is read, 0 kept, and null from an EA that does not send it", () => {
  const pos = payload().open[0];
  const { open } = parseSyncPayload(
    payload({ open: [{ ...pos, point_value: 0 }, { ...pos, ticket: "1009", point_value: "0.6713" }] }),
    NOW
  );
  assert.deepEqual(open.map((o) => o.point_value), [0, 0.6713]);
  const older = { ...pos };
  delete older.point_value;
  assert.equal(parseSyncPayload(payload({ open: [older] }), NOW).open[0].point_value, null);
  assert.equal(parseSyncPayload(payload({ open: [{ ...pos, point_value: null }] }), NOW).open[0].point_value, null);
});

test("a negative or non-numeric point value is refused whole", () => {
  const pos = payload().open[0];
  for (const point_value of [-1, "-0.5", "abc", "NaN", "Infinity", {}]) {
    assert.throws(
      () => parseSyncPayload(payload({ open: [pos, { ...pos, ticket: "1006", point_value }] }), NOW),
      SyncPayloadError,
      JSON.stringify(point_value)
    );
  }
});
