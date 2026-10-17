import { test } from "node:test";
import assert from "node:assert/strict";
import { openSnapshot, eaReportsOpen, OPEN_POSITIONS_EA } from "@/lib/openPositions";
import { payload } from "./fixtures.mjs";

const SYNC = "2026-10-17T12:00:00+00:00";
const EARLIER = "2026-10-16T09:00:00+00:00";

function account(overrides = {}) {
  return { last_sync_at: SYNC, open_positions: 2, ea_version: OPEN_POSITIONS_EA, ...overrides };
}

function rows(updatedAt) {
  return [
    { ticket: "1005", symbol: "EURUSD", updated_at: updatedAt },
    { ticket: "1004", symbol: "XAUUSD", updated_at: updatedAt },
  ];
}

test("rows from the last sync are its current list", () => {
  // Postgres hands back the same instant in its own format.
  const s = openSnapshot(rows("2026-10-17T12:00:00.000Z"), account());
  assert.equal(s.state, "current");
  assert.deepEqual(s.rows.map((r) => r.ticket), ["1005", "1004"]);
  assert.equal(s.reported, 2);
});

test("rows newer than the last sync are current too", () => {
  // The replace landed but the account update after it failed.
  assert.equal(openSnapshot(rows("2026-10-17T12:02:00Z"), account()).state, "current");
});

test("rows left by an earlier sync are never shown as current", () => {
  // A newer EA stored these, then an older one took over: its syncs move
  // last_sync_at on and leave the rows behind.
  const s = openSnapshot(rows(EARLIER), account({ ea_version: "2026.10.17", open_positions: 5 }));
  assert.equal(s.state, "unreported");
  assert.deepEqual(s.rows, []);
  assert.equal(s.reported, 5);

  // And if that older EA says nothing is open, nothing is.
  assert.equal(openSnapshot(rows(EARLIER), account({ ea_version: "2026.10.17", open_positions: 0 })).state, "none");
});

test("no rows and positions open: an older EA, or a list that missed them", () => {
  assert.equal(openSnapshot([], account({ ea_version: "2026.10.17" })).state, "unreported");
  assert.equal(openSnapshot([], account({ ea_version: null })).state, "unreported");
  // The latest EA counted positions but listed none: not its fault, and
  // the next sync fixes it.
  assert.equal(openSnapshot([], account()).state, "pending");
});

test("nothing open, and an EA that has never synced", () => {
  assert.equal(openSnapshot([], account({ open_positions: 0 })).state, "none");
  assert.equal(openSnapshot([], account({ open_positions: null })).state, "none");
  assert.equal(openSnapshot(rows(SYNC), account({ last_sync_at: null })).state, "waiting");
});

test("EA versions compare part by part", () => {
  assert.equal(eaReportsOpen(OPEN_POSITIONS_EA), true);
  assert.equal(eaReportsOpen(payload().ea), true);
  assert.equal(eaReportsOpen("2026.10.17.10"), true);
  assert.equal(eaReportsOpen("2026.11.01"), true);
  assert.equal(eaReportsOpen("2027.1.1"), true);
  assert.equal(eaReportsOpen("2026.10.17"), false);
  assert.equal(eaReportsOpen("2026.10.17.1"), false);
  assert.equal(eaReportsOpen("2026.09.30.9"), false);
  assert.equal(eaReportsOpen(""), false);
  assert.equal(eaReportsOpen(null), false);
  assert.equal(eaReportsOpen("dev build"), false);
});
