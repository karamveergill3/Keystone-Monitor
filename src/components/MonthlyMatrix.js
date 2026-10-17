import Link from "next/link";
import Pnl from "@/components/Pnl";
import { monthLabel } from "@/lib/format";

// Accounts down the side, the last few months across, P&L and gain in
// each cell.
export default function MonthlyMatrix({ rows, months }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="px-3 py-2 text-left font-medium">Account</th>
            {months.map((m) => (
              <th key={m} className="px-3 py-2 text-right font-medium">{monthLabel(m)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line/60 last:border-0">
              <td className="px-3 py-2">
                <Link href={`/accounts/${r.id}`} className="hover:text-accent">{r.label}</Link>
              </td>
              {months.map((m) => {
                const cell = r.months.get(m);
                return (
                  <td key={m} className="px-3 py-2 text-right">
                    {cell ? <Pnl value={cell.pnl} currency={r.currency} gain={cell.gain} decimals={0} /> : <span className="text-muted">-</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
