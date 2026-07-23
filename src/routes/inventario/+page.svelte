<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { api } from "$lib/api/client";
  import type { FulfillmentMode, Product, ProductCondition, ProductInput, Supplier, SupplierInput } from "$lib/types";
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
  import { downloadCsv, reorderSuggestionsToCsv } from "$lib/export/csv";
  import { estimateDaysOfCover, qtySoldForProduct } from "$lib/inventory/stock-cover";
  import { countsInBusinessTotals } from "$lib/sales/cancel-sale";
  import { planReorderSuggestions } from "$lib/inventory/reorder";
  import {
    LEGACY_SUPPLIER,
    NO_SUPPLIER,
    productSupplierSelection,
    supplierSnapshotForSelection,
  } from "$lib/inventory/supplier-selection";

  let products = $state<Product[]>([]);
  let suppliers = $state<Supplier[]>([]);
  let inventoryTab = $state<"products" | "suppliers">("products");
  let supplierModal = $state(false);
  let editingSupplier = $state<Supplier | null>(null);
  let selectedSupplier = $state(NO_SUPPLIER);
  let returnToProductAfterSupplier = $state(false);
  let supplierForm = $state({ name: "", contact: "", email: "", phone: "", ordering_method: "email", notes: "" });
  /** product_id → units sold (net) last 14 days */
  let sold14d = $state<Record<number, number>>({});
  let query = $state("");
  let categoryFilter = $state("");
  let supplyFilter = $state("");
  let conditionFilter = $state("");
  let loading = $state(true);
  let importing = $state(false);
  let modalOpen = $state(false);
  let stockModal = $state(false);
  let editing = $state<Product | null>(null);
  let stockTarget = $state<Product | null>(null);
  let stockDelta = $state("1");
  let stockReason = $state("Reposición");
  let fileInput: HTMLInputElement | undefined = $state();
  let showReorder = $state(false);
  let reorderQty = $state<Record<number, number>>({});

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
    supplier_name: "",
    supplier_contact: "",
    supplier_email: "",
    supplier_phone: "",
    fulfillment_mode: "own_stock" as FulfillmentMode,
    stock_location: "Almacén principal",
    condition_code: "new" as ProductCondition,
  });

  const fulfillmentOptions = [
    { value: "own_stock", label: "Almacén propio" },
    { value: "supplier_dropship", label: "Proveedor · dropshipping" },
    { value: "third_party_fulfillment", label: "3PL / almacén externo" },
    { value: "make_to_order", label: "Bajo pedido" },
  ];
  const conditionOptions = [
    { value: "new", label: "Nuevo" },
    { value: "open_box", label: "Caja abierta" },
    { value: "refurbished", label: "Reacondicionado" },
    { value: "used", label: "Usado" },
    { value: "preowned", label: "Usado" },
    { value: "for_parts", label: "Para piezas" },
  ];

  const activeSuppliers = $derived(suppliers.filter((supplier) => supplier.active));
  const selectedSupplierRecord = $derived(
    activeSuppliers.find((supplier) => String(supplier.id) === selectedSupplier) ?? null,
  );
  const supplierOptions = $derived([
    { value: NO_SUPPLIER, label: "Sin proveedor", hint: "El artículo se abastece sin un contacto asociado" },
    ...activeSuppliers.map((supplier) => ({
      value: String(supplier.id),
      label: supplier.name,
      hint: supplier.contact || supplier.email || supplier.phone || "Proveedor guardado",
    })),
    ...(selectedSupplier === LEGACY_SUPPLIER
      ? [{
          value: LEGACY_SUPPLIER,
          label: `${form.supplier_name || "Proveedor anterior"} · histórico`,
          hint: "No está en el directorio actual; elige otro para sustituirlo",
        }]
      : []),
  ]);

  function fulfillmentLabel(mode?: string) {
    return fulfillmentOptions.find((item) => item.value === mode)?.label ?? "Almacén propio";
  }

  function conditionLabel(condition?: string) {
    return conditionOptions.find((item) => item.value === condition)?.label ?? "Usado";
  }

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
        (p.category || "").toLowerCase().includes(q) ||
        (p.supplier_name || "").toLowerCase().includes(q) ||
        (p.supplier_contact || "").toLowerCase().includes(q);
      const matchCat = !categoryFilter || p.category === categoryFilter;
      const matchSupply = !supplyFilter || (p.fulfillment_mode ?? "own_stock") === supplyFilter;
      const normalizedCondition = p.condition_code === "preowned" ? "used" : (p.condition_code ?? "used");
      const matchCondition = !conditionFilter || normalizedCondition === conditionFilter;
      return matchQ && matchCat && matchSupply && matchCondition;
    })
  );

  const HORIZON_DAYS = 14;
  const reorderSuggestions = $derived(planReorderSuggestions(products, sold14d, HORIZON_DAYS));

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
      suppliers = await api.listSuppliers();
      await loadSoldMap();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    } finally {
      loading = false;
    }
  }

  function openSupplier(s?: Supplier) {
    editingSupplier = s ?? null;
    supplierForm = s ? { name: s.name, contact: s.contact, email: s.email, phone: s.phone, ordering_method: s.ordering_method, notes: s.notes } : { name: "", contact: "", email: "", phone: "", ordering_method: "email", notes: "" };
    supplierModal = true;
  }

  function closeSupplierModal() {
    supplierModal = false;
    if (returnToProductAfterSupplier) {
      returnToProductAfterSupplier = false;
      modalOpen = true;
    }
  }

  function openSupplierFromProduct() {
    modalOpen = false;
    returnToProductAfterSupplier = true;
    openSupplier();
  }

  function chooseSupplier(value: string) {
    selectedSupplier = value;
    const snapshot = supplierSnapshotForSelection(value, suppliers, form);
    form.supplier_name = snapshot.supplier_name ?? "";
    form.supplier_contact = snapshot.supplier_contact ?? "";
    form.supplier_email = snapshot.supplier_email ?? "";
    form.supplier_phone = snapshot.supplier_phone ?? "";
  }

  async function saveSupplier() {
    if (!supplierForm.name.trim()) return showToast("El nombre del proveedor es obligatorio", "err");
    try {
      const saved = await api.upsertSupplier({ id: editingSupplier?.id, ...supplierForm });
      const shouldReturnToProduct = returnToProductAfterSupplier;
      supplierModal = false;
      returnToProductAfterSupplier = false;
      showToast(editingSupplier ? "Proveedor actualizado" : "Proveedor creado");
      await load();
      if (shouldReturnToProduct) {
        chooseSupplier(String(saved.id));
        modalOpen = true;
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }

  onMount(async () => {
    await load();
    if ($page.url.searchParams.get("nuevo") === "1") {
      openCreate();
    }
    showReorder = $page.url.searchParams.get("reponer") === "1";
  });

  function reorderQuantity(suggestion: (typeof reorderSuggestions)[number]) {
    return reorderQty[suggestion.product_id] ?? suggestion.qty_suggested;
  }

  function exportReorder() {
    const rows = reorderSuggestions
      .map((suggestion) => ({ ...suggestion, qty_suggested: Math.max(0, Math.trunc(reorderQuantity(suggestion))) }))
      .filter((suggestion) => suggestion.qty_suggested > 0);
    if (!rows.length) {
      showToast("No hay líneas de reposición para exportar", "info");
      return;
    }
    downloadCsv(`pedido-proveedor-${new Date().toISOString().slice(0, 10)}.csv`, reorderSuggestionsToCsv(rows));
  }

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
      supplier_name: "",
      supplier_contact: "",
      supplier_email: "",
      supplier_phone: "",
      fulfillment_mode: "own_stock",
      stock_location: "Almacén principal",
      condition_code: "new",
    };
    selectedSupplier = NO_SUPPLIER;
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
      supplier_name: p.supplier_name ?? "",
      supplier_contact: p.supplier_contact ?? "",
      supplier_email: p.supplier_email ?? "",
      supplier_phone: p.supplier_phone ?? "",
      fulfillment_mode: p.fulfillment_mode ?? "own_stock",
      stock_location: p.stock_location ?? "Almacén principal",
      condition_code: p.condition_code === "preowned" ? "used" : (p.condition_code ?? "used"),
    };
    selectedSupplier = productSupplierSelection(p, suppliers);
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
      supplier_name: form.supplier_name.trim(),
      supplier_contact: form.supplier_contact.trim(),
      supplier_email: form.supplier_email.trim(),
      supplier_phone: form.supplier_phone.trim(),
      fulfillment_mode: form.fulfillment_mode,
      stock_location: form.stock_location.trim(),
      condition_code: form.condition_code,
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

<section class="inventory-page workspace-page">
<div class="workspace-intro workspace-intro-compact">
  <p class="workspace-index">02 / INVENTARIO</p>
  <div class="workspace-intro-row">
    <h2>Todo en su sitio,<br /><em>antes de faltar.</em></h2>
    <p>Catálogo, proveedores y reposición reunidos en una única vista de trabajo.</p>
  </div>
</div>

<div class="workspace-tabs mb-5 flex gap-2">
  <Button variant={inventoryTab === "products" ? "primary" : "ghost"} onclick={() => (inventoryTab = "products")}>Productos</Button>
  <Button variant={inventoryTab === "suppliers" ? "primary" : "ghost"} onclick={() => (inventoryTab = "suppliers")}>Proveedores {suppliers.length ? `(${suppliers.length})` : ""}</Button>
</div>

{#if inventoryTab === "suppliers"}
  <Card lift={false} class="overflow-hidden p-0">
    <div class="flex items-center justify-between gap-3 border-b border-[var(--color-border-soft)] p-4">
      <div><h2 class="font-semibold text-[var(--color-text)]">Proveedores</h2><p class="text-xs text-[var(--color-muted)]">Contactos y canal directo para pedidos.</p></div>
      <Button onclick={() => openSupplier()}>+ Nuevo proveedor</Button>
    </div>
    {#if !suppliers.length}
      <p class="p-6 text-sm text-[var(--color-muted)]">Aún no hay proveedores. Crea el primero para reutilizar sus datos en el catálogo.</p>
    {:else}
      <div class="overflow-x-auto"><table class="w-full min-w-[44rem] text-left text-sm"><thead class="border-b border-[var(--color-border-soft)] text-xs uppercase text-[var(--color-muted-dim)]"><tr><th class="px-4 py-3">Proveedor</th><th class="px-4 py-3">Contacto</th><th class="px-4 py-3">Pedido</th><th class="px-4 py-3">Notas</th><th></th></tr></thead><tbody>{#each suppliers as supplier (supplier.id)}<tr class="border-b border-[var(--color-border-soft)]"><td class="px-4 py-3 font-medium text-[var(--color-text)]">{supplier.name}</td><td class="px-4 py-3 text-[var(--color-muted)]"><p>{supplier.contact || "—"}</p><p class="text-xs">{supplier.email || supplier.phone || ""}</p></td><td class="px-4 py-3 text-[var(--color-muted)]">{supplier.ordering_method}</td><td class="max-w-56 truncate px-4 py-3 text-xs text-[var(--color-muted)]">{supplier.notes || "—"}</td><td class="px-4 py-3"><Button variant="secondary" class="!px-2 !py-1 text-xs" onclick={() => openSupplier(supplier)}>Editar</Button></td></tr>{/each}</tbody></table></div>
    {/if}
  </Card>
{:else}
<div class="workspace-toolbar mb-5 flex flex-wrap items-center gap-3">
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
  <Select
    class="w-full max-w-[13rem]"
    bind:value={supplyFilter}
    options={[{ value: "", label: "Todo abastecimiento" }, ...fulfillmentOptions]}
  />
  <Select
    class="w-full max-w-[11rem]"
    bind:value={conditionFilter}
    options={[{ value: "", label: "Todo estado" }, ...conditionOptions.filter((item) => item.value !== "preowned")]}
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
    <Button variant={showReorder ? "primary" : "secondary"} onclick={() => (showReorder = !showReorder)}>
      Reponer {reorderSuggestions.length ? `(${reorderSuggestions.length})` : ""}
    </Button>
    <Button onclick={openCreate}>+ Nuevo producto</Button>
  </div>
</div>

{#if showReorder && !loading}
  <Card class="mb-4 border border-amber-400/25 bg-amber-500/[0.06]" lift={false} data-reorder-panel>
    <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="section-label mb-1 !text-amber-200">Reposición sugerida</p>
        <h2 class="text-base font-semibold text-[var(--color-text)]">Pedido local para proveedor</h2>
        <p class="mt-1 text-xs text-[var(--color-muted)]">Calculado con stock mínimo y ventas netas de los últimos {HORIZON_DAYS} días. Edita cantidades antes de exportar.</p>
      </div>
      <Button variant="secondary" onclick={exportReorder} disabled={!reorderSuggestions.length}>Exportar pedido CSV</Button>
    </div>
    {#if !reorderSuggestions.length}
      <p class="text-sm text-[var(--color-muted)]">No hay productos que requieran reposición ahora.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full min-w-[38rem] text-left text-sm">
          <thead class="border-b border-[var(--color-border-soft)] text-xs uppercase text-[var(--color-muted-dim)]">
            <tr><th class="py-2 pr-3">Producto</th><th class="py-2 pr-3">Stock</th><th class="py-2 pr-3">Cobertura</th><th class="py-2 pr-3">Prioridad</th><th class="py-2 text-right">Pedir</th></tr>
          </thead>
          <tbody>
            {#each reorderSuggestions as suggestion (suggestion.product_id)}
              <tr class="border-b border-[var(--color-border-soft)] last:border-0">
                <td class="py-2.5 pr-3"><p class="font-medium text-[var(--color-text)]">{suggestion.name}</p><p class="text-xs text-[var(--color-muted-dim)]">{suggestion.sku}</p></td>
                <td class="py-2.5 pr-3 tabular">{suggestion.stock} <span class="text-xs text-[var(--color-muted-dim)]">/ mín {suggestion.min_stock}</span></td>
                <td class="py-2.5 pr-3 tabular">{suggestion.days_of_cover === null ? "sin ventas" : `~${suggestion.days_of_cover} d`}</td>
                <td class="py-2.5 pr-3"><Badge tone={suggestion.priority === "critical" ? "danger" : "warn"}>{suggestion.priority === "critical" ? "crítico" : "vigilar"}</Badge></td>
                <td class="py-2.5 text-right"><input class="field w-20 py-1 text-right tabular" type="number" min="0" value={reorderQuantity(suggestion)} oninput={(event) => { reorderQty = { ...reorderQty, [suggestion.product_id]: Number((event.currentTarget as HTMLInputElement).value) || 0 }; }} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Card>
{/if}
{/if}

{#if inventoryTab === "products"}
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
        <thead class="border-b border-[var(--color-border-soft)] text-xs uppercase tracking-wide text-[var(--color-muted-dim)]">
          <tr>
            <th class="px-4 py-3 font-medium">Producto</th>
            <th class="px-4 py-3 font-medium">Categoría</th>
            <th class="px-4 py-3 font-medium">Proveedor / contacto</th>
            <th class="px-4 py-3 font-medium">Abastecimiento</th>
            <th class="px-4 py-3 font-medium">Estado</th>
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
            <tr class="border-b border-[var(--color-border-soft)] transition hover:bg-[var(--color-purple-mist)]">
              <td class="px-4 py-3">
                <p class="font-medium text-[var(--color-text)]">{p.name}</p>
                <p class="text-xs text-[var(--color-muted-dim)]">{p.sku}</p>
              </td>
              <td class="px-4 py-3 text-sm text-[var(--color-muted)]">
                {p.category || "—"}
              </td>
              <td class="px-4 py-3">
                <p class="text-sm text-[var(--color-text)]">{p.supplier_name || "Sin proveedor"}</p>
                {#if p.supplier_contact || p.supplier_email || p.supplier_phone}
                  <p class="max-w-44 truncate text-xs text-[var(--color-muted-dim)]" title={p.supplier_email || p.supplier_phone || p.supplier_contact}>
                    {p.supplier_contact || p.supplier_email || p.supplier_phone}
                  </p>
                {/if}
              </td>
              <td class="px-4 py-3 text-xs text-[var(--color-muted)]">{fulfillmentLabel(p.fulfillment_mode)}</td>
              <td class="px-4 py-3"><Badge tone={p.condition_code === "new" ? "ok" : p.condition_code === "for_parts" ? "danger" : "warn"}>{conditionLabel(p.condition_code)}</Badge></td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="tabular {p.stock <= p.min_stock ? 'text-rose-300' : 'text-[var(--color-text)]'}">
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
              <td class="px-4 py-3 tabular text-[var(--color-muted)]">{formatEUR(p.cost_cents)}</td>
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
{/if}

</section>

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
    <div class="mt-2 border-t border-[var(--color-border-soft)] pt-3">
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-dim)]">Abastecimiento y estado</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <Select label="Cómo se sirve" bind:value={form.fulfillment_mode} options={fulfillmentOptions} />
        <Select label="Condición" bind:value={form.condition_code} options={conditionOptions.filter((item) => item.value !== "preowned")} />
        <div class="grid gap-2 sm:col-span-2">
          <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
            <Select
              class="min-w-0 flex-1"
              label="Proveedor guardado"
              value={selectedSupplier}
              options={supplierOptions}
              onvaluechange={chooseSupplier}
            />
            <Button type="button" variant="secondary" class="w-full shrink-0 sm:w-auto" onclick={openSupplierFromProduct}>
              + Nuevo proveedor
            </Button>
          </div>
          {#if selectedSupplierRecord}
            <div class="rounded-xl border border-[var(--color-border-soft)] bg-white/[0.025] px-3 py-2.5 text-xs text-[var(--color-muted)]">
              <p class="font-medium text-[var(--color-text)]">{selectedSupplierRecord.name}</p>
              <p class="mt-1">
                {[selectedSupplierRecord.contact, selectedSupplierRecord.email, selectedSupplierRecord.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
              </p>
            </div>
          {:else if selectedSupplier === LEGACY_SUPPLIER}
            <p class="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-100">
              Este artículo conserva un proveedor histórico que no está en el directorio. Puedes mantenerlo o elegir uno de la lista.
            </p>
          {:else if activeSuppliers.length === 0}
            <p class="text-xs text-[var(--color-muted-dim)]">Aún no hay proveedores guardados. Créalo aquí y volverás al artículo sin perder los datos.</p>
          {/if}
        </div>
        <Input label="Ubicación / origen" bind:value={form.stock_location} placeholder="Almacén principal, proveedor…" />
      </div>
      {#if form.fulfillment_mode === "supplier_dropship"}
        <p class="mt-2 text-xs text-amber-200">Dropshipping: el proveedor envía al cliente; no uses este dato como stock propio disponible.</p>
      {/if}
    </div>
    <div class="mt-2 flex justify-end gap-2">
      <Button variant="ghost" type="button" onclick={() => (modalOpen = false)}>Cancelar</Button>
      <Button type="submit">Guardar</Button>
    </div>
  </form>
</Modal>

<Modal open={supplierModal} title={editingSupplier ? "Editar proveedor" : "Nuevo proveedor"} onclose={closeSupplierModal}>
  <form class="grid gap-3" onsubmit={(e) => { e.preventDefault(); saveSupplier(); }}>
    <Input label="Proveedor" bind:value={supplierForm.name} required placeholder="Empresa o profesional" />
    <div class="grid gap-3 sm:grid-cols-2"><Input label="Contacto directo" bind:value={supplierForm.contact} /><Select label="Canal de pedido" bind:value={supplierForm.ordering_method} options={[{value:"email",label:"Email"},{value:"phone",label:"Teléfono"},{value:"portal",label:"Portal"},{value:"manual",label:"Manual"}]} /></div>
    <div class="grid gap-3 sm:grid-cols-2"><Input label="Email" type="email" bind:value={supplierForm.email} /><Input label="Teléfono" bind:value={supplierForm.phone} /></div>
    <Input label="Notas" bind:value={supplierForm.notes} placeholder="Plazos, condiciones o referencia de cuenta" />
    <div class="mt-2 flex justify-end gap-2"><Button variant="ghost" type="button" onclick={closeSupplierModal}>Cancelar</Button><Button type="submit">Guardar proveedor</Button></div>
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
