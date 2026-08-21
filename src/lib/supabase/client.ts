import { createBrowserClient } from "@supabase/ssr";

// The default flow (PKCE) needs the browser that opens the email link to be
// the same one that requested it, since it checks a code verifier stored
// locally at request time. That fails whenever someone opens the link from
// a different browser, device, or the Gmail app's own in-app browser, which
// is common for a real email link. Editing Supabase's email template to send
// a token instead would avoid this, but the free tier only allows editing
// templates once custom SMTP is configured. The implicit flow sidesteps
// that entirely: the email link carries the session directly, handled by
// src/app/auth/session/page.tsx, with no matching browser required.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit" } },
  );
}
