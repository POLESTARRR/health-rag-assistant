import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const personId = searchParams.get("person_id");
  const reportMonth = searchParams.get("report_month");
  if (!personId || !reportMonth) {
    return NextResponse.json({ error: "person_id and report_month are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("monthly_digests")
    .select("*")
    .eq("person_id", personId)
    .eq("report_month", reportMonth)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ digest: data });
}
