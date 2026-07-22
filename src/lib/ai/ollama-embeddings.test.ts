import { describe, expect, it } from "vitest";
import { embedSemanticText, SEMANTIC_EMBEDDING_DIMENSIONS, vectorLiteral } from "./ollama-embeddings";

describe("Ollama semantic embeddings", () => {
  it("accepts only the configured vector dimension", () => {
    expect(vectorLiteral(Array.from({ length: SEMANTIC_EMBEDDING_DIMENSIONS }, () => 0.25))).toMatch(/^\[0.25,/);
    expect(() => vectorLiteral([1, 2])).toThrow("invalid_embedding");
  });

  it("uses the local Ollama embed endpoint and validates its response", async () => {
    const vector = Array.from({ length: SEMANTIC_EMBEDDING_DIMENSIONS }, () => 0.1);
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("http://ollama.local/api/embed");
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: "nomic-embed-text", input: "texto público" });
      return new Response(JSON.stringify({ embeddings: [vector] }), { status: 200 });
    };
    await expect(embedSemanticText("texto público", { baseUrl: "http://ollama.local", fetchImpl: fetchImpl as typeof fetch })).resolves.toEqual(vector);
  });
});
