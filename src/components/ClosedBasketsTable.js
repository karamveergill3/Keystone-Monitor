import Link from "next/link";
import Pager from "@/components/Pager";
import Pnl from "@/components/Pnl";
import { closedBasket } from "@/lib/baskets";
import { londonTime, money, number, pct } from "@/lib/format";
import { eaReportsOpen, OPEN_POSITIONS_EA } from "@/lib/openPositions";

function sideClass(side) {
  return side === "buy" ? "text-up" : side === "sell" ? "text-down" : "text-muted";
}

// Baskets that have closed, newest first as basket_results gives them,
// with how deep each went while open and what its deals realised.
// eaVersion is the account's ea_version: baskets are tracked from the
// syncs of an EA that lists its open positions, so with an older one the
// empty table says what to install rather than that nothing has closed.
// Shown a page at a time under a heading that carries the page arrows,
// like the trade history.
export default function ClosedBasketsTable({ title, rows, total, page, pageSize, currency, eaVersion, hrefForPage }) {
  const heading = <h2 className="text-base font-semibold">{title}</h2>;
  if (!total) {
    return (
      <>
        {heading}
        <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">
          {eaReportsOpen(eaVersion)
            ? "No closed baskets yet."
            : `Baskets are tracked once the EA lists open positions (${OPEN_POSITIONS_EA} or later). Install the latest EA from the admin screen.`}
        </p>
      </>
    );
  }
  // A page number past the end (an old link, a hand-typed one).
  if (!rows.length) {
    return (
      <>
        {heading}
        <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">
          No closed baskets on this page.{" "}
          <Link href={hrefForPage(1)} scroll={false} className="text-accent hover:underline">Back to the newest</Link>
        </p>
      </>
    );
  }
  const pager = <Pager label="Closed basket pages" page={page} pageSize={pageSize} shown={rows.length} total={total} hrefForPage={hrefForPage} />;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        {pager}
      </div>
      <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-panel-2/70 text-xs tracking-wider text-muted uppercase">
            <tr className="border-b border-line">
              <th className="px-3 py-2 text-left font-medium">Basket</th>
              <th className="px-3 py-2 text-left font-medium">Opened</th>
              <th className="px-3 py-2 text-left font-medium">Closed</th>
              <th className="px-3 py-2 text-right font-medium">Duration</th>
              <th
                className="px-3 py-2 text-right font-medium"
                title="The most positions open in it at one sync, as seen at syncs: a level opened and closed between two syncs is not counted"
              >
                Max positions
              </th>
              <th
                className="px-3 py-2 text-right font-medium"
                title="The most lots open in it at one sync, as seen at syncs: a level opened and closed between two syncs is not counted"
              >
                Max lots
              </th>
              <th className="px-3 py-2 text-right font-medium" title="The deepest floating loss seen at a sync, and its share of the balance then">
                Worst drawdown
              </th>
              <th
                className="px-3 py-2 text-right font-medium"
                title="The sum of the deals of every position the basket held, including levels opened and closed between syncs: profit, swap, commission and fees"
              >
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = closedBasket(r);
              return (
                <tr key={r.id} className="border-b border-line/70 last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink">{r.symbol}</span> <span className={sideClass(r.side)}>{r.side}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{londonTime(r.opened_at)}</td>
                  <td
                    className="px-3 py-2 text-xs"
                    title={
                      c.closedBy === "deal"
                        ? "Its last closing deal"
                        : "The first sync that found it gone: no closing deal for it has synced, so the close may be up to a sync earlier"
                    }
                  >
                    {londonTime(c.closedAt)}
                  </td>
                  <td className="num px-3 py-2 text-right whitespace-nowrap">{c.duration}</td>
                  <td className="num px-3 py-2 text-right">{number(r.max_positions, 0)}</td>
                  <td className="num px-3 py-2 text-right">{number(r.max_lots, 2)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`num block ${c.worstDrawdown > 0 ? "text-down" : "text-muted"}`}>
                      {c.worstDrawdown === null ? "-" : money(-c.worstDrawdown, currency)}
                    </span>
                    <span className="num block text-xs text-muted">{pct(c.worstPct)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.realised === null ? <span className="text-muted">-</span> : <Pnl value={c.realised} currency={currency} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
