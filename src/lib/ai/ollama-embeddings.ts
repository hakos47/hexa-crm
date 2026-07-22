export const SEMANTIC_EMBEDDING_DIMENSIONS = 768;

type FetchLike = typeof fetch;

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/api/embed`;
}

export function vectorLiteral(vector: number[]) {
  if (vector.length !== SEMANTIC_EMBEDDING_DIMENSIONS || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("invalid_embedding");
  }
  return `[${vector.join(",")}]`;
}

export async function embedSemanticText(text: string, options: {
  baseUrl?: string;
  model?: string;
  fetchImpl?: FetchLike;
} = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(endpoint(options.baseUrl ?? process.env.HEXA_OLLAMA_URL ?? "http://127.0.0.1:11434"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: options.model ?? process.env.HEXA_EMBEDDING_MODEL ?? "nomic-embed-text", input: text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("embedding_unavailable");
  const data = await response.json() as { embeddings?: unknown; embedding?: unknown };
  const vector = Array.isArray(data.embeddings) ? data.embeddings[0] : data.embedding;
  if (!Array.isArray(vector) || vector.some((value) => typeof value !== "number")) throw new Error("invalid_embedding");
  vectorLiteral(vector);
  return vector;
}
