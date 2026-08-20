// Simple fixed-size character chunking with overlap. Good enough for
// short medical reports/notes without pulling in a tokenizer dependency.
export function chunkText(text: string, chunkSize = 1200, overlap = 200): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + chunkSize, trimmed.length);
    chunks.push(trimmed.slice(start, end));
    if (end === trimmed.length) break;
    start = end - overlap;
  }

  return chunks;
}
