import { test } from "node:test";
import assert from "node:assert/strict";
import { symbolPointValues, stopOutLevels, accountRisk } from "@/lib/risk";

const SYNC = "2026-10-17T12:00:00+00:00";
const EARLIER = "2026-10-16T09:00:00+00:00";

function position(overrides = {}) {
  return {
    ticket: "1",
    symbol: "XAUUSD",
    side: "buy",
    volume: 1.3,
    open_price: 2650,
    current_price: 2633.3,
    sl: 0,
    tp: 0,
    swap: 0,
    profit: -2171,
    point_value: 100,
    open_time: "2026-10-17T08:00:00Z",
    updated_at: SYNC,
    ...overrides,
  };
}

function account(overrides = {}) {
  return {
    last_sync_at: SYNC,
    open_positions: 1,
    ea_version: "2026.10.17.5",
    balance: 52_049.84,
    equity: 49_878.84,
    margin: 1_239.41,
    stop_out_mode: "percent",
    margin_call_level: 100,
    stop_out_level: 50,
    ...overrides,
  };
}

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

test("the worked example: gold net long 1.30 lots, stop-out at 50%", () => {
  const r = accountRisk({ rows: [position()], account: account() });
  assert.equal(r.state, "current");
  assert.deepEqual(r.levels, { mode: "percent", marginCall: 100, stopOut: 50 });
  close(r.stopOutEquity, 619.705);
  close(r.bufferToStopOut, 49_259.135);
  close(r.marginCallEquity, 1_239.41);
  close(r.bufferToMarginCall, 48_639.43);
  close(r.marginLevel, (49_878.84 / 1_239.41) * 100);

  assert.equal(r.symbols.length, 1);
  const gold = r.symbols[0];
  assert.equal(gold.symbol, "XAUUSD");
  assert.equal(gold.netLots, 1.3);
  assert.equal(gold.side, "buy");
  assert.equal(gold.lots, 1.3);
  assert.equal(gold.price, 2633.3);
  assert.equal(gold.pointValue, 100);
  assert.equal(gold.hedged, false);
  assert.equal(gold.decimals, 2);
  close(gold.stopOut.move, 49_259.135 / 130);
  assert.equal(gold.stopOut.move.toFixed(3), "378.916");
  close(gold.stopOut.price, 2633.3 - 49_259.135 / 130);
  assert.equal(gold.stopOut.price.toFixed(2), "2254.38");
  assert.equal((gold.stopOut.pct * 100).toFixed(2), "14.39");
  close(gold.marginCall.move, 48_639.43 / 130);
  assert.equal(r.nearest, gold);
});

test("numbers arrive as numeric strings from Postgres", () => {
  const r = accountRisk({
    rows: [position({ volume: "1.30", current_price: "2633.30", point_value: "100" })],
    account: account({ equity: "49878.84", margin: "1239.41", stop_out_level: "50", margin_call_level: "100" }),
  });
  assert.equal(r.symbols[0].stopOut.price.toFixed(2), "2254.38");
});

test("money mode: the levels are equities", () => {
  const r = accountRisk({
    rows: [position({ side: "sell", volume: 2, current_price: 2633.3, open_price: 2620, profit: -2660 })],
    account: account({ stop_out_mode: "money", margin_call_level: 2_000, stop_out_level: 1_000, equity: 11_000 }),
  });
  assert.equal(r.levels.mode, "money");
  assert.equal(r.stopOutEquity, 1_000);
  assert.equal(r.marginCallEquity, 2_000);
  assert.equal(r.bufferToStopOut, 10_000);
  const gold = r.symbols[0];
  assert.equal(gold.netLots, -2);
  assert.equal(gold.side, "sell");
  // 10,000 over 2 lots at 100 a point: 50 up, against the short.
  close(gold.stopOut.move, 50);
  close(gold.stopOut.price, 2683.3);
  close(gold.marginCall.move, 45);
});

test("a buffer already gone is no distance at all", () => {
  const r = accountRisk({ rows: [position()], account: account({ equity: 500 }) });
  const gold = r.symbols[0];
  close(r.bufferToStopOut, 500 - 619.705);
  assert.equal(gold.stopOut.move, 0);
  assert.equal(gold.stopOut.pct, 0);
  assert.equal(gold.stopOut.price, 2633.3);
  assert.equal(r.nearest, gold);
});

test("a hedged symbol has no distance, and the exposed one is nearest", () => {
  const rows = [
    position({ ticket: "1", symbol: "EURUSD", side: "buy", volume: 0.1, open_price: 1.085, current_price: 1.084, profit: -10, point_value: 100_000 }),
    position({ ticket: "2", symbol: "EURUSD", side: "buy", volume: 0.2, open_price: 1.083, current_price: 1.084, profit: 20, point_value: 100_000 }),
    position({ ticket: "3", symbol: "EURUSD", side: "sell", volume: 0.3, open_price: 1.0842, current_price: 1.08405, profit: 4.5, point_value: 100_000 }),
    position({ ticket: "4" }),
  ];
  const r = accountRisk({ rows, account: account({ open_positions: 4 }) });
  assert.deepEqual(r.symbols.map((s) => s.symbol), ["XAUUSD", "EURUSD"]);
  const eur = r.symbols[1];
  assert.equal(eur.netLots, 0);
  assert.equal(eur.side, null);
  assert.equal(eur.lots, 0.6);
  assert.equal(eur.hedged, true);
  assert.equal(eur.stopOut, null);
  assert.equal(eur.marginCall, null);
  assert.equal(eur.decimals, 5);
  assert.equal(r.nearest.symbol, "XAUUSD");
});

test("a symbol with no point value has no distances", () => {
  const rows = [position({ symbol: "US30", point_value: null, current_price: 42_000, open_price: 42_000, profit: 0 })];
  const r = accountRisk({ rows, account: account() });
  const s = r.symbols[0];
  assert.equal(s.pointValue, null);
  assert.equal(s.stopOut, null);
  assert.equal(s.marginCall, null);
  assert.equal(r.nearest, null);
});

test("nothing open: no margin, no distances", () => {
  const r = accountRisk({ rows: [], account: account({ margin: 0, open_positions: 0, equity: 50_000 }) });
  assert.equal(r.state, "none");
  assert.equal(r.marginLevel, null);
  assert.equal(r.stopOutEquity, null);
  assert.equal(r.marginCallEquity, null);
  assert.equal(r.bufferToStopOut, null);
  assert.deepEqual(r.symbols, []);
  assert.equal(r.nearest, null);
});

test("stale rows from an earlier sync are ignored", () => {
  const r = accountRisk({
    rows: [position({ updated_at: EARLIER })],
    account: account({ ea_version: "2026.10.17.1" }),
  });
  assert.equal(r.state, "unreported");
  assert.deepEqual(r.symbols, []);
  assert.equal(r.nearest, null);
  // The account's own figures still read.
  close(r.stopOutEquity, 619.705);
});

test("levels unknown until an EA that sends them syncs", () => {
  assert.equal(stopOutLevels(account({ stop_out_level: null })), null);
  assert.equal(stopOutLevels(null), null);
  assert.deepEqual(stopOutLevels(account({ stop_out_mode: null, margin_call_level: null })), {
    mode: "percent",
    marginCall: null,
    stopOut: 50,
  });
  const r = accountRisk({ rows: [position()], account: account({ stop_out_level: null }) });
  assert.equal(r.levels, null);
  assert.equal(r.stopOutEquity, null);
  assert.equal(r.bufferToStopOut, null);
  assert.equal(r.symbols[0].pointValue, 100);
  assert.equal(r.symbols[0].stopOut, null);
  assert.equal(r.nearest, null);
});

test("a margin-call level alone is kept, a missing one is null", () => {
  const r = accountRisk({ rows: [position()], account: account({ margin_call_level: null }) });
  assert.equal(r.marginCallEquity, null);
  assert.equal(r.bufferToMarginCall, null);
  assert.equal(r.symbols[0].marginCall, null);
  assert.ok(r.symbols[0].stopOut);
});

test("point values: the EA's figure first", () => {
  const pv = symbolPointValues([position({ point_value: "100" }), position({ ticket: "2", symbol: "EURUSD", point_value: 100_000 })]);
  assert.equal(pv.get("XAUUSD"), 100);
  assert.equal(pv.get("EURUSD"), 100_000);
});

test("point values: estimated from profit, for buys and sells, volume weighted", () => {
  const pv = symbolPointValues([
    // Buy 0.10 at 2650, now 2640: -10 * 0.1 * 100 = -100.
    position({ ticket: "1", point_value: null, volume: 0.1, open_price: 2650, current_price: 2640, profit: -100 }),
    // Buy 0.30 at 2630, now 2640: +10 * 0.3 * 102 = +306 (a slightly different
    // rate, so the weighting shows).
    position({ ticket: "2", point_value: 0, volume: 0.3, open_price: 2630, current_price: 2640, profit: 306 }),
    // Sell 1.0 at 1.08425, now 1.0851: -0.00085 * 1 * 100,000 = -85.
    position({ ticket: "3", symbol: "EURUSD", side: "sell", point_value: null, volume: 1, open_price: 1.08425, current_price: 1.0851, profit: -85 }),
    // At its open price: nothing to estimate from, and no division by zero.
    position({ ticket: "4", symbol: "EURUSD", side: "buy", point_value: null, volume: 5, open_price: 1.0851, current_price: 1.0851, profit: 0 }),
  ]);
  close(pv.get("XAUUSD"), (100 * 0.1 + 102 * 0.3) / 0.4);
  close(pv.get("EURUSD"), 100_000, 1e-6);
});

test("point values: symbols with neither are left out", () => {
  const pv = symbolPointValues([
    position({ point_value: null, open_price: 2633.3, current_price: 2633.3, profit: 0 }),
    // Moved, but the profit is too small to say anything through cent rounding.
    position({ ticket: "2", symbol: "EURUSD", point_value: null, volume: 0.01, open_price: 1.085, current_price: 1.0851, profit: 0.1 }),
    // A row that contradicts itself (price up on a buy, profit down).
    position({ ticket: "3", symbol: "GBPUSD", point_value: null, open_price: 1.3, current_price: 1.31, profit: -1300 }),
  ]);
  assert.equal(pv.size, 0);
});

test("bad data never throws", () => {
  assert.equal(symbolPointValues(null).size, 0);
  assert.equal(symbolPointValues([null, {}, { symbol: "X", volume: "abc" }]).size, 0);
  const r = accountRisk({ rows: [null, { symbol: "X", updated_at: SYNC }], account: account({ equity: "n/a" }) });
  assert.equal(r.equity, null);
  assert.equal(r.marginLevel, null);
  assert.equal(r.bufferToStopOut, null);
  assert.equal(r.symbols[0].price, null);
  assert.equal(r.symbols[0].stopOut, null);
  assert.equal(accountRisk({}).state, "waiting");
});

test("a long whose stop-out lies below zero keeps its move but has no price", () => {
  const r = accountRisk({
    rows: [position({ symbol: "EURUSD", volume: 0.01, open_price: 1.085, current_price: 1.084, profit: -1, point_value: 100_000 })],
    account: account(),
  });
  const s = r.symbols[0];
  close(s.stopOut.move, 49_259.135 / 1_000);
  assert.equal(s.stopOut.price, null);
  assert.ok(s.stopOut.pct > 1);
});

test("symbols sort nearest to stop-out first", () => {
  const rows = [
    position({ ticket: "1", symbol: "AAA", volume: 0.01, point_value: 1, current_price: 100 }),
    position({ ticket: "2", symbol: "BBB", volume: 1, point_value: 1_000, current_price: 100 }),
    position({ ticket: "3", symbol: "CCC", point_value: null, open_price: 5, current_price: 5, profit: 0 }),
  ];
  const r = accountRisk({ rows, account: account({ open_positions: 3 }) });
  assert.deepEqual(r.symbols.map((s) => s.symbol), ["BBB", "AAA", "CCC"]);
  assert.equal(r.nearest.symbol, "BBB");
});

test("a list cut short at the EA's cap is marked partial", () => {
  const full = accountRisk({ rows: [position()], account: account({ open_positions: 1 }) });
  assert.equal(full.partial, false);
  assert.equal(full.listed, 1);
  const cut = accountRisk({ rows: [position()], account: account({ open_positions: 520 }) });
  assert.equal(cut.partial, true);
  assert.equal(cut.listed, 1);
  assert.equal(cut.reported, 520);
});
