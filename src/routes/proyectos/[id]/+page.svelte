<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api/client";
  import { session, isAdmin } from "$lib/stores/session";
  import { showToast } from "$lib/stores/ui";
  import type {
    WorkProject,
    WorkItem,
    WorkCategory,
    WorkMember,
    WorkProjectInput,
    WorkItemInput,
    WorkStatus,
    WorkPriority,
    WorkItemType,
  } from "$lib/types";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Select from "$lib/components/Select.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";

  const projectId = $derived(Number($page.params.id));

  let project = $state<WorkProject | null>(null);
  let tasks = $state<WorkItem[]>([]);
  let categories = $state<WorkCategory[]>([]);
  let members = $state<WorkMember[]>([]);
  let projectsList = $state<WorkProject[]>([]);
  let loading = $state(true);

  let viewMode = $state<"lista" | "kanban">("lista");

  // Quick Capture State
  let quickTitle = $state("");
  let quickSaving = $state(false);

  // Filters State
  let filterText = $state("");
  let filterStatus = $state("");
  let filterType = $state("");
  let filterPriority = $state("");
  let filterAssignee = $state("");

  // Edit Project Modal State
  let editProjectModalOpen = $state(false);
  let editProjectSaving = $state(false);
  let editProjectForm = $state({
    name: "",
    description: "",
    status: "active" as WorkProject["status"],
    start_date: "",
    target_date: "",
  });

  // Task Detail Modal State
  let detailModalOpen = $state(false);
  let editingTask = $state<WorkItem | null>(null);
  let taskSaving = $state(false);
  let detailForm = $state({
    title: "",
    description: "",
    type: "task" as WorkItemType,
    status: "inbox" as WorkStatus,
    priority: "normal" as WorkPriority,
    category_id: "",
    project_id: "",
    assignee_id: "",
    start_date: "",
    due_date: "",
  });

  const statusOptions = [
    { value: "", label: "Todos los estados" },
    { value: "inbox", label: "Inbox" },
    { value: "planned", label: "Planificado" },
    { value: "in_progress", label: "En progreso" },
    { value: "blocked", label: "Bloqueado" },
    { value: "done", label: "Hecho" },
    { value: "archived", label: "Archivado" },
  ];

  const typeOptions = [
    { value: "", label: "Todos los tipos" },
    { value: "idea", label: "Idea" },
    { value: "task", label: "Tarea" },
    { value: "issue", label: "Incidencia" },
    { value: "milestone", label: "Hito" },
  ];

  const priorityOptions = [
    { value: "", label: "Todas las prioridades" },
    { value: "low", label: "Baja" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "Alta" },
    { value: "urgent", label: "Urgente" },
  ];

  const detailTypeOptions = [
    { value: "task", label: "Tarea" },
    { value: "idea", label: "Idea" },
    { value: "issue", label: "Incidencia" },
    { value: "milestone", label: "Hito" },
  ];

  const detailStatusOptions = [
    { value: "inbox", label: "Inbox" },
    { value: "planned", label: "Planificado" },
    { value: "in_progress", label: "En progreso" },
    { value: "blocked", label: "Bloqueado" },
    { value: "done", label: "Hecho" },
    { value: "archived", label: "Archivado" },
  ];

  const detailPriorityOptions = [
    { value: "low", label: "Baja" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "Alta" },
    { value: "urgent", label: "Urgente" },
  ];

  const projectStatusOptions = [
    { value: "planned", label: "Planificado" },
    { value: "active", label: "Activo" },
    { value: "paused", label: "En pausa" },
    { value: "done", label: "Completado" },
    { value: "archived", label: "Archivado" },
  ];

  const kanbanColumns: { status: WorkStatus; label: string; tone: "neutral" | "ok" | "warn" | "danger" | "ai" }[] = [
    { status: "inbox", label: "Inbox", tone: "neutral" },
    { status: "planned", label: "Planificado", tone: "warn" },
    { status: "in_progress", label: "En progreso", tone: "ai" },
    { status: "blocked", label: "Bloqueado", tone: "danger" },
    { status: "done", label: "Hecho", tone: "ok" },
  ];

  const assigneeOptions = $derived([
    { value: "", label: "Todos los responsables" },
    ...members.map((m) => ({ value: String(m.id), label: m.display_name })),
  ]);

  const detailAssigneeOptions = $derived([
    { value: "", label: "Sin asignar" },
    ...members.map((m) => ({ value: String(m.id), label: m.display_name })),
  ]);

  const categoryOptions = $derived([
    { value: "", label: "Sin categoría" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ]);

  const detailProjectOptions = $derived([
    { value: "", label: "Sin proyecto" },
    ...projectsList.map((p) => ({ value: String(p.id), label: p.name })),
  ]);

  async function loadData() {
    if (!projectId || Number.isNaN(projectId)) return;
    loading = true;
    try {
      const [p, itemsList, catList, memList, pList] = await Promise.all([
        api.getWorkProject(projectId),
        api.listWorkItems({ project_id: projectId }),
        api.listWorkCategories(),
        api.listWorkMembers(),
        api.listWorkProjects(),
      ]);
      project = p;
      tasks = itemsList;
      categories = catList;
      members = memList;
      projectsList = pList;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al cargar el proyecto", "err");
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const _cid = $session.activeCompanyId;
    const _pid = projectId;
    loadData();
  });

  // Calculate metrics
  const totalTasks = $derived(tasks.length);
  const completedTasks = $derived(tasks.filter((t) => t.status === "done").length);
  const blockedTasks = $derived(tasks.filter((t) => t.status === "blocked").length);
  const progressPercent = $derived(totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0);

  // Filter tasks
  const filteredTasks = $derived(
    tasks.filter((task) => {
      if (filterText.trim()) {
        const q = filterText.trim().toLowerCase();
        const titleMatch = task.title.toLowerCase().includes(q);
        const descMatch = (task.description || "").toLowerCase().includes(q);
        const catMatch = (task.category?.name || "").toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !catMatch) return false;
      }
      if (filterStatus && task.status !== filterStatus) return false;
      if (filterType && task.type !== filterType) return false;
      if (filterPriority && task.priority !== filterPriority) return false;
      if (filterAssignee && String(task.assignee_id || "") !== filterAssignee) return false;
      return true;
    })
  );

  function projectStatusLabel(status?: string) {
    switch (status) {
      case "planned": return "Planificado";
      case "active": return "Activo";
      case "paused": return "En pausa";
      case "done": return "Completado";
      case "archived": return "Archivado";
      default: return status || "";
    }
  }

  function projectStatusTone(status?: string): "neutral" | "ok" | "warn" | "danger" | "ai" {
    switch (status) {
      case "active": return "ok";
      case "planned": return "warn";
      case "paused": return "neutral";
      case "done": return "ok";
      case "archived": return "neutral";
      default: return "neutral";
    }
  }

  function taskStatusLabel(s: string) {
    switch (s) {
      case "inbox": return "Inbox";
      case "planned": return "Planificado";
      case "in_progress": return "En progreso";
      case "blocked": return "Bloqueado";
      case "done": return "Hecho";
      case "archived": return "Archivado";
      default: return s;
    }
  }

  function taskTypeLabel(t: string) {
    switch (t) {
      case "idea": return "Idea";
      case "task": return "Tarea";
      case "issue": return "Incidencia";
      case "milestone": return "Hito";
      default: return t;
    }
  }

  function priorityLabel(p: string) {
    switch (p) {
      case "low": return "Baja";
      case "normal": return "Normal";
      case "high": return "Alta";
      case "urgent": return "Urgente";
      default: return p;
    }
  }

  function priorityBadgeTone(p: string): "neutral" | "ok" | "warn" | "danger" {
    switch (p) {
      case "low": return "neutral";
      case "normal": return "ok";
      case "high": return "warn";
      case "urgent": return "danger";
      default: return "neutral";
    }
  }

  function statusBadgeTone(s: string): "neutral" | "ok" | "warn" | "danger" | "ai" {
    switch (s) {
      case "done": return "ok";
      case "in_progress": return "ai";
      case "blocked": return "danger";
      case "planned": return "warn";
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

  // Quick Capture for Project
  async function saveQuickTask() {
    if (!quickTitle.trim()) {
      showToast("Escribe un título para la tarea", "err");
      return;
    }
    quickSaving = true;
    try {
      await api.upsertWorkItem({
        title: quickTitle.trim(),
        project_id: projectId,
        type: "task",
        status: "inbox",
        priority: "normal",
      });
      quickTitle = "";
      showToast("Tarea añadida al proyecto");
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al crear tarea", "err");
    } finally {
      quickSaving = false;
    }
  }

  // Admin Actions: Edit Project & Archive Project
  function openEditProjectModal() {
    if (!project) return;
    editProjectForm = {
      name: project.name,
      description: project.description || "",
      status: project.status,
      start_date: project.start_date ? project.start_date.slice(0, 10) : "",
      target_date: project.target_date ? project.target_date.slice(0, 10) : "",
    };
    editProjectModalOpen = true;
  }

  async function handleSaveProject() {
    if (!project || !editProjectForm.name.trim()) {
      showToast("El nombre del proyecto es obligatorio", "err");
      return;
    }
    editProjectSaving = true;
    try {
      await api.upsertWorkProject({
        id: project.id,
        name: editProjectForm.name.trim(),
        description: editProjectForm.description.trim(),
        status: editProjectForm.status,
        start_date: editProjectForm.start_date || null,
        target_date: editProjectForm.target_date || null,
      });
      showToast("Proyecto actualizado");
      editProjectModalOpen = false;
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al actualizar proyecto", "err");
    } finally {
      editProjectSaving = false;
    }
  }

  async function handleArchiveProject() {
    if (!project) return;
    if (!confirm(`¿Estás seguro de archivar el proyecto "${project.name}"?`)) return;
    try {
      await api.archiveWorkProject(project.id);
      showToast("Proyecto archivado");
      goto("/proyectos");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al archivar proyecto", "err");
    }
  }

  // Task Modal Handlers
  function openNewTaskModal() {
    editingTask = null;
    detailForm = {
      title: "",
      description: "",
      type: "task",
      status: "inbox",
      priority: "normal",
      category_id: "",
      project_id: String(projectId),
      assignee_id: "",
      start_date: "",
      due_date: "",
    };
    detailModalOpen = true;
  }

  function openEditTaskModal(task: WorkItem) {
    editingTask = task;
    detailForm = {
      title: task.title,
      description: task.description || "",
      type: task.type,
      status: task.status,
      priority: task.priority,
      category_id: task.category_id ? String(task.category_id) : "",
      project_id: task.project_id ? String(task.project_id) : String(projectId),
      assignee_id: task.assignee_id ? String(task.assignee_id) : "",
      start_date: task.start_date ? task.start_date.slice(0, 10) : "",
      due_date: task.due_date ? task.due_date.slice(0, 10) : "",
    };
    detailModalOpen = true;
  }

  async function handleSaveTask() {
    if (!detailForm.title.trim()) {
      showToast("El título de la tarea es obligatorio", "err");
      return;
    }
    taskSaving = true;
    try {
      const input: WorkItemInput = {
        id: editingTask?.id,
        title: detailForm.title.trim(),
        description: detailForm.description.trim(),
        type: detailForm.type,
        status: detailForm.status,
        priority: detailForm.priority,
        category_id: detailForm.category_id ? Number(detailForm.category_id) : null,
        project_id: detailForm.project_id ? Number(detailForm.project_id) : null,
        assignee_id: detailForm.assignee_id ? Number(detailForm.assignee_id) : null,
        start_date: detailForm.start_date || null,
        due_date: detailForm.due_date || null,
      };
      await api.upsertWorkItem(input);
      showToast(editingTask ? "Tarea actualizada" : "Tarea creada correctamente");
      detailModalOpen = false;
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al guardar tarea", "err");
    } finally {
      taskSaving = false;
    }
  }

  async function handleArchiveTask() {
    if (!editingTask) return;
    try {
      await api.archiveWorkItem(editingTask.id);
      showToast("Tarea archivada");
      detailModalOpen = false;
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al archivar tarea", "err");
    }
  }

  // Change status directly in Kanban
  async function updateTaskStatus(task: WorkItem, newStatus: WorkStatus) {
    try {
      await api.upsertWorkItem({
        id: task.id,
        title: task.title,
        status: newStatus,
      });
      showToast(`Estado actualizado a ${taskStatusLabel(newStatus)}`);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al actualizar estado", "err");
    }
  }
</script>

<section class="proyecto-detalle-page workspace-page">
  {#if loading}
    <div class="py-16 text-center text-sm text-[var(--color-muted-dim)]">
      Cargando detalle del proyecto...
    </div>
  {:else if !project}
    <EmptyState
      title="Proyecto no encontrado"
      description="No existe el proyecto solicitado o no pertenece a la empresa activa."
    >
      <Button variant="primary" onclick={() => goto("/proyectos")}>
        Volver a Proyectos
      </Button>
    </EmptyState>
  {:else}
    <!-- Top Nav / Back Button -->
    <div class="mb-4 flex items-center justify-between">
      <a
        href="/proyectos"
        class="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-purple-bright)] transition"
      >
        ← Volver a Proyectos
      </a>
      {#if $isAdmin}
        <div class="flex items-center gap-2">
          <Button variant="secondary" onclick={openEditProjectModal} class="text-xs">
            Editar proyecto
          </Button>
          <Button variant="ghost" onclick={handleArchiveProject} class="text-xs text-rose-300 hover:text-rose-200">
            Archivar proyecto
          </Button>
        </div>
      {/if}
    </div>

    <!-- Project Header Banner -->
    <Card lift={false} class="mb-6 border border-[var(--color-border-strong)] bg-purple-950/20 p-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 max-w-3xl">
          <div class="flex flex-wrap items-center gap-3 mb-2">
            <h1 class="text-2xl font-bold text-[var(--color-text)]">
              {project.name}
            </h1>
            <Badge tone={projectStatusTone(project.status)}>
              {projectStatusLabel(project.status)}
            </Badge>
          </div>

          {#if project.description}
            <p class="text-sm text-[var(--color-muted)] mb-4 leading-relaxed">
              {project.description}
            </p>
          {/if}

          <div class="flex flex-wrap items-center gap-6 text-xs text-[var(--color-muted-dim)]">
            {#if project.start_date}
              <span>Inicio: <strong class="text-[var(--color-text)]">{formatDate(project.start_date)}</strong></span>
            {/if}
            <span>Objetivo: <strong class="text-[var(--color-text)]">{formatDate(project.target_date)}</strong></span>
          </div>
        </div>

        <!-- Progress Overview Box -->
        <div class="w-full sm:w-64 shrink-0 space-y-3 rounded-xl border border-[var(--color-border-soft)] bg-black/30 p-4">
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium text-[var(--color-muted)]">Progreso global</span>
            <span class="font-bold text-[var(--color-purple-bright)]">{progressPercent}%</span>
          </div>
          <div class="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              class="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-300"
              style="width: {progressPercent}%"
            ></div>
          </div>

          <div class="flex items-center justify-between gap-1 text-[11px] text-[var(--color-muted-dim)] pt-1">
            <span>Tareas: <strong class="text-[var(--color-text)]">{totalTasks}</strong></span>
            <span>Hechas: <strong class="text-emerald-300">{completedTasks}</strong></span>
            {#if blockedTasks > 0}
              <span>Bloqueadas: <strong class="text-rose-300">{blockedTasks}</strong></span>
            {/if}
          </div>
        </div>
      </div>
    </Card>

    <!-- Quick Capture Form for this Project -->
    <Card lift={false} class="mb-6 border border-[var(--color-border)] bg-purple-950/10 p-4">
      <form
        onsubmit={(e) => {
          e.preventDefault();
          saveQuickTask();
        }}
        class="flex flex-wrap items-center gap-3 sm:flex-nowrap"
      >
        <input
          type="text"
          bind:value={quickTitle}
          placeholder="Añadir nueva tarea rápida a este proyecto..."
          class="field flex-1 min-w-[16rem] text-sm"
        />
        <Button variant="primary" type="submit" disabled={quickSaving} class="shrink-0">
          + Guardar tarea
        </Button>
      </form>
    </Card>

    <!-- Workspace Toolbar: Filters & View Mode Toggle -->
    <div class="workspace-toolbar mb-6 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-3 flex-1">
        <input
          type="text"
          bind:value={filterText}
          placeholder="Buscar tareas en este proyecto…"
          class="field w-full max-w-xs text-sm"
        />
        <Select
          options={statusOptions}
          bind:value={filterStatus}
          placeholder="Todos los estados"
          class="w-44"
        />
        <Select
          options={typeOptions}
          bind:value={filterType}
          placeholder="Todos los tipos"
          class="w-40"
        />
        <Select
          options={priorityOptions}
          bind:value={filterPriority}
          placeholder="Todas las prioridades"
          class="w-44"
        />
        <Select
          options={assigneeOptions}
          bind:value={filterAssignee}
          placeholder="Todos los responsables"
          class="w-48"
        />
      </div>

      <!-- View Switcher -->
      <div class="flex items-center gap-2">
        <div class="inline-flex rounded-xl border border-[var(--color-border)] bg-black/20 p-1">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-medium transition {viewMode === 'lista'
              ? 'bg-[var(--color-purple-deep)] text-white shadow'
              : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
            onclick={() => (viewMode = "lista")}
          >
            ☰ Lista
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-medium transition {viewMode === 'kanban'
              ? 'bg-[var(--color-purple-deep)] text-white shadow'
              : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
            onclick={() => (viewMode = "kanban")}
          >
            ◫ Kanban
          </button>
        </div>

        <Button variant="primary" onclick={openNewTaskModal} class="text-xs">
          + Nueva tarea
        </Button>
      </div>
    </div>

    <!-- Content: Lista or Kanban -->
    {#if filteredTasks.length === 0}
      <EmptyState
        title="No hay tareas en este proyecto"
        description={tasks.length === 0 ? "Empieza creando la primera tarea para este proyecto." : "No hay tareas que coincidan con los filtros aplicados."}
      >
        <Button variant="primary" onclick={openNewTaskModal}>+ Nueva tarea</Button>
      </EmptyState>
    {:else if viewMode === "lista"}
      <Card lift={false} class="overflow-hidden p-0">
        <div class="divide-y divide-[var(--color-border-soft)]">
          {#each filteredTasks as task (task.id)}
            <button
              type="button"
              onclick={() => openEditTaskModal(task)}
              class="group flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-purple-500/[0.06]"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-purple-bright)]">
                    {task.title}
                  </span>
                  {#if task.category}
                    <span
                      class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border border-white/10"
                      style="background-color: {task.category.color}22; color: {task.category.color}"
                    >
                      ● {task.category.name}
                    </span>
                  {/if}
                </div>
                {#if task.description}
                  <p class="mt-0.5 max-w-2xl truncate text-xs text-[var(--color-muted-dim)]">
                    {task.description}
                  </p>
                {/if}
              </div>

              <div class="flex flex-wrap items-center gap-2 shrink-0">
                <Badge tone={statusBadgeTone(task.status)}>{taskStatusLabel(task.status)}</Badge>
                <Badge tone="neutral">{taskTypeLabel(task.type)}</Badge>
                <Badge tone={priorityBadgeTone(task.priority)}>{priorityLabel(task.priority)}</Badge>

                {#if task.assignee_name}
                  <span class="text-xs text-[var(--color-muted)]">
                    👤 {task.assignee_name}
                  </span>
                {/if}

                {#if task.due_date}
                  <span class="text-xs text-[var(--color-muted-dim)] tabular">
                    📅 {formatDate(task.due_date)}
                  </span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      </Card>
    {:else}
      <!-- Kanban Board View -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-start">
        {#each kanbanColumns as col}
          {@const colTasks = filteredTasks.filter((t) => t.status === col.status)}
          <div class="rounded-2xl border border-[var(--color-border)] bg-black/20 p-3 flex flex-col min-h-[300px]">
            <!-- Column Header -->
            <div class="flex items-center justify-between mb-3 px-1 pb-2 border-b border-[var(--color-border-soft)]">
              <div class="flex items-center gap-2">
                <Badge tone={col.tone}>{col.label}</Badge>
              </div>
              <span class="text-xs font-bold text-[var(--color-muted-dim)]">{colTasks.length}</span>
            </div>

            <!-- Column Task Cards -->
            <div class="space-y-2 flex-1">
              {#each colTasks as task (task.id)}
                <Card
                  lift={true}
                  class="cursor-pointer border border-[var(--color-border-soft)] p-3 hover:border-[var(--color-border-strong)] transition-all"
                  onclick={() => openEditTaskModal(task)}
                >
                  <div class="space-y-2">
                    <div class="flex items-start justify-between gap-1">
                      <h4 class="text-xs font-semibold text-[var(--color-text)] leading-snug">
                        {task.title}
                      </h4>
                    </div>

                    {#if task.description}
                      <p class="text-[11px] text-[var(--color-muted-dim)] line-clamp-2">
                        {task.description}
                      </p>
                    {/if}

                    <div class="flex flex-wrap items-center gap-1.5 pt-1">
                      <Badge tone={priorityBadgeTone(task.priority)}>{priorityLabel(task.priority)}</Badge>
                      {#if task.category}
                        <span
                          class="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style="background-color: {task.category.color}22; color: {task.category.color}"
                        >
                          {task.category.name}
                        </span>
                      {/if}
                    </div>

                    {#if task.assignee_name || task.due_date}
                      <div class="flex items-center justify-between text-[10px] text-[var(--color-muted-dim)] pt-1 border-t border-white/5">
                        <span>{task.assignee_name ? `👤 ${task.assignee_name}` : ""}</span>
                        <span>{task.due_date ? `📅 ${formatDate(task.due_date)}` : ""}</span>
                      </div>
                    {/if}
                  </div>
                </Card>
              {/each}
              {#if colTasks.length === 0}
                <div class="py-8 text-center text-xs italic text-[var(--color-muted-dim)]">
                  Sin tareas
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>

<!-- Edit Project Modal (Admin) -->
<Modal
  open={editProjectModalOpen}
  title="Editar Proyecto"
  onclose={() => (editProjectModalOpen = false)}
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      handleSaveProject();
    }}
    class="space-y-4 pt-1"
  >
    <div class="space-y-1">
      <label for="edit-project-name" class="text-xs font-medium text-[var(--color-muted)]">Nombre del proyecto</label>
      <input
        id="edit-project-name"
        type="text"
        bind:value={editProjectForm.name}
        class="field w-full text-sm"
        required
      />
    </div>

    <div class="space-y-1">
      <label for="edit-project-desc" class="text-xs font-medium text-[var(--color-muted)]">Descripción</label>
      <textarea
        id="edit-project-desc"
        bind:value={editProjectForm.description}
        rows={3}
        class="field w-full text-sm"
      ></textarea>
    </div>

    <Select
      label="Estado"
      options={projectStatusOptions}
      bind:value={editProjectForm.status}
    />

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="space-y-1">
        <label for="edit-project-start" class="text-xs font-medium text-[var(--color-muted)]">Fecha de inicio</label>
        <input
          id="edit-project-start"
          type="date"
          bind:value={editProjectForm.start_date}
          class="field w-full text-sm"
        />
      </div>
      <div class="space-y-1">
        <label for="edit-project-target" class="text-xs font-medium text-[var(--color-muted)]">Fecha objetivo</label>
        <input
          id="edit-project-target"
          type="date"
          bind:value={editProjectForm.target_date}
          class="field w-full text-sm"
        />
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-4">
      <Button variant="ghost" type="button" onclick={() => (editProjectModalOpen = false)}>
        Cancelar
      </Button>
      <Button variant="primary" type="submit" disabled={editProjectSaving}>
        Guardar cambios
      </Button>
    </div>
  </form>
</Modal>

<!-- Task Detail Modal -->
<Modal
  open={detailModalOpen}
  title={editingTask ? "Detalle de Tarea" : "Nueva Tarea"}
  onclose={() => (detailModalOpen = false)}
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      handleSaveTask();
    }}
    class="space-y-4 pt-1"
  >
    <div class="space-y-1">
      <label for="task-title" class="text-xs font-medium text-[var(--color-muted)]">Título</label>
      <input
        id="task-title"
        type="text"
        bind:value={detailForm.title}
        placeholder="Título de la tarea"
        class="field w-full text-sm"
        required
      />
    </div>

    <div class="space-y-1">
      <label for="task-desc" class="text-xs font-medium text-[var(--color-muted)]">Descripción</label>
      <textarea
        id="task-desc"
        bind:value={detailForm.description}
        placeholder="Añade detalles o notas..."
        rows={3}
        class="field w-full text-sm"
      ></textarea>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <Select
        label="Tipo"
        options={detailTypeOptions}
        bind:value={detailForm.type}
      />
      <Select
        label="Estado"
        options={detailStatusOptions}
        bind:value={detailForm.status}
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <Select
        label="Prioridad"
        options={detailPriorityOptions}
        bind:value={detailForm.priority}
      />
      <Select
        label="Categoría"
        options={categoryOptions}
        bind:value={detailForm.category_id}
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <Select
        label="Proyecto"
        options={detailProjectOptions}
        bind:value={detailForm.project_id}
      />
      <Select
        label="Responsable"
        options={detailAssigneeOptions}
        bind:value={detailForm.assignee_id}
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="space-y-1">
        <label for="task-start-date" class="text-xs font-medium text-[var(--color-muted)]">Fecha de inicio</label>
        <input
          id="task-start-date"
          type="date"
          bind:value={detailForm.start_date}
          class="field w-full text-sm"
        />
      </div>
      <div class="space-y-1">
        <label for="task-due-date" class="text-xs font-medium text-[var(--color-muted)]">Fecha límite</label>
        <input
          id="task-due-date"
          type="date"
          bind:value={detailForm.due_date}
          class="field w-full text-sm"
        />
      </div>
    </div>

    <div class="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
      {#if editingTask}
        <Button variant="danger" type="button" onclick={handleArchiveTask}>
          Archivar
        </Button>
      {:else}
        <div></div>
      {/if}

      <div class="flex items-center gap-2">
        <Button variant="ghost" type="button" onclick={() => (detailModalOpen = false)}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" disabled={taskSaving}>
          Guardar cambios
        </Button>
      </div>
    </div>
  </form>
</Modal>
