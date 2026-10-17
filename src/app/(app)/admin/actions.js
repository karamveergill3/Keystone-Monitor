"use server";

// Every write the admin screen makes. Each action checks for an admin with
// two-factor itself: a server action is a public endpoint, and being
// reachable only from the admin page is not a check.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSyncKey, hashSyncKey, keyHint } from "@/lib/syncKeys";

const UUID = /^[0-9a-f-]{36}$/i;

function text(formData, name, max) {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

function id(formData, name) {
  const v = text(formData, name, 36);
  if (!UUID.test(v)) throw new Error(`bad ${name}`);
  return v;
}

// Links go out to people, so they are built from APP_URL when it is set,
// never from whatever Host header the request happened to carry.
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

// ----------------------------------------------------------------- members

async function linkFor(db, type, email) {
  const { data, error } = await db.auth.admin.generateLink({ type, email });
  if (error) return { error };
  const link = `${await appOrigin()}/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=${type}`;
  return { link, userId: data.user.id };
}

// No email is sent. Supabase's built-in mailer only delivers to the
// project's own team, so the link is shown here to be passed on directly.
export async function inviteMember(_prev, formData) {
  await requireAdmin();
  const email = text(formData, "email", 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "That is not an email address." };
  const displayName = text(formData, "displayName", 80) || null;
  const role = formData.get("role") === "admin" ? "admin" : "partner";

  const db = createAdminClient();
  let result = await linkFor(db, "invite", email);
  // Already a Supabase user (a removed partner coming back, say): a reset
  // link does the same job.
  if (result.error && /already|registered|exists/i.test(result.error.message)) {
    result = await linkFor(db, "recovery", email);
  }
  if (result.error) return { ok: false, message: result.error.message };

  // AN EXISTING MEMBER KEEPS THEIR ROLE. Re-inviting someone whose link
  // expired is an ordinary thing to do, and the form defaults to Partner:
  // overwriting the row would demote an admin, and could leave nobody able
  // to administer the site. Roles change only through setRole, which
  // guards against that.
  const { data: existing, error: readErr } = await db
    .from("members")
    .select("role")
    .eq("user_id", result.userId)
    .maybeSingle();
  if (readErr) return { ok: false, message: readErr.message };

  if (!existing) {
    const { error } = await db
      .from("members")
      .insert({ user_id: result.userId, email, display_name: displayName, role });
    if (error) return { ok: false, message: error.message };
  }

  done();
  return {
    ok: true,
    email,
    link: result.link,
    note: existing ? `Already a member (${existing.role}); role unchanged. This link sets a new password.` : null,
  };
}

export async function resetLink(_prev, formData) {
  await requireAdmin();
  const email = text(formData, "email", 200);
  const result = await linkFor(createAdminClient(), "recovery", email);
  if (result.error) return { ok: false, message: result.error.message };
  return { ok: true, email, link: result.link };
}

export async function resetTwoFactor(formData) {
  await requireAdmin();
  const userId = id(formData, "userId");
  const db = createAdminClient();
  const { data } = await db.auth.admin.mfa.listFactors({ userId });
  for (const f of data?.factors ?? []) {
    await db.auth.admin.mfa.deleteFactor({ id: f.id, userId });
  }
  done();
}

async function adminCount(db) {
  const { count } = await db.from("members").select("user_id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export async function setRole(formData) {
  const { user } = await requireAdmin();
  const userId = id(formData, "userId");
  const role = formData.get("role") === "admin" ? "admin" : "partner";
  const db = createAdminClient();
  // Never leave the project with nobody able to administer it.
  if (role === "partner" && (userId === user.id || (await adminCount(db)) <= 1)) return;
  await db.from("members").update({ role }).eq("user_id", userId);
  done();
}

export async function removeMember(formData) {
  const { user } = await requireAdmin();
  const userId = id(formData, "userId");
  if (userId === user.id) return;
  // Deleting the Auth user ends their sessions and cascades to members.
  await createAdminClient().auth.admin.deleteUser(userId);
  done();
}
