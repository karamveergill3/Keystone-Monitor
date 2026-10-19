"use client";

import { useActionState } from "react";
import { rotateKey } from "@/app/(app)/admin/actions";
import KeyReveal from "@/components/KeyReveal";
import { quietButtonClass } from "@/lib/ui";

// Make key (or New key), with whatever is passed as children beside the
// button, and the connect steps under it once a key is made.
export default function RotateKeyForm({ accountId, label, hasKey, children }) {
  const [state, action, pending] = useActionState(rotateKey, null);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <form
          action={action}
          onSubmit={(e) => {
            if (hasKey && !confirm(`Make a new key for ${label}? The terminal stops syncing until it has the new one.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="label" value={label} />
          <button type="submit" disabled={pending} className={quietButtonClass}>
            {pending ? "Making..." : hasKey ? "New key" : "Make key"}
          </button>
        </form>
        {children}
      </div>
      <KeyReveal state={state} />
    </div>
  );
}
