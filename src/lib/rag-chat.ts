import { createServiceRoleClient } from "@/lib/supabase/server";
import { getGeminiClient, GEMINI_MODEL, embedText, withGeminiRetry } from "@/lib/gemini";

interface MatchedChunk {
  id: string;
  document_id: string;
  chunk_text: string;
  report_month: string;
  similarity: number;
}

const SYSTEM_PROMPT = `You are a helpful assistant answering questions about a person's health documents (lab reports, doctor's notes, imaging reports, vitals logs) that have been uploaded month by month. You are NOT a doctor, so never diagnose or prescribe. Answer using only the provided context chunks and conversation history. If the context doesn't contain the answer, say so plainly. Cite the report month(s) your answer is based on when relevant.

Write in plain sentences the way a person would speak. Do not use em dashes or en dashes. Do not use markdown headings or bold markers, because the chat window shows them as raw characters. Keep answers short and lead with the direct answer.`;

export async function askRagChat(personId: string, sessionId: string, question: string) {
  const supabase = createServiceRoleClient();

  const questionEmbedding = await embedText(question);

  const { data: chunks, error: matchError } = await supabase.rpc("match_doc_chunks", {
    query_embedding: questionEmbedding,
    match_person_id: personId,
    match_count: 6,
  });
  if (matchError) throw new Error(matchError.message);

  const { data: history } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20);

  const contextText = ((chunks ?? []) as MatchedChunk[])
    .map((c) => `[Report month: ${c.report_month}]\n${c.chunk_text}`)
    .join("\n\n---\n\n");

  const ai = getGeminiClient();
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: SYSTEM_PROMPT }],
        },
        ...(history ?? []).map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        {
          role: "user",
          parts: [{ text: `CONTEXT FROM DOCUMENTS:\n${contextText}\n\nQUESTION: ${question}` }],
        },
      ],
    }),
  );

  const answer = response.text ?? "I couldn't generate a response.";

  await supabase.from("chat_messages").insert([
    { session_id: sessionId, role: "user", content: question },
    { session_id: sessionId, role: "assistant", content: answer },
  ]);

  return { answer, sources: chunks ?? [] };
}
