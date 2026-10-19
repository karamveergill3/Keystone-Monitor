import Link from "next/link";
import StatusDot from "@/components/StatusDot";
import AdminAccountPanel from "@/components/AdminAccountPanel";
import { syncStatus } from "@/lib/site";
import { ago } from "@/lib/format";
import { quietButtonClass } from "@/lib/ui";

// One account on the admin screen: who it is and how it syncs, with every
// change behind Manage. Manage is a native <details>, so it opens without
// any script; its summary sits on the row's right and the panel opens
// under the row.
export default function AdminAccountRow({ account: a, projects, keyHint }) {
  return (
    <li className="relative has-[details[open]]:bg-panel-2/50">
      <div className="flex items-start gap-3 px-4 py-3 sm:pr-32">
        <span className="flex h-6 items-center">
          <StatusDot status={syncStatus(a.last_sync_at)} />
        </span>
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1 pr-26 sm:pr-0">
            <Link href={`/accounts/${a.id}`} className="block text-sm font-medium break-words text-ink hover:text-accent sm:truncate">
              {a.label}
            </Link>
            <p className="text-xs break-words text-muted sm:truncate">
              {a.account_number ? `${a.account_number} · ${a.server}` : "Not connected yet"}
            </p>
          </div>
          <p className="text-xs text-muted sm:shrink-0 sm:text-right">
            {a.last_sync_at ? `Last sync ${ago(a.last_sync_at)}` : "Never synced"}
            {a.ea_version && (
              <span className="whitespace-nowrap sm:block">
                <span className="sm:hidden"> · </span>EA {a.ea_version}
              </span>
            )}
          </p>
        </div>
      </div>
      <details className="group">
        <summary className={`${quietButtonClass} absolute top-4 right-4 cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden`}>
          Manage<span className="sr-only"> {a.label}</span>
          <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 transition-transform group-open:rotate-180">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <AdminAccountPanel account={a} projects={projects} keyHint={keyHint} />
      </details>
    </li>
  );
}
