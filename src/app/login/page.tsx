"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// Auth routes redirect back here with ?error=... when a sign-in link fails,
// so the failure is visible instead of looking like a silent bounce.
function LinkError() {
  const message = useSearchParams().get("error");
  if (!message) return null;
  return <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // The demo deployment signs every visitor in on the server automatically,
  // so there is nothing to log in to here.
  useEffect(() => {
    if (IS_DEMO) router.replace("/");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }

    setStatus("sent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">Health Assistant</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Sign in with the email you were invited with.
        </p>

        <Suspense>
          <LinkError />
        </Suspense>

        {status === "sent" ? (
          <p className="mt-6 rounded-md bg-green-50 p-3 text-sm text-green-700">
            Check your email for a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {status === "sending" ? "Sending..." : "Send sign-in link"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
