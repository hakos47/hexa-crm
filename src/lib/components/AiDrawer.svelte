<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { api } from "$lib/api/client";
  import type { AiMessage, Product, Sale, DashboardStats, VatSummary } from "$lib/types";
  import {
    aiPopup,
    closeAiChat,
    expandAiChat,
    collapseAiChat,
  } from "$lib/stores/ui";
  import { panelLayoutClasses, isCompact, isFullscreen } from "$lib/ai/popup-state";
  import Button from "./Button.svelte";
  import { marked } from "marked";

  let messages = $state<AiMessage[]>([]);
  let input = $state("");
  let loading = $state(false);
  let health = $state<{ ok: boolean; models: string[] } | null>(null);

  // Estados de datos de gráficas
  let activeTab = $state<"sales" | "stock" | "cash" | "vat">("sales");
  let dashboardStats = $state<DashboardStats | null>(null);
  let productsList = $state<Product[]>([]);
  let salesList = $state<Sale[]>([]);
  let vatSummary = $state<VatSummary | null>(null);

  const mode = $derived($aiPopup.mode);
  const open = $derived(mode !== "closed");
  const fullscreen = $derived(isFullscreen($aiPopup));
  const compact = $derived(isCompact($aiPopup));
  const layout = $derived(panelLayoutClasses(mode));

  // Carga de datos de salud de Ollama
  $effect(() => {
    if (open) {
      api.ollamaHealth()
        .then((h) => (health = h))
        .catch(() => (health = { ok: false, models: [] }));
      
      // Si se abre en pantalla completa, cargar todas las estadísticas del panel lateral
      if (fullscreen) {
        refreshDashboardData();
      }
    }
  });

  // Escuchar cuando cambia a modo pantalla completa para recargar datos de gráficas
  $effect(() => {
    if (fullscreen) {
      refreshDashboardData();
    }
  });

  const suggestions = [
    "Resume el día de la tienda",
    "¿Qué productos debo reponer?",
    "¿Cómo va la caja este mes?",
  ];

  async function refreshDashboardData() {
    try {
      dashboardStats = await api.dashboardStats();
      productsList = await api.listProducts(false);
      salesList = await api.listSales();
      
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const lastDay = today.toISOString().slice(0, 10);
      vatSummary = await api.vatSummary(firstDay, lastDay);
    } catch (e) {
      console.error("Error al cargar datos del panel lateral de gráficas:", e);
    }
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    input = "";
    messages = [...messages, { role: "user", content }];
    loading = true;
    try {
      const res = await api.aiChat(messages);
      messages = [...messages, { role: "assistant", content: res.reply }];
      
      // Auto-enrutamiento de pestaña de gráficas reactiva a lo que hable el usuario
      const lower = (content + " " + res.reply).toLowerCase();
      if (lower.includes("venta") || lower.includes("factura") || lower.includes("ingreso") || lower.includes("ticket")) {
        activeTab = "sales";
      } else if (lower.includes("stock") || lower.includes("inventario") || lower.includes("producto") || lower.includes("existencia")) {
        activeTab = "stock";
      } else if (lower.includes("caja") || lower.includes("efectivo") || lower.includes("gasto") || lower.includes("movimiento")) {
        activeTab = "cash";
      } else if (lower.includes("iva") || lower.includes("impuesto") || lower.includes("tasa") || lower.includes("hacienda")) {
        activeTab = "vat";
      }
      
      // Refrescar estadísticas en pantalla
      if (fullscreen) {
        refreshDashboardData();
      }
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

  // Helper para agrupar ventas diarias (últimos 7 días)
  const salesChartData = $derived.by(() => {
    const dataMap = new Map<string, number>();
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      dataMap.set(d.toISOString().slice(0, 10), 0);
    }

    salesList.forEach((s) => {
      if (s.status === "completed") {
        const key = s.sold_at.slice(0, 10);
        if (dataMap.has(key)) {
          dataMap.set(key, (dataMap.get(key) || 0) + s.total_cents / 100);
        }
      }
    });

    return Array.from(dataMap.entries()).map(([date, total]) => {
      const dayName = new Date(date).toLocaleDateString("es-ES", { weekday: "short" });
      return { label: dayName.toUpperCase(), value: total, date };
    });
  });

  const maxSaleValue = $derived(Math.max(...salesChartData.map((d) => d.value), 10));

  // Top 5 productos stock
  const topProductsStock = $derived(
    [...productsList]
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 5)
  );

  const maxStockValue = $derived(Math.max(...topProductsStock.map((p) => p.stock), 10));
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
              Asistente IA (Lucía)
            </h2>
          </div>
          <p class="mt-0.5 truncate text-[11px] text-[var(--color-muted-dim)]" title={health?.ok ? health.models.join(", ") : undefined}>
            {#if health?.ok}
              Ollama listo · {health.models.length} modelo(s) ({health.models[0]})
            {:else if health}
              Ollama offline — revisa Ajustes / ollama serve
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

      <!-- Layout dividido: Chat a la izquierda y Gráficas de pantalla extendida a la derecha (solo en fullscreen) -->
      <div class="flex flex-1 min-h-0 flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-[var(--color-border)]">
        
        <!-- Panel Izquierdo: Ventana de Chat de la IA -->
        <div class="flex flex-1 flex-col min-h-0 min-w-0">
          <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
            {#if messages.length === 0}
              <div
                class="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-3 text-sm text-[var(--color-muted)] sm:p-4"
              >
                ¡Hola! Soy **Lucía**. Pregúntame sobre ventas, el estado del inventario, saldo de caja o resúmenes de IVA. Responderé usando los datos reales de PostgreSQL 18.
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
                class="rounded-2xl px-3 py-2 text-sm leading-relaxed prose prose-invert max-w-none {m.role === 'user'
                  ? 'ml-6 border border-purple-400/25 bg-purple-500/15 text-[var(--color-purple-bright)] sm:ml-8'
                  : 'mr-2 border border-[var(--color-border)] bg-black/30 text-[var(--color-text)] sm:mr-4'}"
              >
                {#if m.role === "assistant"}
                  {@html marked.parse(m.content)}
                {:else}
                  {m.content}
                {/if}
              </div>
            {/each}

            {#if loading}
              <div class="mr-2 rounded-2xl border border-[var(--color-border)] bg-black/30 px-3 py-3 sm:mr-4">
                <div class="flex items-center gap-2">
                  <span class="h-2 w-2 rounded-full bg-purple-400 animate-pulse"></span>
                  <span class="text-xs text-[var(--color-muted)]">Lucía está pensando...</span>
                </div>
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
                placeholder="Escribe tu pregunta a Lucía…"
                class="field min-w-0 flex-1 text-sm"
              />
              <Button variant="ai" type="submit" class="shrink-0" disabled={loading || !input.trim()}>
                Enviar
              </Button>
            </div>
          </form>
        </div>

        <!-- Panel Derecho: Panel de Gráficas de Pantalla Extendida (Solo en Fullscreen) -->
        {#if fullscreen}
          <div class="w-full lg:w-[45%] shrink-0 flex flex-col min-h-0 bg-black/15 overflow-y-auto p-4">
            <div class="flex items-center justify-between border-b border-[var(--color-border)] pb-2 mb-4">
              <h3 class="text-sm font-semibold text-radiant-bright uppercase tracking-wider flex items-center gap-1.5">
                📊 Pantalla Extendida de Métricas
              </h3>
              <button 
                type="button" 
                onclick={refreshDashboardData} 
                class="text-xs text-[var(--color-muted)] hover:text-[var(--color-purple-bright)] transition"
              >
                🔄 Refrescar
              </button>
            </div>

            <!-- Selector de tipo de Gráfica -->
            <div class="grid grid-cols-4 gap-1 mb-4 bg-black/45 p-1 rounded-xl border border-[var(--color-border)]">
              <button 
                type="button" 
                onclick={() => activeTab = "sales"} 
                class="py-1.5 text-[11px] font-medium rounded-lg transition {activeTab === 'sales' ? 'bg-purple-500/20 text-[var(--color-purple-bright)] border border-purple-500/30' : 'text-[var(--color-muted)] hover:text-white'}"
              >
                📈 Ventas
              </button>
              <button 
                type="button" 
                onclick={() => activeTab = "stock"} 
                class="py-1.5 text-[11px] font-medium rounded-lg transition {activeTab === 'stock' ? 'bg-purple-500/20 text-[var(--color-purple-bright)] border border-purple-500/30' : 'text-[var(--color-muted)] hover:text-white'}"
              >
                📊 Stock
              </button>
              <button 
                type="button" 
                onclick={() => activeTab = "cash"} 
                class="py-1.5 text-[11px] font-medium rounded-lg transition {activeTab === 'cash' ? 'bg-purple-500/20 text-[var(--color-purple-bright)] border border-purple-500/30' : 'text-[var(--color-muted)] hover:text-white'}"
              >
                💰 Caja
              </button>
              <button 
                type="button" 
                onclick={() => activeTab = "vat"} 
                class="py-1.5 text-[11px] font-medium rounded-lg transition {activeTab === 'vat' ? 'bg-purple-500/20 text-[var(--color-purple-bright)] border border-purple-500/30' : 'text-[var(--color-muted)] hover:text-white'}"
              >
                🍩 IVA
              </button>
            </div>

            <!-- Contenido de las Gráficas (Bento Cards con Glassmorphism) -->
            <div class="flex-1 space-y-4">
              
              {#if activeTab === "sales"}
                <div class="glass-strong border border-[var(--color-border)] rounded-2xl p-4 glow-purple">
                  <h4 class="text-xs font-semibold text-radiant-bright mb-3">TENDENCIA DE VENTAS (ÚLTIMOS 7 DÍAS)</h4>
                  
                  {#if salesList.length === 0}
                    <div class="h-40 flex items-center justify-center text-xs text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-xl">
                      Sin ventas registradas en el periodo actual.
                    </div>
                  {:else}
                    <!-- Gráfico de barras SVG dinámico -->
                    <div class="h-44 w-full flex items-end justify-between gap-2 pt-6 px-2">
                      {#each salesChartData as item}
                        <div class="flex-1 flex flex-col items-center gap-2 group">
                          <div class="relative w-full flex flex-col justify-end items-center h-32">
                            <span class="absolute -top-6 text-[10px] font-mono text-purple-300 opacity-0 group-hover:opacity-100 transition duration-150">
                              {item.value.toFixed(2)}€
                            </span>
                            <div 
                              class="w-full max-w-[24px] bg-gradient-to-t from-purple-600/80 to-purple-400 rounded-t-md group-hover:glow-purple transition-all duration-300"
                              style="height: {Math.max((item.value / maxSaleValue) * 100, 3)}%"
                            ></div>
                          </div>
                          <span class="text-[9px] font-semibold text-[var(--color-muted-dim)]">{item.label}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}

                  <div class="mt-4 grid grid-cols-2 gap-2 pt-3 border-t border-[var(--color-border)]">
                    <div class="bg-black/35 p-2 rounded-xl border border-[var(--color-border)]">
                      <span class="block text-[10px] text-[var(--color-muted)]">Ventas de Hoy</span>
                      <span class="text-sm font-mono font-bold text-radiant-bright">
                        {((dashboardStats?.sales_today_cents ?? 0) / 100).toFixed(2)} €
                      </span>
                    </div>
                    <div class="bg-black/35 p-2 rounded-xl border border-[var(--color-border)]">
                      <span class="block text-[10px] text-[var(--color-muted)]">Tickets de Hoy</span>
                      <span class="text-sm font-mono font-bold text-radiant-bright">
                        {dashboardStats?.sales_today_count ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              {/if}

              {#if activeTab === "stock"}
                <div class="glass-strong border border-[var(--color-border)] rounded-2xl p-4 glow-purple">
                  <h4 class="text-xs font-semibold text-radiant-bright mb-3">NIVEL DE STOCK (PRODUCTOS CLAVE)</h4>
                  
                  {#if productsList.length === 0}
                    <div class="h-40 flex items-center justify-center text-xs text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-xl">
                      El inventario se encuentra completamente vacío.
                    </div>
                  {:else}
                    <div class="space-y-3.5">
                      {#each topProductsStock as p}
                        <div class="space-y-1">
                          <div class="flex items-center justify-between text-xs">
                            <span class="text-[var(--color-text)] truncate w-2/3">{p.name}</span>
                            <span class="font-mono font-bold {p.stock <= p.min_stock ? 'text-red-400' : 'text-purple-300'}">
                              {p.stock} uds {p.stock <= p.min_stock ? '(Mín. ' + p.min_stock + ')' : ''}
                            </span>
                          </div>
                          <div class="h-2 w-full bg-black/45 rounded-full overflow-hidden border border-[var(--color-border)]">
                            <div 
                              class="h-full rounded-full transition-all duration-500 {p.stock <= p.min_stock ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-purple-600 to-purple-400'}"
                              style="width: {Math.min((p.stock / maxStockValue) * 100, 100)}%"
                            ></div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}

                  <div class="mt-4 pt-3 border-t border-[var(--color-border)] bg-black/35 p-2 rounded-xl text-center border border-[var(--color-border)]">
                    <span class="text-[10px] text-[var(--color-muted)] block">Productos con existencias críticas</span>
                    <span class="text-xs font-bold {(dashboardStats?.low_stock?.length ?? 0) ? 'text-red-400' : 'text-green-400'}">
                      {dashboardStats?.low_stock?.length ?? 0} producto(s) bajo el stock mínimo
                    </span>
                  </div>
                </div>
              {/if}

              {#if activeTab === "cash"}
                <div class="glass-strong border border-[var(--color-border)] rounded-2xl p-4 glow-purple">
                  <h4 class="text-xs font-semibold text-radiant-bright mb-3">BALANCE GENERAL DE CAJA</h4>
                  
                  <div class="flex flex-col items-center justify-center p-4 bg-black/30 rounded-xl border border-[var(--color-border)] mb-4">
                    <span class="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Efectivo en Caja</span>
                    <span class="text-2xl font-mono font-black text-purple-300 mt-1">
                      {((dashboardStats?.cash_balance_cents ?? 0) / 100).toFixed(2)} €
                    </span>
                  </div>

                  <h5 class="text-[10px] font-bold text-[var(--color-muted)] uppercase tracking-wider mb-2">Últimos Movimientos</h5>
                  <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {#each salesList.slice(0, 4) as s}
                      <div class="flex items-center justify-between text-xs p-1.5 rounded-lg bg-black/25 border border-[var(--color-border)]/50">
                        <div class="min-w-0">
                          <span class="block truncate font-semibold text-radiant-bright">{s.number}</span>
                          <span class="text-[9px] text-[var(--color-muted-dim)]">Venta de mostrador</span>
                        </div>
                        <span class="font-mono font-bold text-green-400">+{((s.total_cents) / 100).toFixed(2)}€</span>
                      </div>
                    {/each}
                    {#if salesList.length === 0}
                      <div class="text-center text-xs py-4 text-[var(--color-muted)]">Sin movimientos de caja registrados.</div>
                    {/if}
                  </div>
                </div>
              {/if}

              {#if activeTab === "vat"}
                <div class="glass-strong border border-[var(--color-border)] rounded-2xl p-4 glow-purple">
                  <h4 class="text-xs font-semibold text-radiant-bright mb-3">DISTRIBUCIÓN DE IMPUESTOS (IVA MES ACTUAL)</h4>
                  
                  {#if !vatSummary || vatSummary.buckets.length === 0}
                    <div class="h-40 flex items-center justify-center text-xs text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-xl">
                      Sin datos fiscales para el periodo actual.
                    </div>
                  {:else}
                    <div class="space-y-3">
                      {#each vatSummary.buckets as r}
                        <div class="flex items-center justify-between text-xs p-2 rounded-xl bg-black/35 border border-[var(--color-border)]">
                          <div>
                            <span class="font-bold text-purple-300">Tasa del {r.vat_rate}%</span>
                            <span class="block text-[9px] text-[var(--color-muted)]">Base: {(r.base_cents / 100).toFixed(2)}€</span>
                          </div>
                          <div class="text-right">
                            <span class="font-mono font-bold text-radiant-bright">{(r.vat_cents / 100).toFixed(2)}€</span>
                            <span class="block text-[9px] text-[var(--color-muted-dim)]">Total: {(r.total_cents / 100).toFixed(2)}€</span>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}

                  <div class="mt-4 grid grid-cols-2 gap-2 pt-3 border-t border-[var(--color-border)]">
                    <div class="bg-black/35 p-2 rounded-xl border border-[var(--color-border)]">
                      <span class="block text-[10px] text-[var(--color-muted)]">Total Base Imponible</span>
                      <span class="text-xs font-mono font-bold text-radiant-bright">
                        {((vatSummary?.base_cents ?? 0) / 100).toFixed(2)} €
                      </span>
                    </div>
                    <div class="bg-black/35 p-2 rounded-xl border border-[var(--color-border)]">
                      <span class="block text-[10px] text-[var(--color-muted)]">Total IVA Recaudado</span>
                      <span class="text-xs font-mono font-bold text-purple-300">
                        {((vatSummary?.vat_cents ?? 0) / 100).toFixed(2)} €
                      </span>
                    </div>
                  </div>
                </div>
              {/if}

            </div>
          </div>
        {/if}

      </div>
    </aside>
  </div>
{/if}

<style>
  :global(.prose) {
    line-height: 1.6;
  }
  :global(.prose p) {
    margin-bottom: 0.75rem;
  }
  :global(.prose p:last-child) {
    margin-bottom: 0;
  }
  :global(.prose strong) {
    color: var(--color-purple-bright);
    font-weight: 600;
  }
  :global(.prose ul, .prose ol) {
    margin-left: 1.25rem;
    margin-bottom: 0.75rem;
    list-style-type: disc;
  }
  :global(.prose ol) {
    list-style-type: decimal;
  }
  :global(.prose li) {
    margin-bottom: 0.25rem;
  }
  :global(.prose table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0;
    font-size: 0.85rem;
    border: 1px solid var(--color-border-strong);
  }
  :global(.prose th) {
    border-bottom: 2px solid var(--color-border-strong);
    background-color: rgba(139, 92, 246, 0.1);
    padding: 0.5rem;
    text-align: left;
    font-weight: 600;
    color: var(--color-purple-bright);
  }
  :global(.prose td) {
    border-bottom: 1px solid var(--color-border);
    padding: 0.5rem;
  }
  :global(.prose tr:hover td) {
    background-color: rgba(139, 92, 246, 0.05);
  }
</style>
