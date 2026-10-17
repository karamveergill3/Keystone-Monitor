export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Keystone Monitor";

// A terminal that has not synced for this long is shown as offline. The EA
// syncs every two minutes by default, so this is several missed syncs.
export const OFFLINE_AFTER_MS = 10 * 60_000;

export function syncStatus(lastSyncAt, now = Date.now()) {
  if (!lastSyncAt) return "waiting";
  return now - Date.parse(lastSyncAt) > OFFLINE_AFTER_MS ? "offline" : "online";
}

// Only same-site paths may be used as a "next" destination after sign-in.
export function safeNext(value, fallback = "/") {
  const s = String(value ?? "");
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}
