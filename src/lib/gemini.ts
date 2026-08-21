import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGeminiClient() {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return client;
}

// Flash is free-tier friendly and multimodal (reads PDFs/images directly).
export const GEMINI_MODEL = "gemini-3.6-flash";
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

function isRetryableStatus(err: unknown): boolean {
  const code = (err as { status?: number; code?: number } | undefined)?.status
    ?? (err as { status?: number; code?: number } | undefined)?.code;
  return code === 503 || code === 429;
}

// Gemini returns 503 when its servers are briefly overloaded and 429 when a
// rate limit is hit. Both are worth a short retry instead of failing the
// whole upload or chat turn on what is usually a few seconds of congestion.
export async function withGeminiRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableStatus(err) || attempt === attempts - 1) throw err;
      const delayMs = 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

export async function embedText(text: string): Promise<number[]> {
  const ai = getGeminiClient();
  const response = await withGeminiRetry(() =>
    ai.models.embedContent({
      model: GEMINI_EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    }),
  );
  const values = response.embeddings?.[0]?.values;
  if (!values) throw new Error("Gemini returned no embedding");
  return values;
}
