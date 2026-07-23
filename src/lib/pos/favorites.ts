export const MAX_POS_FAVORITES = 8;

export function normalizeFavoriteIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is number => Number.isInteger(id) && id > 0))].slice(
    0,
    MAX_POS_FAVORITES,
  );
}

export function toggleFavoriteId(ids: number[], productId: number): number[] {
  const normalized = normalizeFavoriteIds(ids);
  if (normalized.includes(productId)) return normalized.filter((id) => id !== productId);
  if (normalized.length >= MAX_POS_FAVORITES) return normalized;
  return [...normalized, productId];
}
