<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { api } from "$lib/api/client";
  import type { Customer, Product, Sale, SaleLineInput } from "$lib/types";
  import { formatEUR, parseEurosInput } from "$lib/money";
  import { saleTotals, type LineInput } from "$lib/vat";
  import { clampCartPercent, planCartDiscounts } from "$lib/sales/cart-discount";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Select from "$lib/components/Select.svelte";
  import { showToast } from "$lib/stores/ui";
  import { resolveQuickAdd } from "$lib/pos/quick-add";
  import { downloadCsv, salesToCsv } from "$lib/export/csv";

  let products = $state<Product[]>([]);
  let customers = $state<Customer[]>([]);
  let sales = $state<Sale[]>([]);
  let tab = $state<"tpv" | "historial">("tpv");
  type CartLine = { product: Product; qty: number; discount_cents: number };
  let cart = $state<CartLine[]>([]);
  /** Global cart discount 0–100%, applied after per-line euro discounts. */
  let cartPercent = $state(0);
  let customerId = $state<string>("");
  let notes = $state("");
  let productQuery = $state("");
  let loading = $state(true);
  let submitting = $state(false);
  let selectedSale = $state<Sale | null>(null);

  const filteredProducts = $derived(
    products.filter(
      (p) =>
        p.active &&
        p.stock > 0 &&
        (p.name.toLowerCase().includes(productQuery.toLowerCase()) ||
          p.sku.toLowerCase().includes(productQuery.toLowerCase()))
    )
  );

  const discountPlan = $derived(
    planCartDiscounts(
      cart.map((c) => ({
        unitPriceCents: c.product.price_cents,
        qty: c.qty,
        lineDiscountCents: Math.min(c.discount_cents, c.product.price_cents * c.qty),
      })),
      cartPercent,
    ),
  );

  const cartLines = $derived<LineInput[]>(
    cart.map((c, i) => ({
      qty: c.qty,
      unitPriceCents: c.product.price_cents,
      vatRate: c.product.vat_rate,
      discountCents: discountPlan.lines[i]?.discountCents ?? 0,
    })),
  );

  const totals = $derived(saleTotals(cartLines));
  const totalDiscountCents = $derived(
    discountPlan.lines.reduce((acc, l) => acc + l.discountCents, 0),
  );
  const cartPercentDiscountCents = $derived(discountPlan.cartDiscountTotalCents);

  async function load() {
    loading = true;
    try {
      [products, customers, sales] = await Promise.all([
        api.listProducts(true),
        api.listCustomers(),
        api.listSales(),
      ]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await load();
    // Acceso rápido "Nueva venta": forzar pestaña TPV
    if ($page.url.searchParams.get("nuevo") === "1") {
      tab = "tpv";
    }
  });

  function addToCart(p: Product) {
    const existing = cart.find((c) => c.product.id === p.id);
    if (existing) {
      if (existing.qty >= p.stock) {
        showToast("Sin stock suficiente", "err");
        return;
      }
      cart = cart.map((c) =>
        c.product.id === p.id ? { ...c, qty: c.qty + 1 } : c
      );
    } else {
      cart = [...cart, { product: p, qty: 1, discount_cents: 0 }];
    }
  }

  /** POS barcode-style: Enter on search adds by SKU or sole match. */
  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const r = resolveQuickAdd(productQuery, products);
    if (r.kind === "exact_sku" || r.kind === "sole_match") {
      addToCart(r.product as Product);
      productQuery = "";
      showToast(`Añadido: ${r.product.name}`);
    } else if (r.kind === "ambiguous") {
      showToast(`Hay ${r.count} coincidencias — afina el SKU`, "info");
    } else {
      showToast("Producto no encontrado o sin stock", "err");
    }
  }

  function exportSalesCsv() {
    if (!sales.length) {
      showToast("No hay ventas para exportar", "info");
      return;
    }
    const csv = salesToCsv(sales);
    const day = new Date().toISOString().slice(0, 10);
    downloadCsv(`ventas-${day}.csv`, csv);
    showToast("CSV de ventas descargado");
  }

  function setQty(id: number, qty: number) {
    if (qty <= 0) {
      cart = cart.filter((c) => c.product.id !== id);
      return;
    }
    cart = cart.map((c) => {
      if (c.product.id !== id) return c;
      const nextQty = Math.min(qty, c.product.stock);
      const maxDisc = c.product.price_cents * nextQty;
      return {
        ...c,
        qty: nextQty,
        discount_cents: Math.min(c.discount_cents, maxDisc),
      };
    });
  }

  function setLineDiscountEuros(id: number, raw: string) {
    const cents = parseEurosInput(raw);
    cart = cart.map((c) => {
      if (c.product.id !== id) return c;
      const max = c.product.price_cents * c.qty;
      const disc = cents == null || cents < 0 ? 0 : Math.min(cents, max);
      return { ...c, discount_cents: disc };
    });
  }

  function lineNetCents(c: CartLine, index: number): number {
    return (
      discountPlan.lines[index]?.lineTotalCents ??
      Math.max(0, c.product.price_cents * c.qty - c.discount_cents)
    );
  }

  function setCartPercentRaw(raw: string) {
    const n = Number(String(raw).replace(",", "."));
    cartPercent = clampCartPercent(Number.isFinite(n) ? n : 0);
  }

  async function checkout() {
    if (!cart.length || submitting) return;
    for (const c of cart) {
      if (c.discount_cents > c.product.price_cents * c.qty) {
        showToast(`Descuento inválido en ${c.product.name}`, "err");
        return;
      }
    }
    submitting = true;
    try {
      const plan = planCartDiscounts(
        cart.map((c) => ({
          unitPriceCents: c.product.price_cents,
          qty: c.qty,
          lineDiscountCents: c.discount_cents,
        })),
        cartPercent,
      );
      const lines: SaleLineInput[] = cart.map((c, i) => ({
        product_id: c.product.id,
        qty: c.qty,
        discount_cents:
          (plan.lines[i]?.discountCents ?? 0) > 0
            ? plan.lines[i].discountCents
            : undefined,
      }));
      const sale = await api.createSale(
        lines,
        customerId ? Number(customerId) : null,
        notes,
      );
      showToast(`Venta ${sale.number} registrada`);
      cart = [];
      cartPercent = 0;
      notes = "";
      customerId = "";
      await load();
      tab = "historial";
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al vender", "err");
    } finally {
      submitting = false;
    }
  }

  let cancelling = $state(false);
  let returning = $state(false);
  /** qty to return per line id (historial partial return) */
  let returnQtyByLine = $state<Record<number, number>>({});

  function remainingLineQty(line: {
    id: number;
    qty: number;
    returned_qty?: number;
  }): number {
    return Math.max(0, line.qty - (line.returned_qty ?? 0));
  }

  function syncReturnQtyDefaults(sale: Sale) {
    const next: Record<number, number> = {};
    for (const line of sale.lines ?? []) {
      const rem = remainingLineQty(line);
      next[line.id] = rem > 0 ? 0 : 0;
    }
    returnQtyByLine = next;
  }

  async function openSale(id: number) {
    try {
      selectedSale = await api.getSale(id);
      if (selectedSale) syncReturnQtyDefaults(selectedSale);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }

  async function cancelSelected() {
    if (
      !selectedSale ||
      (selectedSale.status !== "completed" && selectedSale.status !== "partially_returned")
    ) {
      return;
    }
    if (
      !confirm(
        `¿Anular el resto del ticket ${selectedSale.number}? Se restaurará el stock pendiente y se registrará el reembolso en caja.`,
      )
    ) {
      return;
    }
    cancelling = true;
    try {
      selectedSale = await api.cancelSale(selectedSale.id);
      showToast(`Ticket ${selectedSale.number} anulado`);
      syncReturnQtyDefaults(selectedSale);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al anular", "err");
    } finally {
      cancelling = false;
    }
  }

  async function returnSelectedLines() {
    if (!selectedSale) return;
    if (
      selectedSale.status !== "completed" &&
      selectedSale.status !== "partially_returned"
    ) {
      return;
    }
    const lines = (selectedSale.lines ?? [])
      .map((l) => ({
        line_id: l.id,
        qty: Math.min(returnQtyByLine[l.id] ?? 0, remainingLineQty(l)),
      }))
      .filter((r) => r.qty > 0);
    if (!lines.length) {
      showToast("Indica la cantidad a devolver en al menos una línea", "info");
      return;
    }
    if (
      !confirm(
        `¿Devolver ${lines.reduce((a, l) => a + l.qty, 0)} unidad(es) del ticket ${selectedSale.number}?`,
      )
    ) {
      return;
    }
    returning = true;
    try {
      selectedSale = await api.returnSaleLines(selectedSale.id, lines);
      showToast(`Devolución registrada en ${selectedSale.number}`);
      syncReturnQtyDefaults(selectedSale);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al devolver", "err");
    } finally {
      returning = false;
    }
  }
</script>

<div class="mb-4 flex flex-wrap items-center gap-2">
  <Button variant={tab === "tpv" ? "primary" : "secondary"} onclick={() => (tab = "tpv")}>
    TPV
  </Button>
  <Button variant={tab === "historial" ? "primary" : "secondary"} onclick={() => (tab = "historial")}>
    Historial
  </Button>
  {#if tab === "historial"}
    <Button variant="secondary" class="ml-auto" onclick={exportSalesCsv}>Exportar CSV</Button>
  {/if}
</div>

{#if loading}
  <div class="skeleton h-72"></div>
{:else if tab === "tpv"}
  <div class="grid grid-cols-1 gap-4 xl:grid-cols-5">
    <Card class="min-w-0 xl:col-span-3" lift={false}>
      <input
        bind:value={productQuery}
        placeholder="Buscar o escanear SKU… (Enter)"
        class="field mb-1 w-full text-sm"
        onkeydown={onSearchKeydown}
      />
      <p class="mb-3 text-[11px] text-[var(--color-muted-dim)]">
        Enter = añadir por SKU exacto o única coincidencia (estilo pistola código de barras).
      </p>
      <div class="grid max-h-[min(28rem,50vh)] gap-2 overflow-y-auto sm:grid-cols-2">
        {#each filteredProducts as p}
          <button
            class="rounded-xl border border-[var(--color-border)] bg-black/20 p-3 text-left transition hover:border-purple-400/35 hover:bg-purple-500/10"
            onclick={() => addToCart(p)}
          >
            <p class="font-medium text-[var(--color-text)]">{p.name}</p>
            <div class="mt-1 flex flex-wrap items-center justify-between gap-1 text-xs text-[var(--color-muted-dim)]">
              <span class="break-all">{p.sku} · stock {p.stock}</span>
              <span class="tabular text-radiant">{formatEUR(p.price_cents)}</span>
            </div>
            <Badge tone="vat">{p.vat_rate}% IVA</Badge>
          </button>
        {:else}
          <p class="col-span-full py-8 text-center text-sm text-[var(--color-muted-dim)]">
            No hay productos con stock.
          </p>
        {/each}
      </div>
    </Card>

    <Card class="min-w-0 xl:col-span-2" lift={false}>
      <h2 class="mb-3 font-semibold">Carrito</h2>
      {#if cart.length === 0}
        <EmptyState title="Carrito vacío" description="Pulsa un producto para añadirlo." />
      {:else}
        <ul class="mb-3 max-h-56 space-y-2 overflow-y-auto">
          {#each cart as c, i}
            <li class="rounded-xl bg-black/20 px-3 py-2 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <div class="min-w-0 flex-1 basis-[min(100%,10rem)]">
                  <p class="truncate font-medium">{c.product.name}</p>
                  <p class="text-xs tabular text-[var(--color-muted-dim)]">
                    {formatEUR(c.product.price_cents)} · IVA {c.product.vat_rate}%
                  </p>
                </div>
                <label class="flex flex-col gap-0.5 text-[10px] text-[var(--color-muted-dim)]">
                  Uds
                  <input
                    type="number"
                    min="1"
                    max={c.product.stock}
                    value={c.qty}
                    class="field w-14 shrink-0 px-2 py-1 text-center text-sm tabular"
                    oninput={(e) => setQty(c.product.id, Number((e.target as HTMLInputElement).value))}
                  />
                </label>
                <label class="flex flex-col gap-0.5 text-[10px] text-[var(--color-muted-dim)]">
                  Dto. €
                  <input
                    type="text"
                    inputmode="decimal"
                    placeholder="0"
                    value={c.discount_cents ? (c.discount_cents / 100).toFixed(2) : ""}
                    class="field w-16 shrink-0 px-2 py-1 text-center text-sm tabular"
                    onchange={(e) =>
                      setLineDiscountEuros(c.product.id, (e.target as HTMLInputElement).value)}
                    title="Descuento en euros sobre la línea (máx. total línea)"
                  />
                </label>
                <span class="w-20 shrink-0 text-right tabular text-[var(--color-text)]">
                  {formatEUR(lineNetCents(c, i))}
                </span>
              </div>
            </li>
          {/each}
        </ul>

        <label class="mb-2 flex flex-col gap-1 text-xs text-[var(--color-muted)]">
          Descuento carrito %
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={cartPercent || ""}
            placeholder="0"
            class="field w-full max-w-[8rem] text-sm tabular"
            oninput={(e) => setCartPercentRaw((e.target as HTMLInputElement).value)}
            title="Porcentaje sobre el carrito tras descuentos por línea"
            data-cart-percent
          />
        </label>

        <Select
          class="mb-2"
          label="Cliente (opcional)"
          bind:value={customerId}
          placeholder="— Contado —"
          options={[
            { value: "", label: "— Contado —" },
            ...customers.map((c) => ({ value: String(c.id), label: c.name })),
          ]}
        />

        <div class="mb-3 space-y-1 rounded-xl border border-[var(--color-border)] bg-black/30 p-3 text-sm">
          {#if totalDiscountCents > 0}
            <div class="flex justify-between gap-2 text-amber-200/90">
              <span>Descuentos (línea + carrito)</span>
              <span class="tabular">−{formatEUR(totalDiscountCents)}</span>
            </div>
          {/if}
          {#if cartPercentDiscountCents > 0}
            <div class="flex justify-between gap-2 text-xs text-amber-200/70">
              <span>De los cuales carrito {discountPlan.percent}%</span>
              <span class="tabular">−{formatEUR(cartPercentDiscountCents)}</span>
            </div>
          {/if}
          <div class="flex justify-between gap-2 text-[var(--color-muted)]">
            <span>Base imponible</span>
            <span class="tabular">{formatEUR(totals.subtotalCents)}</span>
          </div>
          <div class="flex justify-between gap-2 text-[var(--color-muted)]">
            <span>IVA</span>
            <span class="tabular">{formatEUR(totals.vatCents)}</span>
          </div>
          <div
            class="flex justify-between gap-2 border-t border-[var(--color-border)] pt-2 text-base font-semibold text-radiant"
          >
            <span>Total</span>
            <span class="tabular">{formatEUR(totals.totalCents)}</span>
          </div>
        </div>

        <Button class="w-full" disabled={submitting} onclick={checkout}>
          {submitting ? "Procesando…" : "Cobrar y registrar"}
        </Button>
      {/if}
    </Card>
  </div>
{:else}
  <div class="grid grid-cols-1 gap-4 xl:grid-cols-5">
    <Card class="min-w-0 overflow-hidden p-0 xl:col-span-3" lift={false}>
      {#if sales.length === 0}
        <div class="p-4">
          <EmptyState title="Sin ventas" description="Cuando cobres un ticket aparecerá aquí." />
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full min-w-[28rem] text-left text-sm">
            <thead class="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-dim)]">
              <tr>
                <th class="px-3 py-3 sm:px-4">Ticket</th>
                <th class="px-3 py-3 sm:px-4">Fecha</th>
                <th class="px-3 py-3 sm:px-4">Total</th>
                <th class="px-3 py-3 sm:px-4"></th>
              </tr>
            </thead>
            <tbody>
              {#each sales as s}
                <tr class="border-b border-white/5 hover:bg-purple-500/[0.05]">
                  <td class="px-3 py-3 font-medium sm:px-4">
                    {s.number}
                    {#if s.status === "cancelled"}
                      <Badge tone="danger">anulada</Badge>
                    {:else if s.status === "partially_returned"}
                      <Badge tone="warn">parcial</Badge>
                    {/if}
                  </td>
                  <td class="px-3 py-3 text-[var(--color-muted)] sm:px-4">
                    {new Date(s.sold_at).toLocaleString("es-ES")}
                  </td>
                  <td
                    class="px-3 py-3 tabular sm:px-4 {s.status === 'cancelled'
                      ? 'text-[var(--color-muted-dim)] line-through'
                      : 'text-radiant'}"
                  >
                    {formatEUR(s.total_cents)}
                    {#if (s.refunded_cents ?? 0) > 0 && s.status !== "cancelled"}
                      <span class="mt-0.5 block text-[10px] text-[var(--color-muted-dim)]">
                        −{formatEUR(s.refunded_cents ?? 0)} dev.
                      </span>
                    {/if}
                  </td>
                  <td class="px-3 py-3 text-right sm:px-4">
                    <Button variant="ghost" class="!px-2 !py-1 text-xs" onclick={() => openSale(s.id)}>
                      Ver
                    </Button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card>

    <Card class="min-w-0 xl:col-span-2" lift={false}>
      {#if !selectedSale}
        <p class="text-sm text-[var(--color-muted-dim)]">
          Selecciona un ticket para ver el desglose de IVA.
        </p>
      {:else}
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold">
              {selectedSale.number}
              {#if selectedSale.status === "cancelled"}
                <Badge tone="danger">anulada</Badge>
              {:else if selectedSale.status === "partially_returned"}
                <Badge tone="warn">parcial</Badge>
              {/if}
            </h2>
            <p class="text-xs text-[var(--color-muted-dim)]">
              {new Date(selectedSale.sold_at).toLocaleString("es-ES")}
            </p>
          </div>
          {#if selectedSale.status === "completed" || selectedSale.status === "partially_returned"}
            <div class="flex flex-wrap gap-1.5">
              <Button
                variant="secondary"
                class="!px-2 !py-1 text-xs"
                disabled={returning || cancelling}
                onclick={returnSelectedLines}
              >
                {returning ? "Devolviendo…" : "Devolver líneas"}
              </Button>
              <Button
                variant="danger"
                class="!px-2 !py-1 text-xs"
                disabled={cancelling || returning}
                onclick={cancelSelected}
              >
                {cancelling ? "Anulando…" : "Anular resto"}
              </Button>
            </div>
          {/if}
        </div>
        <ul class="mt-3 space-y-2" data-sale-return-panel>
          {#each selectedSale.lines ?? [] as line}
            {@const rem = remainingLineQty(line)}
            <li class="rounded-xl bg-black/20 px-3 py-2 text-sm">
              <div class="flex flex-wrap justify-between gap-2">
                <span class="min-w-0 break-words"
                  >{line.product_name ?? `Prod #${line.product_id}`} × {line.qty}
                  {#if (line.returned_qty ?? 0) > 0}
                    <span class="text-[var(--color-muted-dim)]"
                      >(dev. {line.returned_qty}, quedan {rem})</span
                    >
                  {/if}
                </span>
                <span class="tabular shrink-0">{formatEUR(line.line_total_cents)}</span>
              </div>
              <p class="text-xs text-[var(--color-muted-dim)]">
                Base {formatEUR(line.line_base_cents)} · IVA {line.vat_rate}%
                {formatEUR(line.line_vat_cents)}
              </p>
              {#if (selectedSale.status === "completed" || selectedSale.status === "partially_returned") && rem > 0}
                <label class="mt-2 flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  <span class="shrink-0">Devolver</span>
                  <input
                    type="number"
                    min="0"
                    max={rem}
                    class="field !w-16 !px-2 !py-1 text-xs"
                    value={returnQtyByLine[line.id] ?? 0}
                    oninput={(e) => {
                      const v = Math.max(
                        0,
                        Math.min(rem, Math.floor(Number((e.currentTarget as HTMLInputElement).value) || 0)),
                      );
                      returnQtyByLine = { ...returnQtyByLine, [line.id]: v };
                    }}
                  />
                  <span class="text-[var(--color-muted-dim)]">/ {rem} ud.</span>
                </label>
              {/if}
            </li>
          {/each}
        </ul>
        <div class="mt-3 space-y-1 border-t border-[var(--color-border)] pt-3 text-sm">
          <div class="flex justify-between text-[var(--color-muted)]">
            <span>Base</span><span class="tabular">{formatEUR(selectedSale.subtotal_cents)}</span>
          </div>
          <div class="flex justify-between text-[var(--color-muted)]">
            <span>IVA</span><span class="tabular">{formatEUR(selectedSale.vat_cents)}</span>
          </div>
          <div class="flex justify-between font-semibold text-radiant">
            <span>Total ticket</span><span class="tabular">{formatEUR(selectedSale.total_cents)}</span>
          </div>
          {#if (selectedSale.refunded_cents ?? 0) > 0}
            <div class="flex justify-between text-sm text-rose-200/90">
              <span>Devuelto</span>
              <span class="tabular">−{formatEUR(selectedSale.refunded_cents ?? 0)}</span>
            </div>
            <div class="flex justify-between font-medium text-[var(--color-text)]">
              <span>Neto</span>
              <span class="tabular">
                {formatEUR(
                  Math.max(0, selectedSale.total_cents - (selectedSale.refunded_cents ?? 0)),
                )}
              </span>
            </div>
          {/if}
        </div>
      {/if}
    </Card>
  </div>
{/if}
