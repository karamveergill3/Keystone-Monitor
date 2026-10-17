// What a row on the overview or project table shows for one account.

import { periodFigures } from "./accountStats.js";
import { floatingDrawdownPct } from "./drawdown.js";
import { syncStatus } from "./site.js";

export function accountRow(account, daily, today, now = Date.now()) {
  const balance = account.balance === null ? null : Number(account.balance);
  const equity = account.equity === null ? null : Number(account.equity);
  return {
    ...account,
    balance,
    equity,
    currency: account.currency || "USD",
    status: syncStatus(account.last_sync_at, now),
    floatingDd: floatingDrawdownPct(balance, equity),
    maxDd: Number(account.max_drawdown_pct ?? 0),
    periods: periodFigures(daily ?? [], balance, today),
  };
}

// Totals per currency. Accounts in different currencies are never added
// together: there is no exchange rate here to do it honestly.
export function currencyTotals(rows) {
  const by = new Map();
  for (const r of rows) {
    if (r.balance === null) continue;
    const t = by.get(r.currency) ?? { currency: r.currency, accounts: 0, balance: 0, equity: 0, today: 0, week: 0, month: 0, all: 0 };
    t.accounts++;
    t.balance += r.balance;
    t.equity += r.equity ?? r.balance;
    t.today += r.periods.today.pnl;
    t.week += r.periods.week.pnl;
    t.month += r.periods.month.pnl;
    t.all += r.periods.all.pnl;
    by.set(r.currency, t);
  }
  return [...by.values()].sort((a, b) => b.balance - a.balance);
}
