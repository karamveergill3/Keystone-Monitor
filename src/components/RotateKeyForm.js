"use client";

import { useActionState } from "react";
import { rotateKey } from "@/app/(app)/admin/actions";
import KeyReveal from "@/components/KeyReveal";
import { quietButtonClass } from "@/lib/ui";

export default function RotateKeyForm({ accountId, label, hasKey }) {
  const [state, action, pending] = useActionState(rotateKey, null);
  return (
    <div>
      <form
        action={action}
        onSubmit={(e) => {
          if (hasKey && !confirm(`Make a new key for ${label}? The terminal stops syncing until it has the new one.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="label" value={label} />
        <button type="submit" disabled={pending} className={quietButtonClass}>
          {hasKey ? "New key" : "Make key"}
        </button>
      </form>
      <KeyReveal state={state} />
    </div>
  );
}
