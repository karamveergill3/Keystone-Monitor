// Which accounts need looking at, and why. There are no notifications: the
// site itself shows these, in the Needs attention panel on the overview and
// project pages, as highlighted table rows and as a banner on the account.
//
// Each reason is { level, code, short, text }: red for a loss or a broker
// level close enough to act on now, amber for something to keep an eye on.
// short is a few words for a table chip, text one plain sentence with the
// figures. Every figure is as of the account's last sync, which the
// offline reason says when that was long ago.
//
// Pure, so the pages and the tests share it. Everything here ends up on a
// public page.

import { ago, londonTime, money, number, pct } from "./format.js";
import { BROKER_LEVELS_EA, eaReportsOpen } from "./openPositions.js";

// The thresholds, all as shares (0.05 is 5%). Floating drawdown is of the
// balance, with credit already out (accountRow's floatingDd); the stop-out
// distance is the nearest symbol's move to stop-out as a share of its price
// (accountRisk's nearest in src/lib/risk.js).
export const LIMITS = Object.freeze({
  floatingDdAmber: 0.05,
  floatingDdRed: 0.1,
  stopOutAmber: 0.05,
  stopOutRed: 0.02,
});

const LEVEL_ORDER = { red: 0, amber: 1 };

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// A threshold applies to a figure as it is shown, to two decimals of a
// percent, so a colour never disagrees with the number beside it: 0.09996
// shows as 10.00% and is red, as the 10% rule says, and float noise just
// under a round limit (0.09999999999999998) counts as the limit.
function shown(share) {
  return Math.round(share * 1e4) / 1e4;
}

function atLeast(value, limit) {
  return shown(value) >= limit;
}

function below(value, limit) {
  return shown(value) < limit;
}

// The level a floating drawdown (a share of balance) is coloured at, null
// under both limits. The table colours its figure with this, so it is
// coloured exactly when the account is listed for it.
export function floatingDdLevel(dd) {
  const v = num(dd);
  if (v === null) return null;
  return atLeast(v, LIMITS.floatingDdRed) ? "red" : atLeast(v, LIMITS.floatingDdAmber) ? "amber" : null;
}

// The same for a move to stop-out as a share of the symbol's price.
export function stopOutLevel(share) {
  const v = num(share);
  if (v === null) return null;
  return below(v, LIMITS.stopOutRed) ? "red" : below(v, LIMITS.stopOutAmber) ? "amber" : null;
}

// A move to stop-out as shown everywhere: two decimals of a percent, and
// never "0.00%" for a move that is still there, which would read as reached.
export function distanceLabel(share) {
  const v = num(share);
  if (v === null) return "-";
  return v > 0 && shown(v) === 0 ? "under 0.01%" : pct(v);
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// "a", "a and b", "a, b and c".
function list(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// A broker level as the broker states it, with the equity it comes to: a
// margin level and that equity in percent mode; in money mode the level
// is the equity, said once.
function levelText(levels, level, equityAt, currency) {
  if (!levels) return `the broker's level, ${money(equityAt, currency)}`;
  if (levels.mode === "money") return `${money(level ?? equityAt, currency)} equity`;
  return `${number(level, 0)}% margin level, ${money(equityAt, currency)}`;
}

function basketReason(baskets, currency) {
  const flagged = Array.isArray(baskets?.flagged) ? baskets.flagged : [];
  if (!flagged.length) return null;
  const n = flagged.length;
  const names = list(flagged.map((b) => `${b.symbol} ${b.side} at ${money(b.floating, currency)}`));
  const banked = num(baskets.banked) ?? 0;
  const text =
    banked > 0
      ? `${names} ${n === 1 ? "would" : "would each"} lose more than this week's ${money(banked, currency, { sign: true })} banked.`
      : `${names} ${n === 1 ? "is" : "are"} in loss, and the week has banked nothing (${money(num(baskets.weekRealised) ?? 0, currency, { sign: true })}).`;
  return { level: "red", code: "basket-week", short: `${plural(n, "basket")} past week profit`, text };
}

function stopOutReason(risk, currency) {
  const nearest = risk?.nearest;
  const d = nearest?.stopOut;
  const share = num(d?.pct);
  if (share === null) return null;
  const level = d.move === 0 ? "red" : stopOutLevel(share);
  if (!level) return null;
  const brokerLevel = levelText(risk.levels, risk.levels?.stopOut, risk.stopOutEquity, currency);

  if (d.move === 0) {
    return {
      level,
      code: "stop-out",
      short: "At stop-out",
      text: `Equity of ${money(risk.equity, currency)} is at or below the broker's stop-out (${brokerLevel}).`,
    };
  }

  const dp = nearest.decimals ?? 2;
  const direction = nearest.netLots > 0 ? "fall" : "rise";
  const to = d.price === null ? "" : ` to ${number(d.price, dp)}`;
  const exposure = `${number(Math.abs(nearest.netLots), 2)} lots net ${nearest.netLots > 0 ? "long" : "short"}`;
  return {
    level,
    code: "stop-out",
    short: `${distanceLabel(share)} to stop-out`,
    text:
      `A ${distanceLabel(share)} ${direction} in ${nearest.symbol} (${number(d.move, dp)}${to}) against ${exposure} ` +
      `would bring equity down to the broker's stop-out (${brokerLevel}), with every other symbol held still.`,
  };
}

function marginCallReason(risk, currency) {
  const equity = num(risk?.equity);
  const at = num(risk?.marginCallEquity);
  const margin = num(risk?.margin);
  if (equity === null || at === null || !(margin > 0) || equity > at) return null;
  const brokerLevel = levelText(risk.levels, risk.levels?.marginCall, at, currency);
  const marginLevel = num(risk.marginLevel);
  const now = marginLevel === null ? "" : `; the margin level is ${number(marginLevel, 0)}%`;
  return {
    level: "red",
    code: "margin-call",
    short: "At margin call",
    text: `Equity of ${money(equity, currency)} is at or below the broker's margin call (${brokerLevel})${now}.`,
  };
}

function floatingReason(row, currency) {
  const dd = num(row?.floatingDd);
  if (dd === null || !atLeast(dd, LIMITS.floatingDdAmber)) return null;
  const balance = num(row.balance);
  const under = balance === null ? "" : ` (${money(balance * dd, currency)} of the ${money(balance, currency)} balance)`;
  return {
    level: atLeast(dd, LIMITS.floatingDdRed) ? "red" : "amber",
    code: "floating-dd",
    short: `Floating DD ${pct(dd)}`,
    text: `Open trades are ${pct(dd)} under water${under}.`,
  };
}

function offlineReason(row, now) {
  if (row?.status !== "offline") return null;
  const since = ago(row.last_sync_at, now).replace(/ ago$/, "");
  return {
    level: "amber",
    code: "offline",
    short: `Offline ${since}`,
    text: `No sync for ${since}, so every figure here is from the last sync at ${londonTime(row.last_sync_at)}.`,
  };
}

// Margin in use but no distance to stop-out worked out: the EA does not
// send the broker's levels yet, or a symbol has no point value. Without
// this the account would simply have no stop-out reason, which reads as
// safe when it was never checked.
function uncheckedReason(row, risk) {
  if (!risk || !eaReportsOpen(row?.ea_version)) return null;
  const inUse = (num(risk.margin) ?? 0) > 0 || (num(row?.open_positions) ?? 0) > 0;
  if (!inUse) return null;
  const version = row?.ea_version ? `EA ${row.ea_version}` : "This account's EA";
  if (!risk.levels) {
    return {
      level: "amber",
      code: "stop-out-unchecked",
      short: "Stop-out not checked",
      text: `${version} does not send the broker's margin call and stop-out levels, so how close this account is to them is not checked. Attach EA ${BROKER_LEVELS_EA} or later.`,
    };
  }
  if (risk.state !== "current") return null;
  const unknown = (risk.symbols ?? []).filter((s) => !s.hedged && s.pointValue === null).map((s) => s.symbol);
  if (!unknown.length) return null;
  return {
    level: "amber",
    code: "stop-out-unchecked",
    short: "Stop-out not checked",
    text: `The terminal sent no point value for ${list(unknown)}, so ${unknown.length === 1 ? "its" : "their"} distance to stop-out is not checked.`,
  };
}

// The EA lists at most 500 positions: past that, baskets and distances
// come from part of the book and look safer than they are.
function partialReason(risk) {
  if (!risk?.partial) return null;
  return {
    level: "amber",
    code: "partial-list",
    short: "Partial position list",
    text: `The EA listed ${number(risk.listed, 0)} of the ${number(risk.reported, 0)} positions open, so baskets and distances to stop-out are from part of the book and may look safer than they are.`,
  };
}

// A live account whose terminal has never synced: nothing about it can be
// checked until the EA is attached.
function waitingReason() {
  return {
    level: "amber",
    code: "waiting",
    short: "Waiting for first sync",
    text: "No sync yet: attach the EA with this account's key from the admin screen.",
  };
}

function eaReason(row) {
  if (eaReportsOpen(row?.ea_version)) return null;
  const version = row?.ea_version ? `EA ${row.ea_version}` : "This account's EA";
  return {
    level: "amber",
    code: "ea-old",
    short: "EA too old",
    text: `${version} does not send its open positions, so its baskets and distance to stop-out cannot be worked out until the latest EA is attached.`,
  };
}

// What needs looking at on one account. row is accountRow's (src/lib/
// accountView.js), baskets accountBaskets' (src/lib/baskets.js) and risk
// accountRisk's (src/lib/risk.js); either of the last two may be missing,
// and then says nothing. An archived account is no longer watched, so it
// gets no reason; one that has never synced gets only "waiting".
// level is the worst reason's, null with none; reasons are red first, then
// in a fixed order, so the banner never shuffles between renders.
export function accountAttention({ row, baskets, risk, now = Date.now() }) {
  if (!row || row.archived_at) return { level: null, reasons: [] };
  if (!row.last_sync_at) return { level: "amber", reasons: [waitingReason()] };
  const currency = row.currency || "USD";
  const reasons = [
    basketReason(baskets, currency),
    stopOutReason(risk, currency),
    marginCallReason(risk, currency),
    floatingReason(row, currency),
    uncheckedReason(row, risk),
    partialReason(risk),
    offlineReason(row, now),
    eaReason(row),
  ].filter(Boolean);
  // Array sort is stable, so within a level the order above holds.
  reasons.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return { level: reasons[0]?.level ?? null, reasons };
}

// The Needs attention panel: every account with a reason, red before
// amber, then by label. rows each carry { id, label, currency,
// last_sync_at } and their accountAttention result as attention.
export function attentionItems(rows) {
  const items = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const a = r?.attention;
    if (!a?.level) continue;
    items.push({
      accountId: r.id,
      label: r.label,
      currency: r.currency || "USD",
      lastSyncAt: r.last_sync_at ?? null,
      level: a.level,
      reasons: a.reasons,
    });
  }
  return items.sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || String(a.label ?? "").localeCompare(String(b.label ?? "")),
  );
}
