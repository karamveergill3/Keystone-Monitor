import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  adminConfigured,
  adminTag,
  passwordMatches,
  makeAdminToken,
  adminTokenValid,
  MIN_PASSWORD_LENGTH,
  SESSION_DAYS,
} from "@/lib/adminAuth";

const PASSWORD = "4821";
const PEPPER = "service-role-key-for-tests";
const NOW = Date.parse("2026-10-17T12:00:00Z");

test("a 4-character PIN is enough; shorter or missing switches the admin screen off", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 4);
  for (const p of [undefined, null, "", "1", "482", 4821]) {
    assert.equal(adminConfigured(p), false, String(p));
    assert.equal(passwordMatches(String(p ?? ""), p), false, String(p));
  }
  for (const p of ["4821", "0000", "abcd", "correct horse battery"]) {
    assert.equal(adminConfigured(p), true, p);
  }
});

test("only the exact password matches", () => {
  assert.equal(passwordMatches(PASSWORD, PASSWORD), true);
  for (const guess of ["", "482", "48210", " 4821", "4821 ", "4812"]) {
    assert.equal(passwordMatches(guess, PASSWORD), false, guess);
  }
});

test("the tag needs the pepper: never the PIN or its plain hash", () => {
  const tag = adminTag(PASSWORD, PEPPER);
  assert.match(tag, /^[0-9a-f]{64}$/);
  assert.equal(adminTag(PASSWORD, PEPPER), tag, "stable for the same password and pepper");
  assert.notEqual(tag, PASSWORD);
  assert.notEqual(tag, createHash("sha256").update(PASSWORD).digest("hex"));
  assert.notEqual(tag, createHash("sha256").update(`keystone-admin-tag|${PASSWORD}`).digest("hex"));
  assert.notEqual(adminTag("4822", PEPPER), tag, "a different password");
  assert.notEqual(adminTag(PASSWORD, "another pepper"), tag, "a different pepper");
});

test("no pepper or no password, no tag", () => {
  for (const pepper of [undefined, null, ""]) {
    assert.throws(() => adminTag(PASSWORD, pepper), String(pepper));
  }
  assert.throws(() => adminTag("123", PEPPER));
  assert.throws(() => adminTag(undefined, PEPPER));
});

test("a token made with the password and pepper is accepted until it expires", () => {
  const token = makeAdminToken(PASSWORD, PEPPER, NOW);
  assert.equal(adminTokenValid(token, PASSWORD, PEPPER, NOW), true);
  assert.equal(adminTokenValid(token, PASSWORD, PEPPER, NOW + (SESSION_DAYS - 1) * 86_400_000), true);
  assert.equal(adminTokenValid(token, PASSWORD, PEPPER, NOW + SESSION_DAYS * 86_400_000), false);
});

test("changing the password or the pepper, or switching admin off, ends every token", () => {
  const token = makeAdminToken(PASSWORD, PEPPER, NOW);
  assert.equal(adminTokenValid(token, "4822", PEPPER, NOW), false);
  assert.equal(adminTokenValid(token, PASSWORD, "another pepper", NOW), false);
  assert.equal(adminTokenValid(token, PASSWORD, undefined, NOW), false);
  assert.equal(adminTokenValid(token, PASSWORD, "", NOW), false);
  assert.equal(adminTokenValid(token, undefined, PEPPER, NOW), false);
});

test("the cookie is keyed by neither the PIN alone nor the stored tag", () => {
  // Otherwise a stolen cookie, or a read of admin_guard, would let anyone
  // try all 10,000 PINs offline, or forge a cookie outright.
  const [expiry, sig] = makeAdminToken(PASSWORD, PEPPER, NOW).split(".");
  for (const key of [PASSWORD, adminTag(PASSWORD, PEPPER)]) {
    assert.notEqual(createHmac("sha256", key).update(`keystone-admin|${expiry}`).digest("hex"), sig);
  }
});

test("a token cannot be stretched or made up", () => {
  const [expiry, sig] = makeAdminToken(PASSWORD, PEPPER, NOW).split(".");
  const later = String(Number(expiry) + 365 * 86_400_000);
  for (const forged of [
    `${later}.${sig}`,
    `${expiry}.${"0".repeat(64)}`,
    `${expiry}.${sig.slice(0, 63)}`,
    `${expiry}.${sig.toUpperCase()}`,
    `${expiry}${sig}`,
    "",
    null,
    undefined,
  ]) {
    assert.equal(adminTokenValid(forged, PASSWORD, PEPPER, NOW), false, String(forged));
  }
});
