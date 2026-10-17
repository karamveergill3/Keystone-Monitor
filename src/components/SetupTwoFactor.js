"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";

// Enrols an authenticator app. Any half-finished enrolment from an earlier
// visit is removed first, or Supabase refuses a second one with the same
// name.
export default function SetupTwoFactor() {
  const router = useRouter();
  const [factor, setFactor] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mfa = createClient().auth.mfa;
      const { data: list } = await mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status === "unverified") await mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
      if (cancelled) return;
      if (error) setError(error.message);
      else setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      setError("That code did not match. Check the time on your phone and try the next one.");
      setBusy(false);
      return;
    }
    router.replace("/");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold">Set up two-factor</h1>
      <p className="text-sm text-muted">
        Every partner signs in with a password and a code from an authenticator app (Google
        Authenticator, 1Password, Authy). Scan this once.
      </p>
      {factor ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL from Supabase */}
          <img src={factor.qr} alt="QR code for your authenticator app" className="mx-auto h-44 w-44 rounded bg-white p-2" />
          <p className="text-center text-xs text-muted">
            Can&apos;t scan? Enter this key: <span className="font-mono text-ink break-all">{factor.secret}</span>
          </p>
          <div>
            <label htmlFor="code" className={labelClass}>6-digit code</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9 ]{6,7}" className={inputClass} />
          </div>
          <button type="submit" disabled={busy} className={`${buttonClass} w-full`}>
            {busy ? "Checking..." : "Turn on two-factor"}
          </button>
        </>
      ) : (
        !error && <p className="text-sm text-muted">Preparing...</p>
      )}
      {error && <p className="text-sm text-down">{error}</p>}
    </form>
  );
}
