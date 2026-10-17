"use client";

import { useActionState } from "react";
import { adminSignIn } from "@/app/(auth)/admin/login/actions";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";

export default function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminSignIn, null);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">Admin</h1>
      <div>
        <label htmlFor="password" className={labelClass}>Admin password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </div>
      {state && !state.ok && <p className="text-sm text-down">{state.message}</p>}
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Checking..." : "Open admin"}
      </button>
    </form>
  );
}
