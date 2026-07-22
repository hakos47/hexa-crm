import { describe, expect, it, vi } from "vitest";
import { semanticMetric } from "./semantic-metrics";

describe("semantic metric", () => {
  it("records only operational metadata", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_250);
    expect(semanticMetric({ operation: "search", outcome: "failed", startedAt: 1_000, queueDepth: -3 })).toEqual({ operation: "search", outcome: "failed", latencyMs: 250, queueDepth: 0 });
  });
});
