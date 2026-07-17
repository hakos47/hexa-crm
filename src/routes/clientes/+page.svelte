<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { Customer } from "$lib/types";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import Input from "$lib/components/Input.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import { showToast } from "$lib/stores/ui";

  let customers = $state<Customer[]>([]);
  let query = $state("");
  let loading = $state(true);
  let open = $state(false);

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
  let editing = $state<Customer | null>(null);
  let form = $state({ name: "", email: "", phone: "", nif: "", notes: "" });

  async function load() {
    loading = true;
    try {
      customers = await api.listCustomers();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    } finally {
      loading = false;
    }
  }

  onMount(load);

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
      <Card>
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="font-semibold text-slate-100">{c.name}</h3>
            {#if c.nif}
              <p class="text-xs text-slate-500">NIF {c.nif}</p>
            {/if}
          </div>
          <Button variant="ghost" class="!px-2 !py-1 text-xs" onclick={() => openEdit(c)}>Editar</Button>
        </div>
        <div class="mt-3 space-y-1 text-sm text-slate-400">
          {#if c.email}<p>{c.email}</p>{/if}
          {#if c.phone}<p>{c.phone}</p>{/if}
          {#if c.notes}<p class="text-xs text-slate-500">{c.notes}</p>{/if}
        </div>
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
