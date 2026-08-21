const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function DemoBanner() {
  if (!IS_DEMO) return null;

  return (
    <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      This is a public demo with sample data shared by every visitor. Uploads, chat and digests all
      run for real against this sample person, so feel free to try them. Nothing here is a real
      person&apos;s health data.{" "}
      <a
        href="https://github.com/POLESTARRR/health-rag-assistant"
        className="font-medium underline"
      >
        View the source
      </a>
      .
    </div>
  );
}
