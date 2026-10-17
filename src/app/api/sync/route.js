import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestSync } from "@/lib/syncIngest";
import { MAX_BODY_BYTES } from "@/lib/syncPayload";

// The MT5 EA posts here. Authenticated by the account's own sync key; the
// site has no sessions.
export async function POST(request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "body too large" }, { status: 413 });
  }

  try {
    const { status, body } = await ingestSync(createAdminClient(), {
      authorization: request.headers.get("authorization"),
      rawBody: await request.text(),
    });
    return NextResponse.json(body, { status });
  } catch (err) {
    console.error("sync failed:", err.message);
    return NextResponse.json({ ok: false, error: "server error, will retry" }, { status: 500 });
  }
}
