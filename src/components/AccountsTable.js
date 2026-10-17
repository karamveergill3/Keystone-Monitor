import Link from "next/link";
import Pnl from "@/components/Pnl";
import StatusDot from "@/components/StatusDot";
import { money, pct, ago } from "@/lib/format";

export default function AccountsTable({ rows }) {
  if (!rows.length) {
    return <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">No accounts yet.</p>;
  }
  return (
    <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="bg-panel-2/70 text-left text-xs tracking-wider text-muted uppercase">
          <tr className="border-b border-line">
            <th className="px-4 py-2.5 font-medium">Account</th>
            <th className="px-4 py-2.5 text-right font-medium">Balance</th>
            <th className="px-4 py-2.5 text-right font-medium">Equity</th>
            <th className="px-4 py-2.5 text-right font-medium" title="Equity below balance right now">Floating DD</th>
            <th className="px-4 py-2.5 text-right font-medium" title="Largest fall in equity since tracking began">Max DD</th>
            <th className="px-4 py-2.5 text-right font-medium">Today</th>
            <th className="px-4 py-2.5 text-right font-medium">This week</th>
            <th className="px-4 py-2.5 text-right font-medium">This month</th>
            <th className="px-4 py-2.5 text-right font-medium" title="Time-weighted, deposits and withdrawals excluded">Gain</th>
            <th className="px-4 py-2.5 text-right font-medium">Last sync</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line/70 last:border-0 hover:bg-panel-2/60">
              <td className="px-4 py-2.5">
                <Link href={`/accounts/${r.id}`} className="font-medium text-ink hover:text-accent">
                  {r.label}
                </Link>
                <span className="block text-xs text-muted">
                  {r.account_number ? `${r.account_number} · ${r.broker ?? r.server}` : "Not connected yet"}
                </span>
              </td>
              {r.balance === null ? (
                // Never synced: there is nothing to show yet, and 0.00% would
                // read as a measurement.
                <td colSpan={8} className="px-4 py-2.5 text-right text-xs text-muted">Waiting for the EA&apos;s first sync</td>
              ) : (
                <>
                  <td className="num px-4 py-2.5 text-right">{money(r.balance, r.currency)}</td>
                  <td className="num px-4 py-2.5 text-right">{money(r.equity, r.currency)}</td>
                  <td className={`num px-4 py-2.5 text-right ${r.floatingDd > 0.1 ? "text-warn" : ""}`}>{pct(r.floatingDd)}</td>
                  <td className="num px-4 py-2.5 text-right">{pct(r.maxDd)}</td>
                  <td className="px-4 py-2.5 text-right"><Pnl value={r.periods.today.pnl} currency={r.currency} gain={r.periods.today.gain} /></td>
                  <td className="px-4 py-2.5 text-right"><Pnl value={r.periods.week.pnl} currency={r.currency} gain={r.periods.week.gain} /></td>
                  <td className="px-4 py-2.5 text-right"><Pnl value={r.periods.month.pnl} currency={r.currency} gain={r.periods.month.gain} /></td>
                  <td className={`num px-4 py-2.5 text-right ${r.periods.all.gain >= 0 ? "text-up" : "text-down"}`}>
                    {pct(r.periods.all.gain, { sign: true })}
                  </td>
                </>
              )}
              <td className="px-4 py-2.5 text-right text-xs text-muted">
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
