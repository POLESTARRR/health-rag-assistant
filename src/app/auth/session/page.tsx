"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Landing point for the implicit-flow magic link. The browser never sends a
// URL fragment to a server, so this has to run client side to read it: the
// email link redirects here with #access_token=...&refresh_token=... rather
// than a server-visible ?code=. Reading it and calling setSession() writes
// the same cookies a normal sign-in would, so every server route sees a
// signed-in user afterward exactly as if this had been the PKCE flow.
export default function AuthSessionPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const errorDescription = hash.get("error_description");
    if (errorDescription) {
      router.replace(`/login?error=${encodeURIComponent(errorDescription)}`);
      return;
    }

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) {
      router.replace(
        `/login?error=${encodeURIComponent("That sign-in link is missing its token. Request a new one.")}`,
      );
      return;
    }

    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
        router.replace("/");
      })
      .catch(() => setError("Something went wrong signing you in. Request a new link."));
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-neutral-500">{error ?? "Signing you in…"}</p>
    </div>
  );
}
