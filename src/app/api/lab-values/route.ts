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
  if (!personId) return NextResponse.json({ error: "person_id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("lab_values")
    .select("metric_name, value, unit, ref_range_low, ref_range_high, out_of_range, report_month")
    .eq("person_id", personId)
    .order("report_month", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byMetric: Record<string, typeof data> = {};
  for (const row of data ?? []) {
    if (row.value == null) continue; // charts only handle numeric values
    if (!byMetric[row.metric_name]) byMetric[row.metric_name] = [];
    byMetric[row.metric_name].push(row);
  }

  return NextResponse.json({ byMetric });
}
