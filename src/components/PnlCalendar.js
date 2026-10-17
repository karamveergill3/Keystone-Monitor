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
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between text-sm">
        <Link href={prevHref} className="text-muted hover:text-ink">&larr; {monthLabel(addMonths(first, -1))}</Link>
        <p className="font-medium">
          {monthLabel(first)} <span className={`num ml-2 ${monthPnl >= 0 ? "text-up" : "text-down"}`}>{money(monthPnl, currency, { sign: true })}</span>
        </p>
        {nextHref ? (
          <Link href={nextHref} className="text-muted hover:text-ink">{monthLabel(addMonths(first, 1))} &rarr;</Link>
        ) : (
          <span />
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-1 pb-1 text-muted">{d}</div>
        ))}
        {cells.map((d) => {
          const r = byDay.get(d);
          const inMonth = d >= first && d <= last;
          const tone = !r || r.tradePnl === 0 ? "border-line/50" : r.tradePnl > 0 ? "border-up/40 bg-up/10" : "border-down/40 bg-down/10";
          return (
            <div key={d} className={`min-h-16 rounded border p-1.5 ${tone} ${inMonth ? "" : "opacity-30"}`}>
              <p className="text-muted">{Number(d.slice(8))}</p>
              {r && r.tradePnl !== 0 && (
                <>
                  <p className={`num font-medium ${r.tradePnl > 0 ? "text-up" : "text-down"}`}>{money(r.tradePnl, currency, { sign: true, decimals: 0 })}</p>
                  <p className="num text-[10px] text-muted">{pct(r.ret, { sign: true })}</p>
                </>
              )}
              {r && r.cashFlow !== 0 && (
                <p className="num text-[10px] text-warn" title="Deposit or withdrawal">{money(r.cashFlow, currency, { sign: true, decimals: 0 })}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
