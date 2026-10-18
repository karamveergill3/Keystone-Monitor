import Link from "next/link";
import { CLOSABLE, ClosableIcon, ReasonLine } from "@/components/AttentionBanner";
import { ago, londonTime, number } from "@/lib/format";

function accounts(n) {
  return n === 1 ? "1 account" : `${number(n, 0)} accounts`;
}

// On the overview and project pages: every account with a basket in loss
// that could be closed now with the week still in profit (attentionItems
// in src/lib/attention.js), by label, each with its closable baskets. It
// is the site's only highlight, so the box is green and nothing else ever
// appears in it. When no basket can be closed it says so in one quiet
// line, so the reader knows it was checked.
//
// Every reading is from its account's last sync, which each account says.
export default function AttentionPanel({ items, checked }) {
  // Not passed at all is not the same as nothing closable, and a page with
  // no accounts has nothing to check: say nothing rather than none.
  if (!Array.isArray(items) || !checked) return null;

  const closable = items.filter((i) => i?.reasons?.some((r) => r?.code === "basket-closable"));
  if (!closable.length) {
    return <p className="text-sm text-muted">No basket can be closed in profit right now.</p>;
  }

  const n = closable.length;
  return (
    <section aria-labelledby="closable-heading" className={`rounded-lg border p-4 ${CLOSABLE.box}`}>
      <h2 id="closable-heading" className={`flex items-center gap-2 text-sm font-semibold ${CLOSABLE.text}`}>
        <ClosableIcon />
        {`${accounts(n)} can close a basket and stay up for the week`}
      </h2>
      <ul className="mt-3 space-y-3">
        {closable.map((item) => (
          <li key={item.accountId}>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <Link
                href={`/accounts/${item.accountId}`}
                className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:text-accent hover:decoration-accent"
              >
                {item.label}
              </Link>
              <span className="text-xs text-muted" title={item.lastSyncAt ? londonTime(item.lastSyncAt) : undefined}>
                last sync {ago(item.lastSyncAt)}
              </span>
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {item.reasons
                .filter((r) => r?.code === "basket-closable")
                .map((r) => (
                  <ReasonLine key={r.code} reason={r} />
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
