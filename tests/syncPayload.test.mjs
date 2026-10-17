import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSyncPayload, SyncPayloadError, MAX_DEALS_PER_SYNC } from "@/lib/syncPayload";
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
