import { test } from "node:test";
import assert from "node:assert/strict";
import * as attention from "@/lib/attention";
import { accountAttention, attentionItems, distanceLabel } from "@/lib/attention";
import { accountBaskets } from "@/lib/baskets";

const SYNC = "2026-10-17T12:00:00+00:00";
const NONE = { level: null, reasons: [] };

// An accountRow (src/lib/accountView.js).
function row(overrides = {}) {
  return {
    id: "a1",
    label: "Gold grid",
    currency: "USD",
    ea_version: "2026.10.17.5",
    archived_at: null,
    last_sync_at: SYNC,
    status: "online",
    balance: 10_000,
    equity: 10_000,
    floatingDd: 0,
    ...overrides,
  };
}

function codes(a) {
  return a.reasons.map((r) => `${r.level}:${r.code}`);
}

// accountBaskets' result as attention reads it, with one closable basket.
function closableBaskets(overrides = {}) {
  return {
    weekRealised: 496.78,
    closable: [{ symbol: "EURUSD", side: "sell", floating: -95.6, leftover: 401.18, closable: true }],
    ...overrides,
  };
}

// One open basket at floating, from real position rows, against a week.
// reported is the terminal's own count of open positions; above 1, the
// EA's list is cut short.
function realBaskets(floating, weekRealised, { reported = 1, archived_at = null } = {}) {
  const position = {
    ticket: "1", position_id: "1", symbol: "XAUUSD", side: "buy", volume: 1, open_price: 2650, current_price: 2638,
    sl: 0, tp: 0, swap: 0, profit: floating, open_time: "2026-10-17T08:00:00Z", magic: 1, updated_at: SYNC,
  };
  return accountBaskets({
    rows: [position],
    account: { last_sync_at: SYNC, open_positions: reported, ea_version: "2026.10.17.5", balance: 10_000, archived_at },
    weekRealised,
  });
}

test("only the closable flag is left: no limits, levels or other reasons are exported", () => {
  assert.deepEqual(Object.keys(attention).sort(), ["accountAttention", "attentionItems", "distanceLabel"]);
});

test("nothing closable, nothing to say, however the account looks", () => {
  assert.deepEqual(accountAttention({ row: row(), baskets: { weekRealised: 500, closable: [] } }), NONE);
  assert.deepEqual(accountAttention({ row: row() }), NONE);
  // Deep floating drawdown, offline, an old EA, never synced, a list cut
  // short: none of these says anything any more.
  for (const overrides of [
    { floatingDd: 0.5 },
    { status: "offline", last_sync_at: "2026-10-10T09:00:00Z" },
    { ea_version: "2026.10.17.1" },
    { ea_version: null },
    { last_sync_at: null, status: "waiting", balance: null },
  ]) {
    assert.deepEqual(accountAttention({ row: row(overrides) }), NONE, JSON.stringify(overrides));
  }
  assert.deepEqual(accountAttention({ row: null }), NONE);
});

test("near or at stop-out or margin call says nothing: a risk figure is not passed or read", () => {
  // The old inputs are ignored outright.
  const risk = { nearest: { stopOut: { move: 0, pct: 0 } }, equity: 1, marginCallEquity: 1_000, margin: 1_000, partial: true };
  assert.deepEqual(accountAttention({ row: row(), risk }), NONE);
  assert.deepEqual(codes(accountAttention({ row: row(), baskets: closableBaskets(), risk })), ["green:basket-closable"]);
});

test("a basket that could be closed with the week still up: one green reason", () => {
  const a = accountAttention({ row: row(), baskets: closableBaskets() });
  assert.equal(a.level, "green");
  assert.deepEqual(codes(a), ["green:basket-closable"]);
  const r = a.reasons[0];
  assert.equal(r.short, "1 basket closable");
  assert.equal(r.text, "EURUSD sell at -$95.60 could be closed now and the week would stay +$401.18 (of this week's +$496.78).");

  // Several: one clause each, each judged on its own against the week.
  const several = accountAttention({
    row: row({ currency: "GBP" }),
    baskets: {
      weekRealised: 500,
      closable: [
        { symbol: "EURUSD", side: "sell", floating: -400, leftover: 100, closable: true },
        { symbol: "XAUUSD", side: "buy", floating: -300, leftover: 200, closable: true },
      ],
    },
  });
  assert.deepEqual(codes(several), ["green:basket-closable"]);
  assert.equal(several.reasons[0].short, "2 baskets closable");
  assert.equal(
    several.reasons[0].text,
    "EURUSD sell at -£400.00 could be closed now and the week would stay +£100.00; XAUUSD buy at -£300.00 could be closed now and the week would stay +£200.00 (each on its own, of this week's +£500.00).",
  );
});

test("from real baskets: green only when closing still leaves the week up", () => {
  // The owner's example: 1,500 made, a basket at -1,200, closing it keeps 300.
  const a = accountAttention({ row: row(), baskets: realBaskets(-1200, 1500) });
  assert.equal(a.level, "green");
  assert.equal(a.reasons[0].text, "XAUUSD buy at -$1,200.00 could be closed now and the week would stay +$300.00 (of this week's +$1,500.00).");

  // A basket as deep as the week, deeper, in profit, or a week flat or down:
  // no reason of any kind, no level.
  for (const [floating, week] of [[-1500, 1500], [-1500.01, 1500], [-1600, 1500], [40, 1500], [-10, 0], [-10, -250]]) {
    assert.deepEqual(accountAttention({ row: row(), baskets: realBaskets(floating, week) }), NONE, `floating ${floating}, week ${week}`);
  }
});

test("nothing is closable while the EA's list is cut short", () => {
  // The terminal has 520 open but the EA listed one: the basket may be
  // deeper than it looks, so it is not marked, and nothing else is said.
  assert.deepEqual(accountAttention({ row: row(), baskets: realBaskets(-1200, 1500, { reported: 520 }) }), NONE);
});

test("archived accounts get nothing; offline ones only the green flag their last sync earns", () => {
  const archived = row({ archived_at: "2026-10-01T00:00:00Z" });
  assert.deepEqual(accountAttention({ row: archived, baskets: closableBaskets() }), NONE);
  // accountBaskets itself marks nothing on an archived account.
  assert.deepEqual(
    accountAttention({ row: archived, baskets: realBaskets(-1200, 1500, { archived_at: archived.archived_at }) }),
    NONE,
  );

  const offline = row({ status: "offline", last_sync_at: "2026-10-17T09:05:00Z", floatingDd: 0.3, ea_version: "1" });
  assert.deepEqual(accountAttention({ row: offline }), NONE);
  const closable = accountAttention({ row: offline, baskets: closableBaskets() });
  assert.equal(closable.level, "green");
  assert.deepEqual(codes(closable), ["green:basket-closable"]);
});

test("distanceLabel: two decimals, never 0.00% for a move still there", () => {
  assert.equal(distanceLabel(0.00002), "under 0.01%");
  assert.equal(distanceLabel(0.0183), "1.83%");
  assert.equal(distanceLabel(0), "0.00%");
  assert.equal(distanceLabel(null), "-");
  assert.equal(distanceLabel("abc"), "-");
});

test("attention items: only accounts with a closable basket, by label", () => {
  const green = { level: "green", reasons: [{ level: "green", code: "basket-closable", short: "1 basket closable" }] };
  // Anything else, even a stray old-style reason, is never listed.
  const stray = { level: "red", reasons: [{ level: "red", code: "floating-dd" }] };
  const mixed = {
    level: "red",
    reasons: [{ level: "red", code: "stop-out" }, { level: "green", code: "basket-closable", short: "2 baskets closable" }],
  };
  const items = attentionItems([
    { id: "1", label: "Bravo", currency: "USD", last_sync_at: SYNC, attention: green },
    { id: "2", label: "Delta", currency: "GBP", last_sync_at: SYNC, attention: stray },
    { id: "7", label: "Able", currency: "USD", last_sync_at: SYNC, attention: green },
    { id: "8", label: "Zulu", currency: "EUR", last_sync_at: null, attention: green },
    { id: "9", label: "Charlie", attention: mixed },
    { id: "5", label: "Echo", currency: "USD", last_sync_at: SYNC, attention: NONE },
    { id: "6", label: "Foxtrot", currency: "USD", last_sync_at: SYNC },
    null,
  ]);
  assert.deepEqual(items.map((i) => i.label), ["Able", "Bravo", "Charlie", "Zulu"]);
  assert.deepEqual(items[0], { accountId: "7", label: "Able", currency: "USD", lastSyncAt: SYNC, reasons: green.reasons });
  assert.deepEqual(items[2], { accountId: "9", label: "Charlie", currency: "USD", lastSyncAt: null, reasons: [mixed.reasons[1]] });
  assert.deepEqual(items[3], { accountId: "8", label: "Zulu", currency: "EUR", lastSyncAt: null, reasons: green.reasons });
  assert.deepEqual(attentionItems(null), []);
  assert.deepEqual(attentionItems([{ id: "1", label: "A", attention: stray }]), []);
});

test("attention items from real accounts: archived, offline and never-synced ones only when closable", () => {
  const rows = [
    row({ id: "1", label: "Offline closable", status: "offline" }),
    row({ id: "2", label: "Archived", archived_at: "2026-10-01T00:00:00Z" }),
    row({ id: "3", label: "Never synced", last_sync_at: null, status: "waiting" }),
    row({ id: "4", label: "Deep drawdown", floatingDd: 0.4 }),
  ].map((r) => ({
    ...r,
    attention: accountAttention({ row: r, baskets: r.id === "1" || r.id === "2" ? closableBaskets() : undefined }),
  }));
  assert.deepEqual(attentionItems(rows).map((i) => i.label), ["Offline closable"]);
});
