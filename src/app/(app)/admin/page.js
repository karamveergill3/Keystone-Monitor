import Link from "next/link";
import AddAccountForm from "@/components/AddAccountForm";
import AdminAlgorithms from "@/components/AdminAlgorithms";
import AdminAccountRow from "@/components/AdminAccountRow";
import ConfirmButton from "@/components/ConfirmButton";
import { requireAdmin } from "@/lib/access";
import { listProjects, listAccounts } from "@/lib/data";
import { db } from "@/lib/db";
import { londonTime } from "@/lib/format";
import { projectTint } from "@/lib/ui";
import { setArchived } from "./actions";

export const metadata = { title: "Admin" };

const byName = (a, b) => a.label.localeCompare(b.label, "en-GB", { numeric: true, sensitivity: "base" });

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await db();

  const [projects, accounts, keysRes] = await Promise.all([
    listProjects(supabase),
    listAccounts(supabase, { includeArchived: true }),
    supabase.from("account_keys").select("account_id, key_hint, created_at"),
  ]);
  const keys = new Map((keysRes.data ?? []).map((k) => [k.account_id, k]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const active = accounts.filter((a) => !a.archived_at).sort(byName);
  const archived = accounts.filter((a) => a.archived_at).sort(byName);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-muted">Add accounts and algorithms, and connect their MT5 terminals.</p>
      </div>

      <AddAccountForm projects={projects} />

      <AdminAlgorithms
        projects={projects}
        counts={new Map(projects.map((p) => [p.id, accounts.filter((a) => a.project_id === p.id).length]))}
      />

      <div className="space-y-6">
        {projects.map((p) => {
          const list = active.filter((a) => a.project_id === p.id);
          return (
            <section key={p.id} aria-labelledby={`project-${p.id}`} className="space-y-2">
              <h2 id={`project-${p.id}`} className="flex items-center gap-2 text-base font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${projectTint(p.sort).dot}`} />
                {p.name}
                <span className="text-sm font-normal text-muted">(<span className="num">{list.length}</span>)</span>
              </h2>
              {list.length ? (
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
                  {list.map((a) => (
                    <AdminAccountRow key={a.id} account={a} projects={projects} keyHint={keys.get(a.id)?.key_hint ?? null} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-line bg-panel px-4 py-3 text-sm text-muted">No accounts yet. Add one above.</p>
              )}
            </section>
          );
        })}

        {archived.length > 0 && (
          <details className="rounded-lg border border-line bg-panel">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Archived (<span className="num">{archived.length}</span>)
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {archived.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/accounts/${a.id}`} className="block text-sm font-medium break-words text-ink hover:text-accent sm:truncate">
                      {a.label}
                    </Link>
                    <p className="text-xs break-words text-muted sm:truncate">
                      {projectName.get(a.project_id) ?? "No project"} · archived {londonTime(a.archived_at)}
                    </p>
                  </div>
                  <form action={setArchived} className="shrink-0">
                    <input type="hidden" name="accountId" value={a.id} />
                    <input type="hidden" name="archive" value="0" />
                    <ConfirmButton message={`Restore ${a.label}? It shows on the overview again and its syncs are accepted.`}>Restore</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <section aria-labelledby="ea" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="ea" className="text-base font-semibold">EA</h2>
          <a href="/ea/KeystoneSync.mq5" download className="text-sm text-accent hover:underline">Download the blank EA</a>
        </div>
        <p className="text-sm text-muted">
          Each account gets its own ready-made EA, with its key built in, from <span className="font-medium text-ink">Make key</span> or{" "}
          <span className="font-medium text-ink">New key</span> under Manage. The blank one needs its SyncUrl and SyncKey typed in by hand.
        </p>
      </section>
    </div>
  );
}
