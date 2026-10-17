"use client";

import { useState } from "react";
import { copyText } from "@/components/copyText";

// A read-only value with a copy button, for keys and links shown once.
export default function CopyField({ value, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label && <p className="mb-1 text-xs text-muted">{label}</p>}
      <div className="flex gap-2">
        <input readOnly value={value} onFocus={(e) => e.target.select()} className="w-full rounded-md border border-line-strong bg-panel px-3 py-2 font-mono text-xs text-ink" />
        <button
          type="button"
          onClick={async () => {
            if (!(await copyText(value))) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-md border border-line-strong bg-panel px-3 text-xs font-medium hover:bg-panel-2"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
