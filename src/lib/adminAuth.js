// The admin screen's one shared password, and the cookie that remembers it.
//
// There are no admin accounts. ADMIN_PASSWORD, set in Vercel, is the only
// way in. The cookie holds an expiry and an HMAC of it keyed by that
// password, so nobody can make one without the password, and changing the
// password signs every browser out.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "ks_admin";
export const MIN_PASSWORD_LENGTH = 12;
export const SESSION_DAYS = 30;

// A missing or short password switches the admin screen off rather than
// leaving it guarded by something easy to guess.
export function adminConfigured(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest();
}

// Compared as hashes so the comparison takes the same time whatever the
// guess, and lengths never have to match.
export function passwordMatches(given, password) {
  if (!adminConfigured(password)) return false;
  return timingSafeEqual(sha256(given), sha256(password));
}

function signature(expiry, password) {
  return createHmac("sha256", password).update(`keystone-admin|${expiry}`).digest("hex");
}

export function makeAdminToken(password, now = Date.now()) {
  const expiry = String(now + SESSION_DAYS * 86_400_000);
  return `${expiry}.${signature(expiry, password)}`;
}

export function adminTokenValid(token, password, now = Date.now()) {
  if (!adminConfigured(password) || typeof token !== "string") return false;
  const match = /^(\d{1,16})\.([0-9a-f]{64})$/.exec(token);
  if (!match || !(Number(match[1]) > now)) return false;
  return timingSafeEqual(Buffer.from(signature(match[1], password), "hex"), Buffer.from(match[2], "hex"));
}
