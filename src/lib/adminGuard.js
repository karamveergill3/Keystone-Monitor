// The lockout on the admin sign-in form.
//
// ADMIN_PASSWORD may be a 4-digit PIN, and the Admin link is on every
// page, so guesses are counted in the database (admin_guard, schema.sql
// section 7), for everyone at once: after MAX_FAILURES wrong tries in a
// row, every attempt is refused for LOCK_INTERVAL, the right PIN included,
// so a guess made during the lock learns nothing. The count is kept per
// password: changing ADMIN_PASSWORD in Vercel changes the tag (adminAuth.js
// adminTag), and the new one starts with no count and no lock, which is the
// owner's way back in.
//
// The sign-in action decides here, with a function that calls the
// database passed in, so the decision can be tested without one. Anything
// but a clear answer from the database refuses: the PIN is never let
// through unchecked.

import { londonTime } from "@/lib/format";

export const MAX_FAILURES = 5;
export const LOCK_INTERVAL = "1 hour";

const UNAVAILABLE = { status: "unavailable" };

// rpc(name, args) resolves to Supabase's { data, error }. Returns one of
//   { status: "in" }                       the PIN was right: sign in
//   { status: "wrong", left }              wrong; left tries before the lock
//   { status: "locked", until }            refused; locked until that ISO time
//   { status: "unavailable" }              no clear answer: refused
export async function checkAdminAttempt({ ok, tag, rpc }) {
  if (typeof tag !== "string" || !tag) return UNAVAILABLE;
  let result;
  try {
    result = await rpc("admin_attempt", { p_tag: tag, p_ok: ok === true, p_max: MAX_FAILURES, p_lock: LOCK_INTERVAL });
  } catch {
    return UNAVAILABLE;
  }
  if (!result || result.error) return UNAVAILABLE;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") return UNAVAILABLE;

  if (row.locked_until !== null && row.locked_until !== undefined) {
    const until = Date.parse(row.locked_until);
    if (!Number.isFinite(until)) return UNAVAILABLE;
    return { status: "locked", until: new Date(until).toISOString() };
  }
  if (ok === true) return { status: "in" };
  const failures = Number(row.failures);
  if (!Number.isInteger(failures) || failures < 1 || failures >= MAX_FAILURES) return UNAVAILABLE;
  return { status: "wrong", left: MAX_FAILURES - failures };
}

// What the sign-in form shows for a refusal.
export function attemptMessage(outcome) {
  switch (outcome?.status) {
    case "locked":
      return `Admin is locked after ${MAX_FAILURES} wrong tries, until ${londonTime(outcome.until)} London time. ` +
        "Changing ADMIN_PASSWORD in Vercel and redeploying unlocks it at once.";
    case "wrong":
      return `That is not the admin PIN. ${outcome.left} ${outcome.left === 1 ? "try" : "tries"} left ` +
        "before admin locks for an hour.";
    default:
      return "Admin sign-in is unavailable right now. Try again in a minute.";
  }
}
