"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  SESSION_DAYS,
  adminConfigured,
  adminTag,
  makeAdminToken,
  passwordMatches,
} from "@/lib/adminAuth";
import { attemptMessage, checkAdminAttempt } from "@/lib/adminGuard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function adminSignIn(_prev, formData) {
  const password = process.env.ADMIN_PASSWORD;
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ok = passwordMatches(String(formData.get("password") ?? ""), password);

  // Every attempt, right or wrong, is counted by the database, which also
  // says whether admin is locked. If it cannot be asked, nobody gets in.
  let outcome = { status: "unavailable" };
  if (adminConfigured(password)) {
    try {
      const db = createAdminClient();
      outcome = await checkAdminAttempt({ ok, tag: adminTag(password, pepper), rpc: (fn, args) => db.rpc(fn, args) });
    } catch {
      // A missing key or URL: refused as unavailable.
    }
  }

  if (outcome.status !== "in") {
    // A pause on each refusal, on top of the lockout.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { ok: false, message: attemptMessage(outcome) };
  }
  (await cookies()).set(ADMIN_COOKIE, makeAdminToken(password, pepper), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect("/admin");
}

export async function adminSignOut() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/");
}
