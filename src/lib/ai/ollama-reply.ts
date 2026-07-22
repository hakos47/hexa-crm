/**
 * Parse Ollama /api/chat JSON into a user-visible reply.
 * Reasoning models (qwen3.5, etc.) may put tokens in `thinking` and leave
 * `content` empty when think is enabled or num_predict is too low.
 */
export function extractOllamaReply(message?: {
  content?: string;
  thinking?: string;
}): string {
  const content = message?.content?.trim() ?? "";
  if (content) return content;
  const thinking = message?.thinking?.trim() ?? "";
  if (thinking) {
    const lines = thinking
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const last = lines[lines.length - 1];
    if (last && last.length < 500 && !/^thinking/i.test(last)) {
      return last;
    }
    return "El modelo solo generó razonamiento interno sin respuesta final. Prueba de nuevo o cambia de modelo en Ajustes.";
  }
  return "Sin respuesta del modelo.";
}

/** Body for /api/chat — disables reasoning so content is filled promptly. */
export function ollamaChatBody(
  model: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; num_predict?: number },
) {
  return {
    model,
    stream: false,
    think: false,
    messages,
    options: {
      temperature: options?.temperature ?? 0.4,
      num_predict: options?.num_predict ?? 512,
    },
  };
}
