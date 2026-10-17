import { notFound } from "next/navigation";
import AccountsTable from "@/components/AccountsTable";
import CurrencyTotals from "@/components/CurrencyTotals";
import MonthlyMatrix from "@/components/MonthlyMatrix";
import ReportForm from "@/components/ReportForm";
import { db } from "@/lib/db";
import { listProjects, listAccounts, dailyFor } from "@/lib/data";
import { accountRow, currencyTotals } from "@/lib/accountView";
import { groupPeriods } from "@/lib/accountStats";
import { todayKey, monthStart, addMonths } from "@/lib/days";

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
  const daily = await dailyFor(supabase, accounts.map((a) => a.id));
  const today = todayKey();
  const rows = accounts.map((a) => {
    const row = accountRow(a, daily.get(a.id), today);
    const months = new Map(groupPeriods(daily.get(a.id) ?? [], row.balance, "month").map((m) => [m.key, m]));
    return { ...row, months };
  });
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => addMonths(monthStart(today), -i));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <p className="text-sm text-muted">{accounts.length} {accounts.length === 1 ? "account" : "accounts"}</p>
      </div>
      <CurrencyTotals totals={currencyTotals(rows)} />
      <AccountsTable rows={rows} />
      <section className="space-y-3">
        <h2 className="text-base font-semibold">By month</h2>
        <MonthlyMatrix rows={rows} months={months} />
      </section>
      <ReportForm action={`/api/reports/project/${project.slug}`} title={`${project.name} report, every account`} />
    </div>
  );
}
