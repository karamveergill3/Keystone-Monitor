// What goes into a PDF, worked out from the same functions the screens
// use, so paper and screen agree.

import { summarise, dailyReturns, groupReturns, pooledReturns, chainGain } from "./accountStats.js";
import { accountRow } from "./accountView.js";
import { dayKey } from "./days.js";

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

// The fleet summary the office printer prints: one page for whoever holds
// it, on every live account since each went live. projects and accounts
// are listProjects and listAccounts; daily is the Map dailyFor returns and
// floating what floatingHistoryFor returns (src/lib/data.js). Every money
// figure is built from summarise and dailyReturns, the same as each
// account's own page and report.
//
// One currency only: accounts in another are never added in (there is no
// exchange rate here to do it honestly). The summary covers the currency
// most live accounts use and says how many it leaves out.
export function fleetReportModel({ projects, accounts, daily, floating = null, today, now = Date.now() }) {
  const live = accounts
    .map((a) => accountRow(a, daily?.get(a.id) ?? [], today, now))
    .filter((r) => r.balance !== null);

  const byCurrency = new Map();
  for (const r of live) byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + 1);
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1] || (a[0] === "USD" ? -1 : b[0] === "USD" ? 1 : a[0] < b[0] ? -1 : 1))[0]?.[0] ?? "USD";
  const rows = live.filter((r) => r.currency === currency);

  const known = new Set(projects.map((p) => p.id));
  const algoOf = (r) => (known.has(r.project_id) ? r.project_id : null);
  const algos = new Map();
  let profit = 0, combined = 0, trades = 0, wins = 0, losses = 0, lots = 0, grossProfit = 0, grossLoss = 0;
  const days = new Map();
  for (const r of rows) {
    const d = daily?.get(r.id) ?? [];
    const s = summarise(d, r.balance);
    profit += s.tradePnl;
    combined += s.gain ?? 0;
    trades += s.closed;
    wins += s.wins;
    losses += s.losses;
    lots += s.lots;
    grossProfit += s.grossProfit;
    grossLoss += s.grossLoss;
    for (const x of dailyReturns(d, r.balance)) {
      if (x.closed > 0 || x.tradePnl !== 0) days.set(x.day, (days.get(x.day) ?? 0) + x.tradePnl);
    }
    const k = algoOf(r);
    const a = algos.get(k) ?? { accounts: 0, trades: 0, wins: 0, losses: 0, profit: 0 };
    a.accounts++;
    a.trades += s.closed;
    a.wins += s.wins;
    a.losses += s.losses;
    a.profit += s.tradePnl;
    algos.set(k, a);
  }

  const dayList = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, pnl]) => ({ day, pnl: cents(pnl) }));
  let running = 0;
  const curve = dayList.map((x) => ({ day: x.day, value: cents((running += x.pnl)) }));
  const best = dayList.reduce((b, x) => (!b || x.pnl > b.pnl ? x : b), null);

  // Each account's worst open-trade loss as a share of its balance: the
  // deepest equity sample, or what is open right now if that is deeper
  // (the record may not have caught it yet). A positive depth.
  const depths = rows.map((r) => {
    const h = floating?.worst?.get(r.id);
    return Math.max(0, -(h?.worstPct ?? 0), r.floatingDd ?? 0);
  });
  // What the record covers, for these accounts only: from the first
  // account's first sample, every account only from the newest one's, and
  // each account's own gaps.
  const firsts = rows.map((r) => floating?.worst?.get(r.id)?.firstAt).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  const ids = new Set(rows.map((r) => r.id));
  const labelOf = new Map(rows.map((r) => [r.id, r.label]));
  const gaps = (floating?.gaps ?? [])
    .filter((g) => ids.has(g.accountId))
    .map((g) => ({ accountId: g.accountId, label: labelOf.get(g.accountId), from: dayKey(g.from), to: dayKey(g.to) }));

  const algorithms = [...projects.map((p) => [p.id, p.name]), [null, "Other accounts"]]
    .filter(([id]) => algos.has(id))
    .map(([id, name]) => {
      const a = algos.get(id);
      return { name, accounts: a.accounts, trades: a.trades, profit: cents(a.profit), winRate: a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : null };
    });

  return {
    generatedAt: new Date(now).toISOString(),
    today,
    currency,
    accounts: rows.length,
    otherCurrencies: live.length - rows.length,
    algorithms,
    profit: cents(profit),
    combinedReturn: combined,
    pooledReturn: rows.length ? chainGain(pooledReturns(rows.map((r) => ({ daily: daily?.get(r.id) ?? [], balance: r.balance })))) : null,
    bestDay: best,
    trades,
    wins,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    lots,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    runningSince: dayList[0]?.day ?? null,
    tradingDays: dayList.length,
    profitDays: dayList.filter((x) => x.pnl > 0).length,
    curve,
    avgFloatingDrawdown: depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : null,
    deepestFloatingDrawdown: depths.length ? Math.max(...depths) : null,
    floatingSince: firsts[0] ? dayKey(firsts[0]) : null,
    floatingAllSince: firsts.length ? dayKey(firsts[firsts.length - 1]) : null,
    floatingUnrecorded: rows.length - firsts.length,
    floatingGaps: gaps,
  };
}

function cents(v) {
  return Math.round(v * 100) / 100;
}
