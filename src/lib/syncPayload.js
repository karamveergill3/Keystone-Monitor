// Reads and checks what the EA posts to /api/sync.
//
// Everything arriving here came off the internet, so nothing is trusted:
// numbers must be finite, strings are trimmed and capped, tickets are
// digits, and times must parse and be plausible. A payload that fails any
// of that is refused whole rather than half stored, because a deal list
// with holes in it makes every figure quietly wrong.

import { normaliseType, normaliseEntry, kindOf } from "./dealKinds.js";

export const MAX_DEALS_PER_SYNC = 1000;
export const MAX_BODY_BYTES = 2_000_000;

// Deals are not accepted from before this, or from more than a day ahead
// of the server's clock (a broker clock a few hours out is normal; a deal
// a week in the future is a bug).
const EARLIEST = Date.UTC(2000, 0, 1);
const FUTURE_SLACK_MS = 86_400_000;

export class SyncPayloadError extends Error {}

function fail(message) {
  throw new SyncPayloadError(message);
}

function num(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) fail(`${field} is missing`);
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) fail(`${field} is not a number`);
  return n;
}

function int(value, field, opts) {
  const n = num(value, field, opts);
  return n === null ? null : Math.trunc(n);
}

function str(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return s ? s.slice(0, max) : null;
}

function digits(value, field) {
  const s = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(s)) fail(`${field} must be digits`);
  return s.replace(/^0+(?=\d)/, "");
}

function time(value, field, now) {
  const t = Date.parse(String(value ?? ""));
  if (!Number.isFinite(t)) fail(`${field} is not a time`);
  if (t < EARLIEST || t > now + FUTURE_SLACK_MS) fail(`${field} is out of range`);
  return new Date(t).toISOString();
}

function parseDeal(d, i, now) {
  if (!d || typeof d !== "object") fail(`deals[${i}] is not an object`);
  const type = normaliseType(d.type);
  if (!type) fail(`deals[${i}].type is not a deal type`);
  const profit = num(d.profit, `deals[${i}].profit`) ?? 0;
  const swap = num(d.swap, `deals[${i}].swap`) ?? 0;
  const commission = num(d.commission, `deals[${i}].commission`) ?? 0;
  const fee = num(d.fee, `deals[${i}].fee`) ?? 0;
  const position = d.position === undefined || d.position === null || String(d.position) === "0"
    ? null
    : digits(d.position, `deals[${i}].position`);
  return {
    ticket: digits(d.ticket, `deals[${i}].ticket`),
    position_id: position,
    time: time(d.time, `deals[${i}].time`, now),
    type,
    entry: normaliseEntry(d.entry),
    kind: kindOf(type),
    symbol: str(d.symbol, 40),
    volume: num(d.volume, `deals[${i}].volume`),
    price: num(d.price, `deals[${i}].price`),
    profit,
    swap,
    commission,
    fee,
    // Rounded to the cent so the sums in account_daily do not carry
    // floating-point dust from the terminal's doubles.
    net: Math.round((profit + swap + commission + fee) * 100) / 100,
    magic: int(d.magic, `deals[${i}].magic`),
    comment: str(d.comment, 80),
  };
}

export function parseSyncPayload(body, now = Date.now()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("body is not a JSON object");
  if (body.v !== 1) fail("unsupported payload version");

  const a = body.account;
  if (!a || typeof a !== "object") fail("account is missing");

  const account = {
    login: digits(a.login, "account.login"),
    server: str(a.server, 120),
    broker: str(a.company, 120),
    currency: str(a.currency, 8)?.toUpperCase() ?? null,
    leverage: int(a.leverage, "account.leverage"),
    balance: num(a.balance, "account.balance", { required: true }),
    equity: num(a.equity, "account.equity", { required: true }),
    credit: num(a.credit, "account.credit") ?? 0,
    margin: num(a.margin, "account.margin"),
    free_margin: num(a.free_margin, "account.free_margin"),
    margin_level: num(a.margin_level, "account.margin_level"),
    open_positions: int(a.positions, "account.positions"),
    floating_pnl: num(a.floating, "account.floating"),
  };
  if (!account.server) fail("account.server is missing");

  const rawDeals = body.deals ?? [];
  if (!Array.isArray(rawDeals)) fail("deals is not a list");
  if (rawDeals.length > MAX_DEALS_PER_SYNC) fail(`more than ${MAX_DEALS_PER_SYNC} deals in one sync`);

  // A ticket appearing twice in one batch would make the insert fail on
  // its own primary key; the later copy wins.
  const byTicket = new Map();
  rawDeals.forEach((d, i) => {
    const deal = parseDeal(d, i, now);
    byTicket.set(deal.ticket, deal);
  });

  return {
    eaVersion: str(body.ea, 20),
    account,
    deals: [...byTicket.values()],
    more: body.more === true,
  };
}
