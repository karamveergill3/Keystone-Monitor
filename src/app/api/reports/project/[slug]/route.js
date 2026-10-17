import { db } from "@/lib/db";
import { listProjects, listAccounts, dailyFor } from "@/lib/data";
import { reportRange, rangeSlug } from "@/lib/reportRange";
import { projectReportModel } from "@/lib/reportModel";
import { projectReportPdf } from "@/lib/reportPdf";
import { pdfResponse, badRange } from "@/lib/pdfResponse";
import { todayKey } from "@/lib/days";

export async function GET(request, { params }) {
  const { slug } = await params;
  const supabase = await db();
  const project = (await listProjects(supabase)).find((p) => p.slug === slug);
  if (!project) return new Response("Not found\n", { status: 404 });

  const today = todayKey();
  const range = reportRange(new URL(request.url).searchParams, today);
  if (range.error) return badRange(range.error);

  const accounts = await listAccounts(supabase, { projectId: project.id });
  const dailyByAccount = await dailyFor(supabase, accounts.map((a) => a.id));
  const model = projectReportModel({ project, accounts, dailyByAccount, range, today });
  return pdfResponse(await projectReportPdf(model), `report-${project.slug}-${rangeSlug(range)}.pdf`);
}
