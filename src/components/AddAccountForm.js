"use client";

import { useActionState } from "react";
import { createAccount } from "@/app/(app)/admin/actions";
import KeyReveal from "@/components/KeyReveal";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";

export default function AddAccountForm({ projects }) {
  const [state, action, pending] = useActionState(createAccount, null);
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="new-project" className={labelClass}>Project</label>
          <select id="new-project" name="projectId" className={inputClass} required>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-56 flex-1">
          <label htmlFor="new-label" className={labelClass}>Name on screen</label>
          <input id="new-label" name="label" placeholder="e.g. V100 - Sam - 50k" required maxLength={80} className={inputClass} />
        </div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Adding..." : "Add account"}
        </button>
      </form>
      {state && !state.ok && <p className="mt-2 text-sm text-down">{state.message}</p>}
      <KeyReveal state={state} />
    </div>
  );
}
