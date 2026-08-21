import { Type } from "@google/genai";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getGeminiClient, GEMINI_MODEL, embedText, withGeminiRetry } from "@/lib/gemini";
import { chunkText } from "@/lib/chunk-text";
import { DOCUMENTS_BUCKET } from "@/lib/constants";

const EXTRACTION_PROMPT = `You are reading a health document (a lab report, doctor's note, imaging report, or a vitals log) for a single patient.

Return:
1. doc_type: one of "lab_report", "doctor_note", "imaging_report", "vitals_log", "other".
2. full_text: the complete text content of the document, transcribed as accurately as possible (including handwritten values if legible).
3. lab_values: every discrete measurable value in the document (lab test results, vitals like blood pressure/sugar/weight, etc.). For each: metric_name (standardized, e.g. "HbA1c", "Systolic BP", "LDL Cholesterol"), value (numeric if possible), value_text (only if not numeric, e.g. "Negative"/"Trace"), unit, ref_range_low, ref_range_high, ref_range_text (only if the range isn't numeric), out_of_range (true/false if you can tell from the report or reference range), taken_on (ISO date if a specific sample/measurement date is stated, else null).

If there are no discrete measurable values (e.g. it's a doctor's note), return an empty lab_values array but still transcribe full_text.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    doc_type: {
      type: Type.STRING,
      enum: ["lab_report", "doctor_note", "imaging_report", "vitals_log", "other"],
    },
    full_text: { type: Type.STRING },
    lab_values: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          metric_name: { type: Type.STRING },
          value: { type: Type.NUMBER, nullable: true },
          value_text: { type: Type.STRING, nullable: true },
          unit: { type: Type.STRING, nullable: true },
          ref_range_low: { type: Type.NUMBER, nullable: true },
          ref_range_high: { type: Type.NUMBER, nullable: true },
          ref_range_text: { type: Type.STRING, nullable: true },
          out_of_range: { type: Type.BOOLEAN, nullable: true },
          taken_on: { type: Type.STRING, nullable: true },
        },
        required: ["metric_name"],
      },
    },
  },
  required: ["doc_type", "full_text", "lab_values"],
};

interface ExtractedLabValue {
  metric_name: string;
  value?: number | null;
  value_text?: string | null;
  unit?: string | null;
  ref_range_low?: number | null;
  ref_range_high?: number | null;
  ref_range_text?: string | null;
  out_of_range?: boolean | null;
  taken_on?: string | null;
}

interface ExtractionResult {
  doc_type: string;
  full_text: string;
  lab_values: ExtractedLabValue[];
}

export async function parseDocument(documentId: string) {
  const supabase = createServiceRoleClient();

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) throw new Error(`Document ${documentId} not found`);

  try {
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(doc.storage_path);

    if (downloadError || !fileBlob) throw new Error(downloadError?.message ?? "download failed");

    const arrayBuffer = await fileBlob.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = fileBlob.type || "application/pdf";

    const ai = getGeminiClient();
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType, data: base64Data } }, { text: EXTRACTION_PROMPT }],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    );

    const raw = response.text;
    if (!raw) throw new Error("Gemini returned an empty response");
    const result: ExtractionResult = JSON.parse(raw);

    await supabase
      .from("documents")
      .update({
        doc_type: result.doc_type,
        raw_text: result.full_text,
        parse_status: "parsed",
        parse_error: null,
      })
      .eq("id", documentId);

    if (result.lab_values.length > 0) {
      const rows = result.lab_values.map((lv) => ({
        document_id: documentId,
        person_id: doc.person_id,
        report_month: doc.report_month,
        metric_name: lv.metric_name,
        value: lv.value ?? null,
        value_text: lv.value_text ?? null,
        unit: lv.unit ?? null,
        ref_range_low: lv.ref_range_low ?? null,
        ref_range_high: lv.ref_range_high ?? null,
        ref_range_text: lv.ref_range_text ?? null,
        out_of_range: lv.out_of_range ?? null,
        taken_on: lv.taken_on ?? doc.report_month,
      }));
      await supabase.from("lab_values").insert(rows);
    }

    const chunks = chunkText(result.full_text);
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embedText(chunks[i]);
      await supabase.from("doc_chunks").insert({
        document_id: documentId,
        person_id: doc.person_id,
        report_month: doc.report_month,
        chunk_index: i,
        chunk_text: chunks[i],
        embedding,
      });
    }
  } catch (err) {
    await supabase
      .from("documents")
      .update({ parse_status: "failed", parse_error: err instanceof Error ? err.message : String(err) })
      .eq("id", documentId);
    throw err;
  }
}
