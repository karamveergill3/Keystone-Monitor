"use server";

// Every write the admin screen makes. Each action checks for an admin
// itself: a server action is a public endpoint, and being reachable only
// from the admin page is not a check.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSyncKey, hashSyncKey, keyHint } from "@/lib/syncKeys";
import { projectSlug } from "@/lib/projectSlug";

const UUID = /^[0-9a-f-]{36}$/i;

function text(formData, name, max) {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

function id(formData, name) {
  const v = text(formData, name, 36);
  if (!UUID.test(v)) throw new Error(`bad ${name}`);
  return v;
}

// The SyncUrl is pasted into a terminal, so it is built from APP_URL when it
// is set, never from whatever Host header the request happened to carry.
async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

function done() {
  revalidatePath("/", "layout");
}

async function storeKey(db, accountId) {
  const key = generateSyncKey();
  const { error } = await db
    .from("account_keys")
    .upsert(
      { account_id: accountId, key_hash: hashSyncKey(key), key_hint: keyHint(key), created_at: new Date().toISOString() },
      { onConflict: "account_id" }
    );
  if (error) throw new Error(`key write failed: ${error.message}`);
  return key;
}

// ---------------------------------------------------------------- accounts

export async function createAccount(_prev, formData) {
  await requireAdmin();
  const label = text(formData, "label", 80);
  if (!label) return { ok: false, message: "Give the account a name." };
  const projectId = id(formData, "projectId");

  const db = createAdminClient();
  const { data, error } = await db.from("accounts").insert({ label, project_id: projectId }).select("id").single();
  if (error) return { ok: false, message: error.message };
  try {
    const key = await storeKey(db, data.id);
    done();
    return { ok: true, label, key, syncUrl: `${await appOrigin()}/api/sync` };
  } catch (err) {
    await db.from("accounts").delete().eq("id", data.id);
    return { ok: false, message: err.message };
  }
}

export async function rotateKey(_prev, formData) {
  await requireAdmin();
  const accountId = id(formData, "accountId");
  const db = createAdminClient();
  const key = await storeKey(db, accountId);
  done();
  return { ok: true, label: text(formData, "label", 80), key, syncUrl: `${await appOrigin()}/api/sync` };
}

export async function updateAccount(formData) {
  await requireAdmin();
  const label = text(formData, "label", 80);
  if (!label) return;
  await createAdminClient()
    .from("accounts")
    .update({ label, project_id: id(formData, "projectId") })
    .eq("id", id(formData, "accountId"));
  done();
}

export async function setArchived(formData) {
  await requireAdmin();
  const archive = formData.get("archive") === "1";
  await createAdminClient()
    .from("accounts")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id(formData, "accountId"));
  done();
}

export async function requestResync(formData) {
  await requireAdmin();
  await createAdminClient().from("accounts").update({ resync_requested: true }).eq("id", id(formData, "accountId"));
  done();
}

// Only an account that never synced can be deleted outright, so a typo
// can be undone but history can never be lost by a click. Anything with
// data is archived instead.
export async function deleteUnusedAccount(formData) {
  await requireAdmin();
  await createAdminClient()
    .from("accounts")
    .delete()
    .eq("id", id(formData, "accountId"))
    .is("account_number", null)
    .is("last_sync_at", null);
  done();
}

// -------------------------------------------------------------- algorithms
//
// An algorithm (a project in the database: V100, Cycle Method) is a group
// of accounts with its own section, tab and pages. A new one goes last.

export async function createProject(_prev, formData) {
  await requireAdmin();
  const name = text(formData, "name", 40);
  if (!name) return { ok: false, message: "Give the algorithm a name." };
  const db = createAdminClient();
  const { data: existing, error: readError } = await db.from("projects").select("slug, sort, name");
  if (readError) return { ok: false, message: readError.message };
  if ((existing ?? []).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: `There is already an algorithm called ${name}.` };
  }
  const slug = projectSlug(name, (existing ?? []).map((p) => p.slug));
  const sort = Math.max(0, ...(existing ?? []).map((p) => Number(p.sort) || 0)) + 1;
  const { error } = await db.from("projects").insert({ name, slug, sort });
  if (error) return { ok: false, message: error.message };
  done();
  return { ok: true, message: `${name} added.` };
}

export async function renameProject(formData) {
  await requireAdmin();
  const name = text(formData, "name", 40);
  if (!name) return;
  await createAdminClient().from("projects").update({ name }).eq("id", id(formData, "projectId"));
  done();
}

// Only an algorithm with no accounts at all, archived ones included, can be
// deleted; the database refuses anything else too (accounts point at it).
export async function deleteEmptyProject(formData) {
  await requireAdmin();
  const projectId = id(formData, "projectId");
  const db = createAdminClient();
  const { count, error } = await db.from("accounts").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if (error || count !== 0) return;
  await db.from("projects").delete().eq("id", projectId);
  done();
}
