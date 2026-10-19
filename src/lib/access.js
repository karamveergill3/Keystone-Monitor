// Who may use the admin screen. Every other page is open to anyone with
// the link.

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminTokenValid } from "@/lib/adminAuth";

export async function isAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return adminTokenValid(token, process.env.ADMIN_PASSWORD, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// For the admin page and every admin server action. A server action is a
// public endpoint, and being reachable only from the admin page is not a
// check.
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
