import { Type } from "@google/genai";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getGeminiClient, GEMINI_MODEL, withGeminiRetry } from "@/lib/gemini";

const DIGEST_PROMPT = `You are a careful, plain-language health summarizer helping a family understand a loved one's monthly health reports. You are NOT a doctor and must not diagnose or prescribe. Always defer to their real doctor for decisions.

Write the way a thoughtful person writes, not the way a chatbot writes. Use short plain sentences and ordinary words. Do not use em dashes or en dashes. Use full stops instead of dashes to join thoughts. Do not open with filler like "Great news" or "It's important to note". Do not pad sentences with stacked clauses and extra commas. Say the number and what it means, then stop.

You are given, for one person and one target month:
1. "metrics": each metric that has a value in the target month, along with its full historical values (oldest to newest) including reference ranges where known.
2. "notes": text from doctor's notes / imaging reports uploaded that month, if any.

For each metric in "metrics" that has a previous value to compare against, decide whether it improved, worsened, or stayed about the same, using the reference range and general medical knowledge about what direction is healthier for that metric. If a metric has no prior value, skip it from improved/worsened/unchanged (it's new).

Write:
- summary_text: 2-4 short paragraphs in warm, plain, non-alarming language a non-medical family member can understand. Mention the most important changes first. End with a reminder to discuss any concerning results with their doctor.
- improved: list of {metric, from, to, note} for metrics that got better.
- worsened: list of {metric, from, to, note} for metrics that got worse, especially anything now out of the healthy range.
- unchanged: list of {metric, from, to, note} for stable metrics worth mentioning (optional, keep short).
- recommendations: 2-5 concrete, general lifestyle suggestions (diet, activity, follow-up timing) relevant to what worsened. Never suggest specific drug doses or diagnoses.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    summary_text: { type: Type.STRING },
    improved: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          metric: { type: Type.STRING },
          from: { type: Type.STRING },
          to: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ["metric", "to", "note"],
      },
    },
    worsened: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          metric: { type: Type.STRING },
          from: { type: Type.STRING },
          to: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ["metric", "to", "note"],
      },
    },
    unchanged: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          metric: { type: Type.STRING },
          from: { type: Type.STRING },
          to: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ["metric", "to", "note"],
      },
    },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["summary_text", "improved", "worsened", "unchanged", "recommendations"],
};

export async function generateMonthlyDigest(personId: string, reportMonth: string) {
  const supabase = createServiceRoleClient();

  const { data: allValues, error: valuesError } = await supabase
    .from("lab_values")
    .select("metric_name, value, value_text, unit, ref_range_low, ref_range_high, ref_range_text, out_of_range, report_month")
    .eq("person_id", personId)
    .lte("report_month", reportMonth)
    .order("report_month", { ascending: true });

  if (valuesError) throw new Error(valuesError.message);

  const metricsThisMonth = new Set(
    (allValues ?? []).filter((v) => v.report_month === reportMonth).map((v) => v.metric_name),
  );

  const history: Record<string, unknown[]> = {};
  for (const v of allValues ?? []) {
    if (!metricsThisMonth.has(v.metric_name)) continue;
    if (!history[v.metric_name]) history[v.metric_name] = [];
    history[v.metric_name].push({
      report_month: v.report_month,
      value: v.value ?? v.value_text,
      unit: v.unit,
      ref_range: v.ref_range_text ?? (v.ref_range_low != null ? `${v.ref_range_low}-${v.ref_range_high}` : null),
      out_of_range: v.out_of_range,
    });
  }

  const { data: docs } = await supabase
    .from("documents")
    .select("doc_type, raw_text")
    .eq("person_id", personId)
    .eq("report_month", reportMonth)
    .in("doc_type", ["doctor_note", "imaging_report"]);

  const notes = (docs ?? []).map((d) => d.raw_text).filter(Boolean).join("\n\n---\n\n").slice(0, 8000);

  const ai = getGeminiClient();
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: DIGEST_PROMPT },
            { text: `\n\nDATA:\n${JSON.stringify({ metrics: history, notes }, null, 2)}` },
          ],
        },
      ],
      config: { responseMimeType: "application/json", responseSchema },
    }),
  );

  const raw = response.text;
  if (!raw) throw new Error("Gemini returned an empty response");
  const result = JSON.parse(raw);

  const { data: digest, error: upsertError } = await supabase
    .from("monthly_digests")
    .upsert(
      {
        person_id: personId,
        report_month: reportMonth,
        summary_text: result.summary_text,
        improved: result.improved,
        worsened: result.worsened,
        unchanged: result.unchanged,
        recommendations: result.recommendations,
      },
      { onConflict: "person_id,report_month" },
    )
    .select()
    .single();

  if (upsertError) throw new Error(upsertError.message);
  return digest;
}
