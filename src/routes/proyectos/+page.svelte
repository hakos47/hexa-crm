<script lang="ts">
  import { api } from "$lib/api/client";
  import { session, isAdmin } from "$lib/stores/session";
  import { showToast } from "$lib/stores/ui";
  import type { WorkProject, WorkItem, WorkProjectInput } from "$lib/types";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Select from "$lib/components/Select.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";

  let projects = $state<WorkProject[]>([]);
  let items = $state<WorkItem[]>([]);
  let loading = $state(true);

  let filterStatus = $state("");
  let modalOpen = $state(false);
  let saving = $state(false);

  let form = $state({
    name: "",
    description: "",
    status: "active" as WorkProject["status"],
    start_date: "",
    target_date: "",
  });

  const filterOptions = [
    { value: "", label: "Todos" },
    { value: "active", label: "Activo" },
    { value: "planned", label: "Planificado" },
    { value: "paused", label: "En pausa" },
    { value: "done", label: "Completado" },
    { value: "archived", label: "Archivado" },
  ];

  const projectStatusOptions = [
    { value: "planned", label: "Planificado" },
    { value: "active", label: "Activo" },
    { value: "paused", label: "En pausa" },
    { value: "done", label: "Completado" },
    { value: "archived", label: "Archivado" },
  ];

  async function loadData() {
    loading = true;
    try {
      const [projList, itemList] = await Promise.all([
        api.listWorkProjects(),
        api.listWorkItems(),
      ]);
      projects = projList;
      items = itemList;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al cargar proyectos", "err");
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Reload data on company change or initial load
    const _companyId = $session.activeCompanyId;
    loadData();
  });

  const projectMetrics = $derived.by(() => {
    const map = new Map<number, { total: number; completed: number; blocked: number; progress: number }>();
    for (const proj of projects) {
      const projItems = items.filter((i) => i.project_id === proj.id);
      const total = projItems.length;
      const completed = projItems.filter((i) => i.status === "done").length;
      const blocked = projItems.filter((i) => i.status === "blocked").length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      map.set(proj.id, { total, completed, blocked, progress });
    }
    return map;
  });

  const filteredProjects = $derived(
    projects.filter((p) => {
      if (filterStatus && p.status !== filterStatus) return false;
      return true;
    })
  );

  function projectStatusLabel(status: string) {
    switch (status) {
      case "planned": return "Planificado";
      case "active": return "Activo";
      case "paused": return "En pausa";
      case "done": return "Completado";
      case "archived": return "Archivado";
      default: return status;
    }
  }

  function projectStatusTone(status: string): "neutral" | "ok" | "warn" | "danger" | "ai" {
    switch (status) {
      case "active": return "ok";
      case "planned": return "warn";
      case "paused": return "neutral";
      case "done": return "ok";
      case "archived": return "neutral";
      default: return "neutral";
    }
  }

  function formatDate(iso?: string | null) {
    if (!iso) return "Sin fecha";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return iso;
    }
  }

  function openCreateModal() {
    form = {
      name: "",
      description: "",
      status: "active",
      start_date: "",
      target_date: "",
    };
    modalOpen = true;
  }

  async function handleCreateProject() {
    if (!form.name.trim()) {
      showToast("El nombre del proyecto es obligatorio", "err");
      return;
    }
    saving = true;
    try {
      const input: WorkProjectInput = {
        name: form.name.trim(),
        description: form.description.trim(),
        status: form.status,
        start_date: form.start_date || null,
        target_date: form.target_date || null,
      };
      await api.upsertWorkProject(input);
      showToast("Proyecto creado correctamente");
      modalOpen = false;
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al crear proyecto", "err");
    } finally {
      saving = false;
    }
  }
</script>

<section class="proyectos-page workspace-page">
  <!-- Header -->
  <div class="workspace-intro workspace-intro-compact mb-6">
    <p class="workspace-index">02 / PROYECTOS</p>
    <div class="workspace-intro-row">
      <div>
        <h2>Portafolio de<br /><em>Proyectos.</em></h2>
        <p class="mt-1 text-sm text-[var(--color-muted-dim)]">
          Visión estratégica de iniciativas, progreso y métricas operativas por empresa.
        </p>
      </div>
      <div class="mt-4 flex items-center gap-3 sm:mt-0">
        <Button variant="primary" onclick={openCreateModal}>
          + Nuevo proyecto
        </Button>
      </div>
    </div>
  </div>

  <!-- Status Filter Toolbar -->
  <div class="workspace-toolbar mb-6 flex flex-wrap items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <span class="text-xs font-medium text-[var(--color-muted)]">Filtrar por estado:</span>
      <Select
        options={filterOptions}
        bind:value={filterStatus}
        placeholder="Todos"
        class="w-48"
      />
    </div>
    <div class="text-xs text-[var(--color-muted-dim)]">
      Mostrando {filteredProjects.length} de {projects.length} proyectos
    </div>
  </div>

  <!-- Portfolio Grid -->
  {#if loading}
    <div class="py-16 text-center text-sm text-[var(--color-muted-dim)]">
      Cargando portafolio de proyectos...
    </div>
  {:else if filteredProjects.length === 0}
    <EmptyState
      title={projects.length === 0 ? "No hay proyectos en esta empresa" : "No hay proyectos que coincidan"}
      description={projects.length === 0 ? "Crea el primer proyecto para organizar tus tareas e iniciativas." : "Prueba a seleccionar otro estado en el filtro superior."}
    >
      <Button variant="primary" onclick={openCreateModal}>+ Nuevo proyecto</Button>
    </EmptyState>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each filteredProjects as project (project.id)}
        {@const metrics = projectMetrics.get(project.id) ?? { total: 0, completed: 0, blocked: 0, progress: 0 }}
        <a
          href="/proyectos/{project.id}"
          class="group block transition-transform duration-200 hover:-translate-y-0.5"
        >
          <Card lift={true} class="flex h-full flex-col justify-between border border-[var(--color-border)] p-5 hover:border-[var(--color-border-strong)]">
            <div>
              <!-- Top info: Title & Status -->
              <div class="flex items-start justify-between gap-2 mb-2">
                <h3 class="font-semibold text-base text-[var(--color-text)] group-hover:text-[var(--color-purple-bright)] transition-colors">
                  {project.name}
                </h3>
                <Badge tone={projectStatusTone(project.status)}>
                  {projectStatusLabel(project.status)}
                </Badge>
              </div>

              <!-- Description -->
              {#if project.description}
                <p class="text-xs text-[var(--color-muted-dim)] line-clamp-2 mb-4">
                  {project.description}
                </p>
              {:else}
                <p class="text-xs text-[var(--color-muted-dim)] italic mb-4">
                  Sin descripción
                </p>
              {/if}
            </div>

            <div class="space-y-3 pt-3 border-t border-[var(--color-border-soft)]">
              <!-- Target date -->
              <div class="flex items-center justify-between text-xs text-[var(--color-muted)]">
                <span>Fecha objetivo:</span>
                <span class="font-medium tabular text-[var(--color-text)]">
                  📅 {formatDate(project.target_date)}
                </span>
              </div>

              <!-- Task Counts breakdown -->
              <div class="flex items-center gap-2 text-xs">
                <span class="rounded-md bg-white/5 px-2 py-1 text-[var(--color-muted)]">
                  Total: <strong class="text-[var(--color-text)]">{metrics.total}</strong>
                </span>
                <span class="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-300">
                  Hechas: <strong>{metrics.completed}</strong>
                </span>
                {#if metrics.blocked > 0}
                  <span class="rounded-md bg-rose-500/10 px-2 py-1 text-rose-300">
                    Bloqueadas: <strong>{metrics.blocked}</strong>
                  </span>
                {/if}
              </div>

              <!-- Progress Bar -->
              <div class="space-y-1">
                <div class="flex items-center justify-between text-[11px] font-medium">
                  <span class="text-[var(--color-muted-dim)]">Progreso</span>
                  <span class="text-[var(--color-purple-bright)]">{metrics.progress}%</span>
                </div>
                <div class="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    class="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-300"
                    style="width: {metrics.progress}%"
                  ></div>
                </div>
              </div>
            </div>
          </Card>
        </a>
      {/each}
    </div>
  {/if}
</section>

<!-- Project Creation Modal -->
<Modal
  open={modalOpen}
  title="Nuevo Proyecto"
  onclose={() => (modalOpen = false)}
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      handleCreateProject();
    }}
    class="space-y-4 pt-1"
  >
    <div class="space-y-1">
      <label for="project-name" class="text-xs font-medium text-[var(--color-muted)]">Nombre del proyecto</label>
      <input
        id="project-name"
        type="text"
        bind:value={form.name}
        placeholder="Ej. Rediseño Web, Expansión Q3..."
        class="field w-full text-sm"
        required
      />
    </div>

    <div class="space-y-1">
      <label for="project-desc" class="text-xs font-medium text-[var(--color-muted)]">Descripción</label>
      <textarea
        id="project-desc"
        bind:value={form.description}
        placeholder="Describe el objetivo y alcance del proyecto..."
        rows={3}
        class="field w-full text-sm"
      ></textarea>
    </div>

    <Select
      label="Estado inicial"
      options={projectStatusOptions}
      bind:value={form.status}
    />

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="space-y-1">
        <label for="project-start-date" class="text-xs font-medium text-[var(--color-muted)]">Fecha de inicio</label>
        <input
          id="project-start-date"
          type="date"
          bind:value={form.start_date}
          class="field w-full text-sm"
        />
      </div>
      <div class="space-y-1">
        <label for="project-target-date" class="text-xs font-medium text-[var(--color-muted)]">Fecha objetivo</label>
        <input
          id="project-target-date"
          type="date"
          bind:value={form.target_date}
          class="field w-full text-sm"
        />
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-4">
      <Button variant="ghost" type="button" onclick={() => (modalOpen = false)}>
        Cancelar
      </Button>
      <Button variant="primary" type="submit" disabled={saving}>
        Guardar proyecto
      </Button>
    </div>
  </form>
</Modal>
