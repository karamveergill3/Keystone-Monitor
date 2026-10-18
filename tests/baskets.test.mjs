import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basketKey,
  positionIdOf,
  groupBaskets,
  canCloseInProfit,
  accountBaskets,
  shortDuration,
  closedBasket,
  closeReason,
  priceDecimals,
} from "@/lib/baskets";

const SYNC = "2026-10-17T12:00:00+00:00";
const EARLIER = "2026-10-16T09:00:00+00:00";

function position(overrides = {}) {
  return {
    ticket: "1001",
    position_id: null,
    symbol: "XAUUSD",
    side: "buy",
    volume: 0.1,
    open_price: 2650,
    current_price: 2640,
    sl: 0,
    tp: 0,
    swap: 0,
    profit: -100,
    open_time: "2026-10-17T08:00:00Z",
    magic: 100,
    comment: "",
    updated_at: SYNC,
    ...overrides,
  };
}

function account(overrides = {}) {
  return { last_sync_at: SYNC, open_positions: 3, ea_version: "2026.10.17.4", balance: 10_000, ...overrides };
}

// A three-level gold buy grid, one magic per level as some grid EAs do,
// and one EURUSD sell on its own.
function grid() {
  return [
    position({ ticket: "1", position_id: "11", volume: 0.1, open_price: 2650, profit: -100, swap: -1.5, magic: 101, open_time: "2026-10-17T08:00:00Z" }),
    position({ ticket: "2", position_id: "12", volume: 0.2, open_price: 2640, profit: -0.4, swap: -0.6, magic: 102, open_time: "2026-10-17T09:00:00Z" }),
    position({ ticket: "3", position_id: null, volume: 0.1, open_price: 2630, profit: 100, swap: 0, magic: 103, open_time: "2026-10-17T10:00:00Z" }),
    position({ ticket: "4", symbol: "EURUSD", side: "sell", volume: 1, open_price: 1.08425, current_price: 1.0851, profit: -85, magic: 0, open_time: "2026-10-16T22:00:00Z" }),
  ];
}

test("a basket is one symbol on one side, whatever the magic", () => {
  const b = groupBaskets(grid());
  assert.deepEqual(b.map((x) => x.key), ["EURUSD|sell", "XAUUSD|buy"]);
  const gold = b[1];
  assert.equal(gold.positions, 3);
  assert.deepEqual(gold.magics, [101, 102, 103]);
  assert.equal(gold.lots, 0.4);
  // Oldest first; the third has no POSITION_IDENTIFIER, so its ticket.
  assert.deepEqual(gold.positionIds, ["11", "12", "3"]);
  assert.equal(gold.openedAt, "2026-10-17T08:00:00.000Z");
  assert.equal(gold.lastAddedAt, "2026-10-17T10:00:00.000Z");
  assert.equal(basketKey("XAUUSD", "buy"), "XAUUSD|buy");
  assert.equal(positionIdOf({ ticket: "7", position_id: "70" }), "70");
  assert.equal(positionIdOf({ ticket: "7", position_id: null }), "7");
});

test("buys and sells on one symbol are two baskets", () => {
  const b = groupBaskets([
    position({ ticket: "1", side: "buy", profit: -10 }),
    position({ ticket: "2", side: "sell", profit: -30 }),
    position({ ticket: "3", side: "buy", profit: -5 }),
  ]);
  assert.deepEqual(b.map((x) => [x.key, x.positions, x.floating]), [["XAUUSD|sell", 1, -30], ["XAUUSD|buy", 2, -15]]);
});

test("positions with no symbol or side are in no basket", () => {
  const b = groupBaskets([
    position({ ticket: "1", symbol: null }),
    position({ ticket: "2", symbol: "" }),
    position({ ticket: "3", side: null }),
    position({ ticket: "4" }),
  ]);
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].positionIds, ["4"]);
  assert.deepEqual(groupBaskets(null), []);
});

test("the average price is weighted by volume", () => {
  // (0.1 * 2650 + 0.2 * 2640 + 0.1 * 2630) / 0.4
  const gold = groupBaskets(grid()).find((x) => x.key === "XAUUSD|buy");
  assert.ok(Math.abs(gold.avgPrice - 2640) < 1e-9);

  const b = groupBaskets([position({ volume: 1, open_price: 1.1 }), position({ ticket: "2", volume: 3, open_price: 1.2 })]);
  assert.ok(Math.abs(b[0].avgPrice - 1.175) < 1e-12);
  // No volume or no open price: nothing to weigh.
  assert.equal(groupBaskets([position({ volume: 0 })])[0].avgPrice, null);
  assert.equal(groupBaskets([position({ open_price: null })])[0].avgPrice, null);
});

test("floating is profit plus swap, to the cent, from numbers or numeric strings", () => {
  const gold = groupBaskets(grid()).find((x) => x.key === "XAUUSD|buy");
  assert.equal(gold.profit, -0.4);
  assert.equal(gold.swap, -2.1);
  assert.equal(gold.floating, -2.5);

  // Postgres numerics arrive as strings; 0.1 + 0.2 must not leak through.
  const b = groupBaskets([
    position({ ticket: "1", profit: "0.1", swap: "-0.3", volume: "0.1" }),
    position({ ticket: "2", profit: "0.2", swap: null, volume: "0.2" }),
  ])[0];
  assert.equal(b.profit, 0.3);
  assert.equal(b.swap, -0.3);
  assert.equal(b.floating, 0);
  assert.equal(b.lots, 0.3);
});

test("price decimals come from the prices the basket is quoted in", () => {
  const decimals = (open, current = open) => groupBaskets([position({ open_price: open, current_price: current })])[0].decimals;
  assert.equal(decimals(20110.5), 2);
  assert.equal(decimals(1.08425), 5);
  assert.equal(decimals(2651.4), 2);
  assert.equal(decimals(1.1), 2);
  assert.equal(decimals("151.234"), 3);
  // The most any price in it needs, and never more than 5.
  assert.equal(decimals(1.1, 1.08425), 5);
  assert.equal(decimals(0.123456789), 5);
  assert.equal(decimals(null, null), 2);
});

test("stops and targets count towards a symbol's decimals", () => {
  // Quotes that happen to end in 0 must not round a stop at 1.08455.
  assert.equal(priceDecimals([1.0842, 1.0851, 1.08455, 0]), 5);
  assert.equal(priceDecimals([20110.5, 20135, 0, 20300]), 2);
  assert.equal(groupBaskets([position({ open_price: 1.0842, current_price: 1.0851, sl: 1.08455, tp: 0 })])[0].decimals, 5);
  assert.equal(priceDecimals([]), 2);
});

test("the current price is the newest position's", () => {
  const b = groupBaskets([
    position({ ticket: "1", open_time: "2026-10-17T08:00:00Z", current_price: 2639 }),
    position({ ticket: "2", open_time: "2026-10-17T09:00:00Z", current_price: 2640 }),
    position({ ticket: "3", open_time: "2026-10-17T07:00:00Z", current_price: 2638 }),
  ])[0];
  assert.equal(b.currentPrice, 2640);
});

test("a basket is closable when closing it now still leaves the week in profit", () => {
  // The owner's example: the week made 1,500, the basket floats -1,200, so
  // closing it keeps 300.
  assert.equal(canCloseInProfit(-1200, 1500), true);
  // Closing it would take the week to exactly zero, or below: not closable.
  assert.equal(canCloseInProfit(-1500, 1500), false);
  assert.equal(canCloseInProfit(-1500.01, 1500), false);
  assert.equal(canCloseInProfit(-1499.99, 1500), true);
  // A week that is flat or down has nothing to close a loss against.
  assert.equal(canCloseInProfit(-0.01, 0), false);
  assert.equal(canCloseInProfit(-10, -250), false);
  // A basket at zero or in profit has no drawdown to close.
  assert.equal(canCloseInProfit(0, 1500), false);
  assert.equal(canCloseInProfit(25, 1500), false);
  assert.equal(canCloseInProfit(25, -250), false);
  // Both figures as shown, to the cent: float noise never decides it.
  assert.equal(canCloseInProfit(-400, 400.000000001), false);
  assert.equal(canCloseInProfit(-400, 400.004), false);
  assert.equal(canCloseInProfit(-400, 400.006), true);
  assert.equal(canCloseInProfit(-399.996, 400), false);
  assert.equal(canCloseInProfit(-0.004, 400), false);
  assert.equal(canCloseInProfit(-0.1, 0.30000000000000004), true);
  assert.equal(canCloseInProfit(-0.2, 0.1 + 0.1), false);
  // Numeric strings, as Postgres hands numerics over.
  assert.equal(canCloseInProfit("-1200", "1500"), true);
  assert.equal(canCloseInProfit("-1500", "1500"), false);
  // Unknown or non-finite figures are never closable.
  assert.equal(canCloseInProfit(NaN, 1500), false);
  assert.equal(canCloseInProfit(-1, NaN), false);
  assert.equal(canCloseInProfit(-1, null), false);
  assert.equal(canCloseInProfit(-1, undefined), false);
  assert.equal(canCloseInProfit(null, 1500), false);
  assert.equal(canCloseInProfit("", 1500), false);
  assert.equal(canCloseInProfit("abc", 1500), false);
  assert.equal(canCloseInProfit(-Infinity, 1500), false);
  assert.equal(canCloseInProfit(-1, Infinity), false);
});

test("an account's baskets carry closable, leftover, drawdown and the deepest", () => {
  const v = accountBaskets({ rows: grid(), account: account({ open_positions: 4 }), weekRealised: 50 });
  assert.equal(v.state, "current");
  assert.equal(v.reported, 4);
  assert.equal(v.listed, 4);
  assert.equal(v.open, 2);
  assert.equal(v.weekRealised, 50);
  assert.equal(v.lastSyncAt, SYNC);
  assert.equal(v.archived, false);
  assert.equal(v.deepest.key, "EURUSD|sell");
  assert.equal("flagged" in v, false);
  assert.equal("banked" in v, false);

  const [eur, gold] = v.baskets;
  assert.equal(eur.floating, -85);
  assert.equal(eur.drawdown, 85);
  assert.equal(eur.drawdownPct, 0.0085);
  // -85 against a week of +50: closing it would leave the week down.
  assert.equal(eur.closable, false);
  assert.equal(eur.leftover, null);
  // -2.50 against +50: closing it keeps +47.50.
  assert.equal(gold.drawdown, 2.5);
  assert.equal(gold.closable, true);
  assert.equal(gold.leftover, 47.5);
  assert.ok(v.baskets.every((b) => !("flagged" in b)));
  assert.deepEqual(v.closable.map((b) => b.key), ["XAUUSD|buy"]);

  // A basket in profit has no drawdown and is never closable.
  const up = accountBaskets({ rows: [position({ profit: 30 })], account: account(), weekRealised: 500 });
  assert.equal(up.baskets[0].drawdown, 0);
  assert.equal(up.baskets[0].drawdownPct, 0);
  assert.equal(up.baskets[0].closable, false);
  assert.equal(up.baskets[0].leftover, null);
  assert.equal(up.closable.length, 0);
  assert.equal(up.deepest.floating, 30);
});

test("the owner's example: 1,500 made, a basket at -1,200, closing it keeps 300", () => {
  const v = accountBaskets({ rows: [position({ profit: -1200 })], account: account({ open_positions: 1 }), weekRealised: 1500 });
  assert.equal(v.baskets[0].closable, true);
  assert.equal(v.baskets[0].leftover, 300);
  assert.equal(v.closable.length, 1);

  // Exactly the week, or deeper: no flag of any kind.
  for (const profit of [-1500, -1500.01, -2000]) {
    const deep = accountBaskets({ rows: [position({ profit })], account: account({ open_positions: 1 }), weekRealised: 1500 });
    assert.equal(deep.baskets[0].closable, false, `profit ${profit}`);
    assert.equal(deep.baskets[0].leftover, null, `profit ${profit}`);
    assert.deepEqual(deep.closable, [], `profit ${profit}`);
  }
});

test("each basket is judged against the week on its own, deepest loss first", () => {
  // A week of +100: EURUSD (-85) keeps 15, gold (-2.50) keeps 97.50.
  // Closing both would keep 12.50, but each is said on its own.
  const v = accountBaskets({ rows: grid(), account: account(), weekRealised: 100 });
  assert.deepEqual(v.closable.map((b) => [b.key, b.floating, b.leftover]), [["EURUSD|sell", -85, 15], ["XAUUSD|buy", -2.5, 97.5]]);
  assert.ok(v.baskets.every((b) => b.closable));

  // Two baskets that each fit in the week, though not both together.
  const rows = [
    position({ ticket: "1", symbol: "XAUUSD", side: "buy", profit: -300 }),
    position({ ticket: "2", symbol: "EURUSD", side: "sell", profit: -400 }),
    position({ ticket: "3", symbol: "GBPUSD", side: "buy", profit: 40 }),
    position({ ticket: "4", symbol: "USDJPY", side: "sell", profit: -600 }),
  ];
  const w = accountBaskets({ rows, account: account({ open_positions: 4 }), weekRealised: 500 });
  assert.deepEqual(w.closable.map((b) => [b.key, b.leftover]), [["EURUSD|sell", 100], ["XAUUSD|buy", 200]]);
  const jpy = w.baskets.find((b) => b.key === "USDJPY|sell");
  assert.equal(jpy.closable, false);
  assert.equal(jpy.leftover, null);

  // The week is taken to the cent, as is what it keeps.
  const c = accountBaskets({ rows: [position({ profit: -0.1 })], account: account({ open_positions: 1 }), weekRealised: "0.30000000000000004" });
  assert.equal(c.weekRealised, 0.3);
  assert.equal(c.baskets[0].leftover, 0.2);
});

test("a week that is flat, down or unknown has nothing closable", () => {
  for (const weekRealised of [0, -120, undefined, null, "", "abc", NaN]) {
    const v = accountBaskets({ rows: grid(), account: account(), weekRealised });
    assert.deepEqual(v.closable, [], `week ${weekRealised}`);
    assert.ok(v.baskets.every((b) => b.closable === false && b.leftover === null), `week ${weekRealised}`);
  }
  assert.equal(accountBaskets({ rows: grid(), account: account(), weekRealised: -120 }).weekRealised, -120);
  assert.equal(accountBaskets({ rows: grid(), account: account(), weekRealised: undefined }).weekRealised, 0);
  assert.equal(accountBaskets({ rows: grid(), account: account(), weekRealised: "84.996" }).weekRealised, 85);
});

test("a closable basket says what the week keeps; any other says nothing", () => {
  const v = accountBaskets({ rows: grid(), account: account(), weekRealised: 100 });
  assert.equal(closeReason(v.closable[0], "USD"), "Close now and the week stays +$15.00");
  assert.equal(closeReason(v.closable[1], "EUR"), "Close now and the week stays +€97.50");
  assert.equal(closeReason({ closable: true, leftover: 401.18 }, "USD"), "Close now and the week stays +$401.18");
  assert.equal(closeReason({ closable: true, leftover: 1234.5 }, "GBP"), "Close now and the week stays +£1,234.50");

  const deep = accountBaskets({ rows: grid(), account: account(), weekRealised: 50 });
  assert.equal(closeReason(deep.baskets[0], "USD"), null);
  assert.equal(closeReason({ closable: false, leftover: null }, "USD"), null);
  assert.equal(closeReason({ closable: true, leftover: null }, "USD"), null);
  assert.equal(closeReason(null, "USD"), null);
  assert.equal(closeReason(undefined, "USD"), null);
});

test("an archived account lists its baskets but has nothing closable", () => {
  const archived = account({ archived_at: "2026-10-10T00:00:00+00:00" });
  const v = accountBaskets({ rows: grid(), account: archived, weekRealised: 1500 });
  assert.equal(v.archived, true);
  assert.equal(v.open, 2);
  assert.equal(v.deepest.key, "EURUSD|sell");
  assert.equal(v.baskets[0].drawdown, 85);
  assert.deepEqual(v.closable, []);
  assert.ok(v.baskets.every((b) => b.closable === false && b.leftover === null));
});

test("figures are as of the last sync, however long ago it was", () => {
  // A sync two days old still reads as the current list: lastSyncAt says when.
  const old = "2026-10-15T09:00:00+00:00";
  const rows = grid().map((p) => ({ ...p, updated_at: old }));
  const v = accountBaskets({ rows, account: account({ last_sync_at: old }), weekRealised: 0 });
  assert.equal(v.state, "current");
  assert.equal(v.lastSyncAt, old);
  assert.equal(accountBaskets({ rows: [], account: account({ last_sync_at: null }), weekRealised: 0 }).lastSyncAt, null);
  assert.equal(accountBaskets({ rows: [], account: undefined, weekRealised: 0 }).lastSyncAt, null);
});

test("rows an earlier sync left behind make no baskets, and nothing closable", () => {
  // A week of +1,500 would make every stale basket closable if it counted.
  const stale = grid().map((p) => ({ ...p, updated_at: EARLIER }));
  const old = accountBaskets({ rows: stale, account: account({ ea_version: "2026.10.17" }), weekRealised: 1500 });
  assert.equal(old.state, "unreported");
  assert.deepEqual(old.baskets, []);
  assert.deepEqual(old.closable, []);
  assert.equal(old.deepest, null);
  assert.equal(old.open, 0);

  const pending = accountBaskets({ rows: stale, account: account(), weekRealised: 1500 });
  assert.equal(pending.state, "pending");
  assert.equal(pending.open, 0);
  assert.deepEqual(pending.closable, []);

  // Only the rows from the last sync count when both are present.
  const mixed = accountBaskets({ rows: [...stale, position({ ticket: "9", profit: -7 })], account: account({ open_positions: 1 }), weekRealised: 1500 });
  assert.equal(mixed.open, 1);
  assert.equal(mixed.baskets[0].positions, 1);
  assert.equal(mixed.baskets[0].floating, -7);
  assert.deepEqual(mixed.closable.map((b) => [b.positions, b.leftover]), [[1, 1493]]);

  assert.equal(accountBaskets({ rows: grid(), account: account({ last_sync_at: null }), weekRealised: 0 }).state, "waiting");
  assert.equal(accountBaskets({ rows: [], account: account({ open_positions: 0 }), weekRealised: 0 }).state, "none");
});

test("the worst reading merges what tracking has seen with now", () => {
  const tracked = [
    // Deeper before, at a lower balance.
    {
      symbol: "XAUUSD", side: "buy", opened_at: "2026-10-17T06:00:00+00:00", first_seen_at: "2026-10-17T06:02:00+00:00",
      worst_floating: "-900", worst_at: "2026-10-17T09:30:00+00:00", worst_balance: "9000",
    },
    // Never deeper than now.
    {
      symbol: "EURUSD", side: "sell", opened_at: "2026-10-17T00:00:00+00:00", first_seen_at: "2026-10-16T22:02:00+00:00",
      worst_floating: "-40", worst_at: "2026-10-16T23:00:00+00:00", worst_balance: "9500",
    },
    // A basket no longer open: ignored.
    { symbol: "GBPUSD", side: "buy", worst_floating: "-5000", worst_at: EARLIER, worst_balance: "9000" },
  ];
  const v = accountBaskets({ rows: grid(), account: account(), weekRealised: 0, tracked });
  const gold = v.baskets.find((b) => b.key === "XAUUSD|buy");
  const eur = v.baskets.find((b) => b.key === "EURUSD|sell");

  assert.equal(gold.worstFloating, -900);
  assert.equal(gold.worstDrawdown, 900);
  assert.equal(gold.worstAt, "2026-10-17T09:30:00+00:00");
  assert.equal(gold.worstPct, 0.1);
  assert.equal(gold.trackedSince, "2026-10-17T06:02:00+00:00");
  // Tracking saw a position that has closed since, opened earlier.
  assert.equal(gold.openedAt, "2026-10-17T06:00:00.000Z");

  assert.equal(eur.worstFloating, -85);
  assert.equal(eur.worstAt, null);
  assert.equal(eur.worstPct, 0.0085);
  // Its oldest open position is older than tracking's opened_at.
  assert.equal(eur.openedAt, "2026-10-16T22:00:00.000Z");

  assert.equal(v.open, 2);

  // Untracked: the worst is now, and tracking has not started.
  const fresh = accountBaskets({ rows: grid(), account: account(), weekRealised: 0 });
  assert.equal(fresh.baskets[1].worstFloating, fresh.baskets[1].floating);
  assert.equal(fresh.baskets[1].worstAt, null);
  assert.equal(fresh.baskets[1].trackedSince, null);
});

test("percentages need a positive balance", () => {
  for (const balance of [0, null, -50, "0"]) {
    const v = accountBaskets({ rows: grid(), account: account({ balance }), weekRealised: 0 });
    assert.equal(v.baskets[0].drawdownPct, null, `balance ${balance}`);
    assert.equal(v.baskets[0].worstPct, null, `balance ${balance}`);
  }
  // A tracked worst is measured against its own balance, and without one
  // it has no percentage.
  const tracked = [{ symbol: "EURUSD", side: "sell", worst_floating: -200, worst_at: EARLIER, worst_balance: null }];
  const v = accountBaskets({ rows: grid(), account: account(), weekRealised: 0, tracked });
  assert.equal(v.baskets[0].worstFloating, -200);
  assert.equal(v.baskets[0].worstPct, null);
  assert.equal(v.baskets[0].drawdownPct, 0.0085);
});

test("durations read short", () => {
  assert.equal(shortDuration(20_000), "under 1 min");
  assert.equal(shortDuration(45 * 60_000), "45 min");
  assert.equal(shortDuration(3 * 3_600_000), "3 h");
  assert.equal(shortDuration(3 * 3_600_000 + 20 * 60_000), "3 h 20 min");
  assert.equal(shortDuration(2 * 86_400_000 + 4 * 3_600_000 + 59 * 60_000), "2 d 4 h");
  assert.equal(shortDuration(2 * 86_400_000), "2 d");
  assert.equal(shortDuration(-1), "-");
  assert.equal(shortDuration(NaN), "-");
});

test("a closed basket closes at its last closing deal, or the sync that saw it gone", () => {
  const row = {
    opened_at: "2026-10-15T08:00:00+00:00",
    closed_at: "2026-10-16T12:02:00+00:00",
    last_close_at: "2026-10-16T11:20:00+00:00",
    worst_floating: "-1500.5",
    worst_balance: "10005",
    realised: "212.304",
  };
  const c = closedBasket(row);
  assert.equal(c.closedAt, "2026-10-16T11:20:00+00:00");
  assert.equal(c.closedBy, "deal");
  assert.equal(c.duration, "1 d 3 h");
  assert.equal(c.worstDrawdown, 1500.5);
  assert.equal(c.worstPct, 1500.5 / 10005);
  assert.equal(c.realised, 212.3);

  const noDeal = closedBasket({ ...row, last_close_at: null, realised: null, worst_balance: null });
  assert.equal(noDeal.closedAt, "2026-10-16T12:02:00+00:00");
  assert.equal(noDeal.closedBy, "sync");
  assert.equal(noDeal.duration, "1 d 4 h");
  assert.equal(noDeal.realised, null);
  assert.equal(noDeal.worstPct, null);

  // Never in loss: no drawdown.
  assert.equal(closedBasket({ ...row, worst_floating: 12 }).worstDrawdown, 0);
});


test("nothing is closable while the EA's list is cut short", () => {
  // 1 position listed of 650 open: the basket may be far deeper than -1,200.
  const cut = accountBaskets({ rows: [position({ profit: -1200 })], account: account({ open_positions: 650 }), weekRealised: 1500 });
  assert.equal(cut.listed, 1);
  assert.deepEqual(cut.closable, []);
  assert.equal(cut.baskets[0].closable, false);
  assert.equal(cut.baskets[0].leftover, null);
  // The same basket with the whole book listed is closable.
  const whole = accountBaskets({ rows: [position({ profit: -1200 })], account: account({ open_positions: 1 }), weekRealised: 1500 });
  assert.equal(whole.closable.length, 1);
});
