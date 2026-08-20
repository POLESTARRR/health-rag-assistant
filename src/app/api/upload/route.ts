import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "@/lib/constants";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const personId = formData.get("person_id") as string | null;
  const reportMonth = formData.get("report_month") as string | null; // "YYYY-MM-01"

  if (!file || !personId || !reportMonth) {
    return NextResponse.json({ error: "file, person_id and report_month are required" }, { status: 400 });
  }

  const storagePath = `${personId}/${reportMonth}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      person_id: personId,
      report_month: reportMonth,
      original_filename: file.name,
      storage_path: storagePath,
      parse_status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ document: doc });
}
