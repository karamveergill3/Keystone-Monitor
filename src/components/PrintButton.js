"use client";

import { useEffect, useRef, useState } from "react";
import { quietButtonClass } from "@/lib/ui";
import { printStatus, queueErrorText, POLL_EVERY_MS, POLL_FOR_MS } from "@/lib/printButton";

// Asks after a queued job every few seconds until printStatus says it is
// done, which is at the latest two minutes after it was queued. Outside
// the component: it runs from a click, never during render.
async function pollJob(jobId, startedAt, { setText, setBusy, timer }) {
  try {
    const res = await fetch(`/api/print/jobs/${jobId}`, { cache: "no-store" });
    const elapsedMs = Date.now() - startedAt;
    if (res.ok) {
      const s = printStatus({ ...(await res.json()), elapsedMs });
      setText(s.text);
      if (s.done) {
        setBusy(false);
        return;
      }
    } else if (elapsedMs >= POLL_FOR_MS) {
      setBusy(false);
      return;
    }
  } catch {
    // A dropped request: try again on the next tick.
  }
  timer.current = setTimeout(() => pollJob(jobId, startedAt, { setText, setBusy, timer }), POLL_EVERY_MS);
}

// A Print button: the header's fleet summary for admins, and the one in
// each report box, which sends that report with the box's From and To.
// Queues a job for the office print agent (docs/print-agent.md), then asks
// after it every few seconds for up to two minutes and says in a few words
// where it got to. Nothing here can reach the printer itself.
//
// report is "fleet", "project" or "account"; target is the project's slug
// or the account's id.
export default function PrintButton({ label = "Print", report, target = null, className = quietButtonClass }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function start(event) {
    const form = event.currentTarget.form;
    const dates = form
      ? { from: form.elements.namedItem("from")?.value || null, to: form.elements.namedItem("to")?.value || null }
      : {};
    clearTimeout(timer.current);
    setBusy(true);
    setText("Sending...");
    try {
      const res = await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, target, ...dates, copies: 1 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setText(queueErrorText(res.status, body.error));
        setBusy(false);
        return;
      }
      const startedAt = Date.now();
      setText(printStatus({ status: "queued", online: body.online }).text);
      timer.current = setTimeout(() => pollJob(body.jobId, startedAt, { setText, setBusy, timer }), POLL_EVERY_MS);
    } catch {
      setText(queueErrorText(0));
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={start} disabled={busy} className={className}>
        {label}
      </button>
      {text && (
        <span className="text-xs text-muted" role="status" aria-live="polite">
          {text}
        </span>
      )}
    </span>
  );
}
