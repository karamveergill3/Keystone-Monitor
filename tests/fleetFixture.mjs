// A demo-like fleet for the fleet summary's tests (and a sample PDF):
// two algorithms, n accounts, one in EUR, one that has never synced, and
// a floating drawdown record with one gap.

import { normaliseDaily } from "@/lib/accountStats";

export const TODAY = "2026-10-19";
export const NOW = Date.parse("2026-10-19T13:05:00Z");
const SYNC = "2026-10-19T13:04:00Z";

export const projects = [
  { id: "p1", slug: "v100", name: "V100", sort: 1 },
  { id: "p2", slug: "cycle-method", name: "Cycle Method", sort: 2 },
  { id: "p3", slug: "empty", name: "Empty", sort: 3 },
];

export function fleetSample(n = 6) {
  const accounts = [];
  const daily = new Map();
  const worst = new Map();
  for (let i = 0; i < n; i++) {
    const id = `a${i + 1}`;
    const project = i % 2 ? "p2" : "p1";
    const waiting = i === n - 1;
    const currency = i === 3 ? "EUR" : "USD";
    const balance = 10_000 + i * 1_000;
    accounts.push({
      id, project_id: project, label: `${project === "p1" ? "V100" : "Cycle"} #${i + 1}`,
      account_number: waiting ? null : String(51_234_560 + i), currency, archived_at: null,
      last_sync_at: waiting ? null : SYNC,
      balance: waiting ? null : balance,
      // a1 is 1,200 down right now; the rest a little.
      equity: waiting ? null : balance - (i === 0 ? 1_200 : 15 * i),
      credit: 0, max_drawdown_pct: 0.03, tracking_since: "2026-09-01T09:00:00Z",
    });
    // A deposit a month ago, then a profit every weekday but the first
    // Friday, which loses.
    const rows = [{ account_id: id, day: "2026-09-21", trade_pnl: 0, cash_flow: 10_000 + i * 1_000, deposits: 10_000 + i * 1_000, withdrawals: 0, closed: 0, wins: 0, losses: 0, gross_profit: 0, gross_loss: 0, lots: 0 }];
    for (let d = 22; d <= 49; d++) {
      const day = new Date(Date.UTC(2026, 8, d)).toISOString().slice(0, 10);
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const pnl = day === "2026-09-25" ? -100 : Math.round((30 + 10 * Math.sin(d + i)) * 100) / 100;
      rows.push({
        account_id: id, day, trade_pnl: pnl, cash_flow: 0, deposits: 0, withdrawals: 0, closed: 2,
        wins: pnl > 0 ? 2 : 0, losses: pnl > 0 ? 0 : 2,
        gross_profit: pnl > 0 ? pnl : 0, gross_loss: pnl > 0 ? 0 : pnl, lots: 0.2,
      });
    }
    daily.set(id, waiting ? [] : normaliseDaily(rows));
    // The record: a2 once fell 25%; a1's worst sample is shallower than
    // what is open now.
    if (!waiting) worst.set(id, { worstPct: i === 1 ? -0.25 : -0.05, firstAt: i === 2 ? "2026-08-30T08:00:00Z" : "2026-09-01T09:00:00Z" });
  }
  // One gap on a2, and one on the EUR account the summary leaves out.
  const floating = {
    worst,
    gaps: [
      { accountId: "a2", from: "2026-09-02T10:00:00Z", to: "2026-09-08T09:00:00Z" },
      { accountId: "a4", from: "2026-09-10T10:00:00Z", to: "2026-09-15T09:00:00Z" },
    ],
  };
  return { projects, accounts, daily, floating, today: TODAY, now: NOW };
}
