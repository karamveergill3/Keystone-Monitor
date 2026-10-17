// A warning triangle, drawn in the text colour around it, so an alert has
// a shape as well as a colour. Always beside words that say the same
// thing, so screen readers skip it.
export default function WarnIcon({ className = "h-4 w-4" }) {
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
      <path d="M7.13 2.3a1 1 0 0 1 1.74 0l5.9 10.2a1 1 0 0 1-.87 1.5H2.1a1 1 0 0 1-.87-1.5Z" />
      <path d="M8 6v3.4" />
      <circle cx="8" cy="11.6" r="0.35" fill="currentColor" />
    </svg>
  );
}
