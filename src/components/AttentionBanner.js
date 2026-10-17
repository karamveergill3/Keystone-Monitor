import WarnIcon from "@/components/WarnIcon";
import { stopOutLevel } from "@/lib/attention";

// The two attention levels as the screens draw them. Red is act now, amber
// is keep an eye on it. Each has its own shape as well as its colour (a
// triangle, a ring), and every use sits beside words saying why, so a
// level never reads from colour alone. Every text colour here is at least
// 5:1 on every soft fill (src/app/globals.css), so a red reason inside an
// amber box, or the other way round, stays readable.
export const LEVELS = {
  red: {
    text: "text-down",
    box: "border-down/40 bg-down-soft",
    chip: "border-down/40 bg-down-soft text-down",
    cell: "bg-down-soft text-down",
    row: "bg-down-soft/50",
    // On the first cell: a row's own box-shadow does not paint in a
    // collapsed table.
    edge: "shadow-[inset_3px_0_0_var(--color-down)]",
    label: "Act now",
  },
  amber: {
    text: "text-warn",
    box: "border-warn/40 bg-warn-soft",
    chip: "border-warn/40 bg-warn-soft text-warn",
    cell: "bg-warn-soft text-warn",
    row: "bg-warn-soft/60",
    edge: "shadow-[inset_3px_0_0_var(--color-warn)]",
    label: "Watch",
  },
};

// Anything that is not red is drawn amber: an unknown level still gets
// looked at, never hidden.
export function levelStyle(level) {
  return level === "red" ? LEVELS.red : LEVELS.amber;
}

// How close a distance to stop-out is, as a share of the symbol's price:
// the attention reasons' own rule (src/lib/attention.js), so a figure
// coloured here is the one that put the account on the list.
export const distanceLevel = stopOutLevel;

// The level's shape, in the text colour around it: the warning triangle
// for red, a ring with an exclamation mark for amber. Screen readers get
// the level's word instead.
export function ReasonIcon({ level, className = "h-4 w-4" }) {
  const label = <span className="sr-only">{`${levelStyle(level).label}: `}</span>;
  if (level === "red") {
    return (
      <>
        <WarnIcon className={className} />
        {label}
      </>
    );
  }
  return (
    <>
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
        className={`inline-block shrink-0 ${className}`}
      >
        <circle cx="8" cy="8" r="6.2" />
        <path d="M8 4.9v3.6" />
        <circle cx="8" cy="11.1" r="0.35" fill="currentColor" />
      </svg>
      {label}
    </>
  );
}

// One reason as a line: its icon and short form in its own colour, then
// the full sentence in ink.
export function ReasonLine({ reason }) {
  const tone = levelStyle(reason.level);
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1 inline-flex ${tone.text}`}>
        <ReasonIcon level={reason.level} />
      </span>
      <span>
        <span className={`font-semibold ${tone.text}`}>{reason.short}</span>
        {reason.text && <span className="text-ink">{`: ${reason.text}`}</span>}
      </span>
    </li>
  );
}

// Under the account page's heading: every reason this account needs
// looking at (accountAttention in src/lib/attention.js), in one box coloured
// by the worst of them. Nothing at all when there are none, so a healthy
// account's page starts as it always has.
export default function AttentionBanner({ attention }) {
  const reasons = attention?.reasons ?? [];
  if (!reasons.length) return null;
  const worst = attention.level ?? (reasons.some((r) => r.level === "red") ? "red" : "amber");
  return (
    <section aria-label="Needs attention" className={`rounded-md border px-4 py-3 text-sm ${levelStyle(worst).box}`}>
      <ul className="space-y-1.5">
        {reasons.map((r) => (
          <ReasonLine key={r.code} reason={r} />
        ))}
      </ul>
    </section>
  );
}
