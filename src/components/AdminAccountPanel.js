import RotateKeyForm from "@/components/RotateKeyForm";
import ConfirmButton from "@/components/ConfirmButton";
import { updateAccount, setArchived, requestResync, deleteUnusedAccount } from "@/app/(app)/admin/actions";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";

// Everything that changes one account, under its row on the admin screen:
// rename or move it, connect its terminal, then the rarer actions.
export default function AdminAccountPanel({ account: a, projects, keyHint }) {
  const field = `account-${a.id}`;
  const connected = Boolean(a.account_number);
  const neverSynced = !a.account_number && !a.last_sync_at;

  return (
    <div className="space-y-5 border-t border-line px-4 pt-4 pb-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Rename or move</h3>
        <form action={updateAccount} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="accountId" value={a.id} />
          <div className="min-w-0 flex-1 basis-56">
            <label htmlFor={`${field}-label`} className={labelClass}>Name</label>
            <input id={`${field}-label`} name="label" defaultValue={a.label} required maxLength={80} className={inputClass} />
          </div>
          <div className="w-full sm:w-44">
            <label htmlFor={`${field}-project`} className={labelClass}>Algorithm</label>
            <select id={`${field}-project`} name="projectId" defaultValue={a.project_id} className={`${inputClass} h-[2.625rem]`}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass}>Save</button>
        </form>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Connect the terminal</h3>
        <RotateKeyForm accountId={a.id} label={a.label} hasKey={Boolean(keyHint)}>
          <span className="text-xs text-muted">
            {keyHint ? <>Key <span className="font-mono">…{keyHint}</span></> : "No key yet"}
          </span>
        </RotateKeyForm>
        <p className="mt-2 text-xs text-muted">
          The key comes built into a download of the EA, shown once: download it before moving this account to another project. A new
          key stops the old one at once.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {connected && !a.resync_requested && (
          <form action={requestResync}>
            <input type="hidden" name="accountId" value={a.id} />
            <ConfirmButton message={`Ask ${a.label}'s EA to send its whole history again on its next sync? Nothing is duplicated.`}>
              Resync history
            </ConfirmButton>
          </form>
        )}
        {connected && a.resync_requested && <span className="px-1 text-xs text-muted">Resync requested</span>}
        <form action={setArchived}>
          <input type="hidden" name="accountId" value={a.id} />
          <input type="hidden" name="archive" value="1" />
          <ConfirmButton message={`Archive ${a.label}? It disappears from the overview and its syncs are refused. History is kept.`}>
            Archive
          </ConfirmButton>
        </form>
        {neverSynced && (
          <form action={deleteUnusedAccount}>
            <input type="hidden" name="accountId" value={a.id} />
            <ConfirmButton danger message={`Delete ${a.label}? It has never synced, so nothing is lost.`}>Delete</ConfirmButton>
          </form>
        )}
      </div>
    </div>
  );
}
