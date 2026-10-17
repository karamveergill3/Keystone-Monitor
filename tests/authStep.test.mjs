import { test } from "node:test";
import assert from "node:assert/strict";
import { authStep } from "@/lib/authStep";

const verified = { factors: [{ id: "f1", status: "verified", factor_type: "totp" }] };
const halfDone = { factors: [{ id: "f2", status: "unverified", factor_type: "totp" }] };

test("a two-factor session goes straight in", () => {
  assert.equal(authStep("aal2", verified), "ok");
});

test("a password session is asked for a code only if a factor is really enrolled", () => {
  assert.equal(authStep("aal1", verified), "needs-code");
  assert.equal(authStep("aal1", halfDone), "needs-2fa-setup");
  assert.equal(authStep("aal1", { factors: [] }), "needs-2fa-setup");
  assert.equal(authStep("aal1", {}), "needs-2fa-setup");
  assert.equal(authStep(undefined, null), "needs-2fa-setup");
});
