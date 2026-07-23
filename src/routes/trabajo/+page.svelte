<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api/client";
  import { session, isAdmin } from "$lib/stores/session";
  import { showToast } from "$lib/stores/ui";
  import type {
    WorkCategory,
    WorkItem,
    WorkItemFilters,
    WorkItemInput,
    WorkItemType,
    WorkMember,
    WorkPriority,
    WorkStatus,
    WorkProject,
  } from "$lib/types";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Select from "$lib/components/Select.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";

  let items = $state<WorkItem[]>([]);
  let categories = $state<WorkCategory[]>([]);
  let members = $state<WorkMember[]>([]);
  let projects = $state<WorkProject[]>([]);
  let loading = $state(true);

  // Quick Capture State
  let quickTitle = $state("");
  let quickCategoryName = $state("");
  let quickProjectId = $state("");
  let quickSaving = $state(false);

  // Filters State
  let filterText = $state("");
  let filterStatus = $state<string>("");
  let filterType = $state<string>("");
  let filterPriority = $state<string>("");
  let filterAssignee = $state<string>("");
  let filterProject = $state<string>("");

  // Detail Modal / Drawer State
  let detailModalOpen = $state(false);
  let editingItem = $state<WorkItem | null>(null);
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

  // Category Management Modal State
  let categoryModalOpen = $state(false);
  let editingCategory = $state<WorkCategory | null>(null);
  let categoryForm = $state({ name: "", color: "#3b82f6" });

  let mergeModalOpen = $state(false);
  let mergeSourceCategory = $state<WorkCategory | null>(null);
  let mergeTargetCategoryId = $state("");

  // Track active company switch
  let lastCompanyId = $state<number | null>(null);

  // Options for selects
  const statusOptions = [
    { value: "", label: "Todos los estados" },
    { value: "inbox", label: "Inbox" },
    { value: "planned", label: "Planificado" },
    { value: "in_progress", label: "En progreso" },
    { value: "blocked", label: "Bloqueado" },
    { value: "done", label: "Hecho" },
    { value: "archived", label: "Archivados" },
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

  const projectFilterOptions = $derived([
    { value: "", label: "Todos los proyectos" },
    { value: "none", label: "Sin proyecto" },
    ...projects.map((p) => ({ value: String(p.id), label: p.name })),
  ]);

  const quickProjectOptions = $derived([
    { value: "", label: "Sin proyecto" },
    ...projects.map((p) => ({ value: String(p.id), label: p.name })),
  ]);

  const detailProjectOptions = $derived([
    { value: "", label: "Sin proyecto" },
    ...projects.map((p) => ({ value: String(p.id), label: p.name })),
  ]);

  async function loadData() {
    loading = true;
    try {
      const [cats, mems, workList, projList] = await Promise.all([
        api.listWorkCategories(),
        api.listWorkMembers(),
        api.listWorkItems(),
        api.listWorkProjects(),
      ]);
      categories = cats;
      members = mems;
      items = workList;
      projects = projList;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al cargar datos de Trabajo", "err");
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
  });

  // Watch URL params for ?project=<id>, ?item=<id> or ?nuevo=1
  $effect(() => {
    const url = $page.url;
    const projectParam = url.searchParams.get("project");
    if (projectParam !== null && projectParam !== filterProject) {
      filterProject = projectParam;
    }

    const nuevoParam = url.searchParams.get("nuevo");
    const itemParam = url.searchParams.get("item");

    if (nuevoParam === "1") {
      openNewTaskModal();
    } else if (itemParam) {
      const targetId = Number(itemParam);
      const found = items.find((i) => i.id === targetId);
      if (found) {
        openEditTaskModal(found);
      }
    }
  });

  // Handle active company switch safety: reset project filter when active company changes
  $effect(() => {
    const currentCid = $session.activeCompanyId;
    if (lastCompanyId !== null && lastCompanyId !== currentCid) {
      filterProject = "";
      if ($page.url.searchParams.has("project")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("project");
        goto(url.pathname + url.search, { replaceState: true });
      }
      loadData();
    }
    lastCompanyId = currentCid;
  });

  function handleProjectFilterChange(val: string) {
    filterProject = val;
    const url = new URL(window.location.href);
    if (val) {
      url.searchParams.set("project", val);
    } else {
      url.searchParams.delete("project");
    }
    goto(url.pathname + url.search, { replaceState: true, keepFocus: true });
  }

  async function saveQuickTask() {
    if (!quickTitle.trim()) {
      showToast("Escribe un título para la tarea", "err");
      return;
    }
    quickSaving = true;
    try {
      await api.upsertWorkItem({
        title: quickTitle.trim(),
        category_name: quickCategoryName.trim() || undefined,
        type: "task",
        status: "inbox",
        priority: "normal",
        project_id: quickProjectId ? Number(quickProjectId) : null,
        assignee_id: null,
      });
      quickTitle = "";
      quickCategoryName = "";
      quickProjectId = "";
      showToast("Tarea guardada correctamente");
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al guardar tarea", "err");
    } finally {
      quickSaving = false;
    }
  }

  function openNewTaskModal() {
    editingItem = null;
    detailForm = {
      title: "",
      description: "",
      type: "task",
      status: "inbox",
      priority: "normal",
      category_id: "",
      project_id: filterProject && filterProject !== "none" ? filterProject : "",
      assignee_id: "",
      start_date: "",
      due_date: "",
    };
    detailModalOpen = true;
  }

  function openEditTaskModal(item: WorkItem) {
    editingItem = item;
    detailForm = {
      title: item.title,
      description: item.description || "",
      type: item.type,
      status: item.status,
      priority: item.priority,
      category_id: item.category_id ? String(item.category_id) : "",
      project_id: item.project_id ? String(item.project_id) : "",
      assignee_id: item.assignee_id ? String(item.assignee_id) : "",
      start_date: item.start_date ? item.start_date.slice(0, 10) : "",
      due_date: item.due_date ? item.due_date.slice(0, 10) : "",
    };
    detailModalOpen = true;
  }

  function closeDetailModal() {
    detailModalOpen = false;
    editingItem = null;
    if ($page.url.searchParams.has("item") || $page.url.searchParams.has("nuevo")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("item");
      url.searchParams.delete("nuevo");
      goto(url.pathname + url.search, { replaceState: true });
    }
  }

  async function saveDetailTask() {
    if (!detailForm.title.trim()) {
      showToast("El título de la tarea es obligatorio", "err");
      return;
    }
    try {
      const input: WorkItemInput = {
        id: editingItem?.id,
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
      showToast(editingItem ? "Tarea actualizada" : "Tarea creada correctamente");
      closeDetailModal();
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al guardar tarea", "err");
    }
  }

  async function handleArchiveTask() {
    if (!editingItem) return;
    try {
      await api.archiveWorkItem(editingItem.id);
      showToast("Tarea archivada");
      closeDetailModal();
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al archivar tarea", "err");
    }
  }

  // Category Management Handlers (Admin)
  function openNewCategoryModal() {
    if (!$isAdmin) {
      showToast("Permiso denegado: solo administradores", "err");
      return;
    }
    editingCategory = null;
    categoryForm = { name: "", color: "#3b82f6" };
    categoryModalOpen = true;
  }

  function openEditCategoryModal(cat: WorkCategory) {
    if (!$isAdmin) {
      showToast("Permiso denegado: solo administradores", "err");
      return;
    }
    editingCategory = cat;
    categoryForm = { name: cat.name, color: cat.color || "#3b82f6" };
    categoryModalOpen = true;
  }

  async function saveCategory() {
    if (!$isAdmin) {
      showToast("Acción solo permitida para administradores", "err");
      return;
    }
    if (!categoryForm.name.trim()) {
      showToast("El nombre de la categoría es obligatorio", "err");
      return;
    }
    try {
      await api.upsertWorkCategory({
        id: editingCategory?.id,
        name: categoryForm.name.trim(),
        color: categoryForm.color,
      });
      showToast(editingCategory ? "Categoría actualizada" : "Categoría creada");
      categoryModalOpen = false;
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al guardar categoría", "err");
    }
  }

  function openMergeCategoryModal(cat: WorkCategory) {
    if (!$isAdmin) {
      showToast("Permiso denegado: solo administradores", "err");
      return;
    }
    mergeSourceCategory = cat;
    mergeTargetCategoryId = "";
    mergeModalOpen = true;
  }

  async function executeMergeCategory() {
    if (!mergeSourceCategory || !mergeTargetCategoryId) {
      showToast("Selecciona la categoría de destino", "err");
      return;
    }
    try {
      await api.mergeWorkCategories(mergeSourceCategory.id, Number(mergeTargetCategoryId));
      showToast("Categorías fusionadas correctamente");
      mergeModalOpen = false;
      mergeSourceCategory = null;
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al fusionar categorías", "err");
    }
  }

  async function handleArchiveCategory(cat: WorkCategory) {
    if (!$isAdmin) {
      showToast("Permiso denegado: solo administradores", "err");
      return;
    }
    if (!confirm(`¿Archivar la categoría "${cat.name}"?`)) return;
    try {
      await api.archiveWorkCategory(cat.id);
      showToast("Categoría archivada");
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al archivar categoría", "err");
    }
  }

  // Filter items
  const filteredItems = $derived(
    items.filter((item) => {
      if (filterText.trim()) {
        const q = filterText.trim().toLowerCase();
        const titleMatch = item.title.toLowerCase().includes(q);
        const descMatch = (item.description || "").toLowerCase().includes(q);
        const catMatch = (item.category?.name || "").toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !catMatch) return false;
      }
      if (filterStatus && item.status !== filterStatus) return false;
      if (filterType && item.type !== filterType) return false;
      if (filterPriority && item.priority !== filterPriority) return false;
      if (filterAssignee && String(item.assignee_id || "") !== filterAssignee) return false;
      if (filterProject) {
        if (filterProject === "none") {
          if (item.project_id !== null) return false;
        } else {
          if (String(item.project_id || "") !== filterProject) return false;
        }
      }
      return true;
    })
  );

  // Group filtered items by category
  const groupedCategories = $derived(() => {
    const activeCats = categories.filter((c) => !c.archived_at);
    const groups: { category: WorkCategory | null; items: WorkItem[] }[] = [];

    // Named categories
    for (const cat of activeCats) {
      const catItems = filteredItems.filter((i) => i.category_id === cat.id);
      groups.push({ category: cat, items: catItems });
    }

    // Uncategorized group
    const uncategorizedItems = filteredItems.filter((i) => !i.category_id);
    if (uncategorizedItems.length > 0 || groups.length === 0) {
      groups.push({ category: null, items: uncategorizedItems });
    }

    return groups;
  });

  function getProjectName(id?: number | null) {
    if (!id) return null;
    const p = projects.find((proj) => proj.id === id);
    return p ? p.name : null;
  }

  function typeLabel(t: string) {
    switch (t) {
      case "idea": return "Idea";
      case "task": return "Tarea";
      case "issue": return "Incidencia";
      case "milestone": return "Hito";
      default: return t;
    }
  }

  function statusLabel(s: string) {
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
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return iso;
    }
  }

  function formatDateTime(iso?: string | null) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }
</script>

<section class="trabajo-page workspace-page">
  <!-- Intro Header -->
  <div class="workspace-intro workspace-intro-compact mb-6">
    <p class="workspace-index">02 / TRABAJO MULTIEMPRESA</p>
    <div class="workspace-intro-row">
      <h2>Bandeja de trabajo,<br /><em>organizada.</em></h2>
      <p>Gestión centralizada de tareas, incidencias e hitos clasificados por categoría y proyecto.</p>
    </div>
  </div>

  <!-- Quick Capture Form -->
  <Card lift={false} class="mb-6 border border-[var(--color-border-strong)] bg-purple-950/10 p-4">
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
        placeholder="Escribe el título de la tarea..."
        class="field flex-1 min-w-[14rem] text-sm"
      />
      <div class="relative w-full sm:w-44">
        <input
          type="text"
          bind:value={quickCategoryName}
          placeholder="Categoría (ej. Ventas)..."
          list="quick-category-suggestions"
          class="field w-full text-sm"
        />
        <datalist id="quick-category-suggestions">
          {#each categories as cat}
            <option value={cat.name}></option>
          {/each}
        </datalist>
      </div>
      <Select
        options={quickProjectOptions}
        bind:value={quickProjectId}
        placeholder="Sin proyecto"
        class="w-full sm:w-44"
      />
      <Button variant="primary" type="submit" disabled={quickSaving} class="shrink-0">
        + Guardar tarea
      </Button>
    </form>
  </Card>

  <!-- Filter Bar -->
  <div class="workspace-toolbar mb-6 flex flex-wrap items-center gap-3">
    <input
      type="text"
      bind:value={filterText}
      placeholder="Buscar tarea por título o descripción…"
      class="field w-full max-w-xs text-sm"
    />
    <Select
      options={projectFilterOptions}
      value={filterProject}
      onvaluechange={handleProjectFilterChange}
      placeholder="Todos los proyectos"
      class="w-48"
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
    {#if $isAdmin}
      <Button variant="secondary" onclick={openNewCategoryModal} class="ml-auto text-xs">
        + Nueva categoría
      </Button>
    {/if}
  </div>

  <!-- Content / Grouped List View -->
  {#if loading}
    <div class="py-12 text-center text-sm text-[var(--color-muted-dim)]">
      Cargando bandeja de trabajo...
    </div>
  {:else if filteredItems.length === 0}
    <EmptyState
      title="No hay tareas que coincidan"
      description="Prueba a ajustar los filtros de búsqueda o crea una nueva tarea rápida arriba."
    >
      <Button variant="primary" onclick={openNewTaskModal}>+ Nueva tarea</Button>
    </EmptyState>
  {:else}
    <div class="space-y-6">
      {#each groupedCategories() as group}
        {#if group.items.length > 0 || group.category !== null}
          <Card lift={false} class="overflow-hidden p-0">
            <!-- Category Header -->
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-soft)] bg-black/20 p-4">
              <div class="flex items-center gap-3">
                <span
                  class="h-3.5 w-3.5 rounded-full border border-white/20 shadow-sm"
                  style="background-color: {group.category?.color || '#6b7280'}"
                ></span>
                <h3 class="font-semibold text-[var(--color-text)]">
                  {group.category ? group.category.name : "Sin categoría"}
                </h3>
                <Badge tone="neutral">{group.items.length}</Badge>
              </div>

              {#if $isAdmin && group.category}
                <div class="flex items-center gap-1.5">
                  <Button variant="ghost" class="!px-2.5 !py-1 text-xs" onclick={() => openEditCategoryModal(group.category!)}>
                    Editar
                  </Button>
                  <Button variant="ghost" class="!px-2.5 !py-1 text-xs" onclick={() => openMergeCategoryModal(group.category!)}>
                    Fusionar
                  </Button>
                  <Button variant="ghost" class="!px-2.5 !py-1 text-xs text-rose-300 hover:text-rose-200" onclick={() => handleArchiveCategory(group.category!)}>
                    Archivar
                  </Button>
                </div>
              {/if}
            </div>

            <!-- Task Items List -->
            {#if group.items.length === 0}
              <p class="p-4 text-xs text-[var(--color-muted-dim)]">Sin tareas en esta categoría.</p>
            {:else}
              <div class="divide-y divide-[var(--color-border-soft)]">
                {#each group.items as item (item.id)}
                  <button
                    type="button"
                    onclick={() => openEditTaskModal(item)}
                    class="group flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-purple-500/[0.06]"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-purple-bright)]">
                          {item.title}
                        </span>
                        {#if item.source_href}
                          <span class="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300" title="Origen Dashboard">
                            Alerta
                          </span>
                        {/if}
                      </div>
                      {#if item.description}
                        <p class="mt-0.5 max-w-2xl truncate text-xs text-[var(--color-muted-dim)]">
                          {item.description}
                        </p>
                      {/if}
                    </div>

                    <div class="flex flex-wrap items-center gap-2 shrink-0">
                      {#if item.project_id}
                        {@const projName = getProjectName(item.project_id)}
                        {#if projName}
                          <span class="inline-flex items-center gap-1 rounded-md bg-purple-500/10 border border-purple-400/20 px-2 py-0.5 text-xs font-medium text-[var(--color-purple-bright)]">
                            ◫ {projName}
                          </span>
                        {/if}
                      {/if}
                      <Badge tone={statusBadgeTone(item.status)}>{statusLabel(item.status)}</Badge>
                      <Badge tone="neutral">{typeLabel(item.type)}</Badge>
                      <Badge tone={priorityBadgeTone(item.priority)}>{priorityLabel(item.priority)}</Badge>

                      {#if item.assignee_name}
                        <span class="text-xs text-[var(--color-muted)]">
                          👤 {item.assignee_name}
                        </span>
                      {/if}

                      {#if item.due_date}
                        <span class="text-xs text-[var(--color-muted-dim)] tabular">
                          📅 {formatDate(item.due_date)}
                        </span>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </Card>
        {/if}
      {/each}
    </div>
  {/if}
</section>

<!-- Task Detail Modal / Drawer -->
<Modal
  open={detailModalOpen}
  title={editingItem ? "Detalle de Tarea" : "Nueva Tarea"}
  onclose={closeDetailModal}
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      saveDetailTask();
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
        placeholder="Añade detalles, notas o instrucciones..."
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

    {#if editingItem?.status === "done" && editingItem?.completed_at}
      <div class="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">
        Completado el: {formatDateTime(editingItem.completed_at)}
      </div>
    {/if}

    {#if editingItem?.source_href}
      <div class="pt-1">
        <a
          href={editingItem.source_href}
          class="inline-flex items-center gap-1.5 rounded-lg border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-xs text-[var(--color-purple-bright)] hover:bg-purple-500/20"
        >
          Volver al origen →
        </a>
      </div>
    {/if}

    <div class="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
      {#if editingItem}
        <Button variant="danger" type="button" onclick={handleArchiveTask}>
          Archivar
        </Button>
      {:else}
        <div></div>
      {/if}

      <div class="flex items-center gap-2">
        <Button variant="ghost" type="button" onclick={closeDetailModal}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit">
          Guardar cambios
        </Button>
      </div>
    </div>
  </form>
</Modal>

<!-- Category Edit/Create Modal (Admin) -->
<Modal
  open={categoryModalOpen}
  title={editingCategory ? "Editar Categoría" : "Nueva Categoría"}
  onclose={() => (categoryModalOpen = false)}
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      saveCategory();
    }}
    class="space-y-4 pt-1"
  >
    <div class="space-y-1">
      <label for="cat-name" class="text-xs font-medium text-[var(--color-muted)]">Nombre</label>
      <input
        id="cat-name"
        type="text"
        bind:value={categoryForm.name}
        placeholder="Ej. Inventario, Ventas, Proyectos..."
        class="field w-full text-sm"
        required
      />
    </div>

    <div class="space-y-1">
      <label for="cat-color" class="text-xs font-medium text-[var(--color-muted)]">Color de distintivo</label>
      <div class="flex items-center gap-3">
        <input
          id="cat-color"
          type="color"
          bind:value={categoryForm.color}
          class="h-9 w-12 cursor-pointer rounded border border-[var(--color-border)] bg-transparent p-0.5"
        />
        <input
          type="text"
          bind:value={categoryForm.color}
          class="field text-sm font-mono w-28"
        />
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-4">
      <Button variant="ghost" type="button" onclick={() => (categoryModalOpen = false)}>
        Cancelar
      </Button>
      <Button variant="primary" type="submit">
        Guardar categoría
      </Button>
    </div>
  </form>
</Modal>

<!-- Merge Category Modal (Admin) -->
<Modal
  open={mergeModalOpen}
  title="Fusionar Categoría"
  onclose={() => {
    mergeModalOpen = false;
    mergeSourceCategory = null;
  }}
>
  <div class="space-y-4 pt-1">
    <p class="text-sm text-[var(--color-muted)]">
      Reasignarás todas las tareas de <strong>"{mergeSourceCategory?.name}"</strong> a la categoría seleccionada a continuación, y luego se archivará la categoría de origen.
    </p>

    <Select
      label="Categoría destino"
      options={categories
        .filter((c) => c.id !== mergeSourceCategory?.id && !c.archived_at)
        .map((c) => ({ value: String(c.id), label: c.name }))}
      bind:value={mergeTargetCategoryId}
      placeholder="Selecciona la categoría de destino..."
    />

    <div class="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-4">
      <Button variant="ghost" type="button" onclick={() => (mergeModalOpen = false)}>
        Cancelar
      </Button>
      <Button variant="primary" type="button" onclick={executeMergeCategory}>
        Fusionar categorías
      </Button>
    </div>
  </div>
</Modal>
