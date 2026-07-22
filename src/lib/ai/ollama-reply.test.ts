import { describe, expect, it } from "vitest";
import { extractOllamaReply, ollamaChatBody } from "./ollama-reply";

describe("extractOllamaReply", () => {
  it("prefers content", () => {
    expect(
      extractOllamaReply({ content: "  Hola tienda  ", thinking: "ignored" }),
    ).toBe("Hola tienda");
  });

  it("returns empty-content sentinel when nothing present", () => {
    expect(extractOllamaReply({})).toBe("Sin respuesta del modelo.");
    expect(extractOllamaReply(undefined)).toBe("Sin respuesta del modelo.");
  });

  it("falls back to last thinking line when content empty", () => {
    expect(
      extractOllamaReply({
        content: "",
        thinking: "Thinking Process:\n\n1. Analyze\n\nAyer vendiste 120.50 EUR.",
      }),
    ).toBe("Ayer vendiste 120.50 EUR.");
  });

  it("avoids dumping long thinking chains", () => {
    const long = "x".repeat(600);
    expect(extractOllamaReply({ content: " ", thinking: long })).toMatch(
      /razonamiento interno/,
    );
  });
});

describe("ollamaChatBody", () => {
  it("disables think and sets non-stream", () => {
    const body = ollamaChatBody("qwen3.5:4b", [
      { role: "user", content: "hola" },
    ]);
    expect(body.think).toBe(false);
    expect(body.stream).toBe(false);
    expect(body.model).toBe("qwen3.5:4b");
    expect(body.options.num_predict).toBe(512);
  });
});
