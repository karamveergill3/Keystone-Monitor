import { test } from "node:test";
import assert from "node:assert/strict";
import { nextDrawdown, floatingDrawdownPct } from "@/lib/drawdown";

const start = { peak: null, maxDrawdownPct: 0, maxDrawdownAt: null };

test("the first sync sets the peak and records no drawdown", () => {
  const s = nextDrawdown(start, { equity: 10_000, at: "t0" });
  assert.equal(s.peak, 10_000);
  assert.equal(s.maxDrawdownPct, 0);
});

test("a fall from the peak is recorded and kept", () => {
  let s = nextDrawdown(start, { equity: 10_000, at: "t0" });
  s = nextDrawdown(s, { equity: 9_000, at: "t1" });
  assert.equal(s.maxDrawdownPct, 0.1);
  assert.equal(s.maxDrawdownAt, "t1");
  s = nextDrawdown(s, { equity: 11_000, at: "t2" });
  assert.equal(s.peak, 11_000);
  assert.equal(s.maxDrawdownPct, 0.1);
  assert.equal(s.maxDrawdownAt, "t1");
});

test("a withdrawal is not a drawdown", () => {
  let s = nextDrawdown(start, { equity: 10_000, at: "t0" });
  s = nextDrawdown(s, { equity: 5_000, cashFlow: -5_000, at: "t1" });
  assert.equal(s.peak, 5_000);
  assert.equal(s.maxDrawdownPct, 0);
});

test("credit is not the account's money", () => {
  let s = nextDrawdown(start, { equity: 12_000, credit: 2_000, at: "t0" });
  assert.equal(s.peak, 10_000);
  s = nextDrawdown(s, { equity: 10_000, credit: 0, at: "t1" });
  assert.equal(s.maxDrawdownPct, 0);
});

test("floating drawdown is equity below balance", () => {
  assert.equal(floatingDrawdownPct(10_000, 9_500), 0.05);
  assert.equal(floatingDrawdownPct(10_000, 10_500), 0);
  assert.equal(floatingDrawdownPct(0, 0), 0);
});
