import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptMessage, checkAdminAttempt, LOCK_INTERVAL, MAX_FAILURES } from "@/lib/adminGuard";

const TAG = "a".repeat(64);
const UNTIL = "2026-10-19T14:30:00+00:00";

// A stand-in for db.rpc that records its calls and answers as told.
function fakeRpc(answer) {
  const calls = [];
  const rpc = async (fn, args) => {
    calls.push({ fn, args });
    if (answer instanceof Error) throw answer;
    return typeof answer === "function" ? answer(args) : answer;
  };
  return { rpc, calls };
}

test("every attempt is counted, with the PIN's result, the tag and the limits", async () => {
  for (const ok of [true, false]) {
    const { rpc, calls } = fakeRpc({ data: { locked_until: null, failures: ok ? 0 : 1 }, error: null });
    await checkAdminAttempt({ ok, tag: TAG, rpc });
    assert.deepEqual(calls, [
      { fn: "admin_attempt", args: { p_tag: TAG, p_ok: ok, p_max: MAX_FAILURES, p_lock: LOCK_INTERVAL } },
    ]);
  }
  assert.equal(MAX_FAILURES, 5);
  assert.equal(LOCK_INTERVAL, "1 hour");
});

test("the right PIN while not locked lets you in", async () => {
  const { rpc } = fakeRpc({ data: { locked_until: null, failures: 0 }, error: null });
  assert.deepEqual(await checkAdminAttempt({ ok: true, tag: TAG, rpc }), { status: "in" });
  // PostgREST may hand the row back in a list.
  const listed = fakeRpc({ data: [{ locked_until: null, failures: 0 }], error: null });
  assert.deepEqual(await checkAdminAttempt({ ok: true, tag: TAG, rpc: listed.rpc }), { status: "in" });
});

test("a wrong PIN says how many tries are left", async () => {
  for (const [failures, left] of [[1, 4], [2, 3], [4, 1]]) {
    const { rpc } = fakeRpc({ data: { locked_until: null, failures }, error: null });
    assert.deepEqual(await checkAdminAttempt({ ok: false, tag: TAG, rpc }), { status: "wrong", left });
  }
  assert.match(attemptMessage({ status: "wrong", left: 4 }), /4 tries left/);
  assert.match(attemptMessage({ status: "wrong", left: 1 }), /1 try left/);
});

test("while locked, even the right PIN is refused, with the time it unlocks", async () => {
  for (const ok of [true, false]) {
    const { rpc } = fakeRpc({ data: { locked_until: UNTIL, failures: 0 }, error: null });
    assert.deepEqual(await checkAdminAttempt({ ok, tag: TAG, rpc }), {
      status: "locked",
      until: "2026-10-19T14:30:00.000Z",
    });
  }
  const message = attemptMessage({ status: "locked", until: "2026-10-19T14:30:00.000Z" });
  assert.match(message, /19 Oct 2026, 15:30/, "in London time (BST)");
  assert.match(message, /ADMIN_PASSWORD/);
});

test("no clear answer from the database refuses: fail closed", async () => {
  const broken = [
    new Error("network down"),
    { data: null, error: { message: "function public.admin_attempt does not exist" } },
    { data: null, error: null },
    { data: [], error: null },
    { data: "yes", error: null },
    { data: { locked_until: "not a time", failures: 0 }, error: null },
    undefined,
  ];
  for (const answer of broken) {
    for (const ok of [true, false]) {
      const { rpc } = fakeRpc(answer);
      assert.deepEqual(await checkAdminAttempt({ ok, tag: TAG, rpc }), { status: "unavailable" }, String(answer));
    }
  }
  // A wrong PIN with a count that makes no sense is refused the same way.
  for (const failures of [0, 5, null, "x"]) {
    const { rpc } = fakeRpc({ data: { locked_until: null, failures }, error: null });
    assert.deepEqual(await checkAdminAttempt({ ok: false, tag: TAG, rpc }), { status: "unavailable" });
  }
  assert.match(attemptMessage({ status: "unavailable" }), /^Admin sign-in is unavailable right now/);
  assert.match(attemptMessage(undefined), /^Admin sign-in is unavailable right now/);
});

test("without a tag the database is not even asked", async () => {
  for (const tag of [undefined, null, ""]) {
    const { rpc, calls } = fakeRpc({ data: { locked_until: null, failures: 0 }, error: null });
    assert.deepEqual(await checkAdminAttempt({ ok: true, tag, rpc }), { status: "unavailable" });
    assert.equal(calls.length, 0);
  }
});

test("only ok === true counts as the right PIN", async () => {
  const { rpc, calls } = fakeRpc({ data: { locked_until: null, failures: 1 }, error: null });
  assert.deepEqual(await checkAdminAttempt({ ok: "true", tag: TAG, rpc }), { status: "wrong", left: 4 });
  assert.equal(calls[0].args.p_ok, false);
});
