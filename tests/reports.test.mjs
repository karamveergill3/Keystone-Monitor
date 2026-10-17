import { test } from "node:test";
import assert from "node:assert/strict";
import { reportRange, rangeSlug } from "@/lib/reportRange";
import { accountReportModel, projectReportModel } from "@/lib/reportModel";
import { accountReportPdf, projectReportPdf, pdfText } from "@/lib/reportPdf";
import { normaliseDaily } from "@/lib/accountStats";

const TODAY = "2026-10-17";

test("report ranges", () => {
  assert.deepEqual(reportRange({}, TODAY), { from: null, to: TODAY, whole: true });
  assert.deepEqual(reportRange({ from: "2026-09-01", to: "2026-09-15" }, TODAY), { from: "2026-09-01", to: "2026-09-15", whole: false });
  assert.equal(reportRange({ from: "2026-09-01", to: "2027-01-01" }, TODAY).to, TODAY);
  assert.match(reportRange({ from: "2026-02-30" }, TODAY).error, /not a date/);
  assert.match(reportRange({ from: "2026-10-20" }, TODAY).error, /future/);
  assert.match(reportRange({ from: "2026-09-15", to: "2026-09-01" }, TODAY).error, /after/);
  assert.equal(reportRange(new URLSearchParams("from=2026-09-01"), TODAY).from, "2026-09-01");
  assert.equal(rangeSlug({ from: "2026-09-01", to: "2026-09-15" }), "2026-09-01-to-2026-09-15");
  assert.equal(rangeSlug({ from: null, to: TODAY }), `to-${TODAY}`);
});

test("text outside the PDF fonts is mapped down", () => {
  assert.equal(pdfText("−1,000 USC"), "-1,000 USC");
  assert.equal(pdfText("£€$"), "£€$");
  assert.equal(pdfText("日本"), "??");
});

const account = {
  id: "a1", project_id: "p1", label: "V100 · Sam · 50k", account_number: "51234567", server: "Broker-Live",
  broker: "Broker Ltd", currency: "USD", balance: 10_450, equity: 10_300, last_sync_at: "2026-10-17T11:58:00Z",
  tracking_since: "2026-09-01T09:00:00Z", max_drawdown_pct: 0.062, max_drawdown_at: "2026-09-20T14:00:00Z",
};

function daily() {
  const rows = [{ account_id: "a1", day: "2026-08-03", trade_pnl: 0, cash_flow: 10_000, closed: 0, wins: 0, losses: 0, gross_profit: 0, gross_loss: 0, lots: 0 }];
  let pnl = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2026, 7, 4) + i * 86_400_000).toISOString().slice(0, 10);
    const p = i === 59 ? 450 - pnl : Math.round((Math.sin(i) * 60 + 8) * 100) / 100;
    pnl += p;
    rows.push({ account_id: "a1", day: d, trade_pnl: p, cash_flow: 0, closed: 4, wins: p > 0 ? 3 : 1, losses: p > 0 ? 1 : 3, gross_profit: Math.max(p, 0) + 20, gross_loss: Math.min(p, 0) - 20, lots: 0.8 });
  }
  return normaliseDaily(rows);
}

function positions(n) {
  return {
    total: n + 40,
    rows: Array.from({ length: n }, (_, i) => ({
      position_id: String(9000 + i), symbol: "XAUUSD", side: i % 2 ? "sell" : "buy",
      open_time: "2026-10-01T08:00:00Z", close_time: "2026-10-01T09:30:00Z",
      volume_in: 0.2, volume_out: 0.2, open_price: 2650.12, close_price: 2655.4, net: i % 3 ? 21.4 : -12.1,
    })),
  };
}

test("an account report renders, across pages, and agrees with the screen's figures", async () => {
  const range = reportRange({ from: "2026-09-01", to: "2026-09-30" }, TODAY);
  const model = accountReportModel({ account, project: { name: "V100" }, daily: daily(), positions: positions(120), range, today: TODAY });
  assert.equal(model.months.length, 1);
  assert.equal(model.months[0].key, "2026-09-01");
  assert.ok(Math.abs(model.months[0].pnl - model.summary.tradePnl) < 1e-9);

  const pdf = await accountReportPdf(model);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const pages = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pages >= 3, `expected the trade list to run onto more pages, got ${pages}`);
  if (process.env.REPORT_OUT) (await import("node:fs")).writeFileSync(`${process.env.REPORT_OUT}/account.pdf`, pdf);
});

test("a project report renders with per-currency totals", async () => {
  const gbp = { ...account, id: "a2", label: "Cycle · GBP", currency: "GBP", balance: 5_000, equity: 5_000 };
  const never = { ...account, id: "a3", label: "Not connected", account_number: null, balance: null, equity: null };
  const range = reportRange({}, TODAY);
  const model = projectReportModel({
    project: { name: "Cycle Method", slug: "cycle-method" },
    accounts: [account, gbp, never],
    dailyByAccount: new Map([["a1", daily()], ["a2", []]]),
    range,
    today: TODAY,
  });
  assert.deepEqual(model.totals.map((t) => t.currency), ["USD", "GBP"]);
  const pdf = await projectReportPdf(model);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  if (process.env.REPORT_OUT) (await import("node:fs")).writeFileSync(`${process.env.REPORT_OUT}/project.pdf`, pdf);
});
