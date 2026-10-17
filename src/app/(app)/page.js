import Link from "next/link";
import AccountsTable from "@/components/AccountsTable";
import CurrencyTotals from "@/components/CurrencyTotals";
import { db } from "@/lib/db";
import { listProjects, listAccounts, dailyFor } from "@/lib/data";
import { accountRow, currencyTotals } from "@/lib/accountView";
import { todayKey } from "@/lib/days";
import { dayLabel } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const supabase = await db();
  const [projects, accounts] = await Promise.all([listProjects(supabase), listAccounts(supabase)]);
  const daily = await dailyFor(supabase, accounts.map((a) => a.id));
  const today = todayKey();
  const rows = accounts.map((a) => accountRow(a, daily.get(a.id), today));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted">
          Every external account, both projects. Days are London days; today is {dayLabel(today)}.
        </p>
      </div>
      {projects.map((p) => {
        const projectRows = rows.filter((r) => r.project_id === p.id);
        return (
          <section key={p.id} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <Link href={`/projects/${p.slug}`} className="text-sm text-accent hover:underline">
                Monthly breakdown and reports
              </Link>
            </div>
            <CurrencyTotals totals={currencyTotals(projectRows)} />
            <AccountsTable rows={projectRows} />
          </section>
        );
      })}
    </div>
  );
}
