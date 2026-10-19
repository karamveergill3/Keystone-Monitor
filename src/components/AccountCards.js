import Link from "next/link";
import Pnl from "@/components/Pnl";
import { money } from "@/lib/format";

// One small card per account under its project: the balance large, the
// equity under it, and today, this week and this month. Each card opens
// the account. rows are accountRow results (src/lib/accountView.js).
export default function AccountCards({ rows, tint = "bg-panel" }) {
  if (!rows?.length) return null;
  return (
    <div className="grid grid-cols-1 gap-2.5 min-[460px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((r) => (
        <Link
          key={r.id}
          href={`/accounts/${r.id}`}
          className={`hud block rounded-md border border-line p-3 transition-colors hover:border-accent/50 ${tint}`}
        >
          <p className="truncate text-xs font-medium tracking-wide text-muted uppercase" title={r.label}>{r.label}</p>
          {r.balance === null ? (
            <p className="mt-2 text-xs text-muted">Waiting for its first sync</p>
          ) : (
            <>
              <p className="num mt-1 text-lg font-semibold">{money(r.balance, r.currency, { decimals: 0 })}</p>
              <p className="num text-xs text-muted">Equity {money(r.equity, r.currency, { decimals: 0 })}</p>
              <dl className="mt-2 grid grid-cols-3 gap-1 border-t border-ink/10 pt-2 text-xs">
                <div><dt className="text-muted">Today</dt><dd><Pnl value={r.periods.today.pnl} currency={r.currency} decimals={0} /></dd></div>
                <div><dt className="text-muted">Week</dt><dd><Pnl value={r.periods.week.pnl} currency={r.currency} decimals={0} /></dd></div>
                <div><dt className="text-muted">Month</dt><dd><Pnl value={r.periods.month.pnl} currency={r.currency} decimals={0} /></dd></div>
              </dl>
            </>
          )}
        </Link>
      ))}
    </div>
  );
}
