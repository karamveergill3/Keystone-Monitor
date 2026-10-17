"use client";

import { dangerButtonClass, quietButtonClass } from "@/lib/ui";

// A submit button that asks first. Lives inside a server-rendered <form>.
export default function ConfirmButton({ children, message, danger = false }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className={danger ? dangerButtonClass : quietButtonClass}
    >
      {children}
    </button>
  );
}
