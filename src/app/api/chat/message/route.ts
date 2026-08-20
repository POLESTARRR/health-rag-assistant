import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askRagChat } from "@/lib/rag-chat";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { person_id, session_id, message } = await request.json();
  if (!person_id || !session_id || !message) {
    return NextResponse.json({ error: "person_id, session_id and message are required" }, { status: 400 });
  }

  try {
    const result = await askRagChat(person_id, session_id, message);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
