import { money } from "@/lib/format";

// One quiet line of totals for a project, per currency (accounts in
// different currencies are never added together): what the big totals card
// used to say, now that each account has its own card.
export default function ProjectTotals({ totals }) {
  if (!totals?.length) return null;
  return (
    <p className="num text-xs text-muted">
      {totals
        .map(
          (t) =>
            `${t.accounts} ${t.accounts === 1 ? "account" : "accounts"} · ${money(t.balance, t.currency, { decimals: 0 })} · equity ${money(t.equity, t.currency, { decimals: 0 })} · week ${money(t.week, t.currency, { decimals: 0, sign: true })}`
        )
        .join("   ·   ")}
    </p>
  );
}
