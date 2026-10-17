import Link from "next/link";
import { ReasonIcon, ReasonLine, levelStyle } from "@/components/AttentionBanner";
import { ago, londonTime, number } from "@/lib/format";

// The one place on the overview and project pages that says which accounts
// need looking at and why: attentionItems in src/lib/attention.js, red
// accounts first, each with its reasons, red first. The site raises no
// alerts of any other kind, so when nothing is wrong it says so in one calm
// line rather than leaving the reader to wonder whether it is working.
//
// Every reading is from its account's last sync; each account says when
// that was, and an offline one has its own reason saying so.
export default function AttentionPanel({ items, checked }) {
  // Not passed at all is not the same as nothing wrong, and a page with no
  // accounts has nothing to vouch for: say nothing rather than all is well.
  if (!Array.isArray(items) || !checked) return null;

  if (!items.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-up" />
        Nothing needs attention: no basket past the week&apos;s profit, nothing near stop-out or margin call, no terminal
        offline.
      </p>
    );
  }

  const n = items.length;
  const worst = items.some((i) => i.level === "red") ? "red" : "amber";
  const tone = levelStyle(worst);
  return (
    <section aria-labelledby="attention-heading" className={`rounded-lg border p-4 ${tone.box}`}>
      <h2 id="attention-heading" className={`flex items-center gap-2 text-sm font-semibold ${tone.text}`}>
        <ReasonIcon level={worst} />
        {n === 1 ? "1 account needs attention" : `${number(n, 0)} accounts need attention`}
      </h2>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
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
              {item.reasons.map((r) => (
                <ReasonLine key={r.code} reason={r} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
