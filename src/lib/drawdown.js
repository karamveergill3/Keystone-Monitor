// Equity drawdown, carried forward one sync at a time.
//
// The peak is the highest equity seen since tracking began, moved by every
// deposit and withdrawal made after that. Without the adjustment, taking
// money out would read as a loss of the same size, and the "max drawdown"
// partners quote would be wrong forever after.
//
// THE PEAK MOVES BY THE AMOUNT, NOT IN PROPORTION, and that is a choice.
// Withdrawing 4,000 from an account at 10,000 peak and 8,000 equity leaves
// the same 2,000 open loss on 6,000 of capital: 33%, which is also exactly
// what Floating drawdown shows on the same screen. Scaling the peak would
// keep the max at 20% beside a floating figure of 33%, a max below the
// drawdown happening right now. The time-weighted, flow-neutral measure is
// the day-end drawdown in reports (maxDailyDrawdown in accountStats.js).
//
// Credit is taken off equity first: it is the broker's money, not the
// account's, and it can be added or removed at will.

export function nextDrawdown(prev, { equity, credit = 0, cashFlow = 0, at }) {
  const eq = equity - (credit ?? 0);
  let peak = prev.peak === null || prev.peak === undefined ? eq : Number(prev.peak) + cashFlow;
  if (eq > peak) peak = eq;

  const dd = peak > 0 ? Math.max(0, (peak - eq) / peak) : 0;
  const prevMax = Number(prev.maxDrawdownPct ?? 0);

  if (dd > prevMax) {
    return { peak, drawdownPct: dd, maxDrawdownPct: dd, maxDrawdownAt: at };
  }
  return {
    peak,
    drawdownPct: dd,
    maxDrawdownPct: prevMax,
    maxDrawdownAt: prev.maxDrawdownAt ?? null,
  };
}

// Open-trade drawdown right now: how far the account's own equity sits
// below its balance. Broker credit is not the account's money, so it is
// taken off equity first, or a credit would hide a floating loss as big
// as itself.
export function floatingDrawdownPct(balance, equity, credit = 0) {
  if (!(balance > 0) || equity === null || equity === undefined) return 0;
  return Math.max(0, (balance - (equity - (credit ?? 0))) / balance);
}
