import Link from "next/link";
import { adminSignOut } from "@/app/(auth)/admin/login/actions";
import LogoMark from "@/components/LogoMark";
import PrintButton from "@/components/PrintButton";
import { isAdmin } from "@/lib/access";
import { listProjects } from "@/lib/data";
import { db } from "@/lib/db";
import { APP_NAME } from "@/lib/site";

// Open to anyone with the link. The Admin link is always there; /admin
// asks for the admin password unless this browser has already given it.
export default async function AppLayout({ children }) {
  const supabase = await db();
  const [projects, admin] = await Promise.all([listProjects(supabase), isAdmin()]);

  return (
    <div className="min-h-screen">
      <header className="relative z-20 bg-bg/80 backdrop-blur sm:sticky sm:top-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2.5 text-base font-semibold">
            <LogoMark className="h-8 w-8 rounded-lg ring-1 ring-line" />
            <span className="tracking-tight">{APP_NAME}</span>
          </Link>
          <nav className="flex flex-wrap gap-1 text-xs font-medium tracking-[0.12em] text-muted uppercase">
            <Link href="/" className="rounded-md px-2.5 py-1.5 hover:bg-panel-2 hover:text-accent">Overview</Link>
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.slug}`} className="rounded-md px-2.5 py-1.5 hover:bg-panel-2 hover:text-accent">{p.name}</Link>
            ))}
            <Link href="/admin" className="rounded-md px-2.5 py-1.5 hover:bg-panel-2 hover:text-accent">Admin</Link>
          </nav>
          {admin && (
            <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
              <PrintButton label="Print fleet summary" report="fleet" />
              <form action={adminSignOut} className="text-xs text-muted">
                <button type="submit" className="hover:text-ink">Leave admin</button>
              </form>
            </div>
          )}
        </div>
        <div className="neon-rule" />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
