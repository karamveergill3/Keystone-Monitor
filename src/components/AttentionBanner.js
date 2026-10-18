// The one highlight on the site: a basket in loss that could be closed now
// with the week still in profit (src/lib/attention.js). It is drawn green,
// beside a tick in a ring, and always beside words saying so, so it never
// reads from colour alone. Nothing else on the site is coloured as a
// warning.
export const CLOSABLE = {
  text: "text-up",
  box: "border-up/40 bg-up-soft",
  chip: "border-up/40 bg-up-soft text-up",
  row: "bg-up-soft/50",
  // On the first cell: a row's own box-shadow does not paint in a
  // collapsed table.
  edge: "shadow-[inset_3px_0_0_var(--color-up)]",
  label: "Can close",
};

// A tick in a ring, drawn in the text colour around it. Always beside words
// that say the same thing, so screen readers skip it.
export function CheckIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.3 8.2l1.9 1.9 3.5-3.7" />
    </svg>
  );
}

// The tick, with the flag's word for screen readers.
export function ClosableIcon({ className = "h-4 w-4" }) {
  return (
    <>
      <CheckIcon className={className} />
      <span className="sr-only">{`${CLOSABLE.label}: `}</span>
    </>
  );
}

function closableOnly(reasons) {
  return (Array.isArray(reasons) ? reasons : []).filter((r) => r?.code === "basket-closable");
}

// The closable reason as a line: the tick and its short form in green,
// then the full sentence in ink.
export function ReasonLine({ reason }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1 inline-flex ${CLOSABLE.text}`}>
        <ClosableIcon />
      </span>
      <span>
        <span className={`font-semibold ${CLOSABLE.text}`}>{reason.short}</span>
        {reason.text && <span className="text-ink">{`: ${reason.text}`}</span>}
      </span>
    </li>
  );
}

// Under the account page's heading: the account's closable baskets
// (accountAttention in src/lib/attention.js), in one green box. Nothing at
// all otherwise, so every other account's page starts as it always has.
export default function AttentionBanner({ attention }) {
  const reasons = closableOnly(attention?.reasons);
  if (!reasons.length) return null;
  return (
    <section aria-label="Can close in profit" className={`rounded-md border px-4 py-3 text-sm ${CLOSABLE.box}`}>
      <ul className="space-y-1.5">
        {reasons.map((r) => (
          <ReasonLine key={r.code} reason={r} />
        ))}
      </ul>
    </section>
  );
}
