import { notFound } from "next/navigation";
import AccountsTable from "@/components/AccountsTable";
import CurrencyTotals from "@/components/CurrencyTotals";
import AttentionPanel from "@/components/AttentionPanel";
import MonthlyMatrix from "@/components/MonthlyMatrix";
import ReportForm from "@/components/ReportForm";
import { db } from "@/lib/db";
import { listProjects, listAccounts, dailyFor, openPositionsFor, openBasketsFor } from "@/lib/data";
import { accountRow, currencyTotals } from "@/lib/accountView";
import { accountBaskets } from "@/lib/baskets";
import { accountAttention, attentionItems } from "@/lib/attention";
import { groupPeriods } from "@/lib/accountStats";
import { todayKey, monthStart, addMonths } from "@/lib/days";
import { projectTint } from "@/lib/ui";

const MONTHS_SHOWN = 6;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const supabase = await db();
  const project = (await listProjects(supabase)).find((p) => p.slug === slug);
  return { title: project?.name ?? "Project" };
}

export default async function ProjectPage({ params }) {
  const { slug } = await params;
  const supabase = await db();
  const project = (await listProjects(supabase)).find((p) => p.slug === slug);
  if (!project) notFound();

  const accounts = await listAccounts(supabase, { projectId: project.id });
  const ids = accounts.map((a) => a.id);
  const [daily, openMap, trackedMap] = await Promise.all([
    dailyFor(supabase, ids),
    openPositionsFor(supabase, ids),
    openBasketsFor(supabase, ids),
  ]);
  const today = todayKey();
  const rows = accounts.map((a) => {
    const row = accountRow(a, daily.get(a.id), today);
    const months = new Map(groupPeriods(daily.get(a.id) ?? [], row.balance, "month").map((m) => [m.key, m]));
    const baskets = accountBaskets({ rows: openMap.get(a.id), account: row, weekRealised: row.periods.week.pnl, tracked: trackedMap.get(a.id) });
    return { ...row, months, baskets, attention: accountAttention({ row, baskets }) };
  });
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => addMonths(monthStart(today), -i));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold"><span className={`h-3 w-3 rounded-full ${projectTint(project.sort).dot}`} />{project.name}</h1>
        <p className="text-sm text-muted">{accounts.length} {accounts.length === 1 ? "account" : "accounts"}</p>
      </div>
      <AttentionPanel items={attentionItems(rows)} checked={rows.length} />
      <CurrencyTotals totals={currencyTotals(rows)} tint={projectTint(project.sort).tint} />
      <AccountsTable rows={rows} />
      <section className="space-y-3">
        <h2 className="text-base font-semibold">By month</h2>
        <MonthlyMatrix rows={rows} months={months} />
      </section>
      <ReportForm action={`/api/reports/project/${project.slug}`} title={`${project.name} report, every account`} />
    </div>
  );
}
