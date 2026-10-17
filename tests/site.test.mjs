import { test } from "node:test";
import assert from "node:assert/strict";
import { syncStatus, OFFLINE_AFTER_MS } from "@/lib/site";

test("sync status", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  assert.equal(syncStatus(null, now), "waiting");
  assert.equal(syncStatus(new Date(now - 60_000).toISOString(), now), "online");
  assert.equal(syncStatus(new Date(now - OFFLINE_AFTER_MS - 1).toISOString(), now), "offline");
});
