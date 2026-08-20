// Local dev sign-in helper.
//
// Supabase's built-in email service is rate-limited and often doesn't deliver,
// which makes the magic-link flow painful during development. This mints a
// sign-in link directly via the admin API and opens it, no email round-trip.
//
// Usage:  npm run login  [email]
//
// Reads the service_role key from .env.local, so it only ever runs on your
// machine. Never import this from application code.

import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ENV_FILE = ".env.local";
const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";

function readEnv() {
  const file = path.resolve(process.cwd(), ENV_FILE);
  if (!fs.existsSync(file)) {
    fail(`${ENV_FILE} not found. Copy .env.local.example and fill it in.`);
  }
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const env = readEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  fail(`NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in ${ENV_FILE}.`);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// Default to the only user if there is exactly one, which is the common case for a
// private family tool.
let email = process.argv[2];
if (!email) {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) fail(`Could not list users: ${error.message}`);
  const users = data.users;
  if (users.length === 0) {
    fail("No users exist yet. Add one in Supabase under Authentication > Users, or pass an email: npm run login you@example.com");
  }
  if (users.length > 1) {
    fail(`Multiple users exist, so pass one explicitly:\n     ${users.map((u) => `npm run login ${u.email}`).join("\n     ")}`);
  }
  email = users[0].email;
}

const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
if (error) fail(`Could not generate a link for ${email}: ${error.message}`);

const link = `${APP_ORIGIN}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`;

console.log(`\n  Signing in as ${email}`);
console.log(`  ${link}`);
console.log(`\n  Single-use, expires in 1 hour.\n`);

// Best-effort browser open; the link is printed above regardless.
const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
execFile(opener, [link], (err) => {
  if (err) console.log("  (Could not open a browser automatically. Paste the link above.)\n");
});
