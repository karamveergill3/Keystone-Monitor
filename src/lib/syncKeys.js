// Per-account sync keys.
//
// A key is 32 random bytes, shown to the admin once and stored only as its
// SHA-256. That is enough on its own: the key has 256 bits of entropy, so
// the hash needs no salt or stretching, and looking it up by hash means the
// raw key is never compared byte by byte anywhere.

import { createHash, randomBytes } from "node:crypto";

export const KEY_PREFIX = "ptk_";

export function generateSyncKey() {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function hashSyncKey(key) {
  return createHash("sha256").update(String(key), "utf8").digest("hex");
}

// The last four characters, so the admin screen can say which key a
// terminal should have without showing it.
export function keyHint(key) {
  return String(key).slice(-4);
}

export function looksLikeSyncKey(value) {
  return typeof value === "string" && /^ptk_[A-Za-z0-9_-]{43}$/.test(value);
}

// "Authorization: Bearer ptk_..." -> the key, or null.
export function bearerKey(headerValue) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(headerValue ?? "").trim());
  return m && looksLikeSyncKey(m[1]) ? m[1] : null;
}
