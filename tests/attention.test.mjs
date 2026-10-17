import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, accountAttention, attentionItems, distanceLabel, floatingDdLevel, stopOutLevel } from "@/lib/attention";
import { accountRisk } from "@/lib/risk";

const NOW = Date.parse("2026-10-17T12:05:00Z");
const SYNC = "2026-10-17T12:00:00+00:00";

// An accountRow (src/lib/accountView.js) with nothing wrong.
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

// An accountRisk result whose nearest symbol is pct from stop-out.
function riskAt(pct, overrides = {}) {
  const price = 2_000;
  const nearest = {
    symbol: "XAUUSD",
    netLots: 1.3,
    side: "buy",
    lots: 1.3,
    price,
    pointValue: 100,
    decimals: 2,
    stopOut: { move: price * pct, pct, price: price - price * pct },
    marginCall: null,
    hedged: false,
  };
  return {
    state: "current",
    levels: { mode: "percent", marginCall: 100, stopOut: 50 },
    equity: 10_000,
    margin: 1_000,
    marginLevel: 1_000,
    marginCallEquity: 1_000,
    stopOutEquity: 500,
    bufferToMarginCall: 9_000,
    bufferToStopOut: 9_500,
    symbols: [nearest],
    nearest,
    ...overrides,
  };
}

function codes(a) {
  return a.reasons.map((r) => `${r.level}:${r.code}`);
}

test("the limits are the agreed ones", () => {
  assert.deepEqual({ ...LIMITS }, { floatingDdAmber: 0.05, floatingDdRed: 0.1, stopOutAmber: 0.05, stopOutRed: 0.02 });
});

test("nothing wrong, nothing to say", () => {
  const a = accountAttention({ row: row(), baskets: { flagged: [] }, risk: riskAt(0.2), now: NOW });
  assert.deepEqual(a, { level: null, reasons: [] });
  assert.deepEqual(accountAttention({ row: row(), now: NOW }), { level: null, reasons: [] });
});

test("baskets past the week's profit: one red reason for all of them", () => {
  const baskets = {
    banked: 500,
    weekRealised: 500,
    flagged: [
      { symbol: "XAUUSD", side: "buy", floating: -1_200 },
      { symbol: "EURUSD", side: "sell", floating: -650 },
    ],
  };
  const a = accountAttention({ row: row(), baskets, now: NOW });
  assert.equal(a.level, "red");
  assert.equal(a.reasons.length, 1);
  const r = a.reasons[0];
  assert.equal(r.code, "basket-week");
  assert.equal(r.short, "2 baskets past week profit");
  assert.equal(r.text, "XAUUSD buy at -$1,200.00 and EURUSD sell at -$650.00 would each lose more than this week's +$500.00 banked.");

  const one = accountAttention({
    row: row({ currency: "GBP" }),
    baskets: { banked: 0, weekRealised: -50, flagged: [{ symbol: "XAUUSD", side: "buy", floating: -10 }] },
    now: NOW,
  });
  assert.equal(one.reasons[0].short, "1 basket past week profit");
  assert.equal(one.reasons[0].text, "XAUUSD buy at -£10.00 is in loss, and the week has banked nothing (-£50.00).");
});

test("stop-out: red under 2%, amber under 5%, nothing from 5%", () => {
  const at = (pct) => accountAttention({ row: row(), risk: riskAt(pct), now: NOW });
  assert.deepEqual(codes(at(0.0199)), ["red:stop-out"]);
  assert.deepEqual(codes(at(LIMITS.stopOutRed)), ["amber:stop-out"]);
  assert.deepEqual(codes(at(0.0201)), ["amber:stop-out"]);
  assert.deepEqual(codes(at(0.0499)), ["amber:stop-out"]);
  assert.deepEqual(codes(at(LIMITS.stopOutAmber)), []);
  assert.deepEqual(codes(at(0.0501)), []);

  const r = at(0.018).reasons[0];
  assert.equal(r.short, "1.80% to stop-out");
  assert.equal(
    r.text,
    "A 1.80% fall in XAUUSD (36.00 to 1,964.00) against 1.30 lots net long would bring equity down to the broker's stop-out (50% margin level, $500.00), with every other symbol held still.",
  );
});

test("stop-out on a short reads as a rise; at the level it says so", () => {
  const short = riskAt(0.03);
  short.nearest = { ...short.nearest, netLots: -2, side: "sell", stopOut: { move: 60, pct: 0.03, price: 2_060 } };
  const r = accountAttention({ row: row(), risk: short, now: NOW }).reasons[0];
  assert.match(r.text, /^A 3\.00% rise in XAUUSD \(60\.00 to 2,060\.00\) against 2\.00 lots net short/);

  const gone = accountAttention({ row: row(), risk: riskAt(0, { equity: 400, levels: { mode: "money", marginCall: 800, stopOut: 500 } }), now: NOW });
  assert.equal(gone.reasons[0].level, "red");
  assert.equal(gone.reasons[0].short, "At stop-out");
  assert.equal(gone.reasons[0].text, "Equity of $400.00 is at or below the broker's stop-out ($500.00 equity).");
});

test("margin call: red at or below the margin-call equity, only with margin in use", () => {
  const at = (equity, extra = {}) =>
    accountAttention({ row: row(), risk: riskAt(0.5, { equity, marginLevel: equity / 10, ...extra }), now: NOW });
  assert.deepEqual(codes(at(1_000.01)), []);
  const a = at(1_000);
  assert.deepEqual(codes(a), ["red:margin-call"]);
  assert.equal(a.reasons[0].short, "At margin call");
  assert.equal(
    a.reasons[0].text,
    "Equity of $1,000.00 is at or below the broker's margin call (100% margin level, $1,000.00); the margin level is 100%.",
  );
  assert.deepEqual(codes(at(999.99)), ["red:margin-call"]);
  assert.deepEqual(codes(at(0, { margin: 0, marginCallEquity: null })), []);
});

test("floating drawdown: amber from 5%, red from 10%", () => {
  const at = (dd) => accountAttention({ row: row({ floatingDd: dd }), now: NOW });
  assert.deepEqual(codes(at(0.0499)), []);
  assert.deepEqual(codes(at(LIMITS.floatingDdAmber)), ["amber:floating-dd"]);
  assert.deepEqual(codes(at(0.0501)), ["amber:floating-dd"]);
  assert.deepEqual(codes(at(0.0999)), ["amber:floating-dd"]);
  assert.deepEqual(codes(at(LIMITS.floatingDdRed)), ["red:floating-dd"]);
  assert.deepEqual(codes(at(0.1001)), ["red:floating-dd"]);
  // A share that lands a hair under 10% from float arithmetic is still 10%.
  assert.deepEqual(codes(at(0.09999999999999998)), ["red:floating-dd"]);

  const r = at(0.072).reasons[0];
  assert.equal(r.short, "Floating DD 7.20%");
  assert.equal(r.text, "Open trades are 7.20% under water ($720.00 of the $10,000.00 balance).");
});

test("a threshold applies to the figure as shown, to two decimals of a percent", () => {
  // 9.996% shows as 10.00%, so it is red, as the 10% rule says; 4.994% shows as 4.99% and is not listed.
  assert.equal(floatingDdLevel(0.09996), "red");
  assert.equal(floatingDdLevel(0.04994), null);
  assert.equal(floatingDdLevel(0.04996), "amber");
  assert.equal(floatingDdLevel(null), null);
  // 4.996% to stop-out shows as 5.00%: not under 5%. 1.996% shows as 2.00%: amber, not red.
  assert.equal(stopOutLevel(0.04996), null);
  assert.equal(stopOutLevel(0.04994), "amber");
  assert.equal(stopOutLevel(0.01996), "amber");
  assert.equal(stopOutLevel(0.01994), "red");
  assert.equal(stopOutLevel(undefined), null);
  // A move still there never prints as 0.00%, which would read as reached.
  assert.equal(distanceLabel(0.00002), "under 0.01%");
  assert.equal(distanceLabel(0.0183), "1.83%");
  assert.equal(distanceLabel(null), "-");
  const tiny = accountAttention({ row: row(), risk: riskAt(0.00002), now: NOW }).reasons[0];
  assert.equal(tiny.short, "under 0.01% to stop-out");
});

test("margin in use but stop-out not checked: amber, saying why", () => {
  // EA 2026.10.17.4 lists positions but sends no broker levels.
  const old = accountAttention({
    row: row({ ea_version: "2026.10.17.4", margin: 15_900 }),
    risk: riskAt(0.5, { levels: null, nearest: null, stopOutEquity: null, marginCallEquity: null, bufferToStopOut: null, bufferToMarginCall: null }),
    now: NOW,
  });
  assert.deepEqual(codes(old), ["amber:stop-out-unchecked"]);
  assert.match(old.reasons[0].text, /^EA 2026\.10\.17\.4 does not send the broker's margin call and stop-out levels/);
  assert.match(old.reasons[0].text, /Attach EA 2026\.10\.17\.5 or later\.$/);

  // Levels known, but a symbol with no point value has no distance.
  const noValue = riskAt(0.5);
  noValue.symbols = [...noValue.symbols, { symbol: "BTCUSD", netLots: 1, side: "buy", pointValue: null, hedged: false, stopOut: null, marginCall: null }];
  const nv = accountAttention({ row: row(), risk: noValue, now: NOW });
  assert.deepEqual(codes(nv), ["amber:stop-out-unchecked"]);
  assert.equal(nv.reasons[0].text, "The terminal sent no point value for BTCUSD, so its distance to stop-out is not checked.");

  // A hedged symbol needs no point value; nothing open needs no levels.
  const hedged = riskAt(0.5);
  hedged.symbols = [...hedged.symbols, { symbol: "EURUSD", netLots: 0, side: null, pointValue: null, hedged: true, stopOut: null, marginCall: null }];
  assert.deepEqual(codes(accountAttention({ row: row(), risk: hedged, now: NOW })), []);
  assert.deepEqual(codes(accountAttention({ row: row({ ea_version: "2026.10.17.4" }), risk: riskAt(0.5, { levels: null, margin: 0 }), now: NOW })), []);
  // An EA too old to list positions has its own reason instead.
  assert.deepEqual(codes(accountAttention({ row: row({ ea_version: "2026.10.17.1" }), risk: riskAt(0.5, { levels: null }), now: NOW })), ["amber:ea-old"]);
});

test("a list cut short at the EA's 500: amber, saying the distances may be longer than real", () => {
  const a = accountAttention({ row: row(), risk: riskAt(0.5, { partial: true, listed: 500, reported: 520 }), now: NOW });
  assert.deepEqual(codes(a), ["amber:partial-list"]);
  assert.equal(
    a.reasons[0].text,
    "The EA listed 500 of the 520 positions open, so baskets and distances to stop-out are from part of the book and may look safer than they are.",
  );
});

test("offline: amber, saying the figures are from the last sync", () => {
  const sync = "2026-10-17T09:05:00Z";
  const a = accountAttention({ row: row({ status: "offline", last_sync_at: sync }), now: NOW });
  assert.deepEqual(codes(a), ["amber:offline"]);
  assert.equal(a.reasons[0].short, "Offline 3 h");
  assert.equal(a.reasons[0].text, "No sync for 3 h, so every figure here is from the last sync at 17 Oct 2026, 10:05.");
  assert.deepEqual(codes(accountAttention({ row: row({ status: "online" }), now: NOW })), []);
});

test("an EA that does not list open positions: amber", () => {
  const a = accountAttention({ row: row({ ea_version: "2026.10.17.1" }), now: NOW });
  assert.deepEqual(codes(a), ["amber:ea-old"]);
  assert.equal(a.reasons[0].short, "EA too old");
  assert.match(a.reasons[0].text, /^EA 2026\.10\.17\.1 does not send its open positions/);
  assert.deepEqual(codes(accountAttention({ row: row({ ea_version: null }), now: NOW })), ["amber:ea-old"]);
  assert.deepEqual(codes(accountAttention({ row: row({ ea_version: "2026.10.17.2" }), now: NOW })), []);
});

test("archived accounts get no reasons; never-synced ones only 'waiting'", () => {
  const bad = { row: row({ floatingDd: 0.5, status: "offline", ea_version: "1" }), risk: riskAt(0, { equity: 400 }), now: NOW };
  bad.baskets = { banked: 0, weekRealised: 0, flagged: [{ symbol: "XAUUSD", side: "buy", floating: -1 }] };
  assert.equal(accountAttention(bad).reasons.length, 6);
  assert.deepEqual(accountAttention({ ...bad, row: { ...bad.row, archived_at: "2026-10-01T00:00:00Z" } }), { level: null, reasons: [] });
  const waiting = accountAttention({ ...bad, row: { ...bad.row, last_sync_at: null, status: "waiting" } });
  assert.deepEqual(codes(waiting), ["amber:waiting"]);
  assert.equal(waiting.reasons[0].short, "Waiting for first sync");
  assert.deepEqual(accountAttention({ row: null }), { level: null, reasons: [] });
});

test("red reasons come first, then the fixed order", () => {
  const a = accountAttention({
    row: row({ floatingDd: 0.06, status: "offline", last_sync_at: "2026-10-17T11:00:00Z", ea_version: "2026.10.17.5" }),
    baskets: { banked: 0, weekRealised: 0, flagged: [{ symbol: "XAUUSD", side: "buy", floating: -1 }] },
    risk: riskAt(0.03, { equity: 900 }),
    now: NOW,
  });
  assert.equal(a.level, "red");
  assert.deepEqual(codes(a), ["red:basket-week", "red:margin-call", "amber:stop-out", "amber:floating-dd", "amber:offline"]);

  const amber = accountAttention({ row: row({ floatingDd: 0.06 }), now: NOW });
  assert.equal(amber.level, "amber");
});

test("works from a real accountRisk: the worked example is nowhere near", () => {
  const risk = accountRisk({
    rows: [{ ticket: "1", symbol: "XAUUSD", side: "buy", volume: 1.3, current_price: 2633.3, open_price: 2650, profit: -2171, point_value: 100, updated_at: SYNC }],
    account: { last_sync_at: SYNC, open_positions: 1, equity: 49_878.84, margin: 1_239.41, stop_out_mode: "percent", margin_call_level: 100, stop_out_level: 50 },
  });
  assert.deepEqual(accountAttention({ row: row(), risk, now: NOW }).reasons, []);
});

test("attention items: red before amber, then by label, none without a level", () => {
  const red = { level: "red", reasons: [{ level: "red", code: "floating-dd" }] };
  const amber = { level: "amber", reasons: [{ level: "amber", code: "offline" }] };
  const items = attentionItems([
    { id: "1", label: "Bravo", currency: "USD", last_sync_at: SYNC, attention: amber },
    { id: "2", label: "Delta", currency: "GBP", last_sync_at: SYNC, attention: red },
    { id: "3", label: "Alpha", currency: "USD", last_sync_at: SYNC, attention: amber },
    { id: "4", label: "Charlie", currency: "USD", last_sync_at: SYNC, attention: red },
    { id: "5", label: "Echo", currency: "USD", last_sync_at: SYNC, attention: { level: null, reasons: [] } },
    { id: "6", label: "Foxtrot", currency: "USD", last_sync_at: SYNC },
    null,
  ]);
  assert.deepEqual(items.map((i) => i.label), ["Charlie", "Delta", "Alpha", "Bravo"]);
  assert.deepEqual(items[1], { accountId: "2", label: "Delta", currency: "GBP", lastSyncAt: SYNC, level: "red", reasons: red.reasons });
  assert.deepEqual(attentionItems(null), []);
});
