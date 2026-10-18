import Link from "next/link";
import Pnl from "@/components/Pnl";
import StatusDot from "@/components/StatusDot";
import { CLOSABLE, ClosableIcon } from "@/components/AttentionBanner";
import { money, pct, ago, number } from "@/lib/format";

// The Baskets cell, from the row's accountBaskets result (src/lib/baskets.js)
// when the page passed one. A dash when there is nothing to group yet: no
// sync, or no list of positions from the last one. Stacked, so the column
// is as narrow as its widest figure: how many are open, the deepest one's
// floating, and, when any could be closed now with the week still in
// profit, how many, beside a tick, linking to the account's baskets.
function BasketsCell({ r }) {
  const b = r.baskets;
  if (!b || !["current", "none"].includes(b.state)) {
    return <td className="px-3 py-2.5 text-center text-muted">-</td>;
  }
  if (b.open === 0) {
    return <td className="px-3 py-2.5 text-center text-xs text-muted">None</td>;
  }
  const deepest = b.deepest;
  const closable = Array.isArray(b.closable) ? b.closable : [];
  const k = closable.length;
  // Each judged on its own, so each says what the week keeps after it alone.
  const detail = closable
    .map((x) => `${x.symbol} ${x.side} at ${money(x.floating, r.currency)}, week stays ${money(x.leftover, r.currency, { sign: true })}`)
    .join("; ");
  return (
    <td
      className="px-3 py-2.5 text-center"
      title={`${number(b.open, 0)} open ${b.open === 1 ? "basket" : "baskets"}; deepest ${deepest.symbol} ${deepest.side} at ${money(deepest.floating, r.currency, { sign: true })}`}
    >
      <span className="num block whitespace-nowrap">{number(b.open, 0)} open</span>
      <span className="block whitespace-nowrap">
        <Pnl value={deepest.floating} currency={r.currency} />
      </span>
      {k > 0 && (
        <Link
          href={`/accounts/${r.id}#baskets`}
          className={`mt-0.5 flex items-center justify-center gap-1 text-xs font-medium whitespace-nowrap hover:underline ${CLOSABLE.text}`}
          title={`Can be closed now and the week stays in profit, each on its own: ${detail}`}
        >
          <ClosableIcon className="h-3.5 w-3.5" />
          {number(k, 0)} closable
        </Link>
      )}
    </td>
  );
}

// The account's closable baskets (its accountAttention result in
// src/lib/attention.js), as a green chip under its name: the tick and short
// form, the full sentence on hover. It wraps inside the account column,
// which is the one that already wraps, so the figures keep their widths
// and the table still fits the page. Nothing else is ever a chip.
function ClosableChip({ attention }) {
  const reasons = (attention?.reasons ?? []).filter((r) => r?.code === "basket-closable");
  if (!reasons.length) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Can close in profit">
      {reasons.map((reason) => (
        <li
          key={reason.code}
          className={`inline-flex items-center gap-1 rounded border px-1.5 text-xs font-medium ${CLOSABLE.chip}`}
          title={reason.text}
        >
          <ClosableIcon className="h-3.5 w-3.5" />
          {reason.short}
        </li>
      ))}
    </ul>
  );
}

export default function AccountsTable({ rows }) {
  if (!rows.length) {
    return <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">No accounts yet.</p>;
  }
  // Eleven columns share the 1246px page width, so the cells are padded
  // less than other tables' and the headers wrap. Every figure sits in the
  // middle of its column, under its heading; the account stays on the left.
  // A row with a basket that could be closed now with the week still in
  // profit is tinted green, with a bar down its left edge, and says so under
  // the account's name. That is the only highlight: no other row, figure or
  // state is coloured as a warning.
  return (
    <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-panel-2/70 text-left text-xs tracking-wider text-muted uppercase">
          <tr className="border-b border-line">
            <th className="px-3 py-2.5 font-medium">Account</th>
            <th className="px-3 py-2.5 text-center font-medium">Balance</th>
            <th className="px-3 py-2.5 text-center font-medium">Equity</th>
            <th className="px-3 py-2.5 text-center font-medium" title="Equity below balance right now">Floating DD</th>
            <th className="px-3 py-2.5 text-center font-medium" title="Open baskets (one symbol, one direction), the deepest one's floating P&L, and how many could be closed now with this week's realised profit still above zero">
              Baskets
            </th>
            <th className="px-3 py-2.5 text-center font-medium" title="Largest fall in equity since tracking began">Max DD</th>
            <th className="px-3 py-2.5 text-center font-medium">Today</th>
            <th className="px-3 py-2.5 text-center font-medium">This week</th>
            <th className="px-3 py-2.5 text-center font-medium">This month</th>
            <th className="px-3 py-2.5 text-center font-medium" title="Time-weighted, deposits and withdrawals excluded">Gain</th>
            <th className="px-3 py-2.5 text-center font-medium">Last sync</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const closable = r.attention?.level === "green";
            return (
              <tr key={r.id} className={`border-b border-line/70 last:border-0 ${closable ? CLOSABLE.row : "hover:bg-panel-2/60"}`}>
                <td className={`min-w-52 px-3 py-2.5 ${closable ? CLOSABLE.edge : ""}`}>
                  <Link href={`/accounts/${r.id}`} className="group inline-flex flex-wrap items-center gap-x-2 font-medium text-ink hover:text-accent">
                    {r.label}
                    <span className="rounded border border-accent/40 bg-accent-soft px-1.5 text-xs font-medium whitespace-nowrap text-accent group-hover:border-accent">
                      Breakdown <span aria-hidden="true">&rarr;</span>
                    </span>
                  </Link>
                  <span className="block text-xs text-muted">
                    {r.account_number ? `${r.account_number} · ${r.broker ?? r.server}` : "Not connected yet"}
                  </span>
                  <ClosableChip attention={r.attention} />
                </td>
                {r.balance === null ? (
                  // Never synced: there is nothing to show yet, and 0.00% would
                  // read as a measurement.
                  <td colSpan={9} className="px-3 py-2.5 text-center text-xs text-muted">Waiting for the EA&apos;s first sync</td>
                ) : (
                  <>
                    <td className="num px-3 py-2.5 text-center">{money(r.balance, r.currency)}</td>
                    <td className="num px-3 py-2.5 text-center">{money(r.equity, r.currency)}</td>
                    <td className="num px-3 py-2.5 text-center">{pct(r.floatingDd)}</td>
                    <BasketsCell r={r} />
                    <td className="num px-3 py-2.5 text-center">{pct(r.maxDd)}</td>
                    <td className="px-3 py-2.5 text-center"><Pnl value={r.periods.today.pnl} currency={r.currency} gain={r.periods.today.gain} /></td>
                    <td className="px-3 py-2.5 text-center"><Pnl value={r.periods.week.pnl} currency={r.currency} gain={r.periods.week.gain} /></td>
                    <td className="px-3 py-2.5 text-center"><Pnl value={r.periods.month.pnl} currency={r.currency} gain={r.periods.month.gain} /></td>
                    <td className={`num px-3 py-2.5 text-center ${r.periods.all.gain >= 0 ? "text-up" : "text-down"}`}>
                      {pct(r.periods.all.gain, { sign: true })}
                    </td>
                  </>
                )}
                <td className="px-3 py-2.5 text-center text-xs text-muted">
                  <span className="inline-flex items-center gap-2">
                    {ago(r.last_sync_at)} <StatusDot status={r.status} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
