// Grid baskets: what a mean-reversion grid EA has open on an account,
// grouped the way its risk builds up, and whether any of it would give
// back more than the week has banked.
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

// Whether closing a basket now would lose more than the account has
// realised this week. A week that is flat or down has banked nothing, so
// any basket in loss is deeper than it. Both sides are compared in cents,
// as shown, so a loss equal to the week on screen is never flagged.
export function isDeeperThanWeek(floating, weekRealised) {
  const f = num(floating);
  if (f === null) return false;
  const w = num(weekRealised);
  const banked = Math.max(0, w === null ? 0 : cents(w));
  const loss = -cents(f);
  return loss > 0 && loss > banked;
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
// EA is no longer watched, has nothing flagged (its baskets still list).
export function accountBaskets({ rows, account, weekRealised, tracked = [] }) {
  const snap = openSnapshot(rows, account);
  const week = num(weekRealised) === null ? 0 : cents(num(weekRealised));
  const archived = Boolean(account?.archived_at);
  const balance = num(account?.balance);
  const byKey = trackedByKey(tracked);

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
    return {
      ...g,
      drawdown,
      drawdownPct: share(drawdown, balance),
      flagged: !archived && isDeeperThanWeek(g.floating, week),
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
    // What a basket's loss is measured against: a week that is flat or
    // down has banked nothing.
    banked: Math.max(0, week),
    baskets,
    flagged: baskets.filter((b) => b.flagged),
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

// Why a basket is flagged, in words, from an accountBaskets result: what
// the week has banked, or that it has banked nothing (and what it stands
// at), so a week in loss is never shown as the threshold.
export function flagReason({ banked, weekRealised }, currency) {
  if (num(banked) > 0) return `Deeper than this week's ${money(banked, currency, { sign: true })} banked`;
  return `In loss, and the week has banked nothing (${money(num(weekRealised) ?? 0, currency, { sign: true })})`;
}

// Every flagged basket across several accounts, deepest first, for the
// alert panel. rows are account rows (accountRow in src/lib/accountView.js:
// id, label, currency, status, last_sync_at) each carrying its
// accountBaskets result as baskets. A reading is as of the account's last
// sync, so each item says when that was and whether the account is offline.
// Accounts in different currencies are ordered by amount without an
// exchange rate: the order is a reading aid, and every figure shows its own
// currency.
export function flaggedItems(rows) {
  const items = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    for (const basket of r?.baskets?.flagged ?? []) {
      items.push({
        accountId: r.id,
        accountLabel: r.label,
        currency: r.currency,
        weekRealised: r.baskets.weekRealised,
        banked: r.baskets.banked,
        lastSyncAt: r.last_sync_at ?? r.baskets.lastSyncAt ?? null,
        offline: r.status === "offline",
        basket,
      });
    }
  }
  return items.sort(
    (a, b) => a.basket.floating - b.basket.floating || String(a.accountLabel).localeCompare(String(b.accountLabel)),
  );
}
