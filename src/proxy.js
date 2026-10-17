import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // /api/sync is left out on purpose: the EA authenticates with its own
    // key and never has a session, so refreshing one there would be a
    // wasted Auth round trip on every sync from every terminal.
    "/((?!_next/static|_next/image|favicon.ico|api/sync$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
