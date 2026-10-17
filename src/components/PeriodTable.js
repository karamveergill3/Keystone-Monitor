import Pnl from "@/components/Pnl";
import { money, dayLabel, monthLabel } from "@/lib/format";
import { addDays } from "@/lib/days";

// Weeks or months, newest first.
export default function PeriodTable({ periods, unit, currency }) {
  if (!periods.length) return <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">No trading yet.</p>;
  const label = (k) => (unit === "month" ? monthLabel(k) : `w/c ${dayLabel(k)}`);
  return (
    <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-panel-2/70 text-xs tracking-wider text-muted uppercase">
          <tr className="border-b border-line">
            <th className="px-4 py-2.5 text-left font-medium">{unit === "month" ? "Month" : "Week"}</th>
            <th className="px-4 py-2.5 text-right font-medium">P&amp;L</th>
            <th className="px-4 py-2.5 text-right font-medium">Trades closed</th>
            <th className="px-4 py-2.5 text-right font-medium">Deposits / withdrawals</th>
            <th className="px-4 py-2.5 text-right font-medium">Closing balance</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.key} className="border-b border-line/70 last:border-0" title={unit === "week" ? `${dayLabel(p.key)} to ${dayLabel(addDays(p.key, 6))}` : undefined}>
              <td className="px-4 py-2.5">{label(p.key)}</td>
              <td className="px-4 py-2.5 text-right"><Pnl value={p.pnl} currency={currency} gain={p.gain} /></td>
              <td className="num px-4 py-2.5 text-right">{p.closed}</td>
              <td className="num px-4 py-2.5 text-right text-muted">{p.cashFlow ? money(p.cashFlow, currency, { sign: true }) : "-"}</td>
              <td className="num px-4 py-2.5 text-right">{money(p.endBalance, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
