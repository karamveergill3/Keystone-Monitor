import { db } from "@/lib/db";
import { listProjects, listAccounts, dailyFor, floatingHistoryFor } from "@/lib/data";
import { fleetReportModel } from "@/lib/reportModel";
import { fleetReportPdf } from "@/lib/reportPdf";
import { pdfResponse } from "@/lib/pdfResponse";
import { todayKey } from "@/lib/days";

// The fleet summary the office printer prints: every live account since
// each went live, on one portrait A4 page. Public, like the other reports.
export async function GET() {
  const supabase = await db();
  const [projects, accounts] = await Promise.all([listProjects(supabase), listAccounts(supabase)]);
  const ids = accounts.map((a) => a.id);
  const [daily, floating] = await Promise.all([dailyFor(supabase, ids), floatingHistoryFor(supabase, ids)]);
  const today = todayKey();
  const model = fleetReportModel({ projects, accounts, daily, floating, today });
  return pdfResponse(await fleetReportPdf(model), `fleet-summary-${today}.pdf`);
}
