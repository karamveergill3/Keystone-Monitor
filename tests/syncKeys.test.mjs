import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSyncKey, hashSyncKey, keyHint, looksLikeSyncKey, bearerKey } from "@/lib/syncKeys";

test("keys are unique, well formed and hashed to hex", () => {
  const a = generateSyncKey();
  const b = generateSyncKey();
  assert.notEqual(a, b);
  assert.ok(looksLikeSyncKey(a), a);
  assert.match(hashSyncKey(a), /^[0-9a-f]{64}$/);
  assert.equal(hashSyncKey(a), hashSyncKey(a));
  assert.equal(keyHint(a), a.slice(-4));
});

test("only a bearer header carrying a real key is accepted", () => {
  const k = generateSyncKey();
  assert.equal(bearerKey(`Bearer ${k}`), k);
  assert.equal(bearerKey(`bearer ${k}`), k);
  assert.equal(bearerKey(k), null);
  assert.equal(bearerKey("Bearer nope"), null);
  assert.equal(bearerKey(null), null);
});
