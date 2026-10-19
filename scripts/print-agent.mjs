#!/usr/bin/env node
// Keystone Monitor print agent: runs on the office Mac, asks the site for
// print jobs, prints them with lp and says how it went. Node 22 or later,
// no dependencies. docs/print-agent.md says how to install it.
//
// Pull-only: the Mac makes every connection, so no port is opened. When the
// Mac sleeps, jobs simply wait on the site.
//
// Environment (the LaunchAgent sources ~/.keystone-monitor-print.env):
//   PRINT_AGENT_KEY      the agent key (required); the site keeps only its SHA-256
//   PRINT_AGENT_URL      the site, default https://keystone-monitor.vercel.app
//   PRINT_AGENT_PRINTER  the CUPS queue name; leave unset for the default printer
//   PRINT_AGENT_NAME     how this agent is recorded, default the host name

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";

const VERSION = "1.0.0";
const POLL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
const LP_TIMEOUT_MS = 120_000;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const SITE = (process.env.PRINT_AGENT_URL || "https://keystone-monitor.vercel.app").replace(/\/+$/, "");
const KEY = (process.env.PRINT_AGENT_KEY || "").trim();
const PRINTER = (process.env.PRINT_AGENT_PRINTER || "").trim() || null;
const NAME = ((process.env.PRINT_AGENT_NAME || "").trim() || hostname()).slice(0, 64);

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

if (!KEY) {
  log("PRINT_AGENT_KEY is not set. Put it in ~/.keystone-monitor-print.env (see docs/print-agent.md).");
  process.exit(78); // EX_CONFIG: launchd's ThrottleInterval keeps the retries slow.
}

let stopping = false;
let wake = null;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    log(`${signal}: stopping after the current job`);
    wake?.();
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    wake = () => {
      clearTimeout(t);
      resolve();
    };
  });
}

class KeyRejected extends Error {}

async function call(body) {
  const res = await fetch(`${SITE}/api/print-queue`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "User-Agent": `keystone-print-agent/${VERSION}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401) throw new KeyRejected("the site rejected PRINT_AGENT_KEY");
  const text = await res.text();
  if (!res.ok) throw new Error(`site answered ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// lp, run directly (no shell), with its own error text kept for the report.
function lp(file, copies) {
  const args = [];
  if (PRINTER) args.push("-d", PRINTER);
  args.push("-n", String(copies), "-t", "Keystone Monitor fleet summary", file);
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawn("lp", args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      resolve({ ok: false, error: `could not run lp: ${err.message}` });
      return;
    }
    const timer = setTimeout(() => child.kill("SIGKILL"), LP_TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `could not run lp: ${err.message}` });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, output: out.trim() });
      else resolve({ ok: false, error: out.trim() || `lp ${signal ? `was killed (${signal})` : `exited with ${code}`}` });
    });
  });
}

async function printJob(job) {
  const dir = await mkdtemp(join(tmpdir(), "keystone-print-"));
  const file = join(dir, `report-${job.id}.pdf`);
  try {
    // Only ever a report from the site this agent polls.
    if (new URL(job.url).origin !== new URL(SITE).origin || !new URL(job.url).pathname.startsWith("/api/reports/")) {
      return { ok: false, error: "the job's address is not a report on this site" };
    }
    const res = await fetch(job.url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return { ok: false, error: `could not download the report: the site answered ${res.status}` };
    const pdf = Buffer.from(await res.arrayBuffer());
    if (pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return { ok: false, error: "the site did not send a PDF" };
    }
    await writeFile(file, pdf, { mode: 0o600 });
    return await lp(file, job.copies);
  } catch (err) {
    return { ok: false, error: `could not print: ${err.message}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// A few tries, so a dropped connection does not leave a printed job to be
// marked failed by the site's 10-minute rule.
async function report(jobId, result) {
  const body = { action: "report", jobId, ok: result.ok, error: result.ok ? null : result.error.slice(0, 1000) };
  for (let attempt = 1; ; attempt++) {
    try {
      await call(body);
      return;
    } catch (err) {
      if (attempt >= 3 || err instanceof KeyRejected) throw err;
      log(`job ${jobId}: report failed (${err.message}); trying again`);
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
  }
}

async function main() {
  log(`print agent ${VERSION} as "${NAME}", printer ${PRINTER ?? "(default)"}, site ${SITE}`);
  let backoff = 0;
  let keyWarned = false;
  while (!stopping) {
    try {
      const { job } = await call({ action: "poll", agent: NAME, printer: PRINTER, version: VERSION });
      if (keyWarned) log("key accepted again");
      keyWarned = false;
      backoff = 0;
      if (job) {
        log(`job ${job.id}: printing ${job.copies} ${job.copies === 1 ? "copy" : "copies"}`);
        const result = await printJob(job);
        log(`job ${job.id}: ${result.ok ? `printed${result.output ? ` (${result.output})` : ""}` : `failed: ${result.error}`}`);
        // Reported even while stopping: the job is finished either way.
        await report(job.id, result);
        continue;
      }
    } catch (err) {
      backoff = Math.min(MAX_BACKOFF_MS, backoff ? backoff * 2 : POLL_MS * 2);
      if (err instanceof KeyRejected) {
        if (!keyWarned) {
          log("THE SITE REJECTED THIS AGENT'S KEY. Check PRINT_AGENT_KEY in ~/.keystone-monitor-print.env and that its SHA-256 is in print_agent_keys (docs/print-agent.md).");
        }
        keyWarned = true;
        backoff = MAX_BACKOFF_MS;
      } else {
        log(`error: ${err.message}; trying again in ${Math.round(backoff / 1000)} s`);
      }
    }
    if (!stopping) await sleep(backoff || POLL_MS);
  }
  log("stopped");
}

main();
