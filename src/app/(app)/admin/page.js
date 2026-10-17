import Link from "next/link";
import AddAccountForm from "@/components/AddAccountForm";
import RotateKeyForm from "@/components/RotateKeyForm";
import ConfirmButton from "@/components/ConfirmButton";
import EaCodeBox from "@/components/EaCodeBox";
import StatusDot from "@/components/StatusDot";
import { requireAdmin } from "@/lib/access";
import { listProjects, listAccounts } from "@/lib/data";
import { db } from "@/lib/db";
import { syncStatus } from "@/lib/site";
import { ago, londonTime } from "@/lib/format";
import { inputClass, quietButtonClass } from "@/lib/ui";
import { updateAccount, setArchived, requestResync, deleteUnusedAccount } from "./actions";

export const metadata = { title: "Admin" };

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

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold">Admin</h1>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Accounts</h2>
          <a href="/ea/KeystoneSync.mq5" download className="text-sm text-accent hover:underline">Blank EA, for pasting a key by hand</a>
        </div>
        <p className="max-w-3xl text-sm text-muted">
          Add an account, then download its EA: the key is built in, so the terminal needs nothing typed. To set a terminal up
          again, use <span className="font-medium text-ink">New key</span> on its row for a fresh download. The old key stops
          working straight away.
        </p>
        <AddAccountForm projects={projects} />
        <EaCodeBox />
        <div className="relative overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-panel-2/70 text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-medium">Name and project</th>
                <th className="px-4 py-2.5 font-medium">Login</th>
                <th className="px-4 py-2.5 font-medium">Key</th>
                <th className="px-4 py-2.5 font-medium">Last sync</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const key = keys.get(a.id);
                return (
                  <tr key={a.id} className={`border-b border-line/70 align-top last:border-0 ${a.archived_at ? "bg-panel-2/60" : ""}`}>
                    <td className="px-4 py-2.5">
                      <form action={updateAccount} className="flex gap-2">
                        <input type="hidden" name="accountId" value={a.id} />
                        <input name="label" defaultValue={a.label} maxLength={80} className={`${inputClass} w-48 py-1`} aria-label="Name" />
                        <select name="projectId" defaultValue={a.project_id} className={`${inputClass} w-36 py-1`} aria-label="Project">
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button type="submit" className={quietButtonClass}>Save</button>
                      </form>
                      {a.archived_at && <p className="mt-1 text-xs text-warn">Archived {londonTime(a.archived_at)}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {a.account_number ? (
                        <>
                          <Link href={`/accounts/${a.id}`} className="hover:text-accent">{a.account_number}</Link>
                          <span className="block text-muted">{a.server}</span>
                        </>
                      ) : (
                        <span className="text-muted">Not connected</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{key ? `...${key.key_hint}` : "none"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      <span className="inline-flex items-center gap-2">
                        <StatusDot status={syncStatus(a.last_sync_at)} /> {ago(a.last_sync_at)}
                      </span>
                      {a.ea_version && <span className="block">EA {a.ea_version}</span>}
                      {a.resync_requested && <span className="block text-warn">Resync requested</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <RotateKeyForm accountId={a.id} label={a.label} hasKey={Boolean(key)} />
                        {a.account_number && !a.resync_requested && (
                          <form action={requestResync}>
                            <input type="hidden" name="accountId" value={a.id} />
                            <ConfirmButton message={`Ask ${a.label}'s EA to send its whole history again on its next sync? Nothing is duplicated.`}>Resync history</ConfirmButton>
                          </form>
                        )}
                        <form action={setArchived}>
                          <input type="hidden" name="accountId" value={a.id} />
                          <input type="hidden" name="archive" value={a.archived_at ? "0" : "1"} />
                          <ConfirmButton message={a.archived_at ? `Show ${a.label} again?` : `Archive ${a.label}? It disappears from the overview and its syncs are refused. History is kept.`}>
                            {a.archived_at ? "Restore" : "Archive"}
                          </ConfirmButton>
                        </form>
                        {!a.account_number && !a.last_sync_at && (
                          <form action={deleteUnusedAccount}>
                            <input type="hidden" name="accountId" value={a.id} />
                            <ConfirmButton danger message={`Delete ${a.label}? It has never synced, so nothing is lost.`}>Delete</ConfirmButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!accounts.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted">No accounts yet. Add the first one above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Projects: {projects.map((p) => `${p.name} (${accounts.filter((a) => a.project_id === p.id && !a.archived_at).length})`).join(", ")}.
          Accounts with history are archived, never deleted.
        </p>
      </section>
    </div>
  );
}
