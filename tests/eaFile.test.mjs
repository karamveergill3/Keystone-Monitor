import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canPersonalise, personaliseEa, eaFileName } from "@/lib/eaFile";
import { generateSyncKey } from "@/lib/syncKeys";

const EA = readFileSync(new URL("../public/ea/KeystoneSync.mq5", import.meta.url), "utf8");
const URL_OK = "https://keystone-monitor.vercel.app/api/sync";

test("the EA is built with the account's SyncUrl and SyncKey as its inputs", () => {
  const key = generateSyncKey();
  const out = personaliseEa(EA, { syncUrl: URL_OK, syncKey: key });
  assert.match(out, new RegExp(`^input string SyncUrl\\s*=\\s*"${URL_OK.replace(/[./]/g, "\\$&")}";`, "m"));
  assert.match(out, new RegExp(`^input string SyncKey\\s*=\\s*"${key}";`, "m"));
  // Nothing else changes, and the file stays ASCII for MetaEditor.
  assert.equal(out.length, EA.length + URL_OK.length + key.length);
  assert.doesNotMatch(out, /[^\x00-\x7f]/);
});

test("only a real https sync address and a real key are built in", () => {
  const key = generateSyncKey();
  assert.equal(canPersonalise(URL_OK, key), true);
  for (const bad of ["http://localhost:3000/api/sync", "https://example.com/", "https://a.b/api/sync?x", 'https://a.b/api/sync";']) {
    assert.equal(canPersonalise(bad, key), false, bad);
    assert.throws(() => personaliseEa(EA, { syncUrl: bad, syncKey: key }));
  }
  for (const bad of ["", "ptk_short", `${key}"`, key.replace("ptk_", "xyz_")]) {
    assert.equal(canPersonalise(URL_OK, bad), false, bad);
  }
});

test("a source without the inputs is refused rather than shipped unchanged", () => {
  assert.throws(() => personaliseEa("// nothing here", { syncUrl: URL_OK, syncKey: generateSyncKey() }), /inputs were not found/);
});

test("the file is named after the account, in plain ASCII", () => {
  assert.equal(eaFileName("V100 · Sam · 50k"), "KeystoneSync-V100-Sam-50k.mq5");
  assert.equal(eaFileName("Cycle — Main / GBP"), "KeystoneSync-Cycle-Main-GBP.mq5");
  assert.equal(eaFileName("···"), "KeystoneSync.mq5");
  assert.equal(eaFileName(null), "KeystoneSync.mq5");
  assert.ok(eaFileName("x".repeat(100)).length <= "KeystoneSync-.mq5".length + 40);
});
