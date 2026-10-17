"use client";

import { useActionState } from "react";
import { resetLink } from "@/app/(app)/admin/actions";
import LinkReveal from "@/components/LinkReveal";
import { quietButtonClass } from "@/lib/ui";

export default function ResetLinkForm({ email }) {
  const [state, action, pending] = useActionState(resetLink, null);
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="email" value={email} />
        <button type="submit" disabled={pending} className={quietButtonClass}>Password link</button>
      </form>
      <LinkReveal state={state} what="Password reset link" />
    </div>
  );
}
