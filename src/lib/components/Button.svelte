<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  type Variant = "primary" | "secondary" | "ghost" | "danger" | "ai";

  let {
    variant = "primary",
    type = "button",
    disabled = false,
    class: className = "",
    onclick,
    children,
    ...restProps
  }: HTMLButtonAttributes & {
    variant?: Variant;
    children: Snippet;
  } = $props();

  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-45 disabled:pointer-events-none active:scale-[0.98]";

  const styles: Record<Variant, string> = {
    primary:
      "bg-gradient-to-r from-violet-600 to-purple-500 text-white hover:from-violet-500 hover:to-purple-400 shadow-[0_0_28px_rgba(168,85,247,0.35)]",
    secondary:
      "bg-white/[0.03] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-purple-500/10 hover:border-purple-400/30",
    ghost: "text-[var(--color-muted)] hover:bg-purple-500/10 hover:text-[var(--color-purple-bright)]",
    danger: "bg-rose-500/10 text-rose-300 border border-rose-500/25 hover:bg-rose-500/20",
    ai: "bg-gradient-to-r from-purple-600 via-violet-500 to-fuchsia-500 text-white shadow-[0_0_32px_rgba(168,85,247,0.4)] hover:brightness-110",
  };
</script>

<button {...restProps} {type} {disabled} class="{base} {styles[variant]} {className}" {onclick}>
  {@render children()}
</button>
