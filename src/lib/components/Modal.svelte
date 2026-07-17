<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade, scale } from "svelte/transition";

  let {
    open = false,
    title = "",
    onclose,
    children,
  }: {
    open?: boolean;
    title?: string;
    onclose: () => void;
    children: Snippet;
  } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={open ? onKey : undefined} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      aria-label="Cerrar"
      onclick={onclose}
      transition:fade={{ duration: 150 }}
    ></button>
    <div
      class="glass-strong relative z-10 w-full max-w-lg rounded-2xl border border-[var(--color-border-strong)] p-5 glow-purple"
      transition:scale={{ duration: 180, start: 0.96 }}
      role="dialog"
      aria-modal="true"
    >
      <div class="mb-4 flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
        <button
          class="rounded-lg px-2 py-1 text-[var(--color-muted)] hover:bg-purple-500/10 hover:text-[var(--color-purple-bright)]"
          onclick={onclose}
        >
          ✕
        </button>
      </div>
      {@render children()}
    </div>
  </div>
{/if}
