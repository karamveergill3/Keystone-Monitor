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
