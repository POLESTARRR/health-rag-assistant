import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the `token_hash` style magic link (Supabase's default email template,
// and links minted via the admin API). The PKCE `code` flow lives in
// ../callback/route.ts and only works in the browser that requested the link.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (!tokenHash || !type) {
    return redirectToLogin(origin, "That sign-in link is missing its token. Request a new one.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return redirectToLogin(origin, error.message);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

function redirectToLogin(origin: string, message: string) {
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}
