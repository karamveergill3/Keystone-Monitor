// London days, as YYYY-MM-DD keys.
//
// Every "today", "this week" and "this month" in the app is a London day,
// the same calendar ForexDNA uses. The account_daily view in
// supabase/schema.sql buckets deals with the same zone; keep the two in
// step.
//
// Keys are compared as strings, which works because they are zero-padded.
// Arithmetic on them is done in UTC, where a day is always 24 hours.

export const LONDON = "Europe/London";

const keyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: LONDON,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayKey(value) {
  const m = KEY.exec(String(value ?? ""));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === value;
}

// The London day an instant falls on.
export function dayKey(instant) {
  return keyFormat.format(new Date(instant));
}

export function todayKey(now = Date.now()) {
  return dayKey(now);
}

function toUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key, n) {
  return new Date(toUtc(key) + n * 86_400_000).toISOString().slice(0, 10);
}

// Monday of the week the day falls in.
export function weekStart(key) {
  const dow = (new Date(toUtc(key)).getUTCDay() + 6) % 7;
  return addDays(key, -dow);
}

export function monthStart(key) {
  return `${key.slice(0, 7)}-01`;
}

export function monthEnd(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function addMonths(key, n) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

// The UTC instant London midnight begins the day. London is UTC or UTC+1,
// so reading London's clock at UTC midnight gives the offset directly.
// Both changeovers happen at 01:00 UTC, after UTC midnight, so the reading
// is right on those days too.
export function londonMidnight(key) {
  const utcMidnight = toUtc(key);
  const [h, min] = hourFormat.format(new Date(utcMidnight)).split(":").map(Number);
  return new Date(utcMidnight - (h * 60 + min) * 60_000);
}

export function daysInclusive(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000) + 1;
}
