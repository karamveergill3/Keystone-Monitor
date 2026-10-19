// What a Print button says beside itself, from the job's state as
// /api/print and /api/print/jobs/[id] give it.
//
// Pure, so the component and the tests share it.

export const POLL_EVERY_MS = 3_000;
export const POLL_FOR_MS = 120_000;

export const OFFLINE_TEXT = "Printer offline: it will print when the office Mac is on";

// state: { status, error, online } from the server, plus elapsedMs since
// the job was queued. Returns { text, done }: done means stop polling.
export function printStatus({ status, error = null, online = false, elapsedMs = 0 } = {}) {
  if (status === "printed") return { text: "Printed", done: true };
  if (status === "failed") return { text: `Did not print: ${error || "no reason given"}`, done: true };
  const timedOut = elapsedMs >= POLL_FOR_MS;
  // A job the agent has taken is on its way whatever the heartbeat says.
  if (status === "printing") return { text: "Sent to the printer", done: timedOut };
  if (status === "queued") return { text: online ? "Sent to the printer" : OFFLINE_TEXT, done: timedOut };
  return { text: "", done: true };
}

// What a refused or failed request to queue says.
export function queueErrorText(httpStatus, serverError) {
  if (httpStatus === 429) return "Too many prints in the last minute: try again shortly";
  // A 404 with a reason is a report that is not there; without one, the
  // route's answer to anyone not signed in to admin.
  if (httpStatus === 404 && serverError) return `Could not send: ${serverError}`;
  if (httpStatus === 404 || httpStatus === 401 || httpStatus === 403) return "Could not send: sign in to admin again";
  return `Could not send: ${serverError || "the site did not answer"}`;
}
