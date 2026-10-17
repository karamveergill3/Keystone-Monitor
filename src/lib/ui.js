// Shared class strings, so every form control looks the same.
export const inputClass =
  "w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft focus:outline-none";

export const labelClass = "mb-1 block text-xs font-medium text-muted";

export const buttonClass =
  "inline-flex items-center justify-center rounded-md border border-accent/25 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent hover:border-accent/50 disabled:opacity-50";

export const quietButtonClass =
  "inline-flex items-center justify-center rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink hover:bg-panel-2 disabled:opacity-50";

export const dangerButtonClass =
  "inline-flex items-center justify-center rounded-md border border-down/30 bg-panel px-3 py-1.5 text-xs font-medium text-down hover:bg-down-soft disabled:opacity-50";

// Each project's pastel tint and its matching dot, by the project's sort
// order. Written out in full so Tailwind generates every class.
const TINTS = [
  ["bg-tint-1", "bg-series-1"],
  ["bg-tint-2", "bg-series-2"],
  ["bg-tint-3", "bg-up"],
  ["bg-tint-4", "bg-accent"],
];

export function projectTint(sort) {
  const [tint, dot] = TINTS[(Math.max(1, Number(sort) || 1) - 1) % TINTS.length];
  return { tint, dot };
}
