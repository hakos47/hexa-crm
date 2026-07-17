<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    class: className = "",
    lift = true,
    children,
  }: {
    class?: string;
    lift?: boolean;
    children: Snippet;
  } = $props();
</script>

<div class="glass rounded-2xl p-4 {lift ? 'card-lift' : ''} {className}">
  {@render children()}
</div>
