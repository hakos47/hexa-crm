<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { api } from "$lib/api/client";
  import type { Customer, Sale } from "$lib/types";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import Input from "$lib/components/Input.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import { showToast } from "$lib/stores/ui";
  import { customerMetrics } from "$lib/customers/metrics";
  import { formatEUR } from "$lib/money";
  import Badge from "$lib/components/Badge.svelte";

  let customers = $state<Customer[]>([]);
  let query = $state("");
  let loading = $state(true);
  let open = $state(false);
  let sales = $state<Sale[]>([]);

  const filtered = $derived(
    customers.filter((c) => {
      const q = query.toLowerCase().trim();
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.nif.toLowerCase().includes(q)
      );
    })
  );
  const metrics = $derived(customerMetrics(customers, sales));
  let editing = $state<Customer | null>(null);
  let form = $state({ name: "", email: "", phone: "", nif: "", notes: "" });

  async function load() {
    loading = true;
    try {
      [customers, sales] = await Promise.all([api.listCustomers(), api.listSales()]);
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
    form = { name: "", email: "", phone: "", nif: "", notes: "" };
    open = true;
  }

  function openEdit(c: Customer) {
    editing = c;
    form = {
      name: c.name,
      email: c.email,
      phone: c.phone,
      nif: c.nif,
      notes: c.notes,
    };
    open = true;
  }

  async function save() {
    if (!form.name.trim()) {
      showToast("El nombre es obligatorio", "err");
      return;
    }
    try {
      await api.upsertCustomer({
        id: editing?.id,
        ...form,
      });
      open = false;
      showToast(editing ? "Cliente actualizado" : "Cliente creado");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }
</script>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <input
    bind:value={query}
    placeholder="Buscar nombre, email, teléfono o NIF…"
    class="field w-full max-w-sm text-sm"
  />
  <Button class="ml-auto" onclick={openCreate}>+ Nuevo cliente</Button>
</div>

{#if loading}
  <div class="skeleton h-48"></div>
{:else if customers.length === 0}
  <EmptyState title="Sin clientes" description="Añade clientes para asociarlos a las ventas.">
    <Button onclick={openCreate}>Crear cliente</Button>
  </EmptyState>
{:else if filtered.length === 0}
  <EmptyState title="Sin resultados" description="Prueba otro término de búsqueda." />
{:else}
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {#each filtered as c}
      {@const metric = metrics[c.id]}
      {@const recentSales = sales.filter((sale) => sale.customer_id === c.id && sale.status !== "cancelled").sort((a, b) => b.sold_at.localeCompare(a.sold_at)).slice(0, 3)}
      <Card>
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="font-semibold text-[var(--color-text)]">{c.name}</h3>
            {#if c.nif}
              <p class="text-xs text-[var(--color-muted-dim)]">NIF {c.nif}</p>
            {/if}
          </div>
          <Button variant="ghost" class="!px-2 !py-1 text-xs" onclick={() => openEdit(c)}>Editar</Button>
        </div>
        <div class="mt-3 space-y-1 text-sm text-[var(--color-muted)]">
          {#if c.email}<p>{c.email}</p>{/if}
          {#if c.phone}<p>{c.phone}</p>{/if}
          {#if c.notes}<p class="text-xs text-[var(--color-muted-dim)]">{c.notes}</p>{/if}
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-[var(--color-border)] bg-black/20 p-2.5 text-xs">
          <div><p class="text-[var(--color-muted-dim)]">Valor total</p><p class="mt-0.5 font-medium tabular text-[var(--color-text)]">{formatEUR(metric?.lifetime_cents ?? 0)}</p></div>
          <div><p class="text-[var(--color-muted-dim)]">Última compra</p><p class="mt-0.5 text-[var(--color-text)]">{metric?.last_purchase_at ? new Date(metric.last_purchase_at).toLocaleDateString("es-ES") : "—"}</p></div>
          <div><p class="text-[var(--color-muted-dim)]">Frecuencia</p><p class="mt-0.5 text-[var(--color-text)]">{metric?.purchase_count ?? 0} tickets</p></div>
          <div class="flex items-end"><Badge tone={metric?.segment === "vip" ? "ai" : metric?.segment === "en_riesgo" ? "warn" : "ok"}>{metric?.segment?.replace("_", " ") ?? "nuevo"}</Badge></div>
        </div>
        {#if recentSales.length}
          <div class="mt-3 border-t border-[var(--color-border-soft)] pt-3 text-xs">
            <p class="mb-1 text-[var(--color-muted-dim)]">Últimas compras</p>
            {#each recentSales as sale (sale.id)}
              <p class="flex justify-between gap-2 text-[var(--color-muted)]"><span>{new Date(sale.sold_at).toLocaleDateString("es-ES")}</span><span class="tabular">{formatEUR(sale.total_cents - (sale.refunded_cents ?? 0))}</span></p>
            {/each}
          </div>
        {/if}
        <a href={`/ventas?nuevo=1&customerId=${c.id}`} class="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-radiant hover:underline">Nueva venta para este cliente →</a>
      </Card>
    {/each}
  </div>
{/if}

<Modal {open} title={editing ? "Editar cliente" : "Nuevo cliente"} onclose={() => (open = false)}>
  <form
    class="grid gap-3"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <Input label="Nombre" bind:value={form.name} required />
    <div class="grid gap-3 sm:grid-cols-2">
      <Input label="Email" bind:value={form.email} type="email" />
      <Input label="Teléfono" bind:value={form.phone} />
    </div>
    <Input label="NIF/CIF" bind:value={form.nif} />
    <Input label="Notas" bind:value={form.notes} />
    <div class="flex justify-end gap-2">
      <Button variant="ghost" type="button" onclick={() => (open = false)}>Cancelar</Button>
      <Button type="submit">Guardar</Button>
    </div>
  </form>
</Modal>
