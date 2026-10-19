// A demo-like fleet for the fleet summary's tests (and a sample PDF):
// two projects, n accounts, the first with a basket in loss that the
// week's profit could absorb, and one account that has never synced.

import { normaliseDaily } from "@/lib/accountStats";

export const TODAY = "2026-10-19";
export const NOW = Date.parse("2026-10-19T13:05:00Z");
const SYNC = "2026-10-19T13:04:00Z";

export const projects = [
  { id: "p1", slug: "v100", name: "V100", sort: 1 },
  { id: "p2", slug: "cycle-method", name: "Cycle Method", sort: 2 },
];

export function fleetSample(n = 6) {
  const accounts = [];
  const daily = new Map();
  const openMap = new Map();
  const trackedMap = new Map();
  for (let i = 0; i < n; i++) {
    const id = `a${i + 1}`;
    const project = i % 2 ? "p2" : "p1";
    const waiting = i === n - 1;
    const currency = i === 3 ? "EUR" : "USD";
    accounts.push({
      id, project_id: project, label: `${project === "p1" ? "V100" : "Cycle"} #${i + 1}`,
      account_number: waiting ? null : String(51_234_560 + i), server: "Broker-Live", broker: "Broker Ltd",
      currency, ea_version: "2026.10.17.5", archived_at: null,
      last_sync_at: waiting ? null : i === 2 ? "2026-10-19T11:00:00Z" : SYNC,
      balance: waiting ? null : 10_000 + i * 1_000, equity: waiting ? null : 10_000 + i * 1_000 - (i === 0 ? 120 : 15 * i),
      credit: 0, open_positions: i === 0 ? 2 : 0, max_drawdown_pct: 0.03,
    });
    // A deposit a month ago, then a little profit every weekday since.
    const rows = [{ account_id: id, day: "2026-09-21", trade_pnl: 0, cash_flow: 10_000 + i * 1_000, closed: 0, wins: 0, losses: 0, gross_profit: 0, gross_loss: 0, lots: 0 }];
    for (let d = 22; d <= 49; d++) {
      const day = new Date(Date.UTC(2026, 8, d)).toISOString().slice(0, 10);
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const pnl = day === TODAY && i === 0 ? 180 : Math.round((30 + 10 * Math.sin(d + i)) * 100) / 100;
      rows.push({ account_id: id, day, trade_pnl: pnl, cash_flow: 0, closed: 2, wins: 2, losses: 0, gross_profit: pnl, gross_loss: 0, lots: 0.2 });
    }
    daily.set(id, waiting ? [] : normaliseDaily(rows));
    openMap.set(id, i === 0
      ? [
          { ticket: "1", position_id: "1", symbol: "XAUUSD", side: "buy", volume: 0.1, open_price: 2660, current_price: 2654, profit: -60, swap: -0.5, open_time: "2026-10-19T08:00:00Z", updated_at: SYNC },
          { ticket: "2", position_id: "2", symbol: "XAUUSD", side: "buy", volume: 0.1, open_price: 2655, current_price: 2654, profit: -10, swap: 0, open_time: "2026-10-19T09:00:00Z", updated_at: SYNC },
        ]
      : []);
    trackedMap.set(id, []);
  }
  return { projects, accounts, daily, openMap, trackedMap, today: TODAY, now: NOW };
}
