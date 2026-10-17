import Link from "next/link";
import { money, pct } from "@/lib/format";
import { monthStart, monthEnd, addDays, addMonths, weekStart } from "@/lib/days";
import { monthLabel } from "@/lib/format";

// One month, Monday first, each day's trading P&L and gain.
export default function PnlCalendar({ returns, month, currency, prevHref, nextHref }) {
  const byDay = new Map(returns.map((r) => [r.day, r]));
  const first = monthStart(month);
  const last = monthEnd(month);
  const cells = [];
  for (let d = weekStart(first); d <= last || cells.length % 7; d = addDays(d, 1)) cells.push(d);

  let monthPnl = 0;
  for (const r of returns) if (r.day >= first && r.day <= last) monthPnl += r.tradePnl;

  return (
    <div className="hud rounded-md border border-line bg-panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between text-sm">
        <Link href={prevHref} className="text-muted hover:text-ink">&larr; {monthLabel(addMonths(first, -1))}</Link>
        <p className="text-base font-semibold">
          {monthLabel(first)} <span className={`num ml-2 ${monthPnl >= 0 ? "text-up" : "text-down"}`}>{money(monthPnl, currency, { sign: true })}</span>
        </p>
        {nextHref ? (
          <Link href={nextHref} className="text-muted hover:text-ink">{monthLabel(addMonths(first, 1))} &rarr;</Link>
        ) : (
          <span />
        )}
      </div>
      {/* Scrolls sideways on a phone, like the tables, rather than squeezing
          the figures. */}
      <div className="overflow-x-auto">
      <div className="grid min-w-[36rem] grid-cols-7 gap-1.5 text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-1.5 pb-1 font-medium text-muted">{d}</div>
        ))}
        {cells.map((d) => {
          const r = byDay.get(d);
          const inMonth = d >= first && d <= last;
          const tone = !r || r.tradePnl === 0 ? "border border-line/70" : r.tradePnl > 0 ? "border border-up/30 bg-up-soft" : "border border-down/30 bg-down-soft";
          return (
            <div key={d} className={`min-h-[4.5rem] rounded-md p-2 ${tone} ${inMonth ? "" : "opacity-35"}`}>
              <p className="text-muted">{Number(d.slice(8))}</p>
              {r && r.tradePnl !== 0 && (
                <>
                  <p className={`num mt-0.5 text-sm font-semibold ${r.tradePnl > 0 ? "text-up" : "text-down"}`}>{money(r.tradePnl, currency, { sign: true, decimals: 0 })}</p>
                  <p className="num text-xs text-muted">{pct(r.ret, { sign: true })}</p>
                </>
              )}
              {r && r.cashFlow !== 0 && (
                <p className="num mt-1 inline-block rounded bg-warn-soft px-1 text-xs text-warn" title="Deposit or withdrawal">{money(r.cashFlow, currency, { sign: true, decimals: 0 })}</p>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
