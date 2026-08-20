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
    .from("chat_sessions")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { person_id } = await request.json();
  if (!person_id) return NextResponse.json({ error: "person_id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ person_id, title: "New conversation" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
