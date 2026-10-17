import Link from "next/link";
import { adminSignOut } from "@/app/(auth)/admin/login/actions";
import { isAdmin } from "@/lib/access";
import { listProjects } from "@/lib/data";
import { db } from "@/lib/db";
import { APP_NAME } from "@/lib/site";

// Open to anyone with the link. The Admin link shows only once the admin
// password has been entered in this browser; /admin itself asks for it.
export default async function AppLayout({ children }) {
  const supabase = await db();
  const [projects, admin] = await Promise.all([listProjects(supabase), isAdmin()]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-sm font-semibold tracking-wide">{APP_NAME}</Link>
          <nav className="flex flex-wrap gap-4 text-sm text-muted">
            <Link href="/" className="hover:text-ink">Overview</Link>
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.slug}`} className="hover:text-ink">{p.name}</Link>
            ))}
            {admin && <Link href="/admin" className="hover:text-ink">Admin</Link>}
          </nav>
          {admin && (
            <form action={adminSignOut} className="ml-auto text-xs text-muted">
              <button type="submit" className="hover:text-ink">Leave admin</button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
