import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { agentRequest, MAX_AGENT_BODY } from "@/lib/printQueue";

// The office print agent (scripts/print-agent.mjs) polls here with its own
// key. The key is hashed here and the database decides whether it is
// known (claim_print_job and finish_print_job in schema.sql).
export async function POST(request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_AGENT_BODY) return NextResponse.json({ error: "body too large" }, { status: 400 });
  try {
    const { status, body } = await agentRequest(createAdminClient(), {
      authorization: request.headers.get("authorization"),
      rawBody: await request.text(),
      appUrl: process.env.APP_URL || new URL(request.url).origin,
    });
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("print queue failed:", err.message);
    return NextResponse.json({ error: "server error, will retry" }, { status: 500 });
  }
}
