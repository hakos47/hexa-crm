<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { WorkItem } from "$lib/types";
  import Card from "$lib/components/Card.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";

  let items = $state<WorkItem[]>([]);
  let loading = $state(true);
  let error = $state("");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  function toLocalDate(value: string) {
    return new Date(`${value.slice(0, 10)}T00:00:00`);
  }

  function compareByDueDate(a: WorkItem, b: WorkItem) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  }

  const activeItems = $derived(
    items
      .filter((item) => item.status !== "done" && item.status !== "archived")
      .sort(compareByDueDate),
  );
  const overdue = $derived(activeItems.filter((item) => item.due_date && toLocalDate(item.due_date) < today));
  const next = $derived(activeItems.filter((item) => item.due_date && toLocalDate(item.due_date) >= today && toLocalDate(item.due_date) <= nextWeek));
  const later = $derived(activeItems.filter((item) => item.due_date && toLocalDate(item.due_date) > nextWeek));
  const unscheduled = $derived(activeItems.filter((item) => !item.due_date));

  function formatDate(value: string | null) {
    if (!value) return "Sin fecha";
    return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(toLocalDate(value));
  }

  async function loadRoadmap() {
    loading = true;
    error = "";
    try {
      items = await api.listWorkItems();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "No se pudo cargar el roadmap";
    } finally {
      loading = false;
    }
  }

  onMount(loadRoadmap);
</script>

<div class="mx-auto max-w-6xl space-y-5">
  <Card class="border border-purple-400/20 bg-purple-500/[0.06]" lift={false}>
    <p class="section-label">PLANIFICACIÓN</p>
    <h2 class="mt-1 text-xl font-semibold text-[var(--color-text)]">Roadmap de trabajo</h2>
    <p class="mt-2 text-sm text-[var(--color-muted)]">
      Prioridades activas agrupadas por fecha. Abre una tarjeta para gestionarla en Trabajo.
    </p>
  </Card>

  {#if loading}
    <Card lift={false}><p class="text-sm text-[var(--color-muted)]">Cargando roadmap…</p></Card>
  {:else if error}
    <Card class="border border-rose-500/25 bg-rose-500/[0.06]" lift={false}>
      <p class="text-sm text-rose-200">{error}</p>
    </Card>
  {:else if activeItems.length === 0}
    <EmptyState title="No hay trabajo activo planificado" description="Crea una tarea o un hito desde Trabajo y asígnale una fecha objetivo." />
  {:else}
    {@const sections = [
      { title: "Vencido", hint: "Requiere revisión", tone: "border-rose-400/30", items: overdue },
      { title: "Próximos 7 días", hint: "Foco inmediato", tone: "border-amber-400/30", items: next },
      { title: "Más adelante", hint: "Planificado", tone: "border-cyan-400/25", items: later },
      { title: "Sin fecha", hint: "Pendiente de priorizar", tone: "border-white/10", items: unscheduled },
    ]}
    {#each sections as section}
      <section>
        <div class="mb-2 flex items-baseline justify-between gap-3 px-1">
          <h3 class="text-sm font-semibold text-[var(--color-text)]">{section.title}</h3>
          <span class="text-xs text-[var(--color-muted-dim)]">{section.hint} · {section.items.length}</span>
        </div>
        {#if section.items.length === 0}
          <div class="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-muted-dim)]">Sin elementos.</div>
        {:else}
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {#each section.items as item}
              <a href={`/trabajo?item=${item.id}`} class="rounded-xl border {section.tone} bg-black/15 p-4 transition hover:-translate-y-0.5 hover:bg-purple-500/[0.08]">
                <div class="flex items-start justify-between gap-3">
                  <h4 class="font-medium text-[var(--color-text)]">{item.title}</h4>
                  <span class="shrink-0 text-xs text-[var(--color-muted)]">{formatDate(item.due_date)}</span>
                </div>
                <p class="mt-2 line-clamp-2 text-sm text-[var(--color-muted)]">{item.description || "Sin descripción"}</p>
                <p class="mt-3 text-xs text-[var(--color-muted-dim)]">{item.category?.name || "Sin categoría"} · {item.assignee_name || "Sin asignar"}</p>
              </a>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  {/if}
</div>
