import AddAlgorithmForm from "@/components/AddAlgorithmForm";
import ConfirmButton from "@/components/ConfirmButton";
import { renameProject, deleteEmptyProject } from "@/app/(app)/admin/actions";
import { inputClass, projectTint, quietButtonClass } from "@/lib/ui";

// The algorithms (V100, Cycle Method, and any added here), each with how
// many accounts it has, a rename, and a delete while it has none.
export default function AdminAlgorithms({ projects, counts }) {
  return (
    <section aria-labelledby="algorithms" className="rounded-lg border border-line bg-panel p-4">
      <h2 id="algorithms" className="text-base font-semibold">Algorithms</h2>
      <ul className="mt-3 divide-y divide-line">
        {projects.map((p) => {
          const n = counts.get(p.id) ?? 0;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${projectTint(p.sort).dot}`} />
              <form action={renameProject} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="projectId" value={p.id} />
                <div className="w-48 max-w-full">
                  <input name="name" defaultValue={p.name} required maxLength={40} aria-label={`Name of ${p.name}`} className={`${inputClass} py-1`} />
                </div>
                <button type="submit" className={quietButtonClass}>Rename</button>
                <span className="text-xs text-muted">
                  <span className="num">{n}</span> {n === 1 ? "account" : "accounts"}
                </span>
              </form>
              {n === 0 && (
                <form action={deleteEmptyProject}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <ConfirmButton danger message={`Delete ${p.name}? It has no accounts, so nothing is lost.`}>Delete</ConfirmButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 border-t border-line pt-3">
        <AddAlgorithmForm />
      </div>
    </section>
  );
}
