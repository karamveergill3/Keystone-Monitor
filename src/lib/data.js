// The reads every screen and report makes, through the server's client
// from src/lib/db.js. Whatever these return can end up on a public page.

import { cache } from "react";
import { fetchAllPages } from "./fetchAllPages.js";
import { normaliseDaily } from "./accountStats.js";

// Cached for the request: the layout, the page and its metadata all ask.
export const listProjects = cache(async (supabase) => {
  const { data, error } = await supabase.from("projects").select("id, slug, name, sort").order("sort");
  if (error) throw new Error(`projects read failed: ${error.message}`);
  return data ?? [];
});

// stop_out_mode ('percent' or 'money'), margin_call_level and
// stop_out_level are the broker's, null until an EA from 2026.10.17.5
// syncs.
export const ACCOUNT_COLUMNS =
  "id, project_id, label, account_number, server, broker, currency, leverage, ea_version, created_at, archived_at, " +
  "last_sync_at, balance, equity, credit, margin, free_margin, margin_level, open_positions, floating_pnl, " +
  "tracking_since, peak_equity, max_drawdown_pct, max_drawdown_at, resync_requested, " +
  "stop_out_mode, margin_call_level, stop_out_level";

export async function listAccounts(supabase, { projectId = null, includeArchived = false } = {}) {
  let q = supabase.from("accounts").select(ACCOUNT_COLUMNS).order("label");
  if (projectId) q = q.eq("project_id", projectId);
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error(`accounts read failed: ${error.message}`);
  return data ?? [];
}

export async function getAccount(supabase, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const { data, error } = await supabase.from("accounts").select(ACCOUNT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`account read failed: ${error.message}`);
  return data;
}

// Daily rows for several accounts at once, as Map(accountId -> rows).
export async function dailyFor(supabase, accountIds) {
  const out = new Map(accountIds.map((id) => [id, []]));
  if (!accountIds.length) return out;
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from("account_daily")
      .select("*")
      .in("account_id", accountIds)
      .order("account_id")
      .order("day")
      .range(from, to)
  );
  for (const r of normaliseDaily(rows)) out.get(r.accountId)?.push(r);
  return out;
}

// One page of closed positions, newest first, optionally within a range
// of instants.
export async function positionsPage(supabase, accountId, { page = 1, pageSize = 50, since = null, until = null } = {}) {
  const fromRow = (page - 1) * pageSize;
  let q = supabase
    .from("account_positions")
    .select("position_id, symbol, side, open_time, close_time, volume_in, volume_out, open_price, close_price, net", {
      count: "exact",
    })
    .eq("account_id", accountId)
    .order("close_time", { ascending: false })
    .range(fromRow, fromRow + pageSize - 1);
  if (since) q = q.gte("close_time", since);
  if (until) q = q.lt("close_time", until);
  const { data, error, count } = await q;
  if (error) throw new Error(`positions read failed: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

// point_value is account currency per 1.0 move in price per lot (numeric,
// so it may come back as a string; null from an EA older than 2026.10.17.5,
// 0 when the terminal could not say).
const OPEN_COLUMNS =
  "ticket, position_id, symbol, side, volume, open_price, current_price, sl, tp, swap, profit, open_time, magic, comment, " +
  "updated_at, point_value";

// What the terminal had open at its last sync, newest first. At most a few
// hundred rows (the sync refuses more), so one read is all of them.
export async function openPositions(supabase, accountId) {
  const { data, error } = await supabase
    .from("open_positions")
    .select(OPEN_COLUMNS)
    .eq("account_id", accountId)
    .order("open_time", { ascending: false })
    .order("ticket", { ascending: false });
  if (error) throw new Error(`open positions read failed: ${error.message}`);
  return data ?? [];
}

// A Map with every id in it, so a caller can .get() any account it asked
// for and find a list, empty or not.
function byAccount(accountIds, rows) {
  const out = new Map(accountIds.map((id) => [id, []]));
  for (const r of rows) out.get(r.account_id)?.push(r);
  return out;
}

// The read failed message every other read here gives, for a read done
// in pages (fetchAllPages throws the bare database message).
async function paged(what, build) {
  try {
    return await fetchAllPages(build);
  } catch (err) {
    throw new Error(`${what} read failed: ${err.message}`);
  }
}

// openPositions for several accounts at once, as Map(accountId -> rows),
// each row with its account_id and each account's rows in the same order.
// Paged: a few grids of a few hundred positions pass PostgREST's 1000.
export async function openPositionsFor(supabase, accountIds) {
  if (!accountIds.length) return byAccount(accountIds, []);
  const rows = await paged("open positions", (from, to) =>
    supabase
      .from("open_positions")
      .select(`account_id, ${OPEN_COLUMNS}`)
      .in("account_id", accountIds)
      .order("account_id")
      .order("open_time", { ascending: false })
      .order("ticket", { ascending: false })
      .range(from, to)
  );
  return byAccount(accountIds, rows);
}

// The baskets each account has open now (schema.sql, section 6), as
// Map(accountId -> rows), most in loss first. floating and lots are as at
// last_seen_at, the last sync that listed the basket.
export async function openBasketsFor(supabase, accountIds) {
  if (!accountIds.length) return byAccount(accountIds, []);
  const rows = await paged("open baskets", (from, to) =>
    supabase
      .from("baskets")
      .select(
        "id, account_id, symbol, side, opened_at, first_seen_at, last_seen_at, positions, max_positions, " +
          "lots, max_lots, floating, worst_floating, worst_at, worst_balance"
      )
      .in("account_id", accountIds)
      .is("closed_at", null)
      .order("account_id")
      .order("floating")
      .order("id")
      .range(from, to)
  );
  return byAccount(accountIds, rows);
}

// One page of an account's closed baskets, newest closed first, with what
// their deals realised (basket_results in schema.sql). realised and
// last_close_at are null for a basket none of whose deals have arrived.
export async function closedBaskets(supabase, accountId, { page = 1, pageSize = 20 } = {}) {
  const fromRow = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("basket_results")
    .select(
      "id, symbol, side, opened_at, closed_at, max_positions, max_lots, worst_floating, worst_at, worst_balance, " +
        "realised, last_close_at",
      { count: "exact" }
    )
    .eq("account_id", accountId)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .order("id")
    .range(fromRow, fromRow + pageSize - 1);
  if (error) throw new Error(`closed baskets read failed: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

// The last `days` days of 15-minute samples. equity is MT5's, broker credit
// included; credit is beside it (numeric, so it may come back as a string;
// 0 for a sample from before it was recorded) for the chart to take out.
export async function equitySamples(supabase, accountId, days) {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  return fetchAllPages((from, to) =>
    supabase
      .from("equity_samples")
      .select("at, balance, equity, credit")
      .eq("account_id", accountId)
      .gte("at", sinceIso)
      .order("at")
      .range(from, to)
  );
}
