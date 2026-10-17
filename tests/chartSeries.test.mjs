import { test } from "node:test";
import assert from "node:assert/strict";
import {
  thinSamples,
  equityPoints,
  balancePoints,
  niceScale,
  axisMoney,
  dayTicks,
  timeAxis,
  drawdownBands,
  deepestFloating,
} from "@/lib/chartSeries";
import { floatingDrawdownPct } from "@/lib/drawdown";

const MIN = 60_000;
const iso = (t) => new Date(t).toISOString();

// 30 days of 15-minute readings: balance 50,000, equity a gentle wave a
// little under it, with one sharp dip.
const START = Date.parse("2026-09-17T00:00:00Z");
const readings = Array.from({ length: 2880 }, (_, i) => ({
  t: START + i * 15 * MIN,
  balance: 50_000,
  equity: 50_000 - 100 - 50 * Math.sin(i / 20),
}));
readings[1234].equity = 47_500;

test("thinning keeps the first and last reading and at most maxPoints", () => {
  const thin = thinSamples(readings, 240);
  assert.equal(thin.length, 240);
  assert.equal(thin[0], readings[0]);
  assert.equal(thin[thin.length - 1], readings[readings.length - 1]);
  for (let i = 1; i < thin.length; i++) assert.ok(thin[i].t > thin[i - 1].t, "sorted by time");
});

test("thinning keeps each window's deepest real reading", () => {
  const thin = thinSamples(readings, 240);
  // Every plotted point is a reading, not an average.
  for (const p of thin) assert.ok(readings.includes(p));
  // The sharp dip survives.
  assert.ok(thin.includes(readings[1234]));
  // And within its window nothing shallower was picked instead: 2,878
  // middle readings across 238 windows is about 12 each.
  const s = thinSamples(
    [
      { t: 0, balance: 100, equity: 100 },
      { t: 1, balance: 100, equity: 99 },
      { t: 2, balance: 100, equity: 90 },
      { t: 3, balance: 100, equity: 98 },
      { t: 4, balance: 100, equity: 101 },
      { t: 5, balance: 100, equity: 97 },
      { t: 6, balance: 100, equity: 100 },
    ],
    4,
  );
  assert.deepEqual(s.map((p) => p.t), [0, 2, 5, 6]);
});

test("thinning measures depth against the balance, not equity alone", () => {
  // Equity is lower at t=1 but the balance fell with it; t=2 is deeper.
  const s = thinSamples(
    [
      { t: 0, balance: 100, equity: 100 },
      { t: 1, balance: 80, equity: 79 },
      { t: 2, balance: 100, equity: 90 },
      { t: 3, balance: 100, equity: 100 },
    ],
    3,
  );
  assert.deepEqual(s.map((p) => p.t), [0, 2, 3]);
});

test("a short series comes back as a copy", () => {
  const few = readings.slice(0, 10);
  const out = thinSamples(few);
  assert.deepEqual(out, few);
  assert.notEqual(out, few);
  assert.deepEqual(thinSamples([]), []);
});

test("equity rows become sorted points, and say when they were thinned", () => {
  const rows = [
    { at: "2026-10-17T10:15:00+00:00", balance: "50000", equity: "49900.5" },
    { at: "2026-10-17T10:00:00+00:00", balance: 50_000, equity: 49_950 },
    { at: "2026-10-17T10:30:00+00:00", balance: 50_000, equity: null },
  ];
  const { points, thinned } = equityPoints(rows);
  assert.deepEqual(points, [
    { t: Date.parse("2026-10-17T10:00:00Z"), balance: 50_000, equity: 49_950, credit: 0 },
    { t: Date.parse("2026-10-17T10:15:00Z"), balance: 50_000, equity: 49_900.5, credit: 0 },
  ]);
  assert.equal(thinned, false);
  const many = readings.map((r) => ({ at: iso(r.t), balance: r.balance, equity: r.equity }));
  const out = equityPoints(many);
  assert.equal(out.points.length, 240);
  assert.equal(out.thinned, true);
});

test("broker credit is taken off equity, as the Floating drawdown tile takes it", () => {
  const rows = [
    // MT5's equity includes the 500 credit: 49,700 of the account's own
    // money against a 50,000 balance is 300 of floating loss, not 200 of
    // profit.
    { at: "2026-10-17T10:00:00Z", balance: "50000", equity: "50200", credit: "500.00" },
    { at: "2026-10-17T10:15:00Z", balance: 50_000, equity: 49_900, credit: null },
    { at: "2026-10-17T10:30:00Z", balance: 50_000, equity: 49_950 },
    { at: "2026-10-17T10:45:00Z", balance: 50_000, equity: 49_990, credit: "" },
  ];
  const { points } = equityPoints(rows);
  assert.deepEqual(
    points.map((p) => [p.equity, p.credit]),
    [[49_700, 500], [49_900, 0], [49_950, 0], [49_990, 0]],
  );
  // The chart's floating is the tile's, reading for reading.
  rows.forEach((r, i) => {
    const p = points[i];
    assert.equal((p.balance - p.equity) / p.balance, floatingDrawdownPct(Number(r.balance), Number(r.equity), Number(r.credit ?? 0)));
  });
  // The worst moment is the credit-hidden one.
  assert.equal(deepestFloating(points).floating, -300);
  // And the credit hides no drawdown from the shading.
  assert.equal(drawdownBands(points).length, 1);
});

test("taking a credit off leaves no float dust to read as drawdown", () => {
  // 1000.3 - 0.1 is 1000.1999999999999 in floating point: a hair under the
  // balance, which would mark a "Deepest -$0.00".
  const { points } = equityPoints([
    { at: "2026-10-17T10:00:00Z", balance: "1000.2", equity: "1000.3", credit: "0.1" },
    { at: "2026-10-17T10:15:00Z", balance: "1000.2", equity: "1000.3", credit: "0.1" },
  ]);
  assert.equal(points[0].equity, 1000.2);
  assert.equal(deepestFloating(points), null);
  assert.deepEqual(drawdownBands(points), []);
});

test("balance points sit at the last second of their London day", () => {
  const points = balancePoints([
    { day: "2026-07-01", endBalance: 10_000, tradePnl: 0, cashFlow: 10_000, deposits: 10_000, withdrawals: 0 },
    { day: "2026-10-25", endBalance: 10_250, tradePnl: 250, cashFlow: 0, deposits: 0, withdrawals: 0 },
  ]);
  assert.equal(iso(points[0].t), "2026-07-01T22:59:59.000Z");
  // The clocks go back that night; the day ends at midnight UTC, 25 hours
  // after it began.
  assert.equal(iso(points[1].t), "2026-10-25T23:59:59.000Z");
  assert.deepEqual(points[0], {
    t: points[0].t,
    day: "2026-07-01",
    balance: 10_000,
    tradePnl: 0,
    cashFlow: 10_000,
    deposits: 10_000,
    withdrawals: 0,
  });
});

test("nice scales land on round figures with headroom", () => {
  // The old axis printed $49,350 / $50,400 / $51,450 for this range.
  assert.deepEqual(niceScale(49_350, 51_450), { min: 49_000, max: 52_000, step: 1000, ticks: [49_000, 50_000, 51_000, 52_000] });
  assert.deepEqual(niceScale(0, 9_400).ticks, [0, 2500, 5000, 7500, 10_000]);
  assert.deepEqual(niceScale(-1200, 300).ticks, [-1500, -1000, -500, 0, 500]);
  assert.deepEqual(niceScale(0.3, 0.7).ticks, [0.2, 0.4, 0.6, 0.8]);
  assert.equal(niceScale(1_234_567, 1_456_789).step, 100_000);
  // Every step is 1, 2, 2.5 or 5 times a power of ten.
  for (const [lo, hi] of [[49_350, 51_450], [3, 7], [12_345, 12_399], [0, 1e6], [-7, 13]]) {
    const { step, ticks, min, max } = niceScale(lo, hi);
    const m = step / 10 ** Math.floor(Math.log10(step));
    assert.ok([1, 2, 2.5, 5].some((n) => Math.abs(n - m) < 1e-9), `${step}`);
    assert.ok(ticks.length <= 5 && ticks.length >= 2);
    assert.ok(min <= lo && max > hi, `${lo}..${hi} inside ${min}..${max}`);
  }
});

test("a nice scale never dips below zero for a series that does not", () => {
  assert.equal(niceScale(0, 9_400).min, 0);
  assert.equal(niceScale(120, 5_000).min, 0);
});

test("a flat series and missing input still get an axis", () => {
  assert.deepEqual(niceScale(100, 100).ticks, [99, 99.5, 100, 100.5, 101]);
  assert.deepEqual(niceScale(50_000, 50_000).ticks, [49_500, 49_750, 50_000, 50_250, 50_500]);
  assert.deepEqual(niceScale(0, 0).ticks, [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(niceScale(NaN, Infinity).ticks, [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(niceScale(NaN, 100).ticks, niceScale(100, 100).ticks);
  assert.deepEqual(niceScale(300, -1200).ticks, niceScale(-1200, 300).ticks);
  assert.ok(niceScale(0, 100, 3).ticks.length <= 3);
  // Figures near the float limit still return.
  assert.ok(niceScale(-1e308, 1e308).ticks.length >= 2);
});

test("axis labels are short and neighbouring ticks never print the same", () => {
  for (const step of [50, 250, 500, 1000, 2500]) {
    const ticks = Array.from({ length: 6 }, (_, i) => 50_000 + i * step);
    const top = ticks[ticks.length - 1];
    const labels = ticks.map((v) => axisMoney(v, "USD", step, top));
    assert.equal(new Set(labels).size, labels.length, labels.join(" "));
    for (const l of labels) assert.ok(l.length <= 7, l);
  }
  assert.equal(axisMoney(50_250, "USD", 250), "$50.25k");
  assert.equal(axisMoney(50_500, "USD", 500), "$50.5k");
  assert.equal(axisMoney(50_000, "USD", 500), "$50k");
  assert.equal(axisMoney(1_200_000, "USD", 100_000), "$1.2M");
  assert.equal(axisMoney(1_250_000, "USD", 50_000), "$1.25M");
  assert.equal(axisMoney(-12_500, "GBP", 2500), "-£12.5k");
});

test("below 10,000 the axis shows the full amount", () => {
  assert.equal(axisMoney(9_500, "USD", 500), "$9,500");
  assert.equal(axisMoney(9_050, "USD", 50), "$9,050");
  assert.equal(axisMoney(100.25, "EUR", 0.25), "€100.25");
  assert.equal(axisMoney(100, "EUR", 0.5), "€100.00");
  // A step with a fraction shows it, rather than rounding 7.5 to $8.
  assert.equal(axisMoney(7.5, "USD", 2.5), "$7.50");
  assert.equal(axisMoney(10, "USD", 2.5), "$10.00");
});

// The axis TimeChart draws for a series: niceScale's ticks, each through
// axisMoney with the same step and top.
function axisLabels(lo, hi, currency = "USD") {
  const y = niceScale(lo, hi, 6);
  const top = Math.max(Math.abs(y.min), Math.abs(y.max));
  return { y, labels: y.ticks.map((v) => axisMoney(v, currency, y.step, top)) };
}

// A label read back as the amount it stands for.
function amountOf(label) {
  const unit = label.endsWith("M") ? 1e6 : label.endsWith("k") ? 1e3 : 1;
  return Number(label.replace(/[^0-9.-]/g, "")) * unit;
}

test("a few cents of floating on a large balance reads in full, every label distinct", () => {
  // Balance flat at 28,969.77 and equity a few cents under it. The old
  // axis printed $28.9697k for the first three ticks.
  const { y, labels } = axisLabels(28_969.7, 28_969.77);
  assert.deepEqual(y, {
    min: 28_969.68,
    max: 28_969.78,
    step: 0.02,
    ticks: [28_969.68, 28_969.7, 28_969.72, 28_969.74, 28_969.76, 28_969.78],
  });
  assert.deepEqual(labels, ["$28,969.68", "$28,969.70", "$28,969.72", "$28,969.74", "$28,969.76", "$28,969.78"]);
  assert.deepEqual(axisLabels(28_969.74, 28_969.77).labels, ["$28,969.73", "$28,969.74", "$28,969.75", "$28,969.76", "$28,969.77", "$28,969.78"]);
  // A step of a few whole units on a compact axis reads in full too, not
  // $28.965k.
  assert.equal(axisMoney(28_965, "USD", 5, 28_990), "$28,965");
  // And at or above 1% of the unit it stays compact.
  assert.equal(axisMoney(28_960, "USD", 10, 29_000), "$28.96k");
  assert.equal(axisMoney(1_205_000, "USD", 5_000, 1_250_000), "$1,205,000");
  assert.equal(axisMoney(1_210_000, "USD", 10_000, 1_250_000), "$1.21M");
});

test("every axis prints distinct labels that read back as their ticks", () => {
  const levels = [0, 123.45, 9_999.99, 10_000, 28_969.77, 50_000, 99_999.99, 1_234_567.89, 25_000_000];
  const ranges = [0, 0.01, 0.03, 0.07, 0.5, 1, 3, 7.5, 37, 250, 1_234, 40_000, 2_500_000];
  for (const level of levels) {
    for (const range of ranges) {
      const { y, labels } = axisLabels(level - range, level);
      assert.equal(new Set(labels).size, labels.length, `${level} - ${range}: ${labels.join(" ")}`);
      y.ticks.forEach((t, i) => {
        assert.ok(Math.abs(amountOf(labels[i]) - t) < 1e-6 * Math.max(1, Math.abs(t)), `${labels[i]} for ${t}`);
      });
    }
  }
});

test("one form for every tick on an axis that crosses 10,000", () => {
  const { ticks, step, max } = niceScale(0, 14_000);
  const labels = ticks.map((v) => axisMoney(v, "USD", step, max));
  assert.deepEqual(labels, ["$0", "$5k", "$10k", "$15k"]);
});

test("an unknown currency shows its code", () => {
  assert.equal(axisMoney(50_500, "USDT", 500), "USDT 50.5k");
  assert.equal(axisMoney(2_000, "USDT", 500), "USDT 2,000");
  assert.equal(axisMoney(NaN, "USD", 500), "-");
});

test("30 days of ticks fall on London Mondays", () => {
  const { ticks, monthly } = dayTicks(Date.parse("2026-09-17T10:00:00Z"), Date.parse("2026-10-17T10:00:00Z"));
  assert.equal(monthly, false);
  assert.deepEqual(ticks.map(iso), [
    "2026-09-20T23:00:00.000Z",
    "2026-09-27T23:00:00.000Z",
    "2026-10-04T23:00:00.000Z",
    "2026-10-11T23:00:00.000Z",
  ]);
});

test("day ticks stay on London midnight across the clock change", () => {
  // The clocks go back at 02:00 BST on Sunday 25 October 2026.
  const { ticks } = dayTicks(Date.parse("2026-10-20T00:00:00Z"), Date.parse("2026-10-30T00:00:00Z"));
  assert.deepEqual(ticks.map(iso), [
    "2026-10-21T23:00:00.000Z",
    "2026-10-23T23:00:00.000Z",
    "2026-10-26T00:00:00.000Z",
    "2026-10-28T00:00:00.000Z",
    "2026-10-30T00:00:00.000Z",
  ]);
  // And forward in March.
  const spring = dayTicks(Date.parse("2026-03-27T12:00:00Z"), Date.parse("2026-03-31T12:00:00Z")).ticks;
  assert.deepEqual(spring.map(iso), [
    "2026-03-28T00:00:00.000Z",
    "2026-03-29T00:00:00.000Z",
    "2026-03-29T23:00:00.000Z",
    "2026-03-30T23:00:00.000Z",
  ]);
});

test("day ticks never exceed maxTicks", () => {
  const from = Date.parse("2024-01-15T00:00:00Z");
  for (const days of [1, 3, 10, 30, 90, 200, 400, 1500, 4000]) {
    for (const max of [4, 6]) {
      const { ticks } = dayTicks(from, from + days * 86_400_000, max);
      assert.ok(ticks.length <= max, `${days} days, ${ticks.length} ticks`);
      if (days >= 3) assert.ok(ticks.length >= 2, `${days} days, ${ticks.length} ticks`);
    }
  }
  assert.deepEqual(dayTicks(NaN, 5), { ticks: [], monthly: false });
  assert.deepEqual(dayTicks(10, 5), { ticks: [], monthly: false });
});

test("long spans step by months from the 1st", () => {
  const { ticks, monthly } = dayTicks(Date.parse("2025-01-10T00:00:00Z"), Date.parse("2026-10-17T00:00:00Z"));
  assert.equal(monthly, true);
  assert.deepEqual(ticks.map(iso), ["2025-06-30T23:00:00.000Z", "2026-01-01T00:00:00.000Z", "2026-06-30T23:00:00.000Z"]);
});

test("a fortnight step across the October clock change still reads as days", () => {
  // Two months from 1 October: 14-day steps, the first of them 14 days
  // and an hour apart because the clocks go back on 25 October. The old
  // axis took that hour for a month step and read Oct, Oct, Nov, Nov.
  const from = Date.parse("2026-10-01T12:00:00Z");
  const to = Date.parse("2026-12-01T12:00:00Z");
  const { ticks, monthly } = dayTicks(from, to);
  assert.equal(monthly, false);
  assert.deepEqual(ticks.map(iso), [
    "2026-10-11T23:00:00.000Z",
    "2026-10-26T00:00:00.000Z",
    "2026-11-09T00:00:00.000Z",
    "2026-11-23T00:00:00.000Z",
  ]);
  assert.equal(ticks[1] - ticks[0], 14 * 86_400_000 + 3_600_000);
  const axis = timeAxis(from, to);
  assert.deepEqual(axis.ticks.map(axis.label), ["12 Oct", "26 Oct", "9 Nov", "23 Nov"]);
});

test("the time axis labels days, months and years", () => {
  const days = timeAxis(Date.parse("2026-09-17T10:00:00Z"), Date.parse("2026-10-17T10:00:00Z"));
  assert.deepEqual(days.ticks.map(days.label), ["21 Sept", "28 Sept", "5 Oct", "12 Oct"]);
  assert.deepEqual(days.domain, [Date.parse("2026-09-17T10:00:00Z"), Date.parse("2026-10-17T10:00:00Z")]);
  const months = timeAxis(Date.parse("2025-01-10T00:00:00Z"), Date.parse("2026-10-17T00:00:00Z"));
  assert.deepEqual(months.ticks.map(months.label), ["Jul", "2026", "Jul"]);
  // Four and a half months read in months, not four-week steps.
  const summer = timeAxis(Date.parse("2026-06-01T22:59:59Z"), Date.parse("2026-10-16T22:59:59Z"));
  assert.deepEqual(summer.ticks.map(summer.label), ["Jul", "Aug", "Sept", "Oct"]);
});

test("the time axis for under a day, and for one reading", () => {
  // No midnight in the span: the first and last London times.
  const hours = timeAxis(Date.parse("2026-10-17T08:00:00Z"), Date.parse("2026-10-17T14:30:00Z"));
  assert.deepEqual(hours.ticks.map(hours.label), ["09:00", "15:30"]);
  // One midnight: that day.
  const overnight = timeAxis(Date.parse("2026-10-17T19:00:00Z"), Date.parse("2026-10-18T13:00:00Z"));
  assert.deepEqual(overnight.ticks.map(overnight.label), ["18 Oct"]);
  // One reading: centred, with its date.
  const t = Date.parse("2026-10-17T22:59:59Z");
  const one = timeAxis(t, t);
  assert.deepEqual(one.domain, [t - 43_200_000, t + 43_200_000]);
  assert.deepEqual(one.ticks.map(one.label), ["17 Oct"]);
});

test("the time axis drops a tick that would hang off the end", () => {
  // Midnight starting 18 Oct is 30 minutes before the last reading.
  const axis = timeAxis(Date.parse("2026-09-21T10:00:00Z"), Date.parse("2026-10-17T23:30:00Z"));
  assert.ok(!axis.ticks.map(iso).includes("2026-10-17T23:00:00.000Z"));
});

test("drawdown shading follows the balance step and the equity line", () => {
  const bands = drawdownBands([
    { t: 0, balance: 100, equity: 100 },
    { t: 10, balance: 100, equity: 90 },
    // A basket closed in profit: the balance steps up.
    { t: 20, balance: 110, equity: 95 },
    { t: 30, balance: 110, equity: 120 },
    { t: 40, balance: 110, equity: 100 },
  ]);
  assert.deepEqual(bands, [
    // Top edge: the balance, stepping at t=20. Bottom: equity, back to the
    // start. Closes where equity crosses 110, at t=26.
    [[0, 100], [10, 100], [20, 100], [20, 110], [26, 110], [26, 110], [20, 95], [10, 90], [0, 100]],
    // Opens where equity falls back through 110, at t=35.
    [[35, 110], [40, 110], [40, 100], [35, 110]],
  ]);
});

test("floating profit is never shaded", () => {
  assert.deepEqual(
    drawdownBands([
      { t: 0, balance: 100, equity: 101 },
      { t: 10, balance: 100, equity: 105 },
      { t: 20, balance: 100, equity: 100 },
    ]),
    [],
  );
});

test("a losing close ends the shading on the step", () => {
  // The basket closes at t=10 for -10: the balance drops to equity.
  const bands = drawdownBands([
    { t: 0, balance: 100, equity: 92 },
    { t: 10, balance: 90, equity: 90 },
    { t: 20, balance: 90, equity: 91 },
  ]);
  assert.deepEqual(bands, [[[0, 100], [10, 100], [10, 90], [0, 92]]]);
});

test("a gap in the readings breaks the shading", () => {
  const bands = drawdownBands([
    { t: 0, balance: 100, equity: 90 },
    { t: 10, balance: 100, equity: NaN },
    { t: 20, balance: 100, equity: 90 },
    { t: 30, balance: 100, equity: 90 },
  ]);
  assert.deepEqual(bands, [[[20, 100], [30, 100], [30, 90], [20, 90]]]);
  assert.deepEqual(drawdownBands([]), []);
  assert.deepEqual(drawdownBands([{ t: 0, balance: 100, equity: 50 }]), []);
});

test("the deepest floating drawdown", () => {
  assert.deepEqual(deepestFloating(thinSamples(readings)), {
    t: readings[1234].t,
    balance: 50_000,
    equity: 47_500,
    floating: -2_500,
  });
  assert.equal(deepestFloating([{ t: 0, balance: 100, equity: 100 }, { t: 1, balance: 100, equity: 120 }]), null);
  assert.equal(deepestFloating([]), null);
});
