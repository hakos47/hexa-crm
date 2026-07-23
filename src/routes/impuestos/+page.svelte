<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { VatSummary } from "$lib/types";
  import { formatEUR } from "$lib/money";
  import { vatLabel, type VatRate } from "$lib/vat";
  import Card from "$lib/components/Card.svelte";
  import KpiCard from "$lib/components/KpiCard.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import Button from "$lib/components/Button.svelte";
  import { showToast } from "$lib/stores/ui";
  import { downloadCsv, vatSummaryToCsv } from "$lib/export/csv";

  function monthRange(d = new Date()) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0);
    const fmt = (x: Date) => x.toISOString().slice(0, 10);
    return { from: fmt(from), to: fmt(to) };
  }

  let range = $state(monthRange());
  let summary = $state<VatSummary | null>(null);
  let loading = $state(true);

  async function load() {
    loading = true;
    try {
      summary = await api.vatSummary(range.from, range.to);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function exportCsv() {
    if (!summary) {
      showToast("No hay datos de IVA", "info");
      return;
    }
    const csv = vatSummaryToCsv(summary.from, summary.to, summary.buckets);
    downloadCsv(`libro-iva-${summary.from}_${summary.to}.csv`, csv);
    showToast("Libro IVA exportado a CSV");
  }
</script>

<section class="tax-page workspace-page">
<div class="workspace-intro workspace-intro-compact">
  <p class="workspace-index">06 / IMPUESTOS</p>
  <div class="workspace-intro-row">
    <h2>Las cuentas,<br /><em>sin ruido.</em></h2>
    <p>Una lectura interna del IVA repercutido, preparada para revisar y exportar.</p>
  </div>
</div>

<div class="workspace-toolbar mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
  <label class="text-sm w-full sm:w-auto">
    <span class="mb-1 block text-[var(--color-muted)]">Desde</span>
    <input type="date" bind:value={range.from} class="field w-full sm:w-auto" />
  </label>
  <label class="text-sm w-full sm:w-auto">
    <span class="mb-1 block text-[var(--color-muted)]">Hasta</span>
    <input type="date" bind:value={range.to} class="field w-full sm:w-auto" />
  </label>
  <Button class="w-full sm:w-auto" onclick={load}>Actualizar</Button>
  <Button variant="secondary" class="w-full sm:w-auto" onclick={exportCsv}>Exportar CSV</Button>
</div>

<div class="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
  Control interno de IVA repercutido (PVP con IVA incluido). <strong>No sustituye</strong> un software de
  facturación homologado AEAT / Verifactu.
</div>

{#if loading || !summary}
  <div class="skeleton h-48"></div>
{:else}
  <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
    <KpiCard label="Base imponible" value={formatEUR(summary.base_cents)} accent="cyan" />
    <KpiCard label="Cuota IVA" value={formatEUR(summary.vat_cents)} accent="amber" />
    <KpiCard label="Total ventas (interno)" value={formatEUR(summary.total_cents)} accent="emerald" />
  </div>

  <Card lift={false} class="overflow-hidden p-0">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-white/10 text-xs uppercase text-slate-500">
        <tr>
          <th class="px-4 py-3">Tipo</th>
          <th class="px-4 py-3">Base</th>
          <th class="px-4 py-3">Cuota</th>
          <th class="px-4 py-3">Total</th>
        </tr>
      </thead>
      <tbody>
        {#each summary.buckets as b}
          <tr class="border-b border-white/5">
            <td class="px-4 py-3">
              <Badge tone="vat">{vatLabel(b.vat_rate as VatRate)}</Badge>
            </td>
            <td class="px-4 py-3 tabular">{formatEUR(b.base_cents)}</td>
            <td class="px-4 py-3 tabular text-amber-200">{formatEUR(b.vat_cents)}</td>
            <td class="px-4 py-3 tabular font-medium">{formatEUR(b.total_cents)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
{/if}

</section>
