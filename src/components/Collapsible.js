"use client";

import { useState, useSyncExternalStore } from "react";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Another tab changing the choice changes it here too.
function subscribe(onChange) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// A box that opens and shuts on its heading, a native <details>, and
// remembers which in this browser (localStorage under storageKey), so a
// long list stays shut once shut, on every page that shows it. Open until
// told otherwise, and always open as the server sends it; blocked or
// cleared storage just means it opens again.
export default function Collapsible({ storageKey, summary, className = "", children }) {
  const stored = useSyncExternalStore(subscribe, () => read(storageKey), () => null);
  const [choice, setChoice] = useState(null);
  const open = choice ?? stored !== "closed";

  // The browser also fires toggle when the box first appears open; only a
  // real change of state is the reader's choice, and only that is saved.
  function onToggle(event) {
    const next = event.currentTarget.open;
    if (next === open) return;
    setChoice(next);
    try {
      localStorage.setItem(storageKey, next ? "open" : "closed");
    } catch {
      // No storage: the choice lasts until the page is left.
    }
  }

  return (
    <details open={open} onToggle={onToggle} className={`group ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
          <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 transition-transform group-open:rotate-180">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      {children}
    </details>
  );
}
