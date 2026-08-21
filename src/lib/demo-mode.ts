import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";

// Public demo deployment: a separate Render service pointed at its own,
// empty Supabase project seeded only with throwaway sample data. Setting
// DEMO_MODE=true there signs every request in as one fixed demo account
// instead of requiring a real login, so a resume link works with no signup
// flow. The real family deployment never sets this, so this code path never
// runs against real data.
export const DEMO_MODE = process.env.DEMO_MODE === "true";

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
