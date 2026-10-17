// The From and To on a report, read off the query string.
//
// Both are London days and both are included. Either may be blank: no From
// is the start of the history, no To is today. A To in the future is
// clamped to today. Anything else wrong is a sentence, not a guess.

import { isDayKey } from "./days.js";

export function reportRange(params, today) {
  const raw = (k) => {
    const v = typeof params?.get === "function" ? params.get(k) : params?.[k];
    return v ? String(v).trim() : "";
  };
  const fromRaw = raw("from");
  const toRaw = raw("to");

  if (fromRaw && !isDayKey(fromRaw)) return { error: "From is not a date (YYYY-MM-DD)." };
  if (toRaw && !isDayKey(toRaw)) return { error: "To is not a date (YYYY-MM-DD)." };

  const from = fromRaw || null;
  const to = toRaw && toRaw < today ? toRaw : today;

  if (from && from > today) return { error: "From is in the future." };
  if (from && from > to) return { error: "From is after To." };
  return { from, to, whole: !from };
}

// For file names: "2026-09-01-to-2026-09-15" or "to-2026-10-17".
export function rangeSlug({ from, to }) {
  return from ? `${from}-to-${to}` : `to-${to}`;
}
