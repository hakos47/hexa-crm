<script lang="ts">
  import type { SortDirection } from "$lib/table-sort";

  let {
    label,
    active = false,
    direction = "asc",
    align = "left",
    class: className = "",
    onclick,
  }: {
    label: string;
    active?: boolean;
    direction?: SortDirection;
    align?: "left" | "right";
    class?: string;
    onclick: () => void;
  } = $props();
</script>

<th
  class={className}
  aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
>
  <button
    type="button"
    class="group flex w-full items-center gap-1 rounded-sm py-1 transition hover:text-[var(--color-purple-bright)] {align === 'right'
      ? 'justify-end text-right'
      : 'justify-start text-left'}"
    {onclick}
  >
    <span>{label}</span>
    <span
      aria-hidden="true"
      class="text-[0.65rem] transition {active
        ? 'text-[var(--color-purple)] opacity-100'
        : 'opacity-35 group-hover:opacity-70'}"
    >
      {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
    </span>
  </button>
</th>
