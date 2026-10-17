// Every figure on the account, project and report screens, worked out from
// the account_daily view and the account's current balance.
//
// ONE IMPLEMENTATION. The screens and the PDFs both come through here, so a
// figure on paper can never disagree with the same figure on screen.
//
// BALANCES ARE WALKED BACK FROM TODAY. The balance at any past moment is
// today's balance less everything that happened since. That stays right
// even when the terminal only ever sent part of its history, which a
// running total built forwards from the first stored deal would not.
//
// GAIN IS TIME-WEIGHTED, the way Myfxbook's "Gain" is: each day's trading
// P&L over the balance it started with, chained. Deposits and withdrawals
// move the balance without moving the gain, so an account that doubled its
// money and then had half of it withdrawn still reads +100%.

import { weekStart, monthStart } from "./days.js";

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

// Rows from account_daily, as numbers, oldest first.
export function normaliseDaily(rows) {
  return (rows ?? [])
    .map((r) => ({
      accountId: r.account_id,
      day: String(r.day).slice(0, 10),
      tradePnl: n(r.trade_pnl),
      cashFlow: n(r.cash_flow),
      // Kept apart from cash_flow, which nets them, so a day with a deposit
      // and a withdrawal reports both. Older rows without the columns fall
      // back to the net's sign.
      deposits: r.deposits === undefined ? Math.max(0, n(r.cash_flow)) : n(r.deposits),
      withdrawals: r.withdrawals === undefined ? Math.min(0, n(r.cash_flow)) : n(r.withdrawals),
      closed: n(r.closed),
      wins: n(r.wins),
      losses: n(r.losses),
      grossProfit: n(r.gross_profit),
      grossLoss: n(r.gross_loss),
      lots: n(r.lots),
    }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// Each day with its opening and closing balance and its return.
//
// A deposit is assumed to arrive before that day's trading and a
// withdrawal after it, so a first day that is funded and traded on returns
// its P&L over the deposit rather than over zero.
export function dailyReturns(daily, currentBalance) {
  if (currentBalance === null || currentBalance === undefined) return [];
  const out = new Array(daily.length);
  let running = n(currentBalance);
  for (let i = daily.length - 1; i >= 0; i--) {
    const d = daily[i];
    const endBalance = running;
    const startBalance = endBalance - d.tradePnl - d.cashFlow;
    const base = startBalance + d.deposits;
    out[i] = { ...d, startBalance, endBalance, ret: base > 0 ? d.tradePnl / base : 0 };
    running = startBalance;
  }
  return out;
}

export function chainGain(returns) {
  let index = 1;
  for (const r of returns) index *= 1 + r.ret;
  return index - 1;
}

// Largest fall of the gain index from its own high, day end to day end.
// Built on returns rather than balances so withdrawals do not count.
export function maxDailyDrawdown(returns) {
  let index = 1;
  let peak = 1;
  let worst = 0;
  for (const r of returns) {
    index *= 1 + r.ret;
    if (index > peak) peak = index;
    const dd = peak > 0 ? (peak - index) / peak : 0;
    if (dd > worst) worst = dd;
  }
  return worst;
}

function sumWhere(daily, pred) {
  let s = 0;
  for (const d of daily) if (pred(d.day)) s += d.tradePnl + d.cashFlow;
  return s;
}

// Balance at the start of a London day.
export function balanceAtStart(daily, currentBalance, key) {
  if (currentBalance === null || currentBalance === undefined) return null;
  return n(currentBalance) - sumWhere(daily, (day) => day >= key);
}

// Balance at the end of a London day.
export function balanceAtEnd(daily, currentBalance, key) {
  if (currentBalance === null || currentBalance === undefined) return null;
  return n(currentBalance) - sumWhere(daily, (day) => day > key);
}

// Everything a report or a screen says about one stretch of days. from and
// to are both included; either may be null for "no limit".
export function summarise(daily, currentBalance, { from = null, to = null } = {}) {
  const inRange = (day) => (!from || day >= from) && (!to || day <= to);
  const returns = dailyReturns(daily, currentBalance).filter((r) => inRange(r.day));

  let tradePnl = 0, deposits = 0, withdrawals = 0;
  let closed = 0, wins = 0, losses = 0, grossProfit = 0, grossLoss = 0, lots = 0;
  let best = null, worst = null, tradingDays = 0;
  for (const r of returns) {
    tradePnl += r.tradePnl;
    deposits += r.deposits;
    withdrawals += r.withdrawals;
    closed += r.closed;
    wins += r.wins;
    losses += r.losses;
    grossProfit += r.grossProfit;
    grossLoss += r.grossLoss;
    lots += r.lots;
    if (r.closed > 0 || r.tradePnl !== 0) {
      tradingDays++;
      if (!best || r.tradePnl > best.tradePnl) best = r;
      if (!worst || r.tradePnl < worst.tradePnl) worst = r;
    }
  }

  const startBalance = from
    ? balanceAtStart(daily, currentBalance, from)
    : returns.length ? returns[0].startBalance : (currentBalance ?? null);
  const endBalance = to ? balanceAtEnd(daily, currentBalance, to) : (currentBalance ?? null);

  return {
    startBalance,
    endBalance,
    tradePnl,
    deposits,
    withdrawals,
    gain: chainGain(returns),
    maxDrawdown: maxDailyDrawdown(returns),
    closed,
    wins,
    losses,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    grossProfit,
    grossLoss,
    lots,
    tradingDays,
    bestDay: best ? { day: best.day, pnl: best.tradePnl } : null,
    worstDay: worst ? { day: worst.day, pnl: worst.tradePnl } : null,
  };
}

// Today, this week (from Monday) and this month, each as P&L and gain.
export function periodFigures(daily, currentBalance, today) {
  const at = (from) => {
    const s = summarise(daily, currentBalance, { from, to: today });
    return { pnl: s.tradePnl, gain: s.gain };
  };
  const all = summarise(daily, currentBalance);
  return {
    today: at(today),
    week: at(weekStart(today)),
    month: at(monthStart(today)),
    all: { pnl: all.tradePnl, gain: all.gain },
  };
}

// Days rolled up into weeks or months, newest first.
export function groupPeriods(daily, currentBalance, unit) {
  return groupReturns(dailyReturns(daily, currentBalance), unit);
}

// The same, over day returns already worked out (and perhaps filtered to
// a range, so a month cut by the range counts only its days inside it).
export function groupReturns(returns, unit) {
  const keyOf = unit === "week" ? weekStart : unit === "month" ? monthStart : (d) => d;
  const groups = new Map();
  for (const r of returns) {
    const k = keyOf(r.day);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.entries()]
    .map(([key, rs]) => ({
      key,
      pnl: rs.reduce((s, r) => s + r.tradePnl, 0),
      cashFlow: rs.reduce((s, r) => s + r.cashFlow, 0),
      gain: chainGain(rs),
      closed: rs.reduce((s, r) => s + r.closed, 0),
      startBalance: rs[0].startBalance,
      endBalance: rs[rs.length - 1].endBalance,
    }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

// The closing balance of every day with a deal, for the balance chart.
export function balanceCurve(daily, currentBalance) {
  return dailyReturns(daily, currentBalance).map((r) => ({ day: r.day, balance: r.endBalance }));
}
