import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext, syncStatus, OFFLINE_AFTER_MS } from "@/lib/site";

test("same-site paths pass through", () => {
  assert.equal(safeNext("/accounts/abc?page=2#t"), "/accounts/abc?page=2#t");
  assert.equal(safeNext("/"), "/");
  assert.equal(safeNext("/set-password"), "/set-password");
});

test("anything a browser would send elsewhere falls back", () => {
  for (const bad of [
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/\t\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "evil.example",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeNext(bad), "/", JSON.stringify(bad));
  }
});

test("sync status", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  assert.equal(syncStatus(null, now), "waiting");
  assert.equal(syncStatus(new Date(now - 60_000).toISOString(), now), "online");
  assert.equal(syncStatus(new Date(now - OFFLINE_AFTER_MS - 1).toISOString(), now), "offline");
});
