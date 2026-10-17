import Link from "next/link";
import { redirect } from "next/navigation";
import AdminLoginForm from "@/components/AdminLoginForm";
import { isAdmin } from "@/lib/access";
import { adminConfigured, MIN_PASSWORD_LENGTH } from "@/lib/adminAuth";

export const metadata = { title: "Admin" };

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");

  return (
    <div className="space-y-4">
      {adminConfigured(process.env.ADMIN_PASSWORD) ? (
        <AdminLoginForm />
      ) : (
        <div className="space-y-3">
          <h1 className="text-lg font-semibold">Admin is switched off</h1>
          <p className="text-sm text-muted">
            Set ADMIN_PASSWORD, at least {MIN_PASSWORD_LENGTH} characters, in the Vercel project&apos;s
            environment variables and redeploy.
          </p>
        </div>
      )}
      <Link href="/" className="block text-center text-xs text-muted hover:text-ink">Back to the overview</Link>
    </div>
  );
}
