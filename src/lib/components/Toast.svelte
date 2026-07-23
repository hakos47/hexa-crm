<script lang="ts">
  import { fly } from "svelte/transition";
  import { toast } from "$lib/stores/ui";

  const colors = {
    ok: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
    err: "border-rose-500/40 bg-rose-500/15 text-rose-100",
    info: "border-violet-500/40 bg-violet-500/15 text-violet-100",
  };
</script>

{#if $toast}
  <div
    class="fixed bottom-24 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur {colors[$toast.type]}"
    transition:fly={{ y: 16, duration: 200 }}
  >
    {$toast.message}
  </div>
{/if}
