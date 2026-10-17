import Link from "next/link";
import Pnl from "@/components/Pnl";
import StatusDot from "@/components/StatusDot";
import WarnIcon from "@/components/WarnIcon";
import { flagReason } from "@/lib/baskets";
import { money, pct, ago, number } from "@/lib/format";

// The Baskets cell, from the row's accountBaskets result (src/lib/baskets.js)
// when the page passed one. A dash when there is nothing to group yet: no
// sync, or no list of positions from the last one. Stacked, so the column
// is as narrow as its widest figure: how many are open, the deepest one's
// floating, and a link to the account's baskets when any is flagged.
function BasketsCell({ r }) {
  const b = r.baskets;
  if (!b || !["current", "none"].includes(b.state)) {
    return <td className="px-3 py-2.5 text-center text-muted">-</td>;
  }
  if (b.open === 0) {
    return <td className="px-3 py-2.5 text-center text-xs text-muted">None</td>;
  }
  const deepest = b.deepest;
  const k = b.flagged.length;
  const detail = b.flagged.map((x) => `${x.symbol} ${x.side} ${money(x.floating, r.currency)}`).join(", ");
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
          className="mt-0.5 flex items-center justify-center gap-1 text-xs font-medium whitespace-nowrap text-down hover:underline"
          title={`${flagReason(b, r.currency)}: ${detail}`}
        >
          <WarnIcon className="h-3.5 w-3.5" />
          {k} flagged
        </Link>
      )}
    </td>
  );
}

export default function AccountsTable({ rows }) {
  if (!rows.length) {
    return <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">No accounts yet.</p>;
  }
  // Eleven columns share the 1246px page width, so the cells are padded
  // less than other tables' and the headers wrap. Every figure sits in the
  // middle of its column, under its heading; the account stays on the left.
  return (
    <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-panel-2/70 text-left text-xs tracking-wider text-muted uppercase">
          <tr className="border-b border-line">
            <th className="px-3 py-2.5 font-medium">Account</th>
            <th className="px-3 py-2.5 text-center font-medium">Balance</th>
            <th className="px-3 py-2.5 text-center font-medium">Equity</th>
            <th className="px-3 py-2.5 text-center font-medium" title="Equity below balance right now">Floating DD</th>
            <th className="px-3 py-2.5 text-center font-medium" title="Open baskets (one symbol, one direction), the deepest one's floating P&L, and how many are flagged: losing more than the week has banked">
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
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line/70 last:border-0 hover:bg-panel-2/60">
              <td className="min-w-52 px-3 py-2.5">
                <Link href={`/accounts/${r.id}`} className="group inline-flex flex-wrap items-center gap-x-2 font-medium text-ink hover:text-accent">
                  {r.label}
                  <span className="rounded border border-accent/40 bg-accent-soft px-1.5 text-xs font-medium whitespace-nowrap text-accent group-hover:border-accent">
                    Breakdown <span aria-hidden="true">&rarr;</span>
                  </span>
                </Link>
                <span className="block text-xs text-muted">
                  {r.account_number ? `${r.account_number} · ${r.broker ?? r.server}` : "Not connected yet"}
                </span>
              </td>
              {r.balance === null ? (
                // Never synced: there is nothing to show yet, and 0.00% would
                // read as a measurement.
                <td colSpan={9} className="px-3 py-2.5 text-center text-xs text-muted">Waiting for the EA&apos;s first sync</td>
              ) : (
                <>
                  <td className="num px-3 py-2.5 text-center">{money(r.balance, r.currency)}</td>
                  <td className="num px-3 py-2.5 text-center">{money(r.equity, r.currency)}</td>
                  <td className={`num px-3 py-2.5 text-center ${r.floatingDd > 0.1 ? "text-warn" : ""}`}>{pct(r.floatingDd)}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
