import { describe, expect, it } from "vitest";
import { canIndexSemanticEntity, semanticDocumentKey } from "./semantic-index";

describe("semantic index privacy boundary", () => {
  it("only permits non-sensitive commercial entity types", () => {
    expect(canIndexSemanticEntity("product")).toBe(true);
    expect(canIndexSemanticEntity("review")).toBe(true);
    expect(canIndexSemanticEntity("customer")).toBe(false);
    expect(canIndexSemanticEntity("sale")).toBe(false);
  });
  it("makes reindexing idempotent by entity version", () => {
    expect(semanticDocumentKey("product", "abc", "v2")).toBe("product:abc:v2");
  });
});
