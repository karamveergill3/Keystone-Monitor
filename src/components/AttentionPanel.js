import Link from "next/link";
import { CLOSABLE, ClosableIcon } from "@/components/AttentionBanner";
import { ago, londonTime, money, number } from "@/lib/format";
import { syncStatus } from "@/lib/site";

function count(n, one, many) {
  return `${number(n, 0)} ${n === 1 ? one : many}`;
}

const TH = "px-3 py-2 font-medium";
const TD = "px-3 py-2";

// On the overview and project pages: every basket in loss that could be
// closed now with the week still in profit (attentionItems in
// src/lib/attention.js), as one plain table: the account, the basket, its
// loss, the week so far and what the week would be after closing it. It
// is the site's only highlight, so the box is green and nothing else ever
// appears in it. When no basket can be closed it says so in one quiet
// line, so the reader knows it was checked.
//
// Every figure is from its account's last sync; an account that has not
// synced for a while says how long ago that was.
export default function AttentionPanel({ items, checked }) {
  // Not passed at all is not the same as nothing closable, and a page with
  // no accounts has nothing to check: say nothing rather than none.
  if (!Array.isArray(items) || !checked) return null;

  const accounts = items.filter((i) => Array.isArray(i?.baskets) && i.baskets.length > 0);
  if (!accounts.length) {
    return <p className="text-sm text-muted">No basket can be closed in profit right now.</p>;
  }

  const baskets = accounts.reduce((n, i) => n + i.baskets.length, 0);
  const several = accounts.some((i) => i.baskets.length > 1);
  return (
    <section aria-labelledby="closable-heading" className={`space-y-3 rounded-lg border p-4 ${CLOSABLE.box}`}>
      <h2 id="closable-heading" className={`flex flex-wrap items-center gap-x-2 text-sm font-semibold ${CLOSABLE.text}`}>
        <ClosableIcon />
        Baskets you can close and still be up for the week
        <span className="font-normal text-muted">
          {count(baskets, "basket", "baskets")} on {count(accounts.length, "account", "accounts")}
        </span>
      </h2>
      {/* Phones: one short block per account, the week if closed beside each basket. */}
      <ul className="space-y-2 sm:hidden">
        {accounts.map((item) => (
          <li key={item.accountId} className="rounded-md border border-line bg-panel px-3 py-2.5">
            <Link href={`/accounts/${item.accountId}#baskets`} className="font-medium text-ink hover:text-accent">
              {item.label}
            </Link>
            <span className="block text-xs text-muted">
              Week so far <span className="num">{money(item.weekRealised, item.currency, { sign: true })}</span>
              {syncStatus(item.lastSyncAt) === "offline" && ` · last sync ${ago(item.lastSyncAt)}`}
            </span>
            {item.baskets.map((b) => (
              <p key={b.key ?? `${b.symbol}|${b.side}`} className="mt-1.5 flex items-end justify-between gap-3 text-sm">
                <span className="whitespace-nowrap">
                  {b.symbol} <span className={b.side === "buy" ? "text-up" : "text-down"}>{b.side}</span>{" "}
                  <span className="num text-down">{money(b.floating, item.currency)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs text-muted">week if closed</span>
                  <span className="num block font-semibold whitespace-nowrap text-up">{money(b.leftover, item.currency, { sign: true })}</span>
                </span>
              </p>
            ))}
          </li>
        ))}
      </ul>
      {/* Wider screens: one table, a row per basket. */}
      <div className="hidden overflow-x-auto rounded-md border border-line bg-panel sm:block">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-panel-2/70 text-xs tracking-wider text-muted uppercase">
            <tr className="border-b border-line">
              <th className={`${TH} text-left`}>Account</th>
              <th className={`${TH} text-left`}>Basket</th>
              <th className={`${TH} text-right`} title="Profit plus swap of its open positions">Floating</th>
              <th className={`${TH} text-right`} title="Realised trading P&L since Monday 00:00 London">Week so far</th>
              <th className={`${TH} text-right`} title="The week's realised P&L after closing this basket now, on its own">Week if closed</th>
            </tr>
          </thead>
          {accounts.map((item) => {
            const stale = syncStatus(item.lastSyncAt) === "offline";
            return (
              // One tbody per account, so its rows read as a group.
              <tbody key={item.accountId} className="border-b border-line last:border-0">
                {item.baskets.map((b, i) => (
                  <tr key={b.key ?? `${b.symbol}|${b.side}`} className={i > 0 ? "border-t border-line/50" : ""}>
                    <td className={`${TD} align-top`}>
                      {i === 0 && (
                        <>
                          <Link href={`/accounts/${item.accountId}#baskets`} className="font-medium text-ink hover:text-accent">
                            {item.label}
                          </Link>
                          {stale && (
                            <span className="block text-xs text-muted" title={londonTime(item.lastSyncAt)}>
                              last sync {ago(item.lastSyncAt)}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {b.symbol} <span className={b.side === "buy" ? "text-up" : "text-down"}>{b.side}</span>
                    </td>
                    <td className={`${TD} num text-right text-down`}>{money(b.floating, item.currency)}</td>
                    <td className={`${TD} num text-right text-muted`}>{money(item.weekRealised, item.currency, { sign: true })}</td>
                    <td className={`${TD} num text-right font-semibold text-up`}>{money(b.leftover, item.currency, { sign: true })}</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      {several && (
        <p className="text-xs text-muted">Each basket on its own: closing two on one account takes both losses off its week.</p>
      )}
    </section>
  );
}
