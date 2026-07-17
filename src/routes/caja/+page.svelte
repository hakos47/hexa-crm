<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { CashKind, CashMovement } from "$lib/types";
  import { formatEUR, parseEurosInput } from "$lib/money";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import Input from "$lib/components/Input.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import KpiCard from "$lib/components/KpiCard.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Select from "$lib/components/Select.svelte";
  import { showToast } from "$lib/stores/ui";

  let movements = $state<CashMovement[]>([]);
  let balance = $state(0);
  let loading = $state(true);
  let open = $state(false);
  let form = $state({
    kind: "expense",
    amount: "",
    category: "proveedores",
    description: "",
  });

  const categories = ["ventas", "proveedores", "alquiler", "nominas", "servicios", "otros"];

  async function load() {
    loading = true;
    try {
      [movements, balance] = await Promise.all([api.listCashMovements(), api.getCashBalance()]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function save() {
    const cents = parseEurosInput(form.amount);
    if (cents === null || cents <= 0) {
      showToast("Importe no válido", "err");
      return;
    }
    try {
      await api.createCashMovement({
        kind: form.kind as CashKind,
        amount_cents: cents,
        category: form.category,
        description: form.description,
      });
      open = false;
      form = { kind: "expense", amount: "", category: "proveedores", description: "" };
      showToast("Movimiento registrado");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }

  function tone(kind: CashKind) {
    if (kind === "income") return "ok" as const;
    if (kind === "expense") return "danger" as const;
    return "neutral" as const;
  }

  function label(kind: CashKind) {
    if (kind === "income") return "Ingreso";
    if (kind === "expense") return "Gasto";
    return "Ajuste";
  }

  function signed(m: CashMovement) {
    const sign = m.kind === "expense" ? -1 : 1;
    return formatEUR(sign * m.amount_cents, { signed: true });
  }
</script>

{#if loading}
  <div class="skeleton h-40"></div>
{:else}
  <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
    <KpiCard label="Saldo actual" value={formatEUR(balance)} hint="Ingresos − gastos" accent="violet" />
    <Card class="flex items-center justify-between">
      <div>
        <p class="text-sm text-slate-400">Presupuesto de la tienda</p>
        <p class="mt-1 text-sm text-slate-500">Registra gastos, ingresos extra o ajustes de caja.</p>
      </div>
      <Button onclick={() => (open = true)}>+ Movimiento</Button>
    </Card>
  </div>

  {#if movements.length === 0}
    <EmptyState title="Sin movimientos" description="Las ventas generan ingresos automáticos.">
      <Button onclick={() => (open = true)}>Añadir movimiento</Button>
    </EmptyState>
  {:else}
    <Card lift={false} class="overflow-hidden p-0">
      <div class="w-full max-w-full overflow-x-auto">
      <table class="w-full min-w-[32rem] text-left text-sm">
        <thead class="border-b border-white/10 text-xs uppercase text-slate-500">
          <tr>
            <th class="px-4 py-3">Fecha</th>
            <th class="px-4 py-3">Tipo</th>
            <th class="px-4 py-3">Categoría</th>
            <th class="px-4 py-3">Descripción</th>
            <th class="px-4 py-3 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {#each movements as m}
            <tr class="border-b border-white/5 hover:bg-white/[0.03]">
              <td class="px-4 py-3 text-slate-400">{new Date(m.occurred_at).toLocaleString("es-ES")}</td>
              <td class="px-4 py-3"><Badge tone={tone(m.kind)}>{label(m.kind)}</Badge></td>
              <td class="px-4 py-3 capitalize text-slate-300">{m.category}</td>
              <td class="px-4 py-3 text-slate-400">{m.description || "—"}</td>
              <td
                class="px-4 py-3 text-right tabular font-medium {m.kind === 'expense'
                  ? 'text-rose-300'
                  : 'text-emerald-300'}"
              >
                {signed(m)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      </div>
    </Card>
  {/if}
{/if}

<Modal {open} title="Nuevo movimiento de caja" onclose={() => (open = false)}>
  <form
    class="grid gap-3"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <Select
      label="Tipo"
      bind:value={form.kind}
      options={[
        { value: "expense", label: "Gasto" },
        { value: "income", label: "Ingreso" },
        { value: "adjustment", label: "Ajuste (+)" },
      ]}
    />
    <Input label="Importe (€)" bind:value={form.amount} required />
    <Select
      label="Categoría"
      bind:value={form.category}
      options={categories.map((c) => ({ value: c, label: c }))}
    />
    <Input label="Descripción" bind:value={form.description} />
    <div class="flex justify-end gap-2">
      <Button variant="ghost" type="button" onclick={() => (open = false)}>Cancelar</Button>
      <Button type="submit">Guardar</Button>
    </div>
  </form>
</Modal>
