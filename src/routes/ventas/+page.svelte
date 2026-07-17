<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { Customer, Product, Sale, SaleLineInput } from "$lib/types";
  import { formatEUR } from "$lib/money";
  import { saleTotals, type LineInput } from "$lib/vat";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Select from "$lib/components/Select.svelte";
  import { showToast } from "$lib/stores/ui";

  let products = $state<Product[]>([]);
  let customers = $state<Customer[]>([]);
  let sales = $state<Sale[]>([]);
  let tab = $state<"tpv" | "historial">("tpv");
  let cart = $state<{ product: Product; qty: number }[]>([]);
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

  const cartLines = $derived<LineInput[]>(
    cart.map((c) => ({
      qty: c.qty,
      unitPriceCents: c.product.price_cents,
      vatRate: c.product.vat_rate,
    }))
  );

  const totals = $derived(saleTotals(cartLines));

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

  onMount(load);

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
      cart = [...cart, { product: p, qty: 1 }];
    }
  }

  function setQty(id: number, qty: number) {
    if (qty <= 0) {
      cart = cart.filter((c) => c.product.id !== id);
      return;
    }
    cart = cart.map((c) => {
      if (c.product.id !== id) return c;
      return { ...c, qty: Math.min(qty, c.product.stock) };
    });
  }

  async function checkout() {
    if (!cart.length || submitting) return;
    submitting = true;
    try {
      const lines: SaleLineInput[] = cart.map((c) => ({
        product_id: c.product.id,
        qty: c.qty,
      }));
      const sale = await api.createSale(
        lines,
        customerId ? Number(customerId) : null,
        notes
      );
      showToast(`Venta ${sale.number} registrada`);
      cart = [];
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

  async function openSale(id: number) {
    try {
      selectedSale = await api.getSale(id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }
</script>

<div class="mb-4 flex flex-wrap gap-2">
  <Button variant={tab === "tpv" ? "primary" : "secondary"} onclick={() => (tab = "tpv")}>
    TPV
  </Button>
  <Button variant={tab === "historial" ? "primary" : "secondary"} onclick={() => (tab = "historial")}>
    Historial
  </Button>
</div>

{#if loading}
  <div class="skeleton h-72"></div>
{:else if tab === "tpv"}
  <div class="grid grid-cols-1 gap-4 xl:grid-cols-5">
    <Card class="min-w-0 xl:col-span-3" lift={false}>
      <input
        bind:value={productQuery}
        placeholder="Buscar producto…"
        class="field mb-3 w-full text-sm"
      />
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
        <ul class="mb-3 max-h-52 space-y-2 overflow-y-auto">
          {#each cart as c}
            <li class="flex flex-wrap items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-sm">
              <div class="min-w-0 flex-1 basis-[min(100%,10rem)]">
                <p class="truncate font-medium">{c.product.name}</p>
                <p class="text-xs tabular text-[var(--color-muted-dim)]">
                  {formatEUR(c.product.price_cents)} · IVA {c.product.vat_rate}%
                </p>
              </div>
              <input
                type="number"
                min="1"
                max={c.product.stock}
                value={c.qty}
                class="field w-14 shrink-0 px-2 py-1 text-center tabular"
                oninput={(e) => setQty(c.product.id, Number((e.target as HTMLInputElement).value))}
              />
              <span class="w-20 shrink-0 text-right tabular text-[var(--color-text)]">
                {formatEUR(c.product.price_cents * c.qty)}
              </span>
            </li>
          {/each}
        </ul>

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
                  <td class="px-3 py-3 font-medium sm:px-4">{s.number}</td>
                  <td class="px-3 py-3 text-[var(--color-muted)] sm:px-4">
                    {new Date(s.sold_at).toLocaleString("es-ES")}
                  </td>
                  <td class="px-3 py-3 tabular text-radiant sm:px-4">{formatEUR(s.total_cents)}</td>
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
        <h2 class="font-semibold">{selectedSale.number}</h2>
        <p class="text-xs text-[var(--color-muted-dim)]">
          {new Date(selectedSale.sold_at).toLocaleString("es-ES")}
        </p>
        <ul class="mt-3 space-y-2">
          {#each selectedSale.lines ?? [] as line}
            <li class="rounded-xl bg-black/20 px-3 py-2 text-sm">
              <div class="flex flex-wrap justify-between gap-2">
                <span class="min-w-0 break-words"
                  >{line.product_name ?? `Prod #${line.product_id}`} × {line.qty}</span
                >
                <span class="tabular shrink-0">{formatEUR(line.line_total_cents)}</span>
              </div>
              <p class="text-xs text-[var(--color-muted-dim)]">
                Base {formatEUR(line.line_base_cents)} · IVA {line.vat_rate}%
                {formatEUR(line.line_vat_cents)}
              </p>
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
            <span>Total</span><span class="tabular">{formatEUR(selectedSale.total_cents)}</span>
          </div>
        </div>
      {/if}
    </Card>
  </div>
{/if}
