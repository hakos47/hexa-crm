export type SortDirection = "asc" | "desc";
export type SortValue = string | number | null | undefined;

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export function sortRows<T>(
  rows: readonly T[],
  direction: SortDirection,
  value: (row: T) => SortValue
): T[] {
  const factor = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = value(a.row);
      const right = value(b.row);
      let result: number;

      if (typeof left === "number" && typeof right === "number") {
        result = left - right;
      } else {
        result = collator.compare(String(left ?? ""), String(right ?? ""));
      }

      return result === 0 ? a.index - b.index : result * factor;
    })
    .map(({ row }) => row);
}

export function nextSortDirection(
  currentKey: string,
  nextKey: string,
  currentDirection: SortDirection
): SortDirection {
  return currentKey === nextKey && currentDirection === "asc" ? "desc" : "asc";
}
