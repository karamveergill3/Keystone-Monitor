import Link from "next/link";
import AddAccountForm from "@/components/AddAccountForm";
import RotateKeyForm from "@/components/RotateKeyForm";
import InviteForm from "@/components/InviteForm";
import ResetLinkForm from "@/components/ResetLinkForm";
import ConfirmButton from "@/components/ConfirmButton";
import StatusDot from "@/components/StatusDot";
import { requireAdmin } from "@/lib/access";
import { listProjects, listAccounts } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncStatus } from "@/lib/site";
import { ago, londonTime } from "@/lib/format";
import { inputClass, quietButtonClass } from "@/lib/ui";
import { updateAccount, setArchived, requestResync, deleteUnusedAccount, resetTwoFactor, setRole, removeMember } from "./actions";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const { supabase, user } = await requireAdmin();
  const db = createAdminClient();

  const [projects, accounts, keysRes, membersRes, usersRes] = await Promise.all([
    listProjects(supabase),
    listAccounts(supabase, { includeArchived: true }),
    db.from("account_keys").select("account_id, key_hint, created_at"),
    supabase.from("members").select("user_id, email, display_name, role, created_at").order("created_at"),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const keys = new Map((keysRes.data ?? []).map((k) => [k.account_id, k]));
  const users = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const members = membersRes.data ?? [];

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold">Admin</h1>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Accounts</h2>
          <a href="/ea/PartnerSync.mq5" download className="text-sm text-accent hover:underline">Download the MT5 EA</a>
        </div>
        <AddAccountForm projects={projects} />
        <div className="overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-medium">Name and project</th>
                <th className="px-3 py-2 font-medium">Login</th>
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Last sync</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const key = keys.get(a.id);
                return (
                  <tr key={a.id} className={`border-b border-line/60 align-top last:border-0 ${a.archived_at ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2">
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
                    <td className="px-3 py-2 text-xs">
                      {a.account_number ? (
                        <>
                          <Link href={`/accounts/${a.id}`} className="hover:text-accent">{a.account_number}</Link>
                          <span className="block text-muted">{a.server}</span>
                        </>
                      ) : (
                        <span className="text-muted">Not connected</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">{key ? `...${key.key_hint}` : "none"}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-2">
                        <StatusDot status={syncStatus(a.last_sync_at)} /> {ago(a.last_sync_at)}
                      </span>
                      {a.ea_version && <span className="block">EA {a.ea_version}</span>}
                      {a.resync_requested && <span className="block text-warn">Resync requested</span>}
                    </td>
                    <td className="px-3 py-2">
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

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Partners</h2>
        <InviteForm />
        <div className="overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Two-factor</th>
                <th className="px-3 py-2 font-medium">Last sign-in</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const u = users.get(m.user_id);
                const has2fa = (u?.factors ?? []).some((f) => f.status === "verified");
                const isMe = m.user_id === user.id;
                return (
                  <tr key={m.user_id} className="border-b border-line/60 align-top last:border-0">
                    <td className="px-3 py-2">
                      {m.display_name || m.email}
                      <span className="block text-xs text-muted">{m.email}{isMe ? " (you)" : ""}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {isMe ? (
                        m.role
                      ) : (
                        <form action={setRole} className="flex gap-2">
                          <input type="hidden" name="userId" value={m.user_id} />
                          <input type="hidden" name="role" value={m.role === "admin" ? "partner" : "admin"} />
                          <span className="py-1.5">{m.role}</span>
                          <ConfirmButton message={m.role === "admin" ? `Make ${m.email} a view-only partner?` : `Make ${m.email} an admin? Admins can add accounts and invite people.`}>
                            {m.role === "admin" ? "Make partner" : "Make admin"}
                          </ConfirmButton>
                        </form>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-xs ${has2fa ? "text-up" : "text-warn"}`}>{has2fa ? "On" : "Not set up yet"}</td>
                    <td className="px-3 py-2 text-xs text-muted">{u?.last_sign_in_at ? londonTime(u.last_sign_in_at) : "Never"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <ResetLinkForm email={m.email} />
                        {has2fa && !isMe && (
                          <form action={resetTwoFactor}>
                            <input type="hidden" name="userId" value={m.user_id} />
                            <ConfirmButton message={`Reset ${m.email}'s two-factor? They set it up again at their next sign-in.`}>Reset 2FA</ConfirmButton>
                          </form>
                        )}
                        {!isMe && (
                          <form action={removeMember}>
                            <input type="hidden" name="userId" value={m.user_id} />
                            <ConfirmButton danger message={`Remove ${m.email}? Their sign-in is deleted and they lose access at once.`}>Remove</ConfirmButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
