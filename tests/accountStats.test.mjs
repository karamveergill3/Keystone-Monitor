import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseDaily,
  dailyReturns,
  summarise,
  periodFigures,
  groupPeriods,
  balanceAtStart,
  balanceAtEnd,
  maxDailyDrawdown,
} from "@/lib/accountStats";

const close = (a, b) => Math.abs(a - b) < 1e-9;

// Deposit 10k, +1000, -550, withdraw 5k, +450.
const rows = normaliseDaily([
  { account_id: "a", day: "2026-10-01", trade_pnl: 0, cash_flow: 10_000, closed: 0, wins: 0, losses: 0, gross_profit: 0, gross_loss: 0, lots: 0 },
  { account_id: "a", day: "2026-10-02", trade_pnl: 1000, cash_flow: 0, closed: 3, wins: 2, losses: 1, gross_profit: 1200, gross_loss: -200, lots: 1.5 },
  { account_id: "a", day: "2026-10-05", trade_pnl: -550, cash_flow: 0, closed: 2, wins: 0, losses: 2, gross_profit: 0, gross_loss: -550, lots: 1 },
  { account_id: "a", day: "2026-10-06", trade_pnl: 450, cash_flow: -5_000, closed: 1, wins: 1, losses: 0, gross_profit: 450, gross_loss: 0, lots: 0.5 },
]);
const BALANCE = 10_000 + 1000 - 550 + 450 - 5_000; // 5,900

test("balances walk back from today", () => {
  const r = dailyReturns(rows, BALANCE);
  assert.equal(r[0].startBalance, 0);
  assert.equal(r[0].endBalance, 10_000);
  assert.equal(r[1].endBalance, 11_000);
  assert.equal(r[3].endBalance, BALANCE);
  assert.equal(balanceAtStart(rows, BALANCE, "2026-10-05"), 11_000);
  assert.equal(balanceAtEnd(rows, BALANCE, "2026-10-05"), 10_450);
  assert.equal(balanceAtEnd(rows, BALANCE, "2026-10-04"), 11_000);
});

test("gain is time-weighted, so a withdrawal does not move it", () => {
  const s = summarise(rows, BALANCE);
  // 1.10 * (10450/11000) * (1 + 450/10450)
  const expected = 1.1 * (10_450 / 11_000) * (1 + 450 / 10_450) - 1;
  assert.ok(close(s.gain, expected), `${s.gain} vs ${expected}`);
  assert.equal(s.tradePnl, 900);
  assert.equal(s.deposits, 10_000);
  assert.equal(s.withdrawals, -5_000);
  assert.equal(s.startBalance, 0);
  assert.equal(s.endBalance, BALANCE);
});

test("trade record figures", () => {
  const s = summarise(rows, BALANCE);
  assert.equal(s.closed, 6);
  assert.equal(s.winRate, 3 / 6);
  assert.ok(close(s.profitFactor, 1650 / 750));
  assert.equal(s.bestDay.day, "2026-10-02");
  assert.equal(s.worstDay.day, "2026-10-05");
  assert.equal(s.tradingDays, 3);
});

test("a range uses the balance it began with", () => {
  const s = summarise(rows, BALANCE, { from: "2026-10-05", to: "2026-10-05" });
  assert.equal(s.startBalance, 11_000);
  assert.equal(s.endBalance, 10_450);
  assert.equal(s.tradePnl, -550);
  assert.ok(close(s.gain, -0.05));
  assert.ok(close(s.maxDrawdown, 0.05));
});

test("drawdown is measured on the gain index", () => {
  const dd = maxDailyDrawdown(dailyReturns(rows, BALANCE));
  assert.ok(close(dd, 0.05));
});

test("today, this week and this month", () => {
  const p = periodFigures(rows, BALANCE, "2026-10-06");
  assert.equal(p.today.pnl, 450);
  assert.equal(p.week.pnl, -100); // Mon 5th and Tue 6th
  assert.equal(p.month.pnl, 900);
});

test("weeks and months group newest first", () => {
  const weeks = groupPeriods(rows, BALANCE, "week");
  assert.deepEqual(weeks.map((w) => w.key), ["2026-10-05", "2026-09-28"]);
  assert.equal(weeks[0].pnl, -100);
  const months = groupPeriods(rows, BALANCE, "month");
  assert.equal(months.length, 1);
  assert.equal(months[0].endBalance, BALANCE);
});

test("an account that never synced has no balance figures", () => {
  const s = summarise(rows, null);
  assert.equal(s.startBalance, null);
  assert.equal(s.gain, 0);
});
