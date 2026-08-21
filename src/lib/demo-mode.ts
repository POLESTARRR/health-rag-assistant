import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";

// One single flag, read the same way on the server and in the browser.
// An earlier version used two separate flags (one server only, one public)
// and they drifted out of sync, leaving the demo banner showing on the real,
// login required site while the server itself was not actually in demo
// mode. NEXT_PUBLIC_ variables are readable on the server too, so there is
// no reason to keep a second one around.
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

let cachedClient: SupabaseClient | null = null;
let cachedExpiresAt = 0;

// One shared session for every visitor, refreshed lazily when it is close to
// expiring. That is fine here: a public demo has no per visitor data to keep
// separate, everyone is looking at the same sample person.
export async function getDemoClient(): Promise<SupabaseClient> {
  const nowSeconds = Date.now() / 1000;
  if (cachedClient && cachedExpiresAt - nowSeconds > 60) {
    return cachedClient;
  }

  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) {
    throw new Error("DEMO_MODE is enabled but DEMO_EMAIL or DEMO_PASSWORD is not set");
  }

  const client = createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Demo sign in failed: ${error?.message ?? "no session returned"}`);
  }

  cachedClient = client;
  cachedExpiresAt = data.session.expires_at ?? 0;
  return client;
}
