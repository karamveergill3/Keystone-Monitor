// The office printer's queue, given a service-role client.
//
// Pull-only: nothing connects to the office. An admin queues a job
// (queuePrint, from POST /api/print); the print agent on the
// office Mac (scripts/print-agent.mjs) polls POST /api/print-queue with
// its own key (agentRequest), prints the PDF and reports back. The
// database decides whether a key is known (claim_print_job and
// finish_print_job in schema.sql, section 9): the site only ever hands it
// the key's SHA-256.
//
// Kept out of the routes so the tests can drive it with a fake client.

import { createHash } from "node:crypto";
import { todayKey } from "@/lib/days";
import { reportRange } from "@/lib/reportRange";

export const MAX_COPIES = 5;
// More than this many jobs requested in the last minute and the next is
// refused: one admin double-clicking is fine, a loop is not.
export const JOBS_PER_MINUTE = 3;
// An agent that has polled within this long counts as online. It polls
// every 5 seconds.
export const ONLINE_WITHIN_MS = 30_000;
// What an agent may send: a poll or a report is a few hundred bytes.
export const MAX_AGENT_BODY = 4096;
// Unknown key, from the database (SQLSTATE invalid_authorization_specification).
const UNKNOWN_KEY = "28000";

function reply(status, body) {
  return { status, body };
}

export function hashAgentKey(key) {
  return createHash("sha256").update(String(key), "utf8").digest("hex");
}

// "Authorization: Bearer <key>" -> the key, or null. Keys are made with
// `openssl rand -hex 32` (docs/print-agent.md), but anything key-like of a
// sensible length is passed on and left to the database to refuse.
export function agentKey(headerValue) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(headerValue ?? "").trim());
  return m && /^[A-Za-z0-9_-]{32,128}$/.test(m[1]) ? m[1] : null;
}

// copies from the button's body: 1 to MAX_COPIES, 1 when left out.
export function parseCopies(body) {
  const v = body?.copies;
  if (v === undefined || v === null) return 1;
  return Number.isInteger(v) && v >= 1 && v <= MAX_COPIES ? v : null;
}

async function agentOnline(db, now) {
  const { count, error } = await db
    .from("print_agents")
    .select("name", { count: "exact", head: true })
    .gte("last_seen_at", new Date(now - ONLINE_WITHIN_MS).toISOString());
  if (error) throw new Error(`print agents read failed: ${error.message}`);
  return (count ?? 0) > 0;
}

const UNIQUE_VIOLATION = "23505";
const SLUG = /^[a-z0-9-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// What the button asks for -> the report's path on this site, as the
// agent will download it, or { error }. report is "fleet", "project"
// (target: its slug) or "account" (target: its id); from and to are the
// report box's dates, checked as the PDF route checks them.
export function printTarget(body, today) {
  const report = body?.report;
  if (report === "fleet") return { kind: "fleet_summary", path: "/api/reports/fleet" };
  if (report !== "project" && report !== "account") return { error: "report must be fleet, project or account" };
  const target = typeof body.target === "string" ? body.target.trim().toLowerCase() : "";
  if (!(report === "project" ? SLUG : UUID).test(target)) return { error: `no such ${report}` };
  const range = reportRange({ from: body.from, to: body.to }, today);
  if (range.error) return { error: range.error };
  const query = new URLSearchParams();
  if (typeof body.from === "string" && body.from.trim()) query.set("from", body.from.trim());
  if (typeof body.to === "string" && body.to.trim()) query.set("to", body.to.trim());
  const qs = query.toString();
  return {
    kind: `${report}_report`,
    path: `/api/reports/${report}/${target}${qs ? `?${qs}` : ""}`,
    table: report === "project" ? "projects" : "accounts",
    column: report === "project" ? "slug" : "id",
    target,
  };
}

async function queuedFor(db, path) {
  const { data, error } = await db.from("print_jobs").select("id").eq("path", path).eq("status", "queued").maybeSingle();
  if (error) throw new Error(`print jobs read failed: ${error.message}`);
  return data ? Number(data.id) : null;
}

// POST /api/print, after the route has checked the caller is admin. The
// same report already waiting (the Mac asleep, a second click) is handed
// back rather than queued twice; the schema's one-queued-job-per-path
// index settles two clicks that race.
export async function queuePrint(db, { body, now = Date.now(), today = todayKey(now) }) {
  const copies = parseCopies(body);
  if (copies === null) return reply(400, { error: `copies must be a whole number from 1 to ${MAX_COPIES}` });
  const t = printTarget(body, today);
  if (t.error) return reply(t.error.startsWith("no such") ? 404 : 400, { error: t.error });

  if (t.table) {
    const { data, error } = await db.from(t.table).select("id").eq(t.column, t.target).maybeSingle();
    if (error) throw new Error(`${t.table} read failed: ${error.message}`);
    if (!data) return reply(404, { error: `no such ${body.report}` });
  }

  const waiting = await queuedFor(db, t.path);
  if (waiting) return reply(200, { jobId: waiting, online: await agentOnline(db, now), reused: true });

  const recent = await db
    .from("print_jobs")
    .select("id", { count: "exact", head: true })
    .gte("requested_at", new Date(now - 60_000).toISOString());
  if (recent.error) throw new Error(`print jobs read failed: ${recent.error.message}`);
  if ((recent.count ?? 0) >= JOBS_PER_MINUTE) {
    return reply(429, { error: "Too many prints in the last minute: try again shortly" });
  }

  const { data, error } = await db
    .from("print_jobs")
    .insert({ kind: t.kind, path: t.path, copies })
    .select("id")
    .single();
  if (error?.code === UNIQUE_VIOLATION) {
    const raced = await queuedFor(db, t.path);
    if (raced) return reply(200, { jobId: raced, online: await agentOnline(db, now), reused: true });
  }
  if (error) throw new Error(`print job write failed: ${error.message}`);
  return reply(200, { jobId: Number(data.id), online: await agentOnline(db, now), reused: false });
}

// GET /api/print/jobs/[id], after the admin check: what the button shows.
export async function printJobState(db, { id, now = Date.now() }) {
  if (!/^[1-9][0-9]{0,15}$/.test(String(id))) return reply(404, { error: "no such job" });
  const { data, error } = await db.from("print_jobs").select("status, error").eq("id", Number(id)).maybeSingle();
  if (error) throw new Error(`print job read failed: ${error.message}`);
  if (!data) return reply(404, { error: "no such job" });
  return reply(200, { status: data.status, error: data.error ?? null, online: await agentOnline(db, now) });
}

function shortText(v, max) {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string" || v.length > max) return { ok: false };
  return { ok: true, value: v.trim() || null };
}

// POST /api/print-queue: the agent's poll or report. appUrl is APP_URL,
// so the document's address never comes from the request's Host header.
export async function agentRequest(db, { authorization, rawBody, appUrl }) {
  const key = agentKey(authorization);
  if (!key) return reply(401, { error: "missing or malformed print agent key" });
  if (typeof rawBody !== "string" || rawBody.length > MAX_AGENT_BODY) return reply(400, { error: "body too large" });

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return reply(400, { error: "body is not JSON" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, { error: "body is not an object" });
  const keyHash = hashAgentKey(key);

  if (body.action === "poll") {
    const agent = shortText(body.agent, 64);
    const printer = shortText(body.printer, 128);
    const version = shortText(body.version, 32);
    if (!agent.ok || !agent.value || !printer.ok || !version.ok) {
      return reply(400, { error: "poll needs agent (up to 64 characters), and printer and version as short text or null" });
    }
    const { data, error } = await db.rpc("claim_print_job", {
      p_key_hash: keyHash,
      p_agent: agent.value,
      p_printer: printer.value,
      p_version: version.value,
    });
    if (error?.code === UNKNOWN_KEY) return reply(401, { error: "print agent key not recognised" });
    if (error) throw new Error(`claim_print_job failed: ${error.message}`);
    const job = Array.isArray(data) ? data[0] : data;
    if (!job) return reply(200, { job: null });
    const origin = String(appUrl ?? "").replace(/\/+$/, "");
    return reply(200, { job: { id: Number(job.id), copies: job.copies, url: `${origin}${job.path}` } });
  }

  if (body.action === "report") {
    const id = body.jobId;
    const err = shortText(body.error, 2000);
    if (!Number.isSafeInteger(id) || id < 1 || typeof body.ok !== "boolean" || !err.ok) {
      return reply(400, { error: "report needs jobId (a job number), ok (true or false) and error (text or null)" });
    }
    const { error } = await db.rpc("finish_print_job", {
      p_key_hash: keyHash,
      p_id: id,
      p_ok: body.ok,
      p_error: body.ok ? null : err.value,
    });
    if (error?.code === UNKNOWN_KEY) return reply(401, { error: "print agent key not recognised" });
    if (error) throw new Error(`finish_print_job failed: ${error.message}`);
    return reply(200, { ok: true });
  }

  return reply(400, { error: "action must be poll or report" });
}
