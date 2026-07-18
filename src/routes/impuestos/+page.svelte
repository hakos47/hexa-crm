<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { VatBucket, VatSummary } from "$lib/types";
  import { formatEUR } from "$lib/money";
  import { vatLabel, type VatRate } from "$lib/vat";
  import Card from "$lib/components/Card.svelte";
  import KpiCard from "$lib/components/KpiCard.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import Button from "$lib/components/Button.svelte";
  import SortableHeader from "$lib/components/SortableHeader.svelte";
  import { showToast } from "$lib/stores/ui";
  import { downloadCsv, vatSummaryToCsv } from "$lib/export/csv";
  import { nextSortDirection, sortRows, type SortDirection } from "$lib/table-sort";

  type VatSortKey = "rate" | "base" | "vat" | "total";

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
  let vatSortKey = $state<VatSortKey>("rate");
  let vatSortDirection = $state<SortDirection>("asc");

  const sortedBuckets = $derived(
    sortRows(summary?.buckets ?? [], vatSortDirection, (bucket: VatBucket) => {
      if (vatSortKey === "rate") return bucket.vat_rate;
      if (vatSortKey === "base") return bucket.base_cents;
      if (vatSortKey === "vat") return bucket.vat_cents;
      return bucket.total_cents;
    })
  );

  function sortVatBy(key: VatSortKey) {
    vatSortDirection = nextSortDirection(vatSortKey, key, vatSortDirection);
    vatSortKey = key;
  }

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

<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
  <label class="text-sm w-full sm:w-auto">
    <span class="mb-1 block text-[var(--color-muted)]">Desde</span>
    <input type="date" bind:value={range.from} class="field w-full sm:w-auto" />
  </label>
  <label class="text-sm w-full sm:w-auto">
    <span class="mb-1 block text-[var(--color-muted)]">Hasta</span>
    <input type="date" bind:value={range.to} class="field w-full sm:w-auto" />
  </label>
  <button
    class="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 px-4 py-2 text-sm font-medium text-white sm:w-auto"
    onclick={load}
  >
    Actualizar
  </button>
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
    <KpiCard label="Total facturado" value={formatEUR(summary.total_cents)} accent="emerald" />
  </div>

  <Card lift={false} class="overflow-hidden p-0">
    <table class="w-full text-left text-sm">
      <thead class="border-b border-white/10 text-xs uppercase text-slate-500">
        <tr>
          <SortableHeader label="Tipo" active={vatSortKey === "rate"} direction={vatSortDirection} class="px-4 py-2" onclick={() => sortVatBy("rate")} />
          <SortableHeader label="Base" active={vatSortKey === "base"} direction={vatSortDirection} class="px-4 py-2" onclick={() => sortVatBy("base")} />
          <SortableHeader label="Cuota" active={vatSortKey === "vat"} direction={vatSortDirection} class="px-4 py-2" onclick={() => sortVatBy("vat")} />
          <SortableHeader label="Total" active={vatSortKey === "total"} direction={vatSortDirection} class="px-4 py-2" onclick={() => sortVatBy("total")} />
        </tr>
      </thead>
      <tbody>
        {#each sortedBuckets as b}
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
