// Equity drawdown, carried forward one sync at a time.
//
// The peak is the highest equity seen since tracking began, adjusted for
// every deposit and withdrawal made after that. Without the adjustment,
// taking money out would read as a loss of the same size, and the "max
// drawdown" partners quote would be wrong forever after.
//
// THE PEAK IS SCALED, NOT SHIFTED. Moving money in or out leaves the
// account exactly as far below its peak, in percent, as it was. Shifting
// the peak by the amount instead would turn a withdrawal made during a
// drawdown into a deeper one: 10,000 peak, 8,000 equity (20%), withdraw
// 4,000, and a shifted peak of 6,000 reads 33%. Grid accounts nearly
// always carry floating loss, so that is most withdrawals.
//
// Credit is taken off equity first: it is the broker's money, not the
// account's, and it can be added or removed at will.

export function nextDrawdown(prev, { equity, credit = 0, cashFlow = 0, at }) {
  const eq = equity - (credit ?? 0);
  let peak;
  if (prev.peak === null || prev.peak === undefined) {
    peak = eq;
  } else if (cashFlow) {
    // Equity just before the money moved, assuming nothing else changed.
    const before = eq - cashFlow;
    peak = before > 0 ? Number(prev.peak) * (eq / before) : eq;
  } else {
    peak = Number(prev.peak);
  }
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
