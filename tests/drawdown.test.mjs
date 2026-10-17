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

test("during a drawdown, the same open loss is measured against what is left", () => {
  // 10,000 balance at its peak; a floating loss takes equity to 8,000.
  let s = nextDrawdown(start, { equity: 10_000, at: "t0" });
  s = nextDrawdown(s, { equity: 8_000, at: "t1" });
  assert.equal(s.maxDrawdownPct, 0.2);
  // 4,000 withdrawn: the 2,000 open loss is now on 6,000 of balance, and
  // the max agrees with Floating drawdown on the same screen.
  s = nextDrawdown(s, { equity: 4_000, cashFlow: -4_000, at: "t2" });
  assert.ok(Math.abs(s.drawdownPct - floatingDrawdownPct(6_000, 4_000)) < 1e-12, String(s.drawdownPct));
  assert.ok(s.maxDrawdownPct >= s.drawdownPct);
});

test("withdrawing everything resets the peak", () => {
  let s = nextDrawdown(start, { equity: 10_000, at: "t0" });
  s = nextDrawdown(s, { equity: 0, cashFlow: -10_000, at: "t1" });
  assert.equal(s.peak, 0);
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

test("broker credit does not hide a floating loss", () => {
  // MT5 equity includes credit: 10,000 balance + 5,000 credit - 4,000 floating.
  assert.equal(floatingDrawdownPct(10_000, 11_000, 5_000), 0.4);
});
