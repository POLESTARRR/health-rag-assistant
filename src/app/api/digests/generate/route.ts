import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateMonthlyDigest } from "@/lib/generate-digest";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { person_id, report_month } = await request.json();
  if (!person_id || !report_month) {
    return NextResponse.json({ error: "person_id and report_month are required" }, { status: 400 });
  }

  try {
    const digest = await generateMonthlyDigest(person_id, report_month);
    return NextResponse.json({ digest });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
