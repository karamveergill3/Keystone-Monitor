"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, SESSION_DAYS, makeAdminToken, passwordMatches } from "@/lib/adminAuth";

export async function adminSignIn(_prev, formData) {
  const password = process.env.ADMIN_PASSWORD;
  if (!passwordMatches(String(formData.get("password") ?? ""), password)) {
    // A pause on each wrong guess. It does not stop guesses sent in
    // parallel: what really guards /admin is a long, random password.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { ok: false, message: "That is not the admin password." };
  }
  (await cookies()).set(ADMIN_COOKIE, makeAdminToken(password), {
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
