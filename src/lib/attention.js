// Which accounts have a basket in loss that could be closed now with the
// week still in profit. That green flag is the only thing the site
// highlights, by the owner's choice (18 Oct): there are no notifications
// and no other warnings. An offline terminal, a deep floating drawdown or
// an account near margin call or stop-out is never coloured or listed; its
// figures are shown plainly where they belong (the sync status, the
// accounts table, the account page's Margin and stop-out section).
//
// The flag shows in the panel on the overview and project pages, as a
// green row and chip in the accounts table and as a banner on the account
// page. Its one reason is { level: "green", code: "basket-closable",
// short, text }: short is a few words for a table chip, text one plain
// sentence with the figures, as of the account's last sync.
//
// Pure, so the pages and the tests share it. Everything here ends up on a
// public page.

import { money, pct } from "./format.js";

const CLOSABLE = "basket-closable";

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// A share as it is shown, to two decimals of a percent.
function shown(share) {
  return Math.round(share * 1e4) / 1e4;
}

// A move to stop-out as the account page's Margin and stop-out section
// shows it (src/components/RiskPanel.js): two decimals of a percent, and
// never "0.00%" for a move that is still there, which would read as
// reached. A figure only: nothing is coloured or flagged by it.
export function distanceLabel(share) {
  const v = num(share);
  if (v === null) return "-";
  return v > 0 && shown(v) === 0 ? "under 0.01%" : pct(v);
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Baskets in loss that could be closed now with the week still up
// (accountBaskets' closable, src/lib/baskets.js, which marks nothing while
// the EA's list is cut short or the account is archived). Each is judged
// against the week on its own, so several are said one by one, with what
// the week keeps after each, and never as if all could go at once. A
// basket that is not closable says nothing at all.
function closableReason(baskets, currency) {
  const closable = Array.isArray(baskets?.closable) ? baskets.closable : [];
  if (!closable.length) return null;
  const n = closable.length;
  const clauses = closable.map(
    (b) =>
      `${b.symbol} ${b.side} at ${money(b.floating, currency)} could be closed now and the week would stay ${money(b.leftover, currency, { sign: true })}`,
  );
  const week = money(num(baskets.weekRealised), currency, { sign: true });
  const of = n === 1 ? `of this week's ${week}` : `each on its own, of this week's ${week}`;
  return {
    level: "green",
    code: CLOSABLE,
    short: `${plural(n, "basket")} closable`,
    text: `${clauses.join("; ")} (${of}).`,
  };
}

// What the site highlights on one account: { level: "green", reasons:
// [the closable reason] } when a basket could be closed now with the week
// still up, otherwise { level: null, reasons: [] }. row is accountRow's
// (src/lib/accountView.js) and baskets accountBaskets' (src/lib/
// baskets.js), which may be missing and then says nothing. An archived
// account is no longer watched, so it gets nothing; one that is offline or
// has never synced gets the flag only if its last sync's baskets earn it.
export function accountAttention({ row, baskets }) {
  if (!row || row.archived_at) return { level: null, reasons: [] };
  const reason = closableReason(baskets, row.currency || "USD");
  return reason ? { level: "green", reasons: [reason] } : { level: null, reasons: [] };
}

// The panel on the overview and project pages: every account with a
// closable basket, by label. rows each carry { id, label, currency,
// last_sync_at }, their accountAttention result as attention and their
// accountBaskets result as baskets; only the closable reason is ever
// listed. weekRealised and baskets (the closable ones, deepest loss first)
// are the figures the panel lays out as a table.
export function attentionItems(rows) {
  const items = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const reasons = (r?.attention?.reasons ?? []).filter((x) => x?.code === CLOSABLE);
    if (!reasons.length) continue;
    items.push({
      accountId: r.id,
      label: r.label,
      currency: r.currency || "USD",
      lastSyncAt: r.last_sync_at ?? null,
      weekRealised: num(r.baskets?.weekRealised),
      baskets: Array.isArray(r.baskets?.closable) ? r.baskets.closable : [],
      reasons,
    });
  }
  return items.sort((a, b) => String(a.label ?? "").localeCompare(String(b.label ?? "")));
}
