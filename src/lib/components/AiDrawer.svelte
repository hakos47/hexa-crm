<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { api } from "$lib/api/client";
  import type { AiMessage } from "$lib/types";
  import {
    aiPopup,
    closeAiChat,
    expandAiChat,
    collapseAiChat,
  } from "$lib/stores/ui";
  import { panelLayoutClasses, isCompact, isFullscreen } from "$lib/ai/popup-state";
  import Button from "./Button.svelte";

  let messages = $state<AiMessage[]>([]);
  let input = $state("");
  let loading = $state(false);
  let health = $state<{ ok: boolean; models: string[] } | null>(null);

  const mode = $derived($aiPopup.mode);
  const open = $derived(mode !== "closed");
  const fullscreen = $derived(isFullscreen($aiPopup));
  const compact = $derived(isCompact($aiPopup));
  const layout = $derived(panelLayoutClasses(mode));

  $effect(() => {
    if (open) {
      api.ollamaHealth().then((h) => (health = h)).catch(() => (health = { ok: false, models: [] }));
    }
  });

  const suggestions = [
    "Resume el día de la tienda",
    "¿Qué productos debo reponer?",
    "¿Cómo va la caja este mes?",
  ];

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    input = "";
    messages = [...messages, { role: "user", content }];
    loading = true;
    try {
      const res = await api.aiChat(messages);
      messages = [...messages, { role: "assistant", content: res.reply }];
    } catch (e) {
      messages = [
        ...messages,
        {
          role: "assistant",
          content: e instanceof Error ? e.message : "Error al consultar la IA",
        },
      ];
    } finally {
      loading = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      if (fullscreen) collapseAiChat();
      else closeAiChat();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="{layout.root}" data-ai-popup={mode}>
    {#if layout.hasBackdrop}
      <button
        type="button"
        class="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Cerrar pantalla completa"
        onclick={() => collapseAiChat()}
        transition:fade={{ duration: 150 }}
      ></button>
    {/if}

    <aside
      class="glass-strong relative z-10 {layout.panel} overflow-hidden border border-[var(--color-border-strong)] shadow-2xl glow-purple {fullscreen
        ? 'rounded-none sm:rounded-2xl'
        : 'rounded-2xl'}"
      transition:fly={{ y: compact ? 24 : 0, duration: 200 }}
      role="dialog"
      aria-label="Asistente IA"
      data-ai-panel={mode}
    >
      <header
        class="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2.5 sm:px-4 sm:py-3"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 shrink-0 rounded-full bg-purple-400 pulse-glow"></span>
            <h2 class="truncate text-sm font-semibold text-radiant-bright sm:text-base">
              Asistente IA
            </h2>
          </div>
          <p class="mt-0.5 truncate text-[11px] text-[var(--color-muted-dim)]">
            {#if health?.ok}
              Ollama listo · {health.models.length} modelo(s)
            {:else if health}
              Ollama offline
            {:else}
              Comprobando…
            {/if}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          {#if fullscreen}
            <button
              type="button"
              class="rounded-lg px-2 py-1.5 text-xs text-[var(--color-muted)] hover:bg-purple-500/10 hover:text-[var(--color-purple-bright)]"
              title="Restaurar"
              aria-label="Salir de pantalla completa"
              data-ai-action="collapse"
              onclick={() => collapseAiChat()}
            >
              ⧉
            </button>
          {:else}
            <button
              type="button"
              class="rounded-lg px-2 py-1.5 text-xs text-[var(--color-muted)] hover:bg-purple-500/10 hover:text-[var(--color-purple-bright)]"
              title="Pantalla completa"
              aria-label="Expandir a pantalla completa"
              data-ai-action="expand"
              onclick={() => expandAiChat()}
            >
              ⛶
            </button>
          {/if}
          <button
            type="button"
            class="rounded-lg px-2 py-1.5 text-sm text-[var(--color-muted)] hover:bg-purple-500/10 hover:text-[var(--color-purple-bright)]"
            title="Cerrar"
            aria-label="Cerrar asistente"
            data-ai-action="close"
            onclick={() => closeAiChat()}
          >
            ✕
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {#if messages.length === 0}
          <div
            class="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-3 text-sm text-[var(--color-muted)] sm:p-4"
          >
            Pregúntame por ventas, stock, caja o IVA. Contexto local y modelo Ollama (bajo consumo).
          </div>
          <div class="flex flex-wrap gap-2">
            {#each suggestions as s}
              <button
                type="button"
                class="rounded-full border border-[var(--color-border)] bg-black/30 px-3 py-1.5 text-xs text-[var(--color-muted)] transition hover:border-purple-400/40 hover:text-[var(--color-purple-bright)]"
                onclick={() => send(s)}
              >
                {s}
              </button>
            {/each}
          </div>
        {/if}

        {#each messages as m}
          <div
            class="rounded-2xl px-3 py-2 text-sm leading-relaxed {m.role === 'user'
              ? 'ml-6 border border-purple-400/25 bg-purple-500/15 text-[var(--color-purple-bright)] sm:ml-8'
              : 'mr-2 border border-[var(--color-border)] bg-black/30 text-[var(--color-text)] sm:mr-4'}"
          >
            {m.content}
          </div>
        {/each}

        {#if loading}
          <div class="mr-2 rounded-2xl border border-[var(--color-border)] bg-black/30 px-3 py-3 sm:mr-4">
            <div class="skeleton h-4 w-2/3"></div>
          </div>
        {/if}
      </div>

      <form
        class="shrink-0 border-t border-[var(--color-border)] p-2.5 sm:p-3"
        onsubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div class="flex gap-2">
          <input
            bind:value={input}
            placeholder="Escribe tu pregunta…"
            class="field min-w-0 flex-1 text-sm"
          />
          <Button variant="ai" type="submit" class="shrink-0" disabled={loading || !input.trim()}>
            Enviar
          </Button>
        </div>
      </form>
    </aside>
  </div>
{/if}
