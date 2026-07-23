import { describe, expect, it } from "vitest";
import { MAX_POS_FAVORITES, normalizeFavoriteIds, toggleFavoriteId } from "./favorites";

describe("POS favorites", () => {
  it("deduplicates and caps persisted ids", () => {
    expect(normalizeFavoriteIds([1, 1, 0, "2", ...Array.from({ length: 10 }, (_, i) => i + 2)])).toHaveLength(MAX_POS_FAVORITES);
  });

  it("toggles without exceeding eight favorites", () => {
    const ids = Array.from({ length: MAX_POS_FAVORITES }, (_, i) => i + 1);
    expect(toggleFavoriteId(ids, 9)).toEqual(ids);
    expect(toggleFavoriteId(ids, 2)).not.toContain(2);
  });
});
