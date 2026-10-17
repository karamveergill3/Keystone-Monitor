// Makes the first admin, or turns an existing sign-in into one, and prints
// a link to set a password. Everything after that is done on the admin
// screen.
//
//   node --env-file=.env.local scripts/create-admin.mjs you@example.com "Your Name"

import { createClient } from "@supabase/supabase-js";

const [email, name] = process.argv.slice(2);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node --env-file=.env.local scripts/create-admin.mjs you@example.com "Your Name"');
  process.exit(1);
}
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_URL"]) {
  if (!process.env[k]) {
    console.error(`${k} is not set. Fill in .env.local first (see .env.local.example).`);
    process.exit(1);
  }
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let type = "invite";
let res = await db.auth.admin.generateLink({ type, email: email.toLowerCase() });
if (res.error && /already|registered|exists/i.test(res.error.message)) {
  type = "recovery";
  res = await db.auth.admin.generateLink({ type, email: email.toLowerCase() });
}
if (res.error) {
  console.error(`Could not create the link: ${res.error.message}`);
  process.exit(1);
}

const { error } = await db
  .from("members")
  .upsert({ user_id: res.data.user.id, email: email.toLowerCase(), display_name: name ?? null, role: "admin" }, { onConflict: "user_id" });
if (error) {
  console.error(`Could not add the members row: ${error.message}. Has supabase/schema.sql been run?`);
  process.exit(1);
}

const origin = process.env.APP_URL.replace(/\/+$/, "");
console.log(`${email} is an admin. Open this link to choose a password (it works once):\n`);
console.log(`${origin}/confirm?token_hash=${encodeURIComponent(res.data.properties.hashed_token)}&type=${type}\n`);
