import Link from "next/link";
import { number } from "@/lib/format";

function Chevron({ left }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={left ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"} />
    </svg>
  );
}

const ARROW = "inline-flex h-8 w-8 items-center justify-center rounded-md border";

// One arrow: a link while there is a page that way, a dimmed placeholder
// at either end so the pair never shifts about. scroll={false} keeps the
// reader where they are: only the table changes.
function Arrow({ href, left, label }) {
  if (!href) {
    return (
      <span className={`${ARROW} border-line text-muted opacity-40`} aria-disabled="true" title={label}>
        <Chevron left={left} />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} className={`${ARROW} border-line-strong bg-panel text-ink hover:border-accent hover:bg-accent-soft hover:text-accent`} title={label}>
      <Chevron left={left} />
      <span className="sr-only">{label}</span>
    </Link>
  );
}

// Newer and older arrows either side of "11-20 of 179", for a list shown a
// page at a time, newest first. Nothing when it all fits on one page.
export default function Pager({ label, page, pageSize, shown, total, hrefForPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = Math.min(total, (page - 1) * pageSize + 1);
  const to = Math.min(total, (page - 1) * pageSize + shown);
  return (
    <nav aria-label={label} className="flex items-center gap-2">
      <Arrow href={page > 1 ? hrefForPage(page - 1) : null} left label="Newer" />
      <span className="num min-w-28 text-center text-xs text-muted">
        {number(from, 0)}-{number(to, 0)} of {number(total, 0)}
      </span>
      <Arrow href={page < pages ? hrefForPage(page + 1) : null} label="Older" />
    </nav>
  );
}
