<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { api } from "$lib/api/client";
  import type { CashKind, CashMovement, Sale } from "$lib/types";
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
  import { buildDailyCloseReport } from "$lib/reports/daily-close";
  import { planCashReconcile, type CashReconcileResult } from "$lib/reports/cash-reconcile";

  let movements = $state<CashMovement[]>([]);
  let balance = $state(0);
  let sales = $state<Sale[]>([]);
  let loading = $state(true);
  let open = $state(false);
  let closeDay = $state(new Date().toISOString().slice(0, 10));
  let form = $state({
    kind: "expense",
    amount: "",
    category: "proveedores",
    description: "",
  });

  /** Physical count for arqueo (€ string). */
  let countedStr = $state("");
  let reconcileBusy = $state(false);

  const categories = [
    "ventas",
    "proveedores",
    "alquiler",
    "nominas",
    "servicios",
    "arqueo",
    "otros",
  ];

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

  onMount(async () => {
    await load();
    if ($page.url.searchParams.get("nuevo") === "1") {
      open = true;
    }
  });

  const dayClose = $derived(
    buildDailyCloseReport(
      closeDay,
      sales.map((s) => ({
        sold_at: s.sold_at,
        total_cents: s.total_cents,
        subtotal_cents: s.subtotal_cents,
        vat_cents: s.vat_cents,
        refunded_cents: s.refunded_cents ?? 0,
        status: s.status,
      })),
      movements,
      balance,
    ),
  );

  const reconcilePreview = $derived.by((): CashReconcileResult | null => {
    const cents = parseEurosInput(countedStr);
    if (cents === null) return null;
    try {
      return planCashReconcile({ expected_cents: balance, counted_cents: cents });
    } catch {
      return null;
    }
  });

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

  async function applyArqueoAdjustment() {
    if (!reconcilePreview || reconcilePreview.balanced || !reconcilePreview.suggested_adjustment) {
      return;
    }
    const adj = reconcilePreview.suggested_adjustment;
    if (
      !confirm(
        `¿Registrar ${adj.kind === "expense" ? "faltante" : "sobrante"} de ${formatEUR(adj.amount_cents)} en caja?`,
      )
    ) {
      return;
    }
    reconcileBusy = true;
    try {
      await api.createCashMovement({
        kind: adj.kind,
        amount_cents: adj.amount_cents,
        category: adj.category,
        description: adj.description,
      });
      showToast("Arqueo registrado — saldo actualizado");
      countedStr = "";
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al registrar arqueo", "err");
    } finally {
      reconcileBusy = false;
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

<section class="cash-page workspace-page">
<div class="workspace-intro workspace-intro-compact">
  <p class="workspace-index">04 / CAJA</p>
  <div class="workspace-intro-row">
    <h2>Cada euro,<br /><em>en su lugar.</em></h2>
    <p>Saldo, arqueo y cierre diario con una lectura clara y verificable.</p>
  </div>
</div>

{#if loading}
  <div class="skeleton h-40"></div>
{:else}
  <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
    <KpiCard
      label="Saldo actual (sistema)"
      value={formatEUR(balance)}
      hint="Ingresos − gastos · base del arqueo"
      accent="violet"
    />
    <Card class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm text-[var(--color-muted)]">Movimientos</p>
        <p class="mt-1 text-sm text-[var(--color-muted-dim)]">
          Gastos, ingresos extra o ajustes de caja.
        </p>
      </div>
      <Button onclick={() => (open = true)}>+ Movimiento</Button>
    </Card>
  </div>

  <!-- Arqueo (B8) -->
  <Card class="mb-4 border border-[var(--color-border-strong)]" lift={false} data-cash-arqueo>
    <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="section-label mb-1">Arqueo</p>
        <h2 class="text-lg font-semibold text-[var(--color-text)]">Conciliación de caja</h2>
        <p class="mt-1 max-w-xl text-xs text-[var(--color-muted-dim)]">
          Cuenta el efectivo físico y compáralo con el saldo del sistema. Si hay descuadre, puedes
          registrar un movimiento de categoría «arqueo».
        </p>
      </div>
    </div>
    <div class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-[var(--color-border)] bg-black/20 p-3">
        <p class="text-[11px] uppercase tracking-wide text-[var(--color-muted-dim)]">
          Esperado (sistema)
        </p>
        <p class="mt-1 text-xl font-semibold tabular text-radiant" data-arqueo-expected>
          {formatEUR(balance)}
        </p>
      </div>
      <div data-arqueo-counted>
        <Input label="Contado físico (€)" bind:value={countedStr} placeholder="0,00" />
      </div>
      <div class="rounded-xl border border-[var(--color-border)] bg-black/20 p-3">
        <p class="text-[11px] uppercase tracking-wide text-[var(--color-muted-dim)]">Diferencia</p>
        {#if reconcilePreview}
          <p
            class="mt-1 text-xl font-semibold tabular"
            class:text-emerald-300={reconcilePreview.balanced}
            class:text-amber-200={reconcilePreview.outcome === "sobrante"}
            class:text-rose-300={reconcilePreview.outcome === "faltante"}
            data-arqueo-diff
          >
            {formatEUR(reconcilePreview.difference_cents, { signed: true })}
          </p>
          <Badge
            tone={reconcilePreview.balanced
              ? "ok"
              : reconcilePreview.outcome === "sobrante"
                ? "warn"
                : "danger"}
          >
            {reconcilePreview.outcome}
          </Badge>
        {:else}
          <p class="mt-1 text-sm text-[var(--color-muted-dim)]">Introduce el contado</p>
        {/if}
      </div>
    </div>
    {#if reconcilePreview && !reconcilePreview.balanced && reconcilePreview.suggested_adjustment}
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={reconcileBusy}
          onclick={applyArqueoAdjustment}
          data-arqueo-apply
        >
          {reconcileBusy
            ? "Registrando…"
            : reconcilePreview.outcome === "sobrante"
              ? "Registrar sobrante en caja"
              : "Registrar faltante en caja"}
        </Button>
        <p class="text-xs text-[var(--color-muted-dim)]">
          Crea un movimiento «{reconcilePreview.suggested_adjustment.kind}» / categoría arqueo para
          alinear el saldo del sistema con el contado.
        </p>
      </div>
    {:else if reconcilePreview?.balanced}
      <p class="mt-3 text-sm text-emerald-300/90" data-arqueo-ok>Caja cuadrada — sin descuadre.</p>
    {/if}
  </Card>

  <!-- End-of-day cash close -->
  <Card class="mb-4" lift={false} data-daily-close>
    <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="section-label !normal-case !tracking-wide !text-sm">Cierre de caja del día</h2>
        <p class="mt-1 text-xs text-[var(--color-muted-dim)]">
          Resumen operativo: ventas netas, gastos y neto de caja (no sustituye contabilidad formal).
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
        <p class="text-[11px] uppercase tracking-wide text-[var(--color-muted-dim)]">
          Ventas (neto)
        </p>
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
      Bruto tickets {formatEUR(dayClose.sales_gross_cents)} · Base
      {formatEUR(dayClose.sales_base_cents)} · IVA {formatEUR(dayClose.sales_vat_cents)} · Otros
      ingresos {formatEUR(dayClose.other_income_cents)} · Saldo actual
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
          <thead
            class="border-b border-white/10 text-xs uppercase text-[var(--color-muted-dim)]"
          >
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
                <td class="px-4 py-3 text-[var(--color-muted)]">
                  {new Date(m.occurred_at).toLocaleString("es-ES")}
                </td>
                <td class="px-4 py-3"><Badge tone={tone(m.kind)}>{label(m.kind)}</Badge></td>
                <td class="px-4 py-3 capitalize text-[var(--color-muted)]">{m.category}</td>
                <td class="px-4 py-3 text-[var(--color-muted-dim)]">{m.description || "—"}</td>
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

</section>

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
