<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    tone = "neutral",
    children,
  }: {
    tone?: "neutral" | "ok" | "warn" | "danger" | "ai" | "vat";
    children: Snippet;
  } = $props();

  const tones: Record<string, string> = {
    neutral: "bg-white/[0.04] text-[var(--color-muted)] border-[var(--color-border-soft)]",
    ok: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    warn: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    danger: "bg-rose-500/10 text-rose-300 border-rose-500/25",
    ai: "bg-purple-500/15 text-purple-200 border-purple-400/30 shadow-[0_0_12px_rgba(168,85,247,0.15)]",
    vat: "bg-violet-500/10 text-violet-200 border-violet-400/25",
  };
</script>

<span class="inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium {tones[tone]}">
  {@render children()}
</span>
