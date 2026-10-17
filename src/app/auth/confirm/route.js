import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Spends an invite or password-reset token, from the button on /confirm.
// The admin screen builds these links itself, so no Supabase email
// template has to be edited and no email has to be sent.
const TYPES = new Set(["invite", "recovery"]);

export async function POST(request) {
  const url = new URL(request.url);

  // Only from this site's own form. Without this, another site could post
  // its own invite token from a visitor's browser and sign them in as
  // someone else.
  if (request.headers.get("origin") !== url.origin) {
    return new Response("Forbidden\n", { status: 403 });
  }

  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "");

  if (tokenHash && TYPES.has(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/set-password", url.origin), { status: 303 });
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin), { status: 303 });
}

// An old-style link, or one opened directly: show the button, use nothing.
export async function GET(request) {
  const url = new URL(request.url);
  return NextResponse.redirect(new URL(`/confirm${url.search}`, url.origin));
}
