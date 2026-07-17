<script lang="ts">
  let {
    size = 40,
    withWordmark = false,
    class: className = "",
  }: {
    size?: number;
    withWordmark?: boolean;
    class?: string;
  } = $props();
</script>

{#if withWordmark}
  <img
    src="/logo.svg"
    alt="Nix-C"
    width={Math.round(size * 3.4)}
    height={size}
    class="select-none {className}"
    draggable="false"
  />
{:else}
  <img
    src="/logo-mark.svg"
    alt="Nix-C"
    width={size}
    height={size}
    class="select-none shrink-0 {className}"
    draggable="false"
  />
{/if}
