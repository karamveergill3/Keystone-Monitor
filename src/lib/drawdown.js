// Equity drawdown, carried forward one sync at a time.
//
// The peak is the highest equity seen since tracking began, moved by every
// deposit and withdrawal made after that. Without the adjustment, taking
// money out of an account would read as a loss of the same size, and the
// "max drawdown" figure partners quote would be wrong forever after.
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

// Open-trade drawdown right now: how far equity sits below balance.
export function floatingDrawdownPct(balance, equity) {
  if (!(balance > 0) || equity === null || equity === undefined) return 0;
  return Math.max(0, (balance - equity) / balance);
}
