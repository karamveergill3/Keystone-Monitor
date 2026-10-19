import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { printJobState } from "@/lib/printQueue";

// What the print button polls: { status, error, online }. Admins only.
export async function GET(request, { params }) {
  if (!(await isAdmin())) return new Response("Not found\n", { status: 404 });
  const { id } = await params;
  try {
    const { status, body } = await printJobState(await db(), { id });
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("print job read failed:", err.message);
    return NextResponse.json({ error: "the site could not read it" }, { status: 500 });
  }
}
