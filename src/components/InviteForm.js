"use client";

import { useActionState } from "react";
import { inviteMember } from "@/app/(app)/admin/actions";
import LinkReveal from "@/components/LinkReveal";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";

export default function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, null);
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="inv-email" className={labelClass}>Email</label>
          <input id="inv-email" name="email" type="email" required className={inputClass} />
        </div>
        <div className="min-w-40">
          <label htmlFor="inv-name" className={labelClass}>Name</label>
          <input id="inv-name" name="displayName" maxLength={80} className={inputClass} />
        </div>
        <div>
          <label htmlFor="inv-role" className={labelClass}>Role</label>
          <select id="inv-role" name="role" className={inputClass} defaultValue="partner">
            <option value="partner">Partner (view)</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Creating..." : "Create invite link"}
        </button>
      </form>
      <LinkReveal state={state} what="Invite link" />
    </div>
  );
}
