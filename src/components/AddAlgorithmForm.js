"use client";

import { useActionState } from "react";
import { createProject } from "@/app/(app)/admin/actions";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";

// A new algorithm (another bot beside V100 and Cycle Method): its own
// section on the overview, its own tab and pages.
export default function AddAlgorithmForm() {
  const [state, action, pending] = useActionState(createProject, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor="new-algorithm" className={labelClass}>New algorithm</label>
        <input id="new-algorithm" name="name" placeholder="e.g. V200" required maxLength={40} className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full sm:w-auto`}>
        {pending ? "Adding..." : "Add algorithm"}
      </button>
      {state?.message && (
        <p className={`w-full text-sm ${state.ok ? "text-muted" : "text-down"}`}>{state.message}</p>
      )}
    </form>
  );
}
