import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where an invite or password-reset link lands. The admin screen builds
// these links itself (see src/app/(app)/admin/actions.js), so no Supabase
// email template has to be edited and no email has to be sent.
const TYPES = new Set(["invite", "recovery"]);

export async function GET(request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (tokenHash && TYPES.has(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/set-password", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
