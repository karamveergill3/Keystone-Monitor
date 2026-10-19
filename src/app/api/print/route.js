import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { queuePrint } from "@/lib/printQueue";

const notFound = () => new Response("Not found\n", { status: 404 });

// Every Print button (the header's fleet summary, and the report boxes on
// the project and account pages): queues a job for the office print agent.
// Admins only; anyone else gets the same 404 as a missing page.
// JSON only, so a cross-site form can never post here with the admin's
// cookie (a cross-site fetch with this content type needs a preflight
// this route never answers).
export async function POST(request) {
  if (!(await isAdmin())) return notFound();
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) {
    return NextResponse.json({ error: "send JSON" }, { status: 415 });
  }
  let body = {};
  try {
    const raw = await request.text();
    if (raw.length > 1024) return NextResponse.json({ error: "body too large" }, { status: 400 });
    body = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "body is not JSON" }, { status: 400 });
  }
  try {
    const { status, body: out } = await queuePrint(await db(), { body });
    return NextResponse.json(out, { status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("print queue failed:", err.message);
    return NextResponse.json({ error: "the site could not queue it" }, { status: 500 });
  }
}
