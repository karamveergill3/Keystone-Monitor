// Who is asking, for every signed-in page, route and server action.
//
// Order: a session, then a members row, then two-factor. Membership comes
// before two-factor so somebody with no access is told so straight away,
// rather than being walked through setting up an authenticator first.
//
// The database enforces the same rule on its own (public.is_member() in
// schema.sql), so a page that forgot to call this would show nothing, not
// everything.

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { authStep } from "@/lib/authStep";

// Returns { state, user, member, supabase } without redirecting, for route
// handlers that answer with a status code instead.
export const memberState = cache(async () => {
  const user = await getSessionUser();
  if (!user) return { state: "signed-out" };
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("members")
    .select("user_id, email, display_name, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return { state: "no-access", user };

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const step = authStep(aal?.currentLevel, user);
  if (step !== "ok") return { state: step, user, member };
  return { state: "ok", user, member, supabase };
});

const REDIRECTS = {
  "signed-out": "/login",
  "no-access": "/no-access",
  "needs-code": "/verify-2fa",
  "needs-2fa-setup": "/setup-2fa",
};

export async function requireMember() {
  const s = await memberState();
  if (s.state !== "ok") redirect(REDIRECTS[s.state]);
  return s;
}

export async function requireAdmin() {
  const s = await requireMember();
  if (s.member.role !== "admin") redirect("/");
  return s;
}
