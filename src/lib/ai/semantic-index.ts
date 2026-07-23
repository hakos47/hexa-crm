export const SEMANTIC_ENTITY_TYPES = ["product", "evidence", "proposal", "review"] as const;
export type SemanticEntityType = (typeof SEMANTIC_ENTITY_TYPES)[number];

/** v1 privacy boundary: commercial customer and sales data never enter embeddings. */
export function canIndexSemanticEntity(value: string): value is SemanticEntityType {
  return (SEMANTIC_ENTITY_TYPES as readonly string[]).includes(value);
}

export function semanticDocumentKey(type: SemanticEntityType, entityId: string, version: string): string {
  if (!entityId || !version) throw new Error("Documento semántico sin identidad o versión");
  return `${type}:${entityId}:${version}`;
}
