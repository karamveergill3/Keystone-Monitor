"use client";

import { useActionState } from "react";
import { createAccount } from "@/app/(app)/admin/actions";
import KeyReveal from "@/components/KeyReveal";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";

// The project is a segmented choice: radio inputs drawn as pills, so the
// arrow keys and screen readers treat it as the one choice it is.
export default function AddAccountForm({ projects }) {
  const [state, action, pending] = useActionState(createAccount, null);
  return (
    <section aria-labelledby="add-account" className="rounded-lg border border-line bg-panel p-4">
      <h2 id="add-account" className="text-base font-semibold">Add an account</h2>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="new-label" className={labelClass}>Name</label>
          <input id="new-label" name="label" placeholder="e.g. V100 · Sam · 50k" required maxLength={80} className={inputClass} />
        </div>
        <fieldset className="w-full min-w-0 sm:w-auto">
          <legend className={labelClass}>Project</legend>
          <div className="flex rounded-md border border-line-strong bg-panel p-0.5">
            {projects.map((p, i) => (
              <label key={p.id} className="flex-1 cursor-pointer">
                <input type="radio" name="projectId" value={p.id} defaultChecked={i === 0} required className="peer sr-only" />
                <span className="block rounded px-3 py-1.5 text-center text-sm font-medium whitespace-nowrap text-muted peer-checked:bg-accent-soft peer-checked:text-accent peer-checked:ring-1 peer-checked:ring-accent/40 peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                  {p.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" disabled={pending} className={`${buttonClass} w-full sm:w-auto`}>
          {pending ? "Adding..." : "Add account"}
        </button>
      </form>
      {state && !state.ok && <p className="mt-2 text-sm text-down">{state.message}</p>}
      <KeyReveal state={state} />
    </section>
  );
}
