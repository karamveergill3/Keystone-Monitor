"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";

export default function VerifyTwoFactor({ next }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const mfa = createClient().auth.mfa;
    const { data: list } = await mfa.listFactors();
    const factor = list?.totp?.[0];
    if (!factor) {
      router.replace("/setup-2fa");
      return;
    }
    const { error } = await mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      setError("That code did not match. Try the next one.");
      setBusy(false);
      return;
    }
    router.replace(next);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold">Enter your code</h1>
      <p className="text-sm text-muted">From the authenticator app you set up for this site.</p>
      <div>
        <label htmlFor="code" className={labelClass}>6-digit code</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required pattern="[0-9 ]{6,7}" className={inputClass} />
      </div>
      {error && <p className="text-sm text-down">{error}</p>}
      <button type="submit" disabled={busy} className={`${buttonClass} w-full`}>
        {busy ? "Checking..." : "Continue"}
      </button>
      <p className="text-xs text-muted">Lost your phone? An admin can reset your two-factor.</p>
    </form>
  );
}
