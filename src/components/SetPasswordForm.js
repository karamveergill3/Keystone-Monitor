"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";

const MIN_LENGTH = 10;

export default function SetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== String(form.get("confirm"))) return setError("The two passwords are different.");
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.replace("/");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold">Choose a password</h1>
      <div>
        <label htmlFor="password" className={labelClass}>New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_LENGTH} className={inputClass} />
      </div>
      <div>
        <label htmlFor="confirm" className={labelClass}>Same again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
      </div>
      {error && <p className="text-sm text-down">{error}</p>}
      <button type="submit" disabled={busy} className={`${buttonClass} w-full`}>
        {busy ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}
