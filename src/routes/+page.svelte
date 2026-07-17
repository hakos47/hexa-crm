<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { DashboardStats, Sale } from "$lib/types";
  import { formatEUR } from "$lib/money";
  import KpiCard from "$lib/components/KpiCard.svelte";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import { showToast } from "$lib/stores/ui";

  let stats = $state<DashboardStats | null>(null);
  let sales = $state<Sale[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      [stats, sales] = await Promise.all([api.dashboardStats(), api.listSales()]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al cargar", "err");
    } finally {
      loading = false;
    }
  });

  const recent = $derived(sales.slice(0, 6));
</script>

{#if loading}
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {#each Array(4) as _}
      <div class="skeleton h-32"></div>
    {/each}
  </div>
{:else if stats}
  <!-- Overview KPIs — reference CRM style -->
  <p class="section-label mb-3">Overview</p>
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <KpiCard
      label="Ventas hoy"
      value={formatEUR(stats.sales_today_cents)}
      hint="{stats.sales_today_count} ticket(s)"
      icon="◎"
      accent="emerald"
    />
    <KpiCard
      label="Ventas del mes"
      value={formatEUR(stats.sales_month_cents)}
      hint="{stats.sales_month_count} ticket(s)"
      icon="◈"
      accent="violet"
    />
    <KpiCard
      label="Saldo de caja"
      value={formatEUR(stats.cash_balance_cents)}
      hint="Presupuesto actual"
      icon="€"
      accent="cyan"
    />
    <KpiCard
      label="IVA del mes"
      value={formatEUR(stats.vat_month_cents)}
      hint="Base {formatEUR(stats.base_month_cents)}"
      icon="%"
      accent="amber"
    />
  </div>

  <div class="mt-8 grid gap-4 lg:grid-cols-3">
    <!-- Stock alerts as pipeline-like cards -->
    <Card class="lg:col-span-1" lift={false}>
      <div class="mb-4 flex items-center justify-between">
        <h2 class="section-label !normal-case !tracking-wide !text-sm">Stock bajo</h2>
        <Badge tone={stats.low_stock.length ? "warn" : "ok"}>
          {stats.low_stock.length ? `${stats.low_stock.length}` : "OK"}
        </Badge>
      </div>
      {#if stats.low_stock.length === 0}
        <p class="text-sm text-[var(--color-muted-dim)]">Ningún producto bajo mínimo.</p>
      {:else}
        <ul class="space-y-2">
          {#each stats.low_stock as p}
            <li
              class="rounded-xl border border-[var(--color-border)] bg-black/20 px-3 py-2.5 transition hover:border-purple-400/25"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-[var(--color-text)]">{p.name}</p>
                  <p class="text-[11px] text-[var(--color-muted-dim)]">{p.sku}</p>
                </div>
                <div class="text-right">
                  <p class="tabular text-sm text-rose-300">{p.stock}</p>
                  <p class="text-[10px] text-[var(--color-muted-dim)]">mín {p.min_stock}</p>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>

    <!-- Recent sales -->
    <Card class="lg:col-span-1" lift={false}>
      <div class="mb-4 flex items-center justify-between">
        <h2 class="section-label !normal-case !tracking-wide !text-sm">Últimas ventas</h2>
        <a href="/ventas" class="text-xs text-radiant hover:underline">Ver todas</a>
      </div>
      {#if recent.length === 0}
        <p class="text-sm text-[var(--color-muted-dim)]">Aún no hay tickets.</p>
      {:else}
        <ul class="space-y-2">
          {#each recent as s}
            <li
              class="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-black/20 px-3 py-2.5"
            >
              <div>
                <p class="text-sm font-medium">{s.number}</p>
                <p class="text-[11px] text-[var(--color-muted-dim)]">
                  {new Date(s.sold_at).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <span class="tabular text-sm font-medium text-radiant">
                {formatEUR(s.total_cents)}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>

    <!-- Quick actions panel -->
    <Card class="lg:col-span-1" lift={false}>
      <h2 class="section-label mb-4 !normal-case !tracking-wide !text-sm">Acciones rápidas</h2>
      <div class="grid gap-2">
        <a
          href="/ventas"
          class="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-black/20 px-4 py-3 transition hover:border-purple-400/35 hover:bg-purple-500/10"
        >
          <span class="kpi-icon !h-9 !w-9">◎</span>
          <div>
            <p class="text-sm font-medium text-[var(--color-purple-bright)] group-hover:text-radiant-bright">
              Nueva venta
            </p>
            <p class="text-[11px] text-[var(--color-muted-dim)]">TPV con IVA incluido</p>
          </div>
        </a>
        <a
          href="/inventario"
          class="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-black/20 px-4 py-3 transition hover:border-purple-400/35 hover:bg-purple-500/10"
        >
          <span class="kpi-icon !h-9 !w-9">▣</span>
          <div>
            <p class="text-sm font-medium text-[var(--color-text)]">Inventario</p>
            <p class="text-[11px] text-[var(--color-muted-dim)]">Stock y productos</p>
          </div>
        </a>
        <a
          href="/caja"
          class="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-black/20 px-4 py-3 transition hover:border-purple-400/35 hover:bg-purple-500/10"
        >
          <span class="kpi-icon !h-9 !w-9">€</span>
          <div>
            <p class="text-sm font-medium text-[var(--color-text)]">Caja</p>
            <p class="text-[11px] text-[var(--color-muted-dim)]">Presupuesto actual</p>
          </div>
        </a>
        <a
          href="/impuestos"
          class="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-black/20 px-4 py-3 transition hover:border-purple-400/35 hover:bg-purple-500/10"
        >
          <span class="kpi-icon !h-9 !w-9">%</span>
          <div>
            <p class="text-sm font-medium text-[var(--color-text)]">Libro IVA</p>
            <p class="text-[11px] text-[var(--color-muted-dim)]">Resumen fiscal</p>
          </div>
        </a>
      </div>
      <p class="mt-4 text-[11px] leading-relaxed text-[var(--color-muted-dim)]">
        Precios con IVA incluido (0 / 4 / 10 / 21 %). Control interno — no sustituye software homologado AEAT.
      </p>
    </Card>
  </div>
{/if}
