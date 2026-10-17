// What /api/sync does with a payload, given a service-role client.
//
// Kept out of the route so the tests can drive it with a fake client.
//
// ORDER MATTERS. Deals, the equity sample and the open positions are
// stored before the account row is touched, and any failure is a 500. The
// EA only moves its own watermark on a 200, so a failed sync is simply sent
// again next time. Each write is safe to repeat, and the open positions are
// replaced in one transaction, so nothing is ever half recorded.

import { bearerKey, hashSyncKey } from "./syncKeys.js";
import { parseSyncPayload, SyncPayloadError, MAX_BODY_BYTES } from "./syncPayload.js";
import { nextDrawdown } from "./drawdown.js";

export const SAMPLE_EVERY_MS = 15 * 60_000;
const INSERT_CHUNK = 500;

// How often the EA should sync, sent back on every response so it can be
// changed without touching a terminal. Two minutes keeps a dozen terminals
// well inside a hobby hosting plan's request allowance; a closing trade
// still syncs straight away whatever this says.
export function syncIntervalSec(env = process.env) {
  const v = Number(env.SYNC_INTERVAL_SEC);
  if (!Number.isFinite(v)) return 120;
  return Math.min(600, Math.max(30, Math.round(v)));
}

function reply(status, body) {
  return { status, body };
}

export async function ingestSync(db, { authorization, rawBody, now = Date.now(), env = process.env }) {
  const key = bearerKey(authorization);
  if (!key) return reply(401, { ok: false, error: "missing or malformed sync key" });

  if (typeof rawBody !== "string" || rawBody.length > MAX_BODY_BYTES) {
    return reply(413, { ok: false, error: "body too large" });
  }

  let payload;
  try {
    // MQL5 can leave a trailing NUL on a char array; it is not JSON.
    payload = parseSyncPayload(JSON.parse(rawBody.replace(/\u0000+$/, "")), now);
  } catch (err) {
    const message = err instanceof SyncPayloadError ? err.message : "body is not valid JSON";
    return reply(400, { ok: false, error: message });
  }

  const { data: keyRow, error: keyErr } = await db
    .from("account_keys")
    .select("account_id, accounts(*)")
    .eq("key_hash", hashSyncKey(key))
    .maybeSingle();
  if (keyErr) throw new Error(`key lookup failed: ${keyErr.message}`);
  const account = keyRow?.accounts;
  if (!account) return reply(401, { ok: false, error: "unknown sync key" });
  if (account.archived_at) return reply(403, { ok: false, error: "this account is archived" });

  const a = payload.account;

  // The first sync binds the row to its login. After that, a different
  // login on the same key is refused rather than mixed in.
  if (account.account_number && (account.account_number !== a.login || account.server !== a.server)) {
    return reply(409, {
      ok: false,
      error: `this key belongs to ${account.account_number} on ${account.server}, not ${a.login} on ${a.server}`,
    });
  }

  // Deals first. ignoreDuplicates turns the insert into ON CONFLICT DO
  // NOTHING, so what comes back is only what is new - which is what the
  // drawdown peak needs, since a deposit must move it exactly once.
  const rows = payload.deals.map((d) => ({ account_id: account.id, ...d }));
  const inserted = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { data, error } = await db
      .from("deals")
      .upsert(chunk, { onConflict: "account_id,ticket", ignoreDuplicates: true })
      .select("ticket, kind, time, net");
    if (error) throw new Error(`deal insert failed: ${error.message}`);
    inserted.push(...(data ?? []));
  }

  // A deal the broker cancels after the fact keeps its ticket but changes
  // type and has its profit zeroed. Those are the only deals that ever
  // change, so they alone are written over.
  const cancelled = rows.filter((d) => d.type.endsWith("_canceled"));
  if (cancelled.length) {
    const { error } = await db.from("deals").upsert(cancelled, { onConflict: "account_id,ticket" });
    if (error) throw new Error(`cancelled deal update failed: ${error.message}`);
  }

  const nowIso = new Date(now).toISOString();
  const trackingSince = account.tracking_since ?? nowIso;

  // Only money moved after tracking began adjusts the peak. History sent
  // on the first sync predates the peak and is already in the balance.
  const cashFlow = account.tracking_since
    ? inserted
        .filter((d) => d.kind === "cash" && Date.parse(d.time) > Date.parse(account.tracking_since))
        .reduce((s, d) => s + Number(d.net), 0)
    : 0;

  // A BACKLOG PAGE IS NOT SCORED. While the EA says more pages follow,
  // the equity it sends is today's but the deals are older, so comparing
  // the two would mix moments: a deposit made during an outage would raise
  // the peak on the page holding today's equity and again on the page
  // holding the deposit, and read as a drawdown. The peak only follows the
  // money until the last page, which is scored against current equity.
  const dd = payload.more
    ? {
        peak: account.peak_equity === null || account.peak_equity === undefined
          ? null
          : Number(account.peak_equity) + cashFlow,
        maxDrawdownPct: Number(account.max_drawdown_pct ?? 0),
        maxDrawdownAt: account.max_drawdown_at ?? null,
      }
    : nextDrawdown(
        {
          peak: account.peak_equity,
          maxDrawdownPct: account.max_drawdown_pct,
          maxDrawdownAt: account.max_drawdown_at,
        },
        { equity: a.equity, credit: a.credit, cashFlow, at: nowIso }
      );

  const sampleDue =
    !account.last_sample_at || now - Date.parse(account.last_sample_at) >= SAMPLE_EVERY_MS;
  if (sampleDue) {
    const { error } = await db
      .from("equity_samples")
      .upsert(
        [{ account_id: account.id, at: nowIso, balance: a.balance, equity: a.equity }],
        { onConflict: "account_id,at", ignoreDuplicates: true }
      );
    if (error) throw new Error(`equity sample failed: ${error.message}`);
  }

  // Open positions are a snapshot, replaced whole: whatever is not in this
  // sync has been closed. One database call does the delete and the insert
  // in a single transaction (replace_open_positions in schema.sql), so a
  // failure keeps the previous snapshot rather than leaving none. Every row
  // is stamped with this sync's time, the same as last_sync_at below. An EA
  // too old to report positions sends no list (null), and the rows are left
  // as they are rather than wiped.
  if (Array.isArray(payload.open)) {
    const { error } = await db.rpc("replace_open_positions", {
      p_account: account.id,
      p_rows: payload.open,
      p_at: nowIso,
    });
    if (error) throw new Error(`open positions replace failed: ${error.message}`);
  }

  const update = {
    account_number: a.login,
    server: a.server,
    broker: a.broker,
    currency: a.currency,
    leverage: a.leverage,
    ea_version: payload.eaVersion,
    last_sync_at: nowIso,
    balance: a.balance,
    equity: a.equity,
    credit: a.credit,
    margin: a.margin,
    free_margin: a.free_margin,
    margin_level: a.margin_level,
    open_positions: a.open_positions,
    floating_pnl: a.floating_pnl,
    tracking_since: trackingSince,
    peak_equity: dd.peak,
    max_drawdown_pct: dd.maxDrawdownPct,
    max_drawdown_at: dd.maxDrawdownAt,
    ...(sampleDue ? { last_sample_at: nowIso } : {}),
    ...(account.resync_requested ? { resync_requested: false } : {}),
  };
  const { error: updErr } = await db.from("accounts").update(update).eq("id", account.id);
  if (updErr) throw new Error(`account update failed: ${updErr.message}`);

  return reply(200, {
    ok: true,
    stored: inserted.length,
    // The binding sync always asks for the whole history. The EA keeps its
    // watermark per login, so a terminal that already synced this login
    // somewhere else (another row, another deployment) would otherwise only
    // send what happened after that.
    resync: account.resync_requested === true || !account.account_number,
    interval: syncIntervalSec(env),
  });
}
