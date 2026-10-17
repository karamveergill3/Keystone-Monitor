import Pnl from "@/components/Pnl";
import { money } from "@/lib/format";

export default function CurrencyTotals({ totals, tint = "bg-panel" }) {
  if (!totals.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {totals.map((t) => (
        <div key={t.currency} className={`hud rounded-md border border-line p-4 ${tint}`}>
          <p className="text-xs tracking-wider text-muted uppercase">
            {t.accounts} {t.accounts === 1 ? "account" : "accounts"} in {t.currency}
          </p>
          <p className="num mt-1 text-2xl font-semibold">{money(t.balance, t.currency, { decimals: 0 })}</p>
          <p className="num text-xs text-muted">Equity {money(t.equity, t.currency, { decimals: 0 })}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-ink/10 pt-3 text-sm">
            <div><dt className="text-muted">Today</dt><dd><Pnl value={t.today} currency={t.currency} decimals={0} /></dd></div>
            <div><dt className="text-muted">Week</dt><dd><Pnl value={t.week} currency={t.currency} decimals={0} /></dd></div>
            <div><dt className="text-muted">Month</dt><dd><Pnl value={t.month} currency={t.currency} decimals={0} /></dd></div>
          </dl>
        </div>
      ))}
    </div>
  );
}
