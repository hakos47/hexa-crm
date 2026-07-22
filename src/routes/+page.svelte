<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { DashboardStats, Sale, Settings } from "$lib/types";
  import { formatEUR } from "$lib/money";
  import KpiCard from "$lib/components/KpiCard.svelte";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import { showToast } from "$lib/stores/ui";
  import { estimateDaysOfCover, qtySoldForProduct } from "$lib/inventory/stock-cover";
  import { countsInBusinessTotals } from "$lib/sales/cancel-sale";
  import { isOnboardingDone } from "$lib/onboarding/state";
  import { backupAgeDays, needsBackupReminder } from "$lib/backup/backup-status";

  let stats = $state<DashboardStats | null>(null);
  let sales = $state<Sale[]>([]);
  let sold14d = $state<Record<number, number>>({});
  let loading = $state(true);
  let onboardingPending = $state(false);
  let settings = $state<Settings | null>(null);

  onMount(async () => {
    try {
      onboardingPending = !isOnboardingDone();
      [stats, sales, settings] = await Promise.all([
        api.dashboardStats(),
        api.listSales(),
        api.getSettings(),
      ]);
      // Build sold map for low-stock cover hints (last 14d, cap fetches)
      const cutoff = Date.now() - 14 * 86400000;
      const recentSales = sales
        .filter(
          (s) =>
            countsInBusinessTotals(s.status) && new Date(s.sold_at).getTime() >= cutoff,
        )
        .slice(0, 40);
      const lines: { product_id: number; qty: number; returned_qty?: number }[] = [];
      for (const s of recentSales) {
        try {
          const d = await api.getSale(s.id);
          if (d.lines) {
            for (const l of d.lines) {
              lines.push({
                product_id: l.product_id,
                qty: l.qty,
                returned_qty: l.returned_qty,
              });
            }
          }
        } catch {
          /* skip */
        }
      }
      const map: Record<number, number> = {};
      for (const p of stats?.low_stock ?? []) {
        map[p.id] = qtySoldForProduct(lines, p.id);
      }
      sold14d = map;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al cargar", "err");
    } finally {
      loading = false;
    }
  });

  const recent = $derived(sales.slice(0, 6));
  const showBackupReminder = $derived(needsBackupReminder(settings?.last_backup_at));
  const backupDays = $derived(backupAgeDays(settings?.last_backup_at));
</script>

{#if loading}
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {#each Array(4) as _}
      <div class="skeleton h-32"></div>
    {/each}
  </div>
{:else if stats}
  {#if onboardingPending}
    <Card class="mb-4 border border-purple-400/30 bg-purple-500/10" lift={false} data-onboarding-hint>
      <p class="text-sm font-medium text-[var(--color-purple-bright)]">Puesta en marcha pendiente</p>
      <p class="mt-1 text-xs text-[var(--color-muted)]">
        Completa el asistente inicial o ve a Ajustes para nombrar la tienda. Luego cobra tu primera
        venta en el TPV.
      </p>
      <a href="/ventas?nuevo=1" class="mt-2 inline-block text-sm text-radiant hover:underline">
        Ir a cobrar →
      </a>
    </Card>
  {/if}
  {#if showBackupReminder}
    <Card class="mb-4 border border-amber-400/30 bg-amber-500/10" lift={false} data-backup-reminder>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-medium text-amber-100">
            {backupDays === null ? "Aún no hay una copia de seguridad" : `La última copia tiene ${backupDays} días`}
          </p>
          <p class="mt-1 text-xs text-amber-100/75">
            Guarda un JSON local antes de continuar. No se envía nada a la nube.
          </p>
        </div>
        <a href="/ajustes" class="text-sm font-medium text-amber-100 underline-offset-2 hover:underline">
          Hacer copia →
        </a>
      </div>
    </Card>
  {/if}
  <!-- Resumen KPIs -->
  <p class="section-label mb-3">Resumen</p>
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
            {@const cover = estimateDaysOfCover({
              stock: p.stock,
              qtySoldInHorizon: sold14d[p.id] ?? 0,
              horizonDays: 14,
            })}
            <li>
              <a
                href="/inventario"
                class="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-black/20 px-3 py-2.5 transition hover:border-purple-400/25 hover:bg-purple-500/10"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-[var(--color-text)]">{p.name}</p>
                  <p class="text-[11px] text-[var(--color-muted-dim)]">
                    {p.sku}{p.category ? ` · ${p.category}` : ""}
                  </p>
                </div>
                <div class="text-right">
                  <p class="tabular text-sm text-rose-300">{p.stock}</p>
                  <p class="text-[10px] text-[var(--color-muted-dim)]">
                    mín {p.min_stock} · {cover.display}
                  </p>
                </div>
              </a>
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
          href="/ventas?nuevo=1"
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
          href="/inventario?nuevo=1"
          class="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-black/20 px-4 py-3 transition hover:border-purple-400/35 hover:bg-purple-500/10"
        >
          <span class="kpi-icon !h-9 !w-9">▣</span>
          <div>
            <p class="text-sm font-medium text-[var(--color-text)]">Nuevo producto</p>
            <p class="text-[11px] text-[var(--color-muted-dim)]">Alta rápida de stock</p>
          </div>
        </a>
        <a
          href="/caja?nuevo=1"
          class="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-black/20 px-4 py-3 transition hover:border-purple-400/35 hover:bg-purple-500/10"
        >
          <span class="kpi-icon !h-9 !w-9">€</span>
          <div>
            <p class="text-sm font-medium text-[var(--color-text)]">Movimiento de caja</p>
            <p class="text-[11px] text-[var(--color-muted-dim)]">Gasto o ingreso manual</p>
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
