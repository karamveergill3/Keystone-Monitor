"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";

export default function LoginForm({ next, linkError }) {
  const router = useRouter();
  const [error, setError] = useState(linkError ? "That link has expired or was already used. Ask an admin for a new one." : "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    if (error) {
      setError("Email or password is wrong.");
      setBusy(false);
      return;
    }
    // The server sees the new session cookie and decides whether a
    // two-factor step comes first.
    router.replace(next);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <div>
        <label htmlFor="email" className={labelClass}>Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </div>
      {error && <p className="text-sm text-down">{error}</p>}
      <button type="submit" disabled={busy} className={`${buttonClass} w-full`}>
        {busy ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-xs text-muted">
        Access is by invitation. Forgotten your password? Ask an admin for a reset link.
      </p>
    </form>
  );
}
