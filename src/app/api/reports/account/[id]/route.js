import { requireMember } from "@/lib/access";
import { getAccount, listProjects, dailyFor, positionsPage } from "@/lib/data";
import { reportRange, rangeSlug } from "@/lib/reportRange";
import { accountReportModel } from "@/lib/reportModel";
import { accountReportPdf } from "@/lib/reportPdf";
import { pdfResponse, badRange } from "@/lib/pdfResponse";
import { todayKey, londonMidnight, addDays } from "@/lib/days";

// The newest trades a report lists. The figures always cover every trade.
const TRADES_LISTED = 300;

export async function GET(request, { params }) {
  const { id } = await params;
  const { supabase } = await requireMember();
  const account = await getAccount(supabase, id);
  if (!account) return new Response("Not found\n", { status: 404 });

  const today = todayKey();
  const range = reportRange(new URL(request.url).searchParams, today);
  if (range.error) return badRange(range.error);

  const [projects, daily, positions] = await Promise.all([
    listProjects(supabase),
    dailyFor(supabase, [account.id]),
    positionsPage(supabase, account.id, {
      pageSize: TRADES_LISTED,
      since: range.from ? londonMidnight(range.from).toISOString() : null,
      until: londonMidnight(addDays(range.to, 1)).toISOString(),
    }),
  ]);

  const model = accountReportModel({
    account,
    project: projects.find((p) => p.id === account.project_id),
    daily: daily.get(account.id) ?? [],
    positions,
    range,
    today,
  });
  const name = account.account_number ?? account.label;
  return pdfResponse(await accountReportPdf(model), `report-${name}-${rangeSlug(range)}.pdf`);
}
