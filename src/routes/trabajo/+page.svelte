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
  let loading = $state(true);

  // Quick Capture State
  let quickTitle = $state("");
  let quickCategoryName = $state("");
  let quickSaving = $state(false);

  // Filters State
  let filterText = $state("");
  let filterStatus = $state<string>("");
  let filterType = $state<string>("");
  let filterPriority = $state<string>("");
  let filterAssignee = $state<string>("");
  let viewMode = $state<"list" | "kanban">("list");

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

  const kanbanColumns: { status: WorkStatus; label: string; tone: "neutral" | "ok" | "warn" | "danger" | "ai" }[] = [
    { status: "inbox", label: "Inbox", tone: "neutral" },
    { status: "planned", label: "Planificado", tone: "warn" },
    { status: "in_progress", label: "En progreso", tone: "ai" },
    { status: "blocked", label: "Bloqueado", tone: "danger" },
    { status: "done", label: "Hecho", tone: "ok" },
  ];

  async function moveTaskStatus(item: WorkItem, newStatus: WorkStatus) {
    try {
      await api.upsertWorkItem({
        id: item.id,
        title: item.title,
        status: newStatus,
      });
      showToast(`Estado cambiado a ${statusLabel(newStatus)}`);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al cambiar estado", "err");
    }
  }

  async function loadData() {
    loading = true;
    try {
      const [cats, mems, workList] = await Promise.all([
        api.listWorkCategories(),
        api.listWorkMembers(),
        api.listWorkItems(),
      ]);
      categories = cats;
      members = mems;
      items = workList;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al cargar datos de Trabajo", "err");
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
  });

  // Watch URL params for ?item=<id> or ?nuevo=1
  $effect(() => {
    const url = $page.url;
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
        project_id: null,
        assignee_id: null,
      });
      quickTitle = "";
      quickCategoryName = "";
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
      goto("/trabajo", { replaceState: true });
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
  <!-- Intro Header (Obsidian + radiant purple design system) -->
  <div class="workspace-intro workspace-intro-compact mb-6">
    <p class="workspace-index">02 / TRABAJO MULTIEMPRESA</p>
    <div class="workspace-intro-row">
      <h2>Bandeja de trabajo,<br /><em>organizada.</em></h2>
      <p>Gestión centralizada de tareas, incidencias e hitos clasificados por categoría.</p>
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
        class="field flex-1 min-w-[16rem] text-sm"
      />
      <div class="relative w-full sm:w-56">
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

    <!-- View Mode Switcher Toggle (Lista / Kanban) -->
    <div class="flex items-center rounded-xl border border-[var(--color-border-soft)] bg-black/40 p-1">
      <button
        type="button"
        onclick={() => (viewMode = "list")}
        class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition {viewMode === 'list' ? 'bg-purple-500/20 text-[var(--color-purple-bright)] shadow-sm' : 'text-[var(--color-muted)] hover:text-white'}"
      >
        <span class="text-sm">☰</span> Lista
      </button>
      <button
        type="button"
        onclick={() => (viewMode = "kanban")}
        class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition {viewMode === 'kanban' ? 'bg-purple-500/20 text-[var(--color-purple-bright)] shadow-sm' : 'text-[var(--color-muted)] hover:text-white'}"
      >
        <span class="text-sm">☳</span> Kanban
      </button>
    </div>

    {#if $isAdmin}
      <Button variant="secondary" onclick={openNewCategoryModal} class="ml-auto text-xs">
        + Nueva categoría
      </Button>
    {/if}
  </div>

  <!-- Content View (Lista vs Kanban) -->
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
  {:else if viewMode === "kanban"}
    <!-- Kanban Board View -->
    <div class="grid grid-cols-1 gap-4 overflow-x-auto pb-4 md:grid-cols-5 min-w-[70rem]">
      {#each kanbanColumns as col}
        {@const colItems = filteredItems.filter((i) => i.status === col.status)}
        <div class="flex flex-col rounded-xl border border-[var(--color-border-soft)] bg-black/30 p-3">
          <!-- Column Header -->
          <div class="mb-3 flex items-center justify-between border-b border-[var(--color-border-soft)] pb-2.5">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-sm text-[var(--color-text)]">{col.label}</span>
              <Badge tone={col.tone}>{colItems.length}</Badge>
            </div>
            <button
              type="button"
              onclick={() => {
                editingItem = null;
                detailForm = {
                  title: "",
                  description: "",
                  type: "task",
                  status: col.status,
                  priority: "normal",
                  category_id: "",
                  assignee_id: "",
                  start_date: "",
                  due_date: "",
                };
                detailModalOpen = true;
              }}
              class="text-xs text-[var(--color-muted-dim)] hover:text-[var(--color-purple-bright)] font-bold"
              title="Añadir a esta columna"
            >
              +
            </button>
          </div>

          <!-- Column Cards -->
          {#if colItems.length === 0}
            <div class="flex flex-1 items-center justify-center py-8 text-center text-xs text-[var(--color-muted-dim)] border border-dashed border-[var(--color-border-soft)] rounded-lg">
              Sin tareas
            </div>
          {:else}
            <div class="space-y-2.5 flex-1">
              {#each colItems as item (item.id)}
                <Card
                  lift={true}
                  class="cursor-pointer border border-[var(--color-border-soft)] bg-purple-950/20 p-3 transition hover:border-purple-400/40 hover:shadow-md"
                  onclick={() => openEditTaskModal(item)}
                >
                  <div class="flex items-start justify-between gap-2">
                    <p class="font-medium text-xs text-[var(--color-text)] hover:text-[var(--color-purple-bright)] line-clamp-2">
                      {item.title}
                    </p>
                    {#if item.category}
                      <span
                        class="h-2 w-2 rounded-full shrink-0"
                        style="background-color: {item.category.color || '#3b82f6'}"
                        title={item.category.name}
                      ></span>
                    {/if}
                  </div>

                  {#if item.description}
                    <p class="mt-1 line-clamp-2 text-[11px] text-[var(--color-muted-dim)]">
                      {item.description}
                    </p>
                  {/if}

                  <div class="mt-2.5 flex flex-wrap items-center justify-between gap-1 border-t border-white/5 pt-2 text-[10px]">
                    <div class="flex items-center gap-1">
                      <Badge tone={priorityBadgeTone(item.priority)}>{priorityLabel(item.priority)}</Badge>
                      <span class="text-[var(--color-muted-dim)]">{typeLabel(item.type)}</span>
                    </div>

                    {#if item.assignee_name}
                      <span class="text-[var(--color-muted)] truncate max-w-[80px]" title={item.assignee_name}>
                        👤 {item.assignee_name}
                      </span>
                    {/if}
                  </div>
                </Card>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
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
        label="Responsable"
        options={detailAssigneeOptions}
        bind:value={detailForm.assignee_id}
      />
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
