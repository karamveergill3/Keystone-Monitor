// Server actions are public endpoints: anyone who finds an action's ID can
// call it, whether or not they ever saw the admin page. So every exported
// action in the admin actions file must check the admin password before it
// does anything else.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../src/app/(app)/admin/actions.js", import.meta.url), "utf8");

test("every admin action checks the admin password first", () => {
  const actions = [...SOURCE.matchAll(/export\s+async\s+function\s+(\w+)\s*\([^)]*\)\s*\{\s*([^\n]*)/g)];
  assert.ok(actions.length >= 6, "found the admin actions");
  for (const [, name, firstLine] of actions) {
    assert.match(firstLine, /^await requireAdmin\(\);/, `${name} must start with await requireAdmin();`);
  }
  // Nothing exported any other way (export const, export default, export { }).
  assert.equal([...SOURCE.matchAll(/^export\s+(?!async\s+function)/gm)].length, 0);
});
