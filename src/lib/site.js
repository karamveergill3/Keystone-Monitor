export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Keystone Monitor";

// A terminal that has not synced for this long is shown as offline. The EA
// syncs every two minutes by default, so this is several missed syncs.
export const OFFLINE_AFTER_MS = 10 * 60_000;

export function syncStatus(lastSyncAt, now = Date.now()) {
  if (!lastSyncAt) return "waiting";
  return now - Date.parse(lastSyncAt) > OFFLINE_AFTER_MS ? "offline" : "online";
}

// Only same-site paths may be used as a "next" destination after sign-in.
//
// Checked the way a browser will read it, not as typed. The URL parser
// strips tabs and newlines and treats a backslash like a slash, so
// "/\t/evil.example" passes a startsWith("//") test and still lands on
// evil.example. Anything with a control character or backslash is
// refused outright, and what is left must resolve to this site.
const PROBE = "http://same-site.invalid";

export function safeNext(value, fallback = "/") {
  const s = String(value ?? "");
  if (!s.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(s)) return fallback;
  try {
    const u = new URL(s, PROBE);
    return u.origin === PROBE ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}
