<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { api } from "$lib/api/client";
  import type { Product, ProductInput } from "$lib/types";
  import { formatEUR, parseEurosInput } from "$lib/money";
  import { VAT_RATES, vatLabel, type VatRate } from "$lib/vat";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Input from "$lib/components/Input.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Select from "$lib/components/Select.svelte";
  import { showToast } from "$lib/stores/ui";
  import {
    parseProductCsv,
    productCsvTemplate,
    productsToCsv,
  } from "$lib/import/product-csv";
  import { downloadCsv } from "$lib/export/csv";
  import { estimateDaysOfCover, qtySoldForProduct } from "$lib/inventory/stock-cover";
  import { countsInBusinessTotals } from "$lib/sales/cancel-sale";

  let products = $state<Product[]>([]);
  /** product_id → units sold (net) last 14 days */
  let sold14d = $state<Record<number, number>>({});
  let query = $state("");
  let categoryFilter = $state("");
  let loading = $state(true);
  let importing = $state(false);
  let modalOpen = $state(false);
  let stockModal = $state(false);
  let editing = $state<Product | null>(null);
  let stockTarget = $state<Product | null>(null);
  let stockDelta = $state("1");
  let stockReason = $state("Reposición");
  let fileInput: HTMLInputElement | undefined = $state();

  let form = $state({
    sku: "",
    name: "",
    description: "",
    category: "",
    stock: "0",
    min_stock: "5",
    cost: "",
    price: "",
    vat_rate: "21" as string,
  });

  const categories = $derived(
    [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "es")
    )
  );

  const filtered = $derived(
    products.filter((p) => {
      const q = query.toLowerCase();
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q);
      const matchCat = !categoryFilter || p.category === categoryFilter;
      return matchQ && matchCat;
    })
  );

  const HORIZON_DAYS = 14;

  async function loadSoldMap() {
    try {
      const sales = await api.listSales();
      const cutoff = Date.now() - HORIZON_DAYS * 86400000;
      const recent = sales
        .filter(
          (s) =>
            countsInBusinessTotals(s.status) && new Date(s.sold_at).getTime() >= cutoff,
        )
        .slice(0, 80);
      const lines: { product_id: number; qty: number; returned_qty?: number }[] = [];
      for (const s of recent) {
        try {
          const detail = await api.getSale(s.id);
          if (detail.lines) {
            for (const l of detail.lines) {
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
      for (const p of products) {
        map[p.id] = qtySoldForProduct(lines, p.id);
      }
      sold14d = map;
    } catch {
      sold14d = {};
    }
  }

  function coverFor(p: Product) {
    return estimateDaysOfCover({
      stock: p.stock,
      qtySoldInHorizon: sold14d[p.id] ?? 0,
      horizonDays: HORIZON_DAYS,
    });
  }

  async function load() {
    loading = true;
    try {
      products = await api.listProducts(false);
      await loadSoldMap();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await load();
    if ($page.url.searchParams.get("nuevo") === "1") {
      openCreate();
    }
  });

  function openCreate() {
    editing = null;
    form = {
      sku: "",
      name: "",
      description: "",
      category: "",
      stock: "0",
      min_stock: "5",
      cost: "",
      price: "",
      vat_rate: "21",
    };
    modalOpen = true;
  }

  function openEdit(p: Product) {
    editing = p;
    form = {
      sku: p.sku,
      name: p.name,
      description: p.description,
      category: p.category || "",
      stock: String(p.stock),
      min_stock: String(p.min_stock),
      cost: (p.cost_cents / 100).toFixed(2),
      price: (p.price_cents / 100).toFixed(2),
      vat_rate: String(p.vat_rate),
    };
    modalOpen = true;
  }

  async function saveProduct() {
    const cost = parseEurosInput(form.cost);
    const price = parseEurosInput(form.price);
    if (cost === null || price === null) {
      showToast("Precio o coste no válidos", "err");
      return;
    }
    const input: ProductInput = {
      id: editing?.id,
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description,
      category: form.category.trim(),
      stock: Number(form.stock) || 0,
      min_stock: Number(form.min_stock) || 0,
      cost_cents: cost,
      price_cents: price,
      vat_rate: Number(form.vat_rate) as VatRate,
      active: true,
    };
    try {
      await api.upsertProduct(input);
      modalOpen = false;
      showToast(editing ? "Producto actualizado" : "Producto creado");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }

  function openStock(p: Product) {
    stockTarget = p;
    stockDelta = "1";
    stockReason = "Reposición";
    stockModal = true;
  }

  async function applyStock() {
    if (!stockTarget) return;
    const delta = Number(stockDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      showToast("Delta no válido", "err");
      return;
    }
    try {
      await api.adjustStock(stockTarget.id, delta, stockReason || "Ajuste");
      stockModal = false;
      showToast("Stock actualizado");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }

  function downloadTemplate() {
    downloadCsv("plantilla-productos.csv", productCsvTemplate());
  }

  function exportCatalog() {
    downloadCsv(
      `productos-${new Date().toISOString().slice(0, 10)}.csv`,
      productsToCsv(products),
    );
  }

  function triggerImport() {
    fileInput?.click();
  }

  async function onImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    importing = true;
    try {
      const text = await file.text();
      const parsed = parseProductCsv(text, products);
      if (parsed.errors.length && !parsed.rows.length) {
        showToast(parsed.errors[0]?.message || "CSV no válido", "err");
        return;
      }
      if (parsed.errors.length) {
        showToast(
          `${parsed.errors.length} fila(s) con error. Primera: ${parsed.errors[0].message}`,
          "err",
        );
        return;
      }
      if (!parsed.rows.length) {
        showToast("No hay filas de producto en el CSV", "err");
        return;
      }
      let ok = 0;
      for (const row of parsed.rows) {
        await api.upsertProduct(row);
        ok += 1;
      }
      showToast(
        `Importación OK: ${ok} producto(s) (${parsed.would_create} nuevos, ${parsed.would_update} actualizados)`,
      );
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al importar", "err");
    } finally {
      importing = false;
    }
  }
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".csv,text/csv"
  class="hidden"
  onchange={onImportFile}
/>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <input
    bind:value={query}
    placeholder="Buscar nombre, SKU o categoría…"
    class="field w-full max-w-sm text-sm"
  />
  <Select
    class="w-full max-w-[12rem]"
    bind:value={categoryFilter}
    placeholder="Todas las categorías"
    options={[
      { value: "", label: "Todas las categorías" },
      ...categories.map((c) => ({ value: c, label: c })),
    ]}
  />
  <div class="ml-auto flex flex-wrap gap-2">
    <Button variant="secondary" onclick={downloadTemplate} disabled={importing}>
      Plantilla CSV
    </Button>
    <Button variant="secondary" onclick={exportCatalog} disabled={importing || !products.length}>
      Exportar CSV
    </Button>
    <Button variant="secondary" onclick={triggerImport} disabled={importing}>
      {importing ? "Importando…" : "Importar CSV"}
    </Button>
    <Button onclick={openCreate}>+ Nuevo producto</Button>
  </div>
</div>

{#if loading}
  <div class="skeleton h-64"></div>
{:else if filtered.length === 0}
  <EmptyState title="Sin productos" description="Crea tu primer producto para empezar a vender.">
    <Button onclick={openCreate}>Crear producto</Button>
  </EmptyState>
{:else}
  <Card lift={false} class="overflow-hidden p-0">
    <div class="w-full max-w-full overflow-x-auto">
      <table class="w-full min-w-[36rem] text-left text-sm">
        <thead class="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">Producto</th>
            <th class="px-4 py-3 font-medium">Categoría</th>
            <th class="px-4 py-3 font-medium">Stock</th>
            <th class="px-4 py-3 font-medium">Cobertura</th>
            <th class="px-4 py-3 font-medium">PVP</th>
            <th class="px-4 py-3 font-medium">IVA</th>
            <th class="px-4 py-3 font-medium">Coste</th>
            <th class="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as p}
            {@const cover = coverFor(p)}
            <tr class="border-b border-white/5 transition hover:bg-white/[0.03]">
              <td class="px-4 py-3">
                <p class="font-medium text-slate-100">{p.name}</p>
                <p class="text-xs text-slate-500">{p.sku}</p>
              </td>
              <td class="px-4 py-3 text-sm text-[var(--color-muted)]">
                {p.category || "—"}
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="tabular {p.stock <= p.min_stock ? 'text-rose-300' : 'text-slate-200'}">
                    {p.stock}
                  </span>
                  {#if p.stock <= p.min_stock}
                    <Badge tone="warn">bajo</Badge>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3 text-xs">
                <span
                  class="tabular {cover.label === 'critical'
                    ? 'text-rose-300'
                    : cover.label === 'watch'
                      ? 'text-amber-200'
                      : 'text-[var(--color-muted-dim)]'}"
                  title="Estimación a ritmo de ventas de los últimos {HORIZON_DAYS} días"
                >
                  {cover.display}
                </span>
              </td>
              <td class="px-4 py-3 tabular">{formatEUR(p.price_cents)}</td>
              <td class="px-4 py-3">
                <Badge tone="vat">{p.vat_rate}%</Badge>
              </td>
              <td class="px-4 py-3 tabular text-slate-400">{formatEUR(p.cost_cents)}</td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-1">
                  <Button variant="ghost" class="!px-2 !py-1 text-xs" onclick={() => openStock(p)}>
                    Stock
                  </Button>
                  <Button variant="secondary" class="!px-2 !py-1 text-xs" onclick={() => openEdit(p)}>
                    Editar
                  </Button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
{/if}

<Modal open={modalOpen} title={editing ? "Editar producto" : "Nuevo producto"} onclose={() => (modalOpen = false)}>
  <form
    class="grid gap-3"
    onsubmit={(e) => {
      e.preventDefault();
      saveProduct();
    }}
  >
    <div class="grid gap-3 sm:grid-cols-2">
      <Input label="SKU" bind:value={form.sku} required />
      <Select
        label="IVA"
        bind:value={form.vat_rate}
        options={VAT_RATES.map((r) => ({ value: String(r), label: vatLabel(r) }))}
      />
    </div>
    <Input label="Nombre" bind:value={form.name} required />
    <Input label="Categoría" bind:value={form.category} placeholder="Alimentación, Tecnología…" />
    <Input label="Descripción" bind:value={form.description} />
    <div class="grid gap-3 sm:grid-cols-2">
      <Input label="PVP (€, IVA incl.)" bind:value={form.price} required />
      <Input label="Coste (€)" bind:value={form.cost} required />
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <Input label="Stock" type="number" bind:value={form.stock} />
      <Input label="Stock mínimo" type="number" bind:value={form.min_stock} />
    </div>
    <div class="mt-2 flex justify-end gap-2">
      <Button variant="ghost" type="button" onclick={() => (modalOpen = false)}>Cancelar</Button>
      <Button type="submit">Guardar</Button>
    </div>
  </form>
</Modal>

<Modal open={stockModal} title="Ajustar stock" onclose={() => (stockModal = false)}>
  {#if stockTarget}
    <p class="mb-3 text-sm text-slate-400">
      {stockTarget.name} · actual <span class="tabular text-slate-200">{stockTarget.stock}</span>
    </p>
    <form
      class="grid gap-3"
      onsubmit={(e) => {
        e.preventDefault();
        applyStock();
      }}
    >
      <Input label="Delta (+ entrada / − salida)" bind:value={stockDelta} />
      <Input label="Motivo" bind:value={stockReason} />
      <div class="flex justify-end gap-2">
        <Button variant="ghost" type="button" onclick={() => (stockModal = false)}>Cancelar</Button>
        <Button type="submit">Aplicar</Button>
      </div>
    </form>
  {/if}
</Modal>
