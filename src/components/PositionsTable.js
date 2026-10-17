import Link from "next/link";
import Pnl from "@/components/Pnl";
import { londonTime, number } from "@/lib/format";

export default function PositionsTable({ rows, total, page, pageSize, currency, hrefForPage }) {
  if (!total) return <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">No closed trades yet.</p>;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-2">
      <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2 text-left font-medium">Closed</th>
              <th className="px-3 py-2 text-left font-medium">Opened</th>
              <th className="px-3 py-2 text-left font-medium">Symbol</th>
              <th className="px-3 py-2 text-left font-medium">Side</th>
              <th className="px-3 py-2 text-right font-medium">Lots</th>
              <th className="px-3 py-2 text-right font-medium">Open</th>
              <th className="px-3 py-2 text-right font-medium">Close</th>
              <th className="px-3 py-2 text-right font-medium" title="Profit, swap, commission and fees together">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const partial = Number(p.volume_out) < Number(p.volume_in) - 1e-9;
              return (
                <tr key={p.position_id} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2 text-xs">{londonTime(p.close_time)}</td>
                  <td className="px-3 py-2 text-xs text-muted">{londonTime(p.open_time)}</td>
                  <td className="px-3 py-2">{p.symbol}</td>
                  <td className={`px-3 py-2 ${p.side === "buy" ? "text-up" : p.side === "sell" ? "text-down" : "text-muted"}`}>
                    {p.side ?? "-"}
                  </td>
                  <td className="num px-3 py-2 text-right">
                    {number(p.volume_out, 2)}
                    {partial && <span className="ml-1 text-[10px] text-warn" title={`${number(p.volume_in, 2)} lots opened, part still open`}>part</span>}
                  </td>
                  <td className="num px-3 py-2 text-right">{p.open_price === null ? "-" : number(p.open_price, 5)}</td>
                  <td className="num px-3 py-2 text-right">{p.close_price === null ? "-" : number(p.close_price, 5)}</td>
                  <td className="px-3 py-2 text-right"><Pnl value={Number(p.net)} currency={currency} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{total.toLocaleString("en-GB")} closed trades</span>
        <span className="flex gap-3">
          {page > 1 && <Link href={hrefForPage(page - 1)} className="hover:text-ink">&larr; Newer</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link href={hrefForPage(page + 1)} className="hover:text-ink">Older &rarr;</Link>}
        </span>
      </div>
    </div>
  );
}
