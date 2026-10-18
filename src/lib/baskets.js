// Grid baskets: what a mean-reversion grid EA has open on an account,
// grouped the way its risk builds up, and which baskets in loss could be
// closed now with the week still in profit.
//
// A basket is every open position on one account with the same symbol and
// the same side. Magic numbers are ignored on purpose: some grid EAs give
// every grid level its own magic, and splitting on it would hide how deep
// a basket really is. Merging two EAs' positions on one symbol overstates
// the depth instead, which is the safe direction for a risk alert. A
// position with no symbol or no side is in no basket. track_baskets() in
// supabase/schema.sql groups the same way, so its rows line up by key.
//
// Pure, so the pages and the tests share it. Everything here ends up on a
// public page.

import { money } from "./format.js";
import { openSnapshot } from "./openPositions.js";

const SIDES = new Set(["buy", "sell"]);

// The price decimals a basket shows: never fewer than money has, never
// more than any symbol is quoted in.
const MIN_DECIMALS = 2;
const MAX_DECIMALS = 5;

// Money to the cent, so a sum over many positions carries no float noise
// (0.1 + 0.2) and two figures equal in cents compare equal. -0 becomes 0.
function cents(v) {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

// Lots to a millionth: brokers step lots by 0.01 or 0.001, and adding
// them in floating point leaves tails like 0.30000000000000004.
function lotsRound(v) {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

// A numeric column as Postgres hands it over, a number or a numeric string.
// Null, empty and unreadable values stay null rather than becoming 0.
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function instant(iso) {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : null;
}

function iso(t) {
  return t === null ? null : new Date(t).toISOString();
}

// The fewest decimals that write a price exactly. Prices arrive as the
// decimal the terminal quoted, so toFixed at the right length gives the
// same double back; the tolerance only absorbs a value that went through
// arithmetic on the way.
function decimalsOf(price) {
  for (let d = 0; d < MAX_DECIMALS; d++) {
    if (Math.abs(Number(price.toFixed(d)) - price) < 1e-9) return d;
  }
  return MAX_DECIMALS;
}

// The decimals to show one symbol's prices in: the most any of its quotes
// needs, between MIN_DECIMALS and MAX_DECIMALS. Stops and targets count
// too, so a stop at 1.08455 is never shown rounded to 1.0846.
export function priceDecimals(values) {
  let decimals = MIN_DECIMALS;
  for (const v of values) {
    const price = num(v);
    if (price !== null) decimals = Math.max(decimals, decimalsOf(price));
  }
  return decimals;
}

export function basketKey(symbol, side) {
  return `${symbol}|${side}`;
}

// A position's identity for finding its deals: POSITION_IDENTIFIER, or its
// ticket from an EA older than 2026.10.17.4 (on MT5 the same number for a
// position opened by one order). The same coalesce track_baskets() uses.
export function positionIdOf(row) {
  return String(row?.position_id ?? row?.ticket);
}

// Deepest first; the key settles a tie, so the order never shuffles
// between renders.
function deepestFirst(a, b) {
  return a.floating - b.floating || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

function summarise(key, symbol, side, rows) {
  // Oldest first, so positionIds read in the order the grid was built.
  const sorted = [...rows].sort((a, b) => (instant(a.open_time) ?? 0) - (instant(b.open_time) ?? 0));

  let lots = 0;
  let weighted = 0;
  let weight = 0;
  let profit = 0;
  let swap = 0;
  const quotes = [];
  let opened = null;
  let added = null;
  let currentPrice = null;
  let currentAt = -Infinity;
  const magics = new Set();

  for (const p of sorted) {
    const volume = num(p.volume) ?? 0;
    const open = num(p.open_price);
    const current = num(p.current_price);
    const t = instant(p.open_time);

    lots += volume;
    if (open !== null && volume > 0) {
      weighted += open * volume;
      weight += volume;
    }
    profit += num(p.profit) ?? 0;
    swap += num(p.swap) ?? 0;
    quotes.push(open, current, p.sl, p.tp);
    const magic = num(p.magic);
    if (magic !== null) magics.add(magic);
    if (t !== null) {
      opened = opened === null ? t : Math.min(opened, t);
      added = added === null ? t : Math.max(added, t);
    }
    // One symbol on one side is quoted at one price, so any row would do;
    // the newest is taken in case an older one ever lags.
    if (current !== null && (t ?? -Infinity) >= currentAt) {
      currentPrice = current;
      currentAt = t ?? -Infinity;
    }
  }

  const profitC = cents(profit);
  const swapC = cents(swap);
  return {
    key,
    symbol,
    side,
    positions: sorted.length,
    lots: lotsRound(lots),
    // Volume-weighted open price: where the basket breaks even, before swap.
    avgPrice: weight > 0 ? weighted / weight : null,
    currentPrice,
    profit: profitC,
    swap: swapC,
    // From the rounded parts, so the three figures on screen add up.
    floating: cents(profitC + swapC),
    openedAt: iso(opened),
    lastAddedAt: iso(added),
    magics: [...magics].sort((a, b) => a - b),
    decimals: priceDecimals(quotes),
    positionIds: sorted.map(positionIdOf),
  };
}

// Open position rows grouped into baskets, deepest first. Takes the rows as
// given: the caller decides which are current (accountBaskets below does).
export function groupBaskets(rows) {
  const groups = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.symbol || !SIDES.has(r.side)) continue;
    const key = basketKey(r.symbol, r.side);
    if (!groups.has(key)) groups.set(key, { symbol: r.symbol, side: r.side, rows: [] });
    groups.get(key).rows.push(r);
  }
  return [...groups.entries()].map(([key, g]) => summarise(key, g.symbol, g.side, g.rows)).sort(deepestFirst);
}

// Whether a basket in loss could be closed now and the week still be up:
// this week's realised profit is positive and more than the basket's loss.
// The week made 1,500 and the basket floats -1,200: closing it keeps 300,
// so it is closable. A basket in profit has no drawdown to close, a week
// that is flat or down has nothing to absorb one, and a loss that would
// take the week to exactly zero or below is not closable. Both figures are
// compared in cents, as shown, so what the screen says always agrees.
// An unknown or non-finite figure is never closable.
export function canCloseInProfit(floating, weekRealised) {
  const f = num(floating);
  const w = num(weekRealised);
  if (f === null || w === null) return false;
  const loss = cents(f);
  const week = cents(w);
  return loss < 0 && week > 0 && cents(week + loss) > 0;
}

// Tracked open baskets by key. track_baskets() keeps one open row per key;
// should two ever arrive, the deeper reading wins, the safe side for a risk
// figure.
function trackedByKey(tracked) {
  const by = new Map();
  for (const t of Array.isArray(tracked) ? tracked : []) {
    if (!t?.symbol || !SIDES.has(t.side)) continue;
    const key = basketKey(t.symbol, t.side);
    const prev = by.get(key);
    if (!prev || (num(t.worst_floating) ?? Infinity) < (num(prev.worst_floating) ?? Infinity)) by.set(key, t);
  }
  return by;
}

function share(amount, of) {
  return of !== null && of > 0 ? amount / of : null;
}

// Everything the screens say about one account's baskets.
//
// state and reported are openSnapshot's (src/lib/openPositions.js), and the
// baskets are built only from its current rows, so positions an earlier
// sync left behind never count. tracked is the account's open rows from the
// baskets table: the worst reading each basket has had since tracking
// began. It can be empty (tracking starts with the next sync) or a sync
// behind the positions; a basket without a tracked row reads as now.
//
// "current" means the rows are the last sync's list, not that the last sync
// was recent: an account that has stopped syncing keeps its last list. So
// every figure here is as of lastSyncAt, and an archived account, whose
// EA is no longer watched, has nothing closable (its baskets still list).
//
// weekRealised is the week's realised trading P&L (accountRow's
// periods.week.pnl, since Monday 00:00 London). Each basket is judged
// against it on its own: two closable baskets may not both be closable
// together. leftover is what the week would keep after closing that
// basket, null when it is not closable.
export function accountBaskets({ rows, account, weekRealised, tracked = [] }) {
  const snap = openSnapshot(rows, account);
  const week = num(weekRealised) === null ? 0 : cents(num(weekRealised));
  const archived = Boolean(account?.archived_at);
  const balance = num(account?.balance);
  const byKey = trackedByKey(tracked);

  // The EA lists at most 500 positions. When the terminal has more, a
  // basket may be deeper than the list shows, so nothing is marked
  // closable until the whole book is in view.
  const complete = snap.state === "current" && snap.reported <= snap.rows.length;

  const baskets = groupBaskets(snap.state === "current" ? snap.rows : []).map((g) => {
    const t = byKey.get(g.key);
    const tWorst = num(t?.worst_floating);
    const deeperBefore = tWorst !== null && tWorst < g.floating;
    const worstFloating = deeperBefore ? cents(tWorst) : g.floating;
    const worstDrawdown = Math.max(0, cents(-worstFloating));
    const drawdown = Math.max(0, cents(-g.floating));
    const tOpened = instant(t?.opened_at);
    const gOpened = instant(g.openedAt);
    const opened = tOpened === null ? gOpened : gOpened === null ? tOpened : Math.min(tOpened, gOpened);
    const closable = !archived && complete && canCloseInProfit(g.floating, week);
    return {
      ...g,
      drawdown,
      drawdownPct: share(drawdown, balance),
      closable,
      leftover: closable ? cents(week + g.floating) : null,
      worstFloating,
      worstDrawdown,
      // null is now: no sync has seen it deeper than it is.
      worstAt: deeperBefore ? (t.worst_at ?? null) : null,
      // A past worst is measured against the balance it happened at.
      worstPct: share(worstDrawdown, deeperBefore ? num(t.worst_balance) : balance),
      trackedSince: t?.first_seen_at ?? null,
      // Tracking remembers positions that have closed since, so the basket
      // may have started before anything still open in it.
      openedAt: iso(opened),
    };
  });

  return {
    state: snap.state,
    reported: snap.reported,
    // The EA sends at most 500 positions: baskets are built from these.
    listed: snap.rows.length,
    lastSyncAt: account?.last_sync_at ?? null,
    archived,
    weekRealised: week,
    baskets,
    // Deepest loss first, as the baskets are.
    closable: baskets.filter((b) => b.closable),
    deepest: baskets[0] ?? null,
    open: baskets.length,
  };
}

// "45 min", "3 h 20 min", "2 d 4 h": how long a basket stayed open.
export function shortDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

// What the closed baskets table shows for one basket_results row.
//
// Its close is the last closing deal of any position ever in it. Without
// one (the deals have not synced yet, or none matched), it falls back to
// the first sync that found the basket gone, which is up to a sync late.
export function closedBasket(row) {
  const lastClose = instant(row?.last_close_at);
  const closedAt = lastClose !== null ? row.last_close_at : (row?.closed_at ?? null);
  const worstFloating = num(row?.worst_floating);
  const worstDrawdown = worstFloating === null ? null : Math.max(0, cents(-worstFloating));
  const realised = num(row?.realised);
  return {
    closedAt,
    closedBy: lastClose !== null ? "deal" : "sync",
    duration: shortDuration((instant(closedAt) ?? NaN) - (instant(row?.opened_at) ?? NaN)),
    worstDrawdown,
    worstPct: worstDrawdown === null ? null : share(worstDrawdown, num(row?.worst_balance)),
    realised: realised === null ? null : cents(realised),
  };
}

// Why a basket is marked closable, in words, from one of accountBaskets'
// baskets: what the week keeps if it is closed now. null for a basket that
// is not closable, which says nothing.
export function closeReason(basket, currency) {
  const leftover = num(basket?.leftover);
  if (!basket?.closable || leftover === null) return null;
  return `Close now and the week stays ${money(leftover, currency, { sign: true })}`;
}
