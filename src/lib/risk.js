// Margin and stop-out: how far price can move against what an account has
// open before the broker's margin call and stop-out. For a grid bot this is
// the risk that matters most: a basket that keeps adding levels into a
// trend can run the account into stop-out, which closes everything at the
// worst prices of the move.
//
// The broker's levels come from the EA (2026.10.17.5 on): stop_out_mode,
// margin_call_level and stop_out_level on the account. In percent mode a
// level is a margin level (equity / margin, as a percentage), in money mode
// it is the equity itself. Each open position carries point_value, the
// account currency one lot gains or loses per 1.0 move in its symbol's
// price (SYMBOL_TRADE_TICK_VALUE_LOSS / SYMBOL_TRADE_TICK_SIZE).
//
// The distances are worked out one symbol at a time, as if only that
// symbol moved and everything else held still, and with margin held where
// it is (it moves a little with price on most symbols). They are a guide to
// which exposure is closest, not a forecast: several symbols moving
// together reach the levels sooner.
//
// Pure, so the pages and the tests share it. Everything here ends up on a
// public page. Bad data gives nulls, never a throw.

import { priceDecimals } from "./baskets.js";
import { openSnapshot } from "./openPositions.js";

// A position's profit has to be at least this, in the account currency,
// before it is used to estimate a point value: profit arrives rounded to
// the cent, and at 1.00 that rounding moves the estimate by under 0.5%.
const MIN_ESTIMATE_PROFIT = 1;

// A numeric column as Postgres hands it over, a number or a numeric string.
// Null, empty and unreadable values stay null rather than becoming 0.
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Lots to a millionth, as baskets.js does: adding 0.1 + 0.2 lots must net
// against a 0.3 lot sell to exactly flat.
function lotsRound(v) {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

function dirOf(side) {
  return side === "buy" ? 1 : side === "sell" ? -1 : 0;
}

function rowsBySymbol(rows) {
  const by = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.symbol) continue;
    if (!by.has(r.symbol)) by.set(r.symbol, []);
    by.get(r.symbol).push(r);
  }
  return by;
}

// Half the last digit a symbol is quoted to: a price that has moved less
// than that has not moved at all, as far as the terminal showed it.
function quoteStep(rows) {
  const quotes = [];
  for (const r of rows) quotes.push(r.open_price, r.current_price);
  return 0.5 * 10 ** -priceDecimals(quotes);
}

// One symbol's point value: the EA's own figure when it sent one, else the
// volume-weighted estimate from the positions' profit. null when neither.
function pointValueOf(rows) {
  for (const r of rows) {
    const pv = num(r.point_value);
    // Every row of a snapshot carries the same figure for its symbol.
    if (pv !== null && pv > 0) return pv;
  }

  // profit = dir * (current - open) * volume * point value, so each
  // position that has moved gives one reading of it. Weighting by volume
  // makes the big positions count most, as they do in the account.
  const step = quoteStep(rows);
  let weighted = 0;
  let weight = 0;
  for (const r of rows) {
    const dir = dirOf(r.side);
    const volume = num(r.volume);
    const open = num(r.open_price);
    const current = num(r.current_price);
    const profit = num(r.profit);
    if (!dir || volume === null || volume <= 0 || open === null || current === null || profit === null) continue;
    const moved = current - open;
    if (Math.abs(moved) <= step || Math.abs(profit) < MIN_ESTIMATE_PROFIT) continue;
    const estimate = profit / (dir * moved * volume);
    // A reading of the wrong sign means the row disagrees with itself
    // (profit one way, price the other); it says nothing about the value.
    if (!(estimate > 0)) continue;
    weighted += estimate * volume;
    weight += volume;
  }
  return weight > 0 ? weighted / weight : null;
}

// Map(symbol -> account currency per 1.0 move in price per lot). Takes the
// rows as given: the caller decides which are current (accountRisk does).
export function symbolPointValues(rows) {
  const out = new Map();
  for (const [symbol, list] of rowsBySymbol(rows)) {
    const pv = pointValueOf(list);
    if (pv !== null) out.set(symbol, pv);
  }
  return out;
}

// The broker's levels as the account row stores them; null until an EA
// that sends them has synced. A mode other than "money" is read as
// percent, MT5's default and by far the most common.
export function stopOutLevels(account) {
  const stopOut = num(account?.stop_out_level);
  if (stopOut === null) return null;
  return {
    mode: account?.stop_out_mode === "money" ? "money" : "percent",
    marginCall: num(account?.margin_call_level),
    stopOut,
  };
}

// The equity at which a level is reached, for the margin in use.
function equityAt(level, mode, margin) {
  if (level === null) return null;
  return mode === "money" ? level : (margin * level) / 100;
}

// How far price can move against exposure (account currency per 1.0 move)
// before a buffer of equity is gone. move is in price units and 0 when the
// buffer is already gone; price is where that lands, null when it would be
// at or below zero (no price can fall that far, so this symbol alone never
// gets there).
function distance(buffer, exposure, netLots, price) {
  if (buffer === null || !(exposure > 0) || price === null || !(price > 0)) return null;
  const move = Math.max(0, buffer) / exposure;
  const at = price - Math.sign(netLots) * move;
  return { move, pct: move / price, price: at > 0 ? at : null };
}

// The price the account would close a symbol at: the bid for buys, the ask
// for sells, so the quote on the side that is net open. The newest row
// wins, in case an older one ever lags.
function priceFor(rows, netLots) {
  const side = netLots > 0 ? "buy" : netLots < 0 ? "sell" : null;
  let best = null;
  let bestAt = -Infinity;
  for (const pass of side ? [side, null] : [null]) {
    for (const r of rows) {
      if (pass && r.side !== pass) continue;
      const p = num(r.current_price);
      const t = Date.parse(r.open_time ?? "");
      const at = Number.isFinite(t) ? t : -Infinity;
      if (p !== null && p > 0 && (best === null || at >= bestAt)) {
        best = p;
        bestAt = at;
      }
    }
    if (best !== null) return best;
  }
  return null;
}

// Nearest to stop-out first; symbols without a distance after, by name, so
// the order never shuffles between renders.
function nearestFirst(a, b) {
  const pa = a.stopOut?.pct ?? Infinity;
  const pb = b.stopOut?.pct ?? Infinity;
  if (pa !== pb) return pa - pb;
  const ma = a.marginCall?.pct ?? Infinity;
  const mb = b.marginCall?.pct ?? Infinity;
  if (ma !== mb) return ma - mb;
  return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
}

// Everything the account page's Margin and stop-out section says, as
// plain figures: nothing on the site colours or flags them. Built only
// from openSnapshot's current rows, so positions an earlier sync left
// behind never count. As with baskets, every figure is as of the
// account's last sync.
//
// With no margin in use (nothing open) the broker's levels do not apply,
// so the equities, buffers and distances are all null. marginLevel is a
// percentage, as the terminal shows it.
export function accountRisk({ rows, account }) {
  const snap = openSnapshot(rows, account);
  const levels = stopOutLevels(account);
  const equity = num(account?.equity);
  const margin = num(account?.margin);
  const used = margin !== null && margin > 0;

  const marginLevel = used && equity !== null ? (equity / margin) * 100 : null;
  const marginCallEquity = used && levels ? equityAt(levels.marginCall, levels.mode, margin) : null;
  const stopOutEquity = used && levels ? equityAt(levels.stopOut, levels.mode, margin) : null;
  const bufferToMarginCall = marginCallEquity !== null && equity !== null ? equity - marginCallEquity : null;
  const bufferToStopOut = stopOutEquity !== null && equity !== null ? equity - stopOutEquity : null;

  const current = snap.state === "current" ? snap.rows : [];
  const pointValues = symbolPointValues(current);

  const symbols = [...rowsBySymbol(current)].map(([symbol, list]) => {
    let net = 0;
    let gross = 0;
    const quotes = [];
    for (const r of list) {
      const volume = num(r.volume) ?? 0;
      net += dirOf(r.side) * volume;
      if (dirOf(r.side)) gross += volume;
      quotes.push(r.open_price, r.current_price, r.sl, r.tp);
    }
    const netLots = lotsRound(net);
    const pointValue = pointValues.get(symbol) ?? null;
    const price = priceFor(list, netLots);
    const hedged = netLots === 0;
    const exposure = hedged || pointValue === null ? null : Math.abs(netLots) * pointValue;
    return {
      symbol,
      netLots,
      side: netLots > 0 ? "buy" : netLots < 0 ? "sell" : null,
      lots: lotsRound(gross),
      price,
      pointValue,
      decimals: priceDecimals(quotes),
      stopOut: distance(bufferToStopOut, exposure, netLots, price),
      marginCall: distance(bufferToMarginCall, exposure, netLots, price),
      hedged,
    };
  });
  symbols.sort(nearestFirst);

  return {
    state: snap.state,
    // The EA lists at most 500 positions. When the terminal has more, the
    // exposure here is from part of the book and every distance is longer
    // than the real one: partial says so.
    reported: snap.reported,
    listed: current.length,
    partial: snap.state === "current" && snap.reported > current.length,
    levels,
    equity,
    margin,
    marginLevel,
    marginCallEquity,
    stopOutEquity,
    bufferToMarginCall,
    bufferToStopOut,
    symbols,
    nearest: symbols[0]?.stopOut ? symbols[0] : null,
  };
}
