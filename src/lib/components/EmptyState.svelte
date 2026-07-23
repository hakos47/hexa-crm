<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    description = "",
    children,
  }: {
    title: string;
    description?: string;
    children?: Snippet;
  } = $props();
</script>

<div
  class="empty-editorial flex flex-col items-center justify-center border border-dashed border-[var(--color-border)] px-6 py-14 text-center"
>
  <div
    class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-500/10 text-xl text-radiant"
  >
    ◌
  </div>
  <h3 class="text-base font-medium text-[var(--color-text)]">{title}</h3>
  {#if description}
    <p class="mt-1 max-w-sm text-sm text-[var(--color-muted-dim)]">{description}</p>
  {/if}
  {#if children}
    <div class="mt-4">{@render children()}</div>
  {/if}
</div>
