import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// SERVER-ONLY. SUPABASE_SERVICE_ROLE_KEY bypasses row-level security: never
// prefix it NEXT_PUBLIC_ and never import this from a "use client" file.
// Route handlers, server actions and server-only lib code only.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
