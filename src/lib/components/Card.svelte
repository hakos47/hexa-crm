<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    class: className = "",
    lift = true,
    children,
    ...restProps
  }: {
    class?: string;
    lift?: boolean;
    children: Snippet;
    [attribute: string]: unknown;
  } = $props();
</script>

<div class="glass rounded-2xl p-4 {lift ? 'card-lift' : ''} {className}" {...restProps}>
  {@render children()}
</div>
