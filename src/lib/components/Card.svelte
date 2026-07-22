<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    class: className = "",
    lift = true,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & {
    lift?: boolean;
    children: Snippet;
  } = $props();
</script>

<div {...restProps} class="glass rounded-2xl p-4 {lift ? 'card-lift' : ''} {className}">
  {@render children()}
</div>
