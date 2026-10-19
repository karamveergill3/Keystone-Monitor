// What goes into a PDF, worked out from the same functions the screens
// use, so paper and screen agree.

import { summarise, dailyReturns, groupReturns } from "./accountStats.js";
import { accountRow, currencyTotals } from "./accountView.js";
import { accountBaskets } from "./baskets.js";
import { accountAttention, attentionItems } from "./attention.js";

export function accountReportModel({ account, project, daily, positions, range, today, now = Date.now() }) {
  const row = accountRow(account, daily, today, now);
  const inRange = (day) => (!range.from || day >= range.from) && day <= range.to;
  const returns = dailyReturns(daily, row.balance).filter((r) => inRange(r.day));
  return {
    account: row,
    project,
    range,
    summary: summarise(daily, row.balance, range),
    months: groupReturns(returns, "month"),
    curve: returns.map((r) => ({ day: r.day, balance: r.endBalance })),
    positions,
  };
}

export function projectReportModel({ project, accounts, dailyByAccount, range, today, now = Date.now() }) {
  const rows = accounts.map((a) => {
    const daily = dailyByAccount.get(a.id) ?? [];
    const row = accountRow(a, daily, today, now);
    return { ...row, summary: summarise(daily, row.balance, range) };
  });

  const totals = new Map();
  for (const r of rows) {
    if (r.balance === null) continue;
    const t = totals.get(r.currency) ?? { currency: r.currency, accounts: 0, startBalance: 0, endBalance: 0, tradePnl: 0, deposits: 0, withdrawals: 0, closed: 0 };
    t.accounts++;
    t.startBalance += r.summary.startBalance ?? 0;
    t.endBalance += r.summary.endBalance ?? 0;
    t.tradePnl += r.summary.tradePnl;
    t.deposits += r.summary.deposits;
    t.withdrawals += r.summary.withdrawals;
    t.closed += r.summary.closed;
    totals.set(r.currency, t);
  }
  return { project, range, rows, totals: [...totals.values()] };
}

// What the open trades are worth right now: equity less balance, with any
// broker credit taken out of equity first, to the cent. The accounts
// table's Floating DD money (src/components/AccountsTable.js), so paper
// and screen agree.
export function floatingMoney(row) {
  const v = Number(row.equity) - Number(row.balance) - Number(row.credit ?? 0);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

// The fleet summary the office printer prints: every project's accounts
// as the overview's table has them, the per-currency totals under each,
// and every basket that could be closed now with the week still up, as the
// overview's panel lists them. daily, openMap and trackedMap are the
// Maps dailyFor, openPositionsFor and openBasketsFor (src/lib/data.js)
// return. An account in no listed project goes under "Other accounts".
export function fleetReportModel({ projects, accounts, daily, openMap, trackedMap, today, now = Date.now() }) {
  const rows = accounts.map((a) => {
    const row = accountRow(a, daily?.get(a.id) ?? [], today, now);
    const baskets = accountBaskets({
      rows: openMap?.get(a.id) ?? [],
      account: row,
      weekRealised: row.periods.week.pnl,
      tracked: trackedMap?.get(a.id) ?? [],
    });
    const floating = row.balance === null ? null : floatingMoney(row);
    return { ...row, floating, baskets, attention: accountAttention({ row, baskets }) };
  });

  const known = new Set(projects.map((p) => p.id));
  const groups = projects.map((p) => ({ project: p, rows: rows.filter((r) => r.project_id === p.id) }));
  const strays = rows.filter((r) => !known.has(r.project_id));
  if (strays.length) groups.push({ project: { id: null, name: "Other accounts" }, rows: strays });

  const closable = attentionItems(rows).flatMap((item) =>
    item.baskets.map((b) => ({
      accountId: item.accountId,
      label: item.label,
      currency: item.currency,
      symbol: b.symbol,
      side: b.side,
      floating: b.floating,
      week: item.weekRealised,
      leftover: b.leftover,
    }))
  );

  return {
    generatedAt: new Date(now).toISOString(),
    today,
    accounts: rows.length,
    projects: groups.map((g) => ({
      project: g.project,
      rows: g.rows,
      totals: currencyTotals(g.rows).map((t) => ({
        ...t,
        floating: Math.round(g.rows.filter((r) => r.currency === t.currency && r.floating !== null).reduce((s, r) => s + r.floating, 0) * 100) / 100,
      })),
    })),
    closable,
  };
}
