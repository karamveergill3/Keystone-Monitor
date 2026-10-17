// The MT5 EA cannot be compiled here, so these pin what can be checked
// from its source: that it never trades, and that it sends what the server
// reads.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { payload } from "./fixtures.mjs";
import { KEY_PREFIX } from "@/lib/syncKeys";

const EA = readFileSync(new URL("../public/ea/KeystoneSync.mq5", import.meta.url), "utf8");
const code = EA.replace(/\/\/.*$/gm, "");

test("the EA has no way to trade", () => {
  const forbidden = [
    /\bOrderSend(Async)?\s*\(/,
    /\bOrderCheck\s*\(/,
    /\bCTrade\b/,
    /\bCPositionInfo\b/,
    /#include\s*<Trade\//,
    /\bPosition(Close|Modify|Open)\w*\s*\(/,
    /\bTRADE_ACTION_/,
  ];
  for (const re of forbidden) assert.doesNotMatch(code, re, `found ${re}`);
});

test("the EA is plain ASCII, which MetaEditor always reads correctly", () => {
  assert.doesNotMatch(EA, /[^\x00-\x7f]/);
});

test("every field the server reads is one the EA sends", () => {
  const sent = new Set([...code.matchAll(/\\"(\w+)\\":/g)].map((m) => m[1]));
  const p = payload();
  const expected = [
    ...Object.keys(p).filter((k) => k !== "ea" && k !== "v"),
    "v",
    "ea",
    ...Object.keys(p.account),
    ...Object.keys(p.deals[0]),
    ...Object.keys(p.open[0]),
  ];
  for (const k of expected) assert.ok(sent.has(k), `EA does not send "${k}"`);
});

test("the EA sends its open positions, capped, in every page", () => {
  assert.match(code, /#define MAX_OPEN\s+\d+/);
  assert.match(code, /string BuildOpen\(\)/);
  assert.match(code, /",\\"open\\":" \+ BuildOpen\(\)/);
  // Open times are converted to UTC the same way deal times are.
  assert.match(code, /MsToIso\(msc - \(long\)utcOffset \* 1000\)[\s\S]*MsToIso\(msc - \(long\)utcOffset \* 1000\)/);
});

test("the EA only counts a page as stored when the sync endpoint says ok", () => {
  assert.match(code, /StringFind\(text, "\\"ok\\":true"\) < 0/);
  // The raw source: stripping // comments would also cut "https://" lines.
  assert.match(EA, /StringSubstr\(SyncUrl, urlLen - 9\) != "\/api\/sync"/);
});

test("the EA authenticates the way the server expects", () => {
  assert.match(code, /Authorization: Bearer " \+ SyncKey/);
  assert.match(code, new RegExp(`StringFind\\(SyncKey, "${KEY_PREFIX}"\\)`));
  assert.match(code, /input string SyncUrl/);
  assert.match(code, /input string SyncKey/);
});
