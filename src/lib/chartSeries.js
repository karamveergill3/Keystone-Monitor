// What the account page's charts plot, and how their axes read.
//
// Pure, so the page can thin the equity samples on the server (240 points
// cross the wire instead of 2,880) and the chart components can lay out
// their axes on the client from the same functions the tests check.
//
// THE MODEL BEHIND THE LINES. Balance only moves when a deal closes, so it
// is a step: each reading's balance holds until the next reading. Equity
// floats continuously, so it is a straight line from reading to reading.
// The drawdown shading follows both exactly (see drawdownBands).

import { dayKey, addDays, addMonths, monthStart, londonMidnight } from "./days.js";
import { money } from "./format.js";

const DAY = 86_400_000;

function num(value) {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(value);
}

// Equity less balance. A reading missing either sorts as the shallowest,
// so it is never picked to stand for its window.
function floating(s) {
  const f = s.equity - s.balance;
  return Number.isFinite(f) ? f : Infinity;
}

// Fewer points for a long series without hiding a drawdown. The span is cut
// into equal stretches of time and each keeps its one deepest reading
// (lowest equity less balance), so every plotted point is a real reading
// and the worst moment of each stretch survives. Averaging, or keeping
// every nth reading, would shave the dips a grid bot is watched for.
// Equal time rather than equal counts keeps a stretch the EA was offline
// looking empty instead of borrowing readings from either side.
export function thinSamples(samples, maxPoints = 240) {
  const list = samples ?? [];
  if (list.length <= maxPoints) return list.slice();
  const first = list[0];
  const last = list[list.length - 1];
  const buckets = Math.max(1, maxPoints - 2);
  const span = last.t - first.t;
  const picks = new Array(buckets).fill(null);
  for (let i = 1; i < list.length - 1; i++) {
    const s = list[i];
    // Every reading at one instant has no span to cut; share them out by
    // position instead.
    const at = span > 0 ? (s.t - first.t) / span : (i - 1) / (list.length - 2);
    const b = Math.min(buckets - 1, Math.max(0, Math.floor(at * buckets)));
    if (picks[b] === null || floating(s) < floating(picks[b])) picks[b] = s;
  }
  return [first, ...picks.filter(Boolean), last];
}

// Rows from equity_samples as chart points, oldest first and thinned.
// thinned says whether any reading was dropped, so the chart can say how
// the rest were chosen.
//
// equity is the account's own equity: MT5's equity less broker credit,
// which is the broker's money and can be added or taken away at will. Left
// in, a credit would plot as floating profit and hide a drawdown as big as
// itself, and the chart would disagree with the Floating drawdown tile
// (floatingDrawdownPct in drawdown.js takes credit off the same way).
// credit is kept on each point so the chart can say it was taken off; a
// row without one has none.
export function equityPoints(rows, maxPoints = 240) {
  const all = (rows ?? [])
    .map((r) => {
      const credit = Number.isFinite(num(r.credit)) ? num(r.credit) : 0;
      const equity = num(r.equity);
      // Rounded to 12 figures, so taking a credit off does not leave float
      // dust that reads as a fraction of a cent of drawdown.
      const own = credit === 0 ? equity : Number((equity - credit).toPrecision(12));
      return { t: Date.parse(r.at), balance: num(r.balance), equity: own, credit };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.balance) && Number.isFinite(p.equity))
    .sort((a, b) => a.t - b.t);
  const points = thinSamples(all, maxPoints);
  return { points, thinned: points.length < all.length };
}

// dailyReturns() rows as balance chart points, one per day with a deal.
// Each sits at the last second of its London day, because endBalance is
// what the day closed on; the next midnight is worked out rather than
// assumed 24 hours on, which the clock changes make wrong twice a year.
export function balancePoints(returns) {
  return (returns ?? []).map((r) => ({
    t: londonMidnight(addDays(r.day, 1)).getTime() - 1000,
    day: r.day,
    balance: r.endBalance,
    tradePnl: r.tradePnl,
    cashFlow: r.cashFlow,
    deposits: r.deposits,
    withdrawals: r.withdrawals,
  }));
}

const MAX_DECIMALS = 20;

// The fewest decimals that write x exactly, once it is rounded to 12
// significant figures to shed float dust (0.1 + 0.2 is 0.3, not
// 0.30000000000000004). Past that rounding the test is exact: a tolerance
// relative to the size of x would call 28.96968 "28.9697", and an axis of
// cents on a 28,969 balance would print the same label three times.
function decimalsFor(x) {
  const r = Number(Math.abs(x).toPrecision(12));
  if (!Number.isFinite(r) || r === 0) return 0;
  for (let d = 0; d < MAX_DECIMALS; d++) {
    // r carries at most 12 significant figures, so r * 10^d does too, and
    // rounding it to 12 again leaves an integer exactly when r needs no
    // more than d decimals.
    if (Number.isInteger(Number((r * 10 ** d).toPrecision(12)))) return d;
  }
  return MAX_DECIMALS;
}

const NICE = [1, 2, 2.5, 5];

// A y axis that lands on round figures: ticks every 1, 2, 2.5 or 5 times a
// power of ten, at most maxTicks of them, spanning min..max with about 5%
// headroom each side so a line never runs along the frame. A series that
// never goes below zero never gets an axis that does: a balance axis
// reaching -$500 reads as an overdraft.
export function niceScale(min, max, maxTicks = 5) {
  let lo = Number.isFinite(min) ? min : Number.isFinite(max) ? max : 0;
  let hi = Number.isFinite(max) ? max : lo;
  if (lo > hi) [lo, hi] = [hi, lo];
  const nonNegative = lo >= 0;
  // A flat series gets a window around it, so it sits mid-plot rather than
  // on a zero-height axis.
  const pad = hi === lo ? (lo === 0 ? 1 : Math.abs(lo) * 0.01) : (hi - lo) * 0.05;
  lo -= pad;
  hi += pad;
  if (nonNegative) lo = Math.max(0, lo);

  const most = Math.max(2, Math.floor(maxTicks));
  let exp = Math.floor(Math.log10((hi - lo) / (most - 1)));
  // A step ten times wider always fits, so a few decades settle it; the
  // cap only stops figures near the float limit from spinning forever.
  for (let tries = 0; tries < 40; tries++, exp++) {
    for (const m of NICE) {
      const step = Number((m * 10 ** exp).toPrecision(12));
      const d = decimalsFor(step);
      const start = Number((Math.floor(lo / step + 1e-9) * step).toFixed(d));
      const end = Number((Math.ceil(hi / step - 1e-9) * step).toFixed(d));
      const count = Math.round((end - start) / step) + 1;
      if (count <= most) {
        const ticks = Array.from({ length: count }, (_, i) => Number((start + i * step).toFixed(d)));
        return { min: start, max: end, step, ticks };
      }
    }
  }
  return { min: lo, max: hi, step: hi - lo, ticks: [lo, hi] };
}

// Short labels for a money axis. Below 10,000 the amount in full ($9,500);
// from there compact ($50.25k, $1.2M), with only as many decimals as the
// step needs, so neighbouring ticks never print the same and round ones
// stay short. top is the largest tick on the axis: passing it makes every
// tick take the same form, rather than $9,000 sitting under $10k.
//
// A step under 1% of the compact unit goes back to full amounts: a few
// cents of floating on a 28,969.77 balance reads $28,969.74, not
// $28.96974k. Ticks are assumed to be multiples of step, as niceScale
// gives them, which is what keeps every label exact and so distinct.
export function axisMoney(value, currency = "USD", step = 1, top = value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "-";
  const s = Number.isFinite(step) && step > 0 ? step : 1;
  const size = Math.max(Math.abs(v), Math.abs(Number(top) || 0));
  const [unit, suffix] = size >= 1_000_000 ? [1_000_000, "M"] : [1_000, "k"];
  if (size < 10_000 || v === 0 || s < unit / 100) {
    // Whole units for a whole step, otherwise at least cents and as many
    // more as the step has. Zero reads $0 on a compact axis too, not $0k.
    const stepDecimals = decimalsFor(s);
    return money(v, currency, { decimals: stepDecimals === 0 ? 0 : Math.max(2, stepDecimals) });
  }
  const scaled = v / unit;
  const most = decimalsFor(s / unit);
  let d = 0;
  while (d < most && decimalsFor(scaled) > d) d++;
  return `${money(scaled, currency, { decimals: d })}${suffix}`;
}

function mod(a, n) {
  return ((a % n) + n) % n;
}

function dayNumber(key) {
  return Math.round(Date.parse(`${key}T00:00:00Z`) / DAY);
}

// No four-week step: past a fortnight, people read a long axis in months.
const DAY_STEPS = [1, 2, 7, 14];
const MONTH_STEPS = [1, 2, 3, 6, 12, 24, 60, 120];

// Instants for the x axis: London midnights inside tMin..tMax, every k
// days for the smallest k (1, 2, 7 or 14 days, then 1, 2, 3, 6 or 12
// months and on) that gives at most maxTicks. Steps of a week or more fall
// on Mondays, where the app's weeks start; month steps on the 1st. Ticks
// are anchored to the calendar, not to tMin, so they do not slide along
// as new readings arrive.
//
// Returns { ticks, monthly }: monthly says a month step was chosen, so the
// labels need not guess it from the spacing, which a clock change throws
// out (a fortnight across the October change is 14 days and an hour).
export function dayTicks(tMin, tMax, maxTicks = 6) {
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax < tMin) return { ticks: [], monthly: false };
  const firstKey = dayKey(tMin);
  const lastKey = dayKey(tMax);
  const inside = (t) => t >= tMin && t <= tMax;

  // Listing the days is only worth it when a day step could fit.
  if (tMax - tMin <= (maxTicks + 1) * 14 * DAY) {
    const days = [];
    for (let k = firstKey; k <= lastKey; k = addDays(k, 1)) {
      const t = londonMidnight(k).getTime();
      if (inside(t)) days.push({ t, n: dayNumber(k) });
    }
    for (const step of DAY_STEPS) {
      // Day 4 of the Unix epoch, 5 January 1970, was a Monday.
      const offset = step >= 7 ? 4 : 0;
      const picked = days.filter((d) => mod(d.n - offset, step) === 0);
      if (picked.length <= maxTicks) return { ticks: picked.map((d) => d.t), monthly: false };
    }
  }
  let picked = [];
  for (const step of MONTH_STEPS) {
    picked = [];
    for (let k = monthStart(firstKey); k <= lastKey; k = addMonths(k, 1)) {
      const [y, m] = k.split("-").map(Number);
      if (mod(y * 12 + m - 1, step) !== 0) continue;
      const t = londonMidnight(k).getTime();
      if (inside(t)) picked.push(t);
    }
    if (picked.length <= maxTicks) break;
  }
  return { ticks: picked, monthly: true };
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Europe/London" });
const yearFormat = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Europe/London" });
const hourFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/London" });

// The x axis for a span: its domain, the ticks from dayTicks, and the label
// each tick reads. Days read "17 Oct"; month steps read "Oct", and January
// its year, so a long history still says which year it is in. Ticks
// within 5% of either end are dropped (when two others are left): their
// labels would hang off the plot. A span with no midnight in it is under
// a day, so its first and last readings are labelled with their London
// time instead; a single reading gets half a day either side and its date.
export function timeAxis(tMin, tMax, maxTicks = 6) {
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return { domain: [0, 1], ticks: [], label: () => "" };
  if (tMax <= tMin) {
    return { domain: [tMin - DAY / 2, tMin + DAY / 2], ticks: [tMin], label: (t) => dayFormat.format(t) };
  }
  const domain = [tMin, tMax];
  const { ticks: all, monthly } = dayTicks(tMin, tMax, maxTicks);
  if (all.length === 0) return { domain, ticks: [tMin, tMax], label: (t) => hourFormat.format(t) };
  const edge = (tMax - tMin) * 0.05;
  const clear = all.filter((t) => t - tMin >= edge && tMax - t >= edge);
  const ticks = clear.length >= 2 ? clear : all;
  const label = (t) => {
    if (!monthly) return dayFormat.format(t);
    return monthFormat.format(t) === "Jan" ? yearFormat.format(t) : monthFormat.format(t);
  };
  return { domain, ticks, label };
}

// The floating drawdown as polygons to shade, in data units: [t, value]
// corners, top edge forwards then bottom edge back. Over each gap between
// readings the balance holds at the earlier reading's value (the step the
// balance line draws) and equity runs straight to the next reading (the
// line the equity line draws), so the shading meets both lines exactly.
// Where equity crosses the balance the polygon closes at the crossing,
// and where a closed deal moves the balance the edge steps with it, so
// floating profit is never shaded as drawdown.
export function drawdownBands(samples) {
  const list = samples ?? [];
  const bands = [];
  let top = null;
  let bottom = null;
  const open = (t, b, e) => {
    top = [[t, b]];
    bottom = [[t, e]];
  };
  const close = () => {
    if (top) bands.push([...top, ...bottom.reverse()]);
    top = bottom = null;
  };
  for (let i = 0; i + 1 < list.length; i++) {
    const { t: t0, balance: b, equity: e0 } = list[i];
    const { t: t1, equity: e1 } = list[i + 1];
    if (![t0, t1, b, e0, e1].every(Number.isFinite) || t1 <= t0) {
      close();
      continue;
    }
    const d0 = b - e0;
    const d1 = b - e1;
    const crossing = () => t0 + ((t1 - t0) * d0) / (d0 - d1);
    if (d0 > 0) {
      // Still in drawdown from the last gap: the top edge steps to this
      // reading's balance if a deal moved it. Otherwise one starts here.
      if (!top) open(t0, b, e0);
      else if (top[top.length - 1][1] !== b) top.push([t0, b]);
      if (d1 > 0) {
        top.push([t1, b]);
        bottom.push([t1, e1]);
      } else {
        const tc = crossing();
        top.push([tc, b]);
        bottom.push([tc, b]);
        close();
      }
    } else {
      // Equity is at or above the balance here. A drawdown carried from
      // the last gap ends on the step: a basket closed at a loss and took
      // the balance down to equity.
      close();
      if (d1 > 0) {
        open(crossing(), b, b);
        top.push([t1, b]);
        bottom.push([t1, e1]);
      }
    }
  }
  close();
  return bands;
}

// The reading with equity furthest below balance, or null when equity
// never dipped below it.
export function deepestFloating(samples) {
  let worst = null;
  for (const s of samples ?? []) {
    const f = s.equity - s.balance;
    if (Number.isFinite(f) && f < 0 && (worst === null || f < worst.floating)) {
      worst = { t: s.t, balance: s.balance, equity: s.equity, floating: f };
    }
  }
  return worst;
}
