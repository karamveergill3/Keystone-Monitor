import Link from "next/link";
import Pager from "@/components/Pager";
import Pnl from "@/components/Pnl";
import { londonTime, number } from "@/lib/format";
import { priceDecimals } from "@/lib/baskets";

// Price decimals per symbol on this page, from the prices themselves, so an
// index reads 20,004.79 rather than 20,004.79000.
function symbolDecimals(rows) {
  const quotes = new Map();
  for (const p of rows) {
    if (!quotes.has(p.symbol)) quotes.set(p.symbol, []);
    quotes.get(p.symbol).push(p.open_price, p.close_price);
  }
  return new Map([...quotes].map(([symbol, values]) => [symbol, priceDecimals(values)]));
}

// Closed trades, newest first, a page at a time, under a heading that
// carries the page arrows. The page keeps its place when an arrow is used.
export default function PositionsTable({ title, rows, total, page, pageSize, currency, hrefForPage }) {
  const heading = <h2 className="text-base font-semibold">{title}</h2>;
  if (!total) {
    return (
      <>
        {heading}
        <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">No closed trades yet.</p>
      </>
    );
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // A page number past the end (an old link, a hand-typed one).
  if (!rows.length) {
    return (
      <>
        {heading}
        <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">
          There are only {number(pages, 0)} {pages === 1 ? "page" : "pages"} of trades.{" "}
          <Link href={hrefForPage(1)} scroll={false} className="text-accent hover:underline">Back to the newest</Link>
        </p>
      </>
    );
  }
  const pager = <Pager label="Trade history pages" page={page} pageSize={pageSize} shown={rows.length} total={total} hrefForPage={hrefForPage} />;
  const decimals = symbolDecimals(rows);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        {pager}
      </div>
      <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-panel-2/70 text-xs tracking-wider text-muted uppercase">
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
              const d = decimals.get(p.symbol) ?? 5;
              return (
                <tr key={p.position_id} className="border-b border-line/70 last:border-0">
                  <td className="px-3 py-1.5 text-xs">{londonTime(p.close_time)}</td>
                  <td className="px-3 py-1.5 text-xs text-muted">{londonTime(p.open_time)}</td>
                  <td className="px-3 py-1.5">{p.symbol}</td>
                  <td className={`px-3 py-1.5 ${p.side === "buy" ? "text-up" : p.side === "sell" ? "text-down" : "text-muted"}`}>
                    {p.side ?? "-"}
                  </td>
                  <td className="num px-3 py-1.5 text-right">
                    {number(p.volume_out, 2)}
                    {partial && <span className="ml-1 rounded bg-warn-soft px-1 text-xs text-warn" title={`${number(p.volume_in, 2)} lots opened, part still open`}>part</span>}
                  </td>
                  <td className="num px-3 py-1.5 text-right">{p.open_price === null ? "-" : number(p.open_price, d)}</td>
                  <td className="num px-3 py-1.5 text-right">{p.close_price === null ? "-" : number(p.close_price, d)}</td>
                  <td className="px-3 py-1.5 text-right"><Pnl value={Number(p.net)} currency={currency} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>
          {number(total, 0)} closed {total === 1 ? "trade" : "trades"} · page {number(page, 0)} of {number(pages, 0)}
        </span>
        {pager}
      </div>
    </>
  );
}
