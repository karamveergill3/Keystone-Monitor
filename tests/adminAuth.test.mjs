import { test } from "node:test";
import assert from "node:assert/strict";
import { adminConfigured, passwordMatches, makeAdminToken, adminTokenValid, SESSION_DAYS } from "@/lib/adminAuth";

const PASSWORD = "correct horse battery";
const NOW = Date.parse("2026-10-17T12:00:00Z");

test("a missing or short password switches the admin screen off", () => {
  for (const p of [undefined, null, "", "short", "elevenchars"]) {
    assert.equal(adminConfigured(p), false, String(p));
    assert.equal(passwordMatches(p ?? "", p), false, String(p));
  }
  assert.equal(adminConfigured("twelve chars"), true);
});

test("only the exact password matches", () => {
  assert.equal(passwordMatches(PASSWORD, PASSWORD), true);
  for (const guess of ["", "correct horse", `${PASSWORD} `, PASSWORD.toUpperCase()]) {
    assert.equal(passwordMatches(guess, PASSWORD), false, guess);
  }
});

test("a token made with the password is accepted until it expires", () => {
  const token = makeAdminToken(PASSWORD, NOW);
  assert.equal(adminTokenValid(token, PASSWORD, NOW), true);
  assert.equal(adminTokenValid(token, PASSWORD, NOW + (SESSION_DAYS - 1) * 86_400_000), true);
  assert.equal(adminTokenValid(token, PASSWORD, NOW + SESSION_DAYS * 86_400_000), false);
});

test("changing the password, or switching admin off, ends every token", () => {
  const token = makeAdminToken(PASSWORD, NOW);
  assert.equal(adminTokenValid(token, "a different password", NOW), false);
  assert.equal(adminTokenValid(token, undefined, NOW), false);
});

test("a token cannot be stretched or made up", () => {
  const [expiry, sig] = makeAdminToken(PASSWORD, NOW).split(".");
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
    assert.equal(adminTokenValid(forged, PASSWORD, NOW), false, String(forged));
  }
});
