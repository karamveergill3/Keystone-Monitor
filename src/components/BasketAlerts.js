import Link from "next/link";
import WarnIcon from "@/components/WarnIcon";
import { flagReason } from "@/lib/baskets";
import { ago, londonTime, money, number } from "@/lib/format";

// Builds this component's items from account rows carrying their baskets;
// the logic and its tests live in src/lib/baskets.js.
export { flaggedItems } from "@/lib/baskets";

function sideClass(side) {
  return side === "buy" ? "text-up" : side === "sell" ? "text-down" : "text-muted";
}

// Every basket, across the accounts on a page, whose floating loss is more
// than its account has banked this week, deepest first, each linking to
// that account's baskets. Nothing at all when there are none, so a quiet
// week leaves the page as it was.
//
// Each reading is from its account's last sync. An offline account keeps
// its last one, so it says so in words, never looking live.
export default function BasketAlerts({ items }) {
  if (!items?.length) return null;
  const n = items.length;
  return (
    <section className="rounded-lg border border-down/40 bg-down-soft p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-down">
        <WarnIcon className="h-4 w-4" />
        {n === 1
          ? "1 basket losing more than its account has banked this week"
          : `${number(n, 0)} baskets losing more than their accounts have banked this week`}
      </h2>
      <ul className="mt-2 space-y-2 text-sm text-ink">
        {items.map((item) => {
          const { accountId, accountLabel, currency, lastSyncAt, offline, basket: b } = item;
          return (
            <li key={`${accountId}:${b.key}`}>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <Link
                  href={`/accounts/${accountId}#baskets`}
                  className="font-medium text-ink underline decoration-down/40 underline-offset-2 hover:text-accent hover:decoration-accent"
                >
                  {accountLabel}
                </Link>
                <span>
                  {b.symbol} <span className={sideClass(b.side)}>{b.side}</span>
                  {` · ${number(b.positions, 0)} ${b.positions === 1 ? "position" : "positions"} · floating `}
                  <span className="num font-medium text-down">{money(b.floating, currency)}</span>
                </span>
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span>{flagReason(item, currency)}</span>
                <span aria-hidden="true">·</span>
                {offline && (
                  <span className="rounded border border-down/40 bg-panel px-1.5 font-medium text-down uppercase">Offline</span>
                )}
                <span title={lastSyncAt ? londonTime(lastSyncAt) : undefined}>
                  as of last sync {ago(lastSyncAt)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
