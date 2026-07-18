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
  import SortableHeader from "$lib/components/SortableHeader.svelte";
  import { showToast } from "$lib/stores/ui";
  import { buildDailyCloseReport } from "$lib/reports/daily-close";
  import type { Sale } from "$lib/types";
  import { nextSortDirection, sortRows, type SortDirection } from "$lib/table-sort";

  type MovementSortKey = "date" | "kind" | "category" | "description" | "amount";

  let movements = $state<CashMovement[]>([]);
  let balance = $state(0);
  let sales = $state<Sale[]>([]);
  let loading = $state(true);
  let open = $state(false);
  let movementSortKey = $state<MovementSortKey>("date");
  let movementSortDirection = $state<SortDirection>("desc");
  let closeDay = $state(new Date().toISOString().slice(0, 10));
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
      [movements, balance, sales] = await Promise.all([
        api.listCashMovements(),
        api.getCashBalance(),
        api.listSales(),
      ]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    } finally {
      loading = false;
    }
  }

  onMount(load);

  const dayClose = $derived(
    buildDailyCloseReport(closeDay, sales, movements, balance)
  );
  const sortedMovements = $derived(
    sortRows(movements, movementSortDirection, (movement) => {
      if (movementSortKey === "date") return new Date(movement.occurred_at).getTime();
      if (movementSortKey === "kind") return label(movement.kind);
      if (movementSortKey === "category") return movement.category;
      if (movementSortKey === "description") return movement.description;
      return movement.kind === "expense" ? -movement.amount_cents : movement.amount_cents;
    })
  );

  function sortMovementsBy(key: MovementSortKey) {
    movementSortDirection = nextSortDirection(
      movementSortKey,
      key,
      movementSortDirection
    );
    movementSortKey = key;
  }

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
    <Card class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm text-slate-400">Presupuesto de la tienda</p>
        <p class="mt-1 text-sm text-slate-500">Registra gastos, ingresos extra o ajustes de caja.</p>
      </div>
      <Button onclick={() => (open = true)}>+ Movimiento</Button>
    </Card>
  </div>

  <!-- End-of-day cash close (POS best practice) -->
  <Card class="mb-4" lift={false}>
    <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="section-label !normal-case !tracking-wide !text-sm">Cierre de caja del día</h2>
        <p class="mt-1 text-xs text-[var(--color-muted-dim)]">
          Resumen operativo: ventas, gastos y neto de caja (no sustituye contabilidad formal).
        </p>
      </div>
      <label class="text-sm">
        <span class="mb-1 block text-[var(--color-muted)]">Día</span>
        <input type="date" bind:value={closeDay} class="field" />
      </label>
    </div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-xl border border-[var(--color-border)] bg-black/20 p-3">
        <p class="text-[11px] uppercase tracking-wide text-[var(--color-muted-dim)]">Tickets</p>
        <p class="mt-1 text-xl font-semibold tabular">{dayClose.sales_count}</p>
      </div>
      <div class="rounded-xl border border-[var(--color-border)] bg-black/20 p-3">
        <p class="text-[11px] uppercase tracking-wide text-[var(--color-muted-dim)]">Ventas</p>
        <p class="mt-1 text-xl font-semibold tabular text-radiant">
          {formatEUR(dayClose.sales_total_cents)}
        </p>
      </div>
      <div class="rounded-xl border border-[var(--color-border)] bg-black/20 p-3">
        <p class="text-[11px] uppercase tracking-wide text-[var(--color-muted-dim)]">Gastos</p>
        <p class="mt-1 text-xl font-semibold tabular text-rose-300">
          {formatEUR(dayClose.expense_cents)}
        </p>
      </div>
      <div class="rounded-xl border border-[var(--color-border)] bg-black/20 p-3">
        <p class="text-[11px] uppercase tracking-wide text-[var(--color-muted-dim)]">Neto día</p>
        <p class="mt-1 text-xl font-semibold tabular">
          {formatEUR(dayClose.net_cash_cents)}
        </p>
      </div>
    </div>
    <p class="mt-3 text-xs text-[var(--color-muted-dim)]">
      Base {formatEUR(dayClose.sales_base_cents)} · IVA {formatEUR(dayClose.sales_vat_cents)} ·
      Otros ingresos {formatEUR(dayClose.other_income_cents)} · Saldo actual
      {formatEUR(dayClose.cash_balance_cents)}
    </p>
  </Card>

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
            <SortableHeader label="Fecha" active={movementSortKey === "date"} direction={movementSortDirection} class="px-4 py-2" onclick={() => sortMovementsBy("date")} />
            <SortableHeader label="Tipo" active={movementSortKey === "kind"} direction={movementSortDirection} class="px-4 py-2" onclick={() => sortMovementsBy("kind")} />
            <SortableHeader label="Categoría" active={movementSortKey === "category"} direction={movementSortDirection} class="px-4 py-2" onclick={() => sortMovementsBy("category")} />
            <SortableHeader label="Descripción" active={movementSortKey === "description"} direction={movementSortDirection} class="px-4 py-2" onclick={() => sortMovementsBy("description")} />
            <SortableHeader label="Importe" active={movementSortKey === "amount"} direction={movementSortDirection} align="right" class="px-4 py-2" onclick={() => sortMovementsBy("amount")} />
          </tr>
        </thead>
        <tbody>
          {#each sortedMovements as m}
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
