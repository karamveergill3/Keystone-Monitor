import Link from "next/link";
import { ReasonIcon, ReasonLine, levelStyle, worstLevel } from "@/components/AttentionBanner";
import { ago, londonTime, number } from "@/lib/format";

function accounts(n) {
  return n === 1 ? "1 account" : `${number(n, 0)} accounts`;
}

// The one place on the overview and project pages that lists the accounts
// with something to say and why: attentionItems in src/lib/attention.js,
// red accounts first, then amber, then green, each with its reasons in
// their own colours. Green is the good kind: a basket that could be closed
// now with the week still in profit. The box and its heading follow the
// worst account on the list, so a list of green ones only is green. The
// site raises no alerts of any other kind, so when there is nothing at all
// it says so in one calm line rather than leaving the reader to wonder
// whether it is working.
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
        <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full border border-line-strong" />
        Nothing to flag: no basket can be closed in profit right now, nothing near stop-out or margin call, no terminal
        offline.
      </p>
    );
  }

  // Accounts with something wrong and accounts whose only news is a
  // closable basket are counted apart, so good news is never counted as
  // needing attention.
  const bad = items.filter((i) => i.level !== "green").length;
  const good = items.length - bad;
  const worst = worstLevel(items.map((i) => i.level)) ?? "amber";
  const tone = levelStyle(worst);
  const heading = [
    bad > 0 && `${accounts(bad)} ${bad === 1 ? "needs" : "need"} attention`,
    good > 0 && `${accounts(good)} can close a basket and stay up for the week`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section aria-labelledby="attention-heading" className={`rounded-lg border p-4 ${tone.box}`}>
      <h2 id="attention-heading" className={`flex items-center gap-2 text-sm font-semibold ${tone.text}`}>
        <ReasonIcon level={worst} />
        {heading}
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
