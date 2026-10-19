import { test } from "node:test";
import assert from "node:assert/strict";
import { fleetReportModel, floatingMoney } from "@/lib/reportModel";
import { fleetReportPdf } from "@/lib/reportPdf";
import { accountRow, currencyTotals } from "@/lib/accountView";
import { fleetSample, TODAY, NOW } from "./fleetFixture.mjs";

test("the fleet summary groups accounts by project with the overview's figures", () => {
  const input = fleetSample(6);
  const m = fleetReportModel(input);
  assert.equal(m.today, TODAY);
  assert.equal(m.generatedAt, new Date(NOW).toISOString());
  assert.equal(m.accounts, 6);
  assert.deepEqual(m.projects.map((p) => [p.project.name, p.rows.map((r) => r.id)]), [
    ["V100", ["a1", "a3", "a5"]],
    ["Cycle Method", ["a2", "a4", "a6"]],
  ]);
  // Every figure is accountRow's, exactly as the screens have it.
  for (const p of m.projects) {
    for (const r of p.rows) {
      const screen = accountRow(input.accounts.find((a) => a.id === r.id), input.daily.get(r.id), TODAY, NOW);
      assert.deepEqual(r.periods, screen.periods, r.id);
      assert.equal(r.floatingDd, screen.floatingDd, r.id);
      assert.equal(r.status, screen.status, r.id);
    }
  }
  const a1 = m.projects[0].rows[0];
  assert.equal(a1.floating, -120);
  assert.equal(floatingMoney({ balance: 1000, equity: 1050.004, credit: 100 }), -50);
  assert.equal(m.projects[0].rows.find((r) => r.id === "a3").status, "offline");
  assert.equal(m.projects[1].rows.find((r) => r.id === "a6").floating, null);
});

test("totals are per currency and add the floating money", () => {
  const m = fleetReportModel(fleetSample(6));
  const cycle = m.projects[1];
  assert.deepEqual(cycle.totals.map((t) => t.currency).sort(), ["EUR", "USD"]);
  const usd = cycle.totals.find((t) => t.currency === "USD");
  const eur = cycle.totals.find((t) => t.currency === "EUR");
  assert.equal(usd.accounts, 1);
  assert.equal(eur.accounts, 1);
  assert.equal(usd.floating, -15);
  assert.equal(eur.floating, -45);
  const expect = currencyTotals(cycle.rows);
  assert.deepEqual(cycle.totals.map(({ floating, ...t }) => t), expect);
});

test("closable baskets are listed as the overview's panel has them", () => {
  const m = fleetReportModel(fleetSample(6));
  assert.equal(m.closable.length, 1);
  const [b] = m.closable;
  assert.equal(b.label, "V100 #1");
  assert.equal(b.symbol, "XAUUSD");
  assert.equal(b.side, "buy");
  assert.equal(b.floating, -70.5);
  assert.equal(b.week, 180);
  assert.equal(b.leftover, Math.round((b.week + b.floating) * 100) / 100);
});

test("an archived or unknown-project account is handled, and no basket means none listed", () => {
  const input = fleetSample(4);
  input.openMap.set("a1", []);
  input.accounts[1].project_id = "gone";
  const m = fleetReportModel(input);
  assert.deepEqual(m.closable, []);
  assert.deepEqual(m.projects.map((p) => p.project.name), ["V100", "Cycle Method", "Other accounts"]);
  assert.deepEqual(m.projects[2].rows.map((r) => r.id), ["a2"]);
});

test("the fleet summary PDF renders: one landscape page for fifteen accounts, more flow on", async () => {
  for (const [n, maxPages] of [[6, 1], [15, 1], [60, 6]]) {
    const pdf = await fleetReportPdf(fleetReportModel(fleetSample(n)));
    const text = pdf.toString("latin1");
    assert.ok(text.startsWith("%PDF-"), String(n));
    const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
    assert.ok(pages >= 1 && pages <= maxPages, `${n} accounts: ${pages} pages`);
    if (n === 60) assert.ok(pages > 1);
    assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  }
});
