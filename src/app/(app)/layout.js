import Link from "next/link";
import { requireMember } from "@/lib/access";
import { listProjects } from "@/lib/data";
import { APP_NAME } from "@/lib/site";

export default async function AppLayout({ children }) {
  const { member, supabase } = await requireMember();
  const projects = await listProjects(supabase);

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
            {member.role === "admin" && <Link href="/admin" className="hover:text-ink">Admin</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted">
            <span>{member.display_name || member.email}</span>
            <form action="/auth/sign-out" method="post">
              <button type="submit" className="hover:text-ink">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
