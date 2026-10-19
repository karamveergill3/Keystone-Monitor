// The admin screen's one shared password (a PIN will do), and the cookie
// that remembers it.
//
// There are no admin accounts. ADMIN_PASSWORD, set in Vercel, is the only
// way in. It may be as short as a 4-digit PIN, so it is never used on its
// own: everything derived from it is keyed by a server-side pepper too
// (SUPABASE_SERVICE_ROLE_KEY, which the server always has and nobody else
// does). Ten thousand PINs are nothing to try offline, so nothing that
// leaves the server, the cookie included, and nothing in the database can
// be checked against a guess without the pepper.
//
// The cookie holds an expiry and an HMAC of it, keyed by the pepper and the
// password together, so nobody can make one without both, and changing
// either signs every browser out. Guesses at the sign-in form are limited
// by the lockout in the database (src/lib/adminGuard.js).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "ks_admin";
export const MIN_PASSWORD_LENGTH = 4;
export const SESSION_DAYS = 30;

// A missing or too-short password switches the admin screen off.
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

function pepperUsable(pepper) {
  return typeof pepper === "string" && pepper.length > 0;
}

// HMAC keyed by the pepper over a label and the password. Each use has its
// own label, so the tag stored in the database is never the cookie's key.
function derive(label, password, pepper) {
  if (!adminConfigured(password) || !pepperUsable(pepper)) {
    throw new Error("admin password or pepper missing");
  }
  return createHmac("sha256", pepper).update(`${label}|${password}`).digest();
}

// What the lockout stores to notice that ADMIN_PASSWORD has changed. Never
// the password or its plain hash: a 4-digit PIN's SHA-256 falls to 10,000
// tries.
export function adminTag(password, pepper) {
  return derive("keystone-admin-tag", password, pepper).toString("hex");
}

function signature(expiry, password, pepper) {
  return createHmac("sha256", derive("keystone-admin-cookie", password, pepper))
    .update(`keystone-admin|${expiry}`)
    .digest("hex");
}

export function makeAdminToken(password, pepper, now = Date.now()) {
  const expiry = String(now + SESSION_DAYS * 86_400_000);
  return `${expiry}.${signature(expiry, password, pepper)}`;
}

export function adminTokenValid(token, password, pepper, now = Date.now()) {
  if (!adminConfigured(password) || !pepperUsable(pepper) || typeof token !== "string") return false;
  const match = /^(\d{1,16})\.([0-9a-f]{64})$/.exec(token);
  if (!match || !(Number(match[1]) > now)) return false;
  return timingSafeEqual(
    Buffer.from(signature(match[1], password, pepper), "hex"),
    Buffer.from(match[2], "hex")
  );
}
