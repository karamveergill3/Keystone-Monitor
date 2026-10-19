import { test } from "node:test";
import assert from "node:assert/strict";
import { printStatus, queueErrorText, OFFLINE_TEXT, POLL_FOR_MS } from "@/lib/printButton";

test("what the button says for each state of the job", () => {
  assert.deepEqual(printStatus({ status: "queued", online: true }), { text: "Sent to the printer", done: false });
  assert.deepEqual(printStatus({ status: "queued", online: false }), { text: OFFLINE_TEXT, done: false });
  assert.equal(OFFLINE_TEXT, "Printer offline: it will print when the office Mac is on");
  assert.deepEqual(printStatus({ status: "printing", online: false }), { text: "Sent to the printer", done: false });
  assert.deepEqual(printStatus({ status: "printed" }), { text: "Printed", done: true });
  assert.deepEqual(printStatus({ status: "failed", error: "lp: out of paper" }), { text: "Did not print: lp: out of paper", done: true });
  assert.deepEqual(printStatus({ status: "failed" }), { text: "Did not print: no reason given", done: true });
});

test("polling stops after two minutes, keeping what it last said", () => {
  assert.deepEqual(printStatus({ status: "queued", online: false, elapsedMs: POLL_FOR_MS }), { text: OFFLINE_TEXT, done: true });
  assert.deepEqual(printStatus({ status: "printing", elapsedMs: POLL_FOR_MS + 1 }), { text: "Sent to the printer", done: true });
  assert.equal(printStatus({ status: "queued", online: true, elapsedMs: POLL_FOR_MS - 1 }).done, false);
});

test("a refused request says why", () => {
  assert.match(queueErrorText(429), /Too many prints/);
  assert.match(queueErrorText(404), /sign in to admin again/);
  assert.equal(queueErrorText(404, "no such project"), "Could not send: no such project");
  assert.equal(queueErrorText(500, "the site could not queue it"), "Could not send: the site could not queue it");
  assert.equal(queueErrorText(0), "Could not send: the site did not answer");
});
