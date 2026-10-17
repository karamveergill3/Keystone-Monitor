import Pnl from "@/components/Pnl";
import { money } from "@/lib/format";

export default function CurrencyTotals({ totals }) {
  if (!totals.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {totals.map((t) => (
        <div key={t.currency} className="rounded-lg border border-line bg-panel p-4">
          <p className="text-xs text-muted">
            {t.accounts} {t.accounts === 1 ? "account" : "accounts"} in {t.currency}
          </p>
          <p className="num mt-1 text-xl font-semibold">{money(t.balance, t.currency, { decimals: 0 })}</p>
          <p className="num text-xs text-muted">Equity {money(t.equity, t.currency, { decimals: 0 })}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div><dt className="text-muted">Today</dt><dd><Pnl value={t.today} currency={t.currency} decimals={0} /></dd></div>
            <div><dt className="text-muted">Week</dt><dd><Pnl value={t.week} currency={t.currency} decimals={0} /></dd></div>
            <div><dt className="text-muted">Month</dt><dd><Pnl value={t.month} currency={t.currency} decimals={0} /></dd></div>
          </dl>
        </div>
      ))}
    </div>
  );
}
