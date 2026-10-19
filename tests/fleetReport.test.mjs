import { test } from "node:test";
import assert from "node:assert/strict";
import { fleetReportModel } from "@/lib/reportModel";
import { fleetReportPdf } from "@/lib/reportPdf";
import { summarise, chainGain, pooledReturns } from "@/lib/accountStats";
import { accountRow } from "@/lib/accountView";
import { fleetSample, projects, TODAY, NOW } from "./fleetFixture.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test("the fleet's figures are each live account's own, added up", () => {
  const input = fleetSample(6);
  const m = fleetReportModel(input);
  assert.equal(m.today, TODAY);
  assert.equal(m.generatedAt, new Date(NOW).toISOString());
  assert.equal(m.currency, "USD");
  // a4 is in EUR and a6 has never synced: four live USD accounts.
  assert.equal(m.accounts, 4);
  assert.equal(m.otherCurrencies, 1);

  const ids = ["a1", "a2", "a3", "a5"];
  const each = ids.map((id) => {
    const a = input.accounts.find((x) => x.id === id);
    return summarise(input.daily.get(id), a.balance);
  });
  const sum = (f) => each.reduce((t, s) => t + f(s), 0);
  close(m.profit, sum((s) => s.tradePnl), "profit");
  close(m.combinedReturn, sum((s) => s.gain), "combined return");
  assert.equal(m.trades, sum((s) => s.closed));
  assert.equal(m.wins, sum((s) => s.wins));
  close(m.winRate, sum((s) => s.wins) / (sum((s) => s.wins) + sum((s) => s.losses)), "win rate");
  close(m.lots, sum((s) => s.lots), "lots");
  close(m.profitFactor, sum((s) => s.grossProfit) / -sum((s) => s.grossLoss), "profit factor");
  // Pooled: the four accounts' days as one account's, time-weighted.
  const pooled = chainGain(pooledReturns(ids.map((id) => ({ daily: input.daily.get(id), balance: input.accounts.find((a) => a.id === id).balance }))));
  close(m.pooledReturn, pooled, "pooled");
  // For one account, the pool is that account's own gain.
  const solo = fleetReportModel({ ...input, accounts: input.accounts.filter((a) => a.id === "a1") });
  close(solo.pooledReturn, solo.combinedReturn, "one account pooled");
});

test("the curve adds the fleet's days up to the realised profit, and counts the days", () => {
  const m = fleetReportModel(fleetSample(6));
  assert.equal(m.runningSince, "2026-09-22");
  // Weekdays from 22 Sep to 19 Oct.
  assert.equal(m.tradingDays, 20);
  assert.equal(m.curve.length, 20);
  assert.equal(m.profitDays, 19);
  assert.ok(m.curve.every((c, i) => i === 0 || c.day > m.curve[i - 1].day));
  close(m.curve.at(-1).value, m.profit, "curve ends at the profit");
  const lossDay = m.curve.findIndex((c) => c.day === "2026-09-25");
  assert.ok(m.curve[lossDay].value < m.curve[lossDay - 1].value);
  const steps = m.curve.map((c, i) => c.value - (i ? m.curve[i - 1].value : 0));
  close(m.bestDay.pnl, Math.max(...steps), "best day is the biggest step");
});

test("floating drawdown: the deeper of the record and what is open now, averaged, with where the record starts", () => {
  const input = fleetSample(6);
  const m = fleetReportModel(input);
  const now = (id) => accountRow(input.accounts.find((a) => a.id === id), [], TODAY, NOW).floatingDd;
  // a1: open 1,200 on 10,000 (12%) beats its recorded 5%; a2 recorded 25%;
  // a3 and a5 recorded 5%, deeper than open.
  close(now("a1"), 0.12, "a1 open now");
  const expect = [0.12, 0.25, 0.05, 0.05];
  close(m.avgFloatingDrawdown, expect.reduce((a, b) => a + b) / 4, "average");
  close(m.deepestFloatingDrawdown, 0.25, "deepest");
  // a3's record starts 30 Aug, the rest 1 Sep; only the summarised
  // accounts' gaps are kept, the EUR one's is not.
  assert.equal(m.floatingSince, "2026-08-30");
  assert.equal(m.floatingAllSince, "2026-09-01");
  assert.equal(m.floatingUnrecorded, 0);
  assert.deepEqual(m.floatingGaps, [{ accountId: "a2", label: "Cycle #2", from: "2026-09-02", to: "2026-09-08" }]);

  // An account with no samples is counted as having no record.
  input.floating.worst.delete("a5");
  assert.equal(fleetReportModel(input).floatingUnrecorded, 1);

  // No record at all: what is open now still counts, and nothing is "since".
  const bare = fleetReportModel({ ...input, floating: null });
  close(bare.deepestFloatingDrawdown, 0.12, "open now without a record");
  assert.equal(bare.floatingSince, null);
  assert.equal(bare.floatingAllSince, null);
  assert.equal(bare.floatingUnrecorded, 4);
  assert.deepEqual(bare.floatingGaps, []);
});

test("algorithms: each with its live accounts, an unknown one under Other accounts, an empty one left out", () => {
  const input = fleetSample(6);
  input.accounts.find((a) => a.id === "a5").project_id = "gone";
  const m = fleetReportModel(input);
  assert.deepEqual(m.algorithms.map((a) => [a.name, a.accounts]), [["V100", 2], ["Cycle Method", 1], ["Other accounts", 1]]);
  const v100 = m.algorithms[0];
  assert.equal(v100.trades, 2 * 20 * 2);
  assert.ok(v100.profit > 0 && v100.winRate > 0.9);
  assert.equal(m.algorithms.reduce((t, a) => t + a.trades, 0), m.trades);
});

test("the currency most live accounts use is the one summarised; a tie goes to USD", () => {
  const input = fleetSample(3);
  input.accounts[0].currency = "EUR";
  const tie = fleetReportModel(input);
  assert.equal(tie.currency, "USD");
  assert.equal(tie.accounts, 1);
  assert.equal(tie.otherCurrencies, 1);
  input.accounts[1].currency = "EUR";
  assert.equal(fleetReportModel(input).currency, "EUR");
});

test("an empty fleet still makes a page", async () => {
  const m = fleetReportModel({ projects, accounts: [], daily: new Map(), today: TODAY, now: NOW });
  assert.equal(m.accounts, 0);
  assert.equal(m.profit, 0);
  assert.equal(m.bestDay, null);
  assert.equal(m.runningSince, null);
  assert.equal(m.avgFloatingDrawdown, null);
  assert.equal(m.pooledReturn, null);
  const pdf = (await fleetReportPdf(m)).toString("latin1");
  assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 1);
});

test("the fleet summary PDF is one portrait page, however many accounts and algorithms", async () => {
  for (const n of [6, 15, 60]) {
    const input = fleetSample(n);
    // Many algorithms: the list folds the rest into one line.
    if (n === 60) {
      input.projects = Array.from({ length: 9 }, (_, k) => ({ id: `q${k}`, slug: `q${k}`, name: `Algorithm number ${k + 1}`, sort: k }));
      input.accounts.forEach((a, i) => (a.project_id = `q${i % 9}`));
      input.projects[0].name = "An algorithm with a very long name indeed, for the test";
      input.floating.gaps.push({ accountId: "a1", from: "2026-09-12T00:00:00Z", to: "2026-09-16T00:00:00Z" }, { accountId: "a3", from: "2026-09-20T00:00:00Z", to: "2026-09-24T00:00:00Z" });
    }
    const pdf = (await fleetReportPdf(fleetReportModel(input))).toString("latin1");
    assert.ok(pdf.startsWith("%PDF-"), String(n));
    assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 1, `${n} accounts`);
    assert.match(pdf, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  }
});
