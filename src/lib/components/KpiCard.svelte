<script lang="ts">
  import Card from "./Card.svelte";

  let {
    label,
    value,
    hint = "",
    icon = "◇",
    accent = "violet",
  }: {
    label: string;
    value: string;
    hint?: string;
    icon?: string;
    accent?: "violet" | "emerald" | "cyan" | "amber" | "rose";
  } = $props();

  const iconTone: Record<string, string> = {
    violet: "text-[var(--color-purple)] shadow-[0_0_18px_rgba(168,85,247,0.35)]",
    emerald: "text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.25)]",
    cyan: "text-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.25)]",
    amber: "text-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.25)]",
    rose: "text-rose-300 shadow-[0_0_18px_rgba(251,113,133,0.25)]",
  };
</script>

<Card class="relative overflow-hidden !p-5">
  <!-- soft radiant wash -->
  <div
    class="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl"
  ></div>
  <div class="relative flex items-start gap-3">
    <div class="kpi-icon {iconTone[accent]}">{icon}</div>
    <div class="min-w-0 flex-1">
      <p class="section-label !text-[0.65rem] !tracking-[0.16em]">{label}</p>
      <p class="mt-2 text-3xl font-semibold tabular tracking-tight text-[var(--color-text)]">
        {value}
      </p>
      {#if hint}
        <p class="mt-1.5 text-xs text-[var(--color-muted-dim)]">{hint}</p>
      {/if}
    </div>
  </div>
</Card>
