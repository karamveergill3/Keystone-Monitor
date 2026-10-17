// How every page, report and admin action reaches the data: the
// service-role client, on the server only. The database gives the browser
// roles nothing at all (see schema.sql), so a visitor sees exactly what the
// pages render and no more.

import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// One client per request, so the request-cached reads in data.js are
// shared by the layout, the page and its metadata.
const client = cache(() => createAdminClient());

// Waits for a real request first. The figures change with every sync, so
// no page may be prerendered at build time with whatever the data was then.
export async function db() {
  await connection();
  return client();
}
