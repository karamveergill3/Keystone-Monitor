// What goes into a PDF, worked out from the same functions the screens
// use, so paper and screen agree.

import { summarise, dailyReturns, groupReturns } from "./accountStats.js";
import { accountRow } from "./accountView.js";

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
