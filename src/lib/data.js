// The reads every screen and report makes, through the signed-in user's
// own client so row-level security applies to all of them.

import { cache } from "react";
import { fetchAllPages } from "./fetchAllPages.js";
import { normaliseDaily } from "./accountStats.js";

// Cached for the request: the layout, the page and its metadata all ask.
export const listProjects = cache(async (supabase) => {
  const { data, error } = await supabase.from("projects").select("id, slug, name, sort").order("sort");
  if (error) throw new Error(`projects read failed: ${error.message}`);
  return data ?? [];
});

export const ACCOUNT_COLUMNS =
  "id, project_id, label, account_number, server, broker, currency, leverage, ea_version, created_at, archived_at, " +
  "last_sync_at, balance, equity, credit, margin, free_margin, margin_level, open_positions, floating_pnl, " +
  "tracking_since, peak_equity, max_drawdown_pct, max_drawdown_at, resync_requested";

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

// The last `days` days of 15-minute samples.
export async function equitySamples(supabase, accountId, days) {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  return fetchAllPages((from, to) =>
    supabase
      .from("equity_samples")
      .select("at, balance, equity")
      .eq("account_id", accountId)
      .gte("at", sinceIso)
      .order("at")
      .range(from, to)
  );
}
