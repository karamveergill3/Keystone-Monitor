// The MT5 EA cannot be compiled here, so these pin what can be checked
// from its source: that it never trades, and that it sends what the server
// reads.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { payload } from "./fixtures.mjs";
import { KEY_PREFIX } from "@/lib/syncKeys";
import { eaReportsOpen } from "@/lib/openPositions";

const EA = readFileSync(new URL("../public/ea/KeystoneSync.mq5", import.meta.url), "utf8");
const code = EA.replace(/\/\/.*$/gm, "");

// One function's source, from its signature to its closing brace. The
// file's functions open and close their bodies at two spaces, and every
// brace inside them is indented further.
function body(signature) {
  const start = code.indexOf(signature);
  assert.ok(start >= 0, `the EA has no ${signature}`);
  const end = code.slice(start).search(/^  \}\r?$/m);
  assert.ok(end > 0, `cannot find where ${signature} ends`);
  return code.slice(start, start + end);
}

// The JSON keys a piece of source writes: each one appears as \"key\":
function keysIn(source) {
  return new Set([...source.matchAll(/\\"(\w+)\\":/g)].map((m) => m[1]));
}

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

test("every field the server reads is one the EA sends, from the function that builds it", () => {
  // Per function, not across the whole file: deals and open positions share
  // field names (symbol, volume, profit...), so one builder dropping a field
  // must not be hidden by the other still sending it.
  const p = payload();
  const parts = [
    ["int SendPage(", Object.keys(p)],
    ["string BuildAccount()", Object.keys(p.account)],
    ["string BuildDeals(", Object.keys(p.deals[0])],
    ["string BuildOpen()", Object.keys(p.open[0])],
  ];
  for (const [signature, expected] of parts) {
    const sent = keysIn(body(signature));
    for (const k of expected) assert.ok(sent.has(k), `${signature} does not send "${k}"`);
  }
});

test("the EA's version is one the account page knows lists open positions", () => {
  const version = code.match(/#define EA_VERSION\s+"([^"]+)"/)?.[1];
  assert.ok(version, "no EA_VERSION");
  assert.equal(eaReportsOpen(version), true, version);
  assert.equal(payload().ea, version);
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
