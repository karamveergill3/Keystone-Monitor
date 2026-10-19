import Link from "next/link";
import AccountsTable from "@/components/AccountsTable";
import AccountCards from "@/components/AccountCards";
import ProjectTotals from "@/components/ProjectTotals";
import AttentionPanel from "@/components/AttentionPanel";
import { db } from "@/lib/db";
import { listProjects, listAccounts, dailyFor, openPositionsFor, openBasketsFor } from "@/lib/data";
import { accountRow, currencyTotals } from "@/lib/accountView";
import { accountBaskets } from "@/lib/baskets";
import { accountAttention, attentionItems } from "@/lib/attention";
import { todayKey } from "@/lib/days";
import { dayLabel } from "@/lib/format";
import { projectTint } from "@/lib/ui";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const supabase = await db();
  const [projects, accounts] = await Promise.all([listProjects(supabase), listAccounts(supabase)]);
  const ids = accounts.map((a) => a.id);
  const [daily, openMap, trackedMap] = await Promise.all([
    dailyFor(supabase, ids),
    openPositionsFor(supabase, ids),
    openBasketsFor(supabase, ids),
  ]);
  const today = todayKey();
  const rows = accounts.map((a) => {
    const row = accountRow(a, daily.get(a.id), today);
    const baskets = accountBaskets({ rows: openMap.get(a.id), account: row, weekRealised: row.periods.week.pnl, tracked: trackedMap.get(a.id) });
    return { ...row, baskets, attention: accountAttention({ row, baskets }) };
  });

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted">
          Every external account, by algorithm. Days are London days; today is {dayLabel(today)}.
        </p>
      </div>
      <AttentionPanel items={attentionItems(rows)} checked={rows.length} />
      {projects.map((p) => {
        const projectRows = rows.filter((r) => r.project_id === p.id);
        return (
          <section key={p.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${projectTint(p.sort).dot}`} />{p.name}</h2>
              <Link href={`/projects/${p.slug}`} className="text-sm text-accent hover:underline">
                Monthly breakdown and reports
              </Link>
            </div>
            <ProjectTotals totals={currencyTotals(projectRows)} />
            <AccountCards rows={projectRows} tint={projectTint(p.sort).tint} />
            <AccountsTable rows={projectRows} />
          </section>
        );
      })}
    </div>
  );
}
