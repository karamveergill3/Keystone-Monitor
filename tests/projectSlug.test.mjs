import { test } from "node:test";
import assert from "node:assert/strict";
import { projectSlug, MAX_SLUG } from "@/lib/projectSlug";

const VALID = /^[a-z0-9-]{1,40}$/;

test("a name becomes a lower-case hyphenated address", () => {
  assert.equal(projectSlug("Cycle Method"), "cycle-method");
  assert.equal(projectSlug("  V200 · Grid  "), "v200-grid");
  assert.equal(projectSlug("Café Bot!"), "cafe-bot");
});

test("a name with nothing usable still gets an address", () => {
  assert.equal(projectSlug("···"), "algorithm");
  assert.equal(projectSlug(""), "algorithm");
});

test("never one already taken", () => {
  assert.equal(projectSlug("V100", ["v100"]), "v100-2");
  assert.equal(projectSlug("V100", ["v100", "v100-2"]), "v100-3");
});

test("always within the database's rule, however long the name", () => {
  const long = "A very long algorithm name that goes on and on and on";
  const slug = projectSlug(long);
  assert.ok(slug.length <= MAX_SLUG && VALID.test(slug), slug);
  const again = projectSlug(long, [slug]);
  assert.ok(again.length <= MAX_SLUG && VALID.test(again) && again !== slug, again);
});
