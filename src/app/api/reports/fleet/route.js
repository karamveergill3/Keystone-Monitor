import { db } from "@/lib/db";
import { listProjects, listAccounts, dailyFor, openPositionsFor, openBasketsFor } from "@/lib/data";
import { fleetReportModel } from "@/lib/reportModel";
import { fleetReportPdf } from "@/lib/reportPdf";
import { pdfResponse } from "@/lib/pdfResponse";
import { todayKey } from "@/lib/days";

// The fleet summary the office printer prints: every account, as the
// overview shows it, on landscape A4. Public, like the other reports.
export async function GET() {
  const supabase = await db();
  const [projects, accounts] = await Promise.all([listProjects(supabase), listAccounts(supabase)]);
  const ids = accounts.map((a) => a.id);
  const [daily, openMap, trackedMap] = await Promise.all([
    dailyFor(supabase, ids),
    openPositionsFor(supabase, ids),
    openBasketsFor(supabase, ids),
  ]);
  const today = todayKey();
  const model = fleetReportModel({ projects, accounts, daily, openMap, trackedMap, today });
  return pdfResponse(await fleetReportPdf(model), `fleet-summary-${today}.pdf`);
}
