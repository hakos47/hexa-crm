export type SemanticMetricInput = {
  operation: "index" | "search";
  outcome: "ready" | "failed";
  startedAt: number;
  queueDepth?: number;
};

/** Metadata only: never accept a query, document body, embedding or customer id. */
export function semanticMetric(input: SemanticMetricInput) {
  return {
    operation: input.operation,
    outcome: input.outcome,
    latencyMs: Math.max(0, Math.round(Date.now() - input.startedAt)),
    queueDepth: Math.max(0, Math.trunc(input.queueDepth ?? 0)),
  };
}
