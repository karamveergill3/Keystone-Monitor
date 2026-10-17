import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, addDays, weekStart, monthStart, monthEnd, addMonths, londonMidnight, isDayKey, daysInclusive } from "@/lib/days";

test("a deal late on a summer evening UTC is the next London day", () => {
  assert.equal(dayKey("2026-07-01T23:30:00Z"), "2026-07-02");
  assert.equal(dayKey("2026-12-01T23:30:00Z"), "2026-12-01");
});

test("weeks start on Monday", () => {
  assert.equal(weekStart("2026-10-17"), "2026-10-12"); // Saturday
  assert.equal(weekStart("2026-10-12"), "2026-10-12"); // Monday
  assert.equal(weekStart("2026-10-18"), "2026-10-12"); // Sunday
});

test("month arithmetic", () => {
  assert.equal(monthStart("2026-10-17"), "2026-10-01");
  assert.equal(monthEnd("2026-02-10"), "2026-02-28");
  assert.equal(monthEnd("2028-02-10"), "2028-02-29");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-15", -1), "2025-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("London midnight is 23:00 UTC in summer and 00:00 UTC in winter", () => {
  assert.equal(londonMidnight("2026-07-01").toISOString(), "2026-06-30T23:00:00.000Z");
  assert.equal(londonMidnight("2026-12-01").toISOString(), "2026-12-01T00:00:00.000Z");
  // Both changeover days.
  assert.equal(londonMidnight("2026-03-29").toISOString(), "2026-03-29T00:00:00.000Z");
  assert.equal(londonMidnight("2026-10-25").toISOString(), "2026-10-24T23:00:00.000Z");
});

test("day keys are validated as real dates", () => {
  assert.equal(isDayKey("2026-10-17"), true);
  assert.equal(isDayKey("2026-02-30"), false);
  assert.equal(isDayKey("2026-1-1"), false);
  assert.equal(isDayKey(undefined), false);
  assert.equal(daysInclusive("2026-10-01", "2026-10-15"), 15);
});
