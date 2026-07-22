<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { AuthUser, Settings, UserInput, UserRole } from "$lib/types";
  import { VAT_RATES, vatLabel, type VatRate } from "$lib/vat";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import Input from "$lib/components/Input.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Select from "$lib/components/Select.svelte";
  import { showToast } from "$lib/stores/ui";
  import {
    currentUser,
    isAdmin,
    clearSession,
    setIdleTimeoutMinutes,
  } from "$lib/stores/session";
  import { normalizeIdleTimeoutMinutes } from "$lib/auth/idle-timeout";
  import { parseBackupJson, type BackupEnvelope } from "$lib/backup/backup";
  import { theme, toggleTheme } from "$lib/stores/theme";
  import { TEMP_PASSWORD_LENGTH } from "$lib/auth/password-policy";
  import {
    applyGitHubUpdate,
    checkGitHubUpdate,
    getAppVersion,
    DEFAULT_RELEASES_PAGE,
  } from "$lib/update/check";
  import type { UpdateStatus } from "$lib/update/version";
  import { openExternalUrl } from "$lib/update/open-url";
  import {
    AJUSTES_SECTION_STORAGE_KEY,
    type AjustesSectionId,
    resolveActiveSection,
    sectionById,
    visibleAjustesSections,
  } from "$lib/settings/sections";

  let settings = $state<Settings | null>(null);
  let health = $state<{ ok: boolean; models: string[] } | null>(null);
  let users = $state<AuthUser[]>([]);
  let loading = $state(true);
  let defaultVatStr = $state("21");
  let roleStr = $state<string>("cajero");

  let appVersion = $state(getAppVersion());
  let updateStatus = $state<UpdateStatus | null>(null);
  let updateBusy = $state(false);

  let activeSection = $state<AjustesSectionId>("tienda");

  let userModal = $state(false);
  let editingUser = $state<AuthUser | null>(null);
  let userForm = $state({
    username: "",
    display_name: "",
    role: "cajero" as UserRole,
    active: true,
  });

  let createdTempPassword = $state<string | null>(null);
  let tempModal = $state(false);
  let restorePreview = $state<BackupEnvelope | null>(null);
  let restoreBusy = $state(false);

  let pinForm = $state({ current: "", next: "", confirm: "" });

  const runtimeMode = $derived(
    api.isTauri() ? "Tauri · SQLite" : "Web · API / Postgres o localStorage",
  );

  const navSections = $derived(visibleAjustesSections($isAdmin));
  const activeMeta = $derived(sectionById(activeSection));

  function setSection(id: AjustesSectionId) {
    activeSection = resolveActiveSection(id, $isAdmin);
    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.setItem(AJUSTES_SECTION_STORAGE_KEY, activeSection);
      } catch {
        /* ignore */
      }
    }
  }

  async function load() {
    loading = true;
    try {
      settings = await api.getSettings();
      defaultVatStr = String(settings.default_vat);
      setIdleTimeoutMinutes(settings.idle_timeout_minutes);
      health = await api.ollamaHealth();
      if ($isAdmin) {
        users = await api.listUsers();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    let stored: string | null = null;
    if (typeof sessionStorage !== "undefined") {
      try {
        stored = sessionStorage.getItem(AJUSTES_SECTION_STORAGE_KEY);
      } catch {
        stored = null;
      }
    }
    activeSection = resolveActiveSection(stored, $isAdmin);
    load();
  });

  // If role flips and current section is admin-only, land on a safe tab.
  $effect(() => {
    activeSection = resolveActiveSection(activeSection, $isAdmin);
  });

  async function save() {
    if (!settings) return;
    try {
      settings.default_vat = Number(defaultVatStr) as VatRate;
      settings = await api.updateSettings(settings);
      setIdleTimeoutMinutes(settings.idle_timeout_minutes);
      showToast("Ajustes guardados");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }

  async function resetDemo() {
    if (!confirm("¿Restaurar datos de demostración? Se perderán los datos actuales.")) {
      return;
    }
    try {
      await api.resetDemo();
      showToast("Demo restaurada — vuelve a iniciar sesión");
      clearSession();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }

  async function exportBackup() {
    try {
      const envelope = await api.exportBackup();
      const blob = new Blob([JSON.stringify(envelope, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hexa-crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      settings = await api.getSettings();
      showToast("Copia de seguridad descargada");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al exportar", "err");
    }
  }

  async function inspectBackupFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    restorePreview = null;
    if (!file) return;
    try {
      const validation = await parseBackupJson(await file.text());
      if (!validation.ok) {
        showToast(validation.error, "err");
        return;
      }
      restorePreview = validation.envelope;
    } catch {
      showToast("No se pudo leer la copia. Elige un JSON válido.", "err");
    }
  }

  async function restoreBackup() {
    if (!restorePreview) return;
    if (!confirm("Se sustituirán los datos locales por esta copia y se cerrará la sesión. ¿Continuar?")) {
      return;
    }
    restoreBusy = true;
    try {
      await api.restoreBackup(restorePreview);
      clearSession();
      showToast("Copia restaurada. Inicia sesión de nuevo.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo restaurar la copia", "err");
    } finally {
      restoreBusy = false;
    }
  }

  function openCreateUser() {
    editingUser = null;
    userForm = { username: "", display_name: "", role: "cajero", active: true };
    roleStr = "cajero";
    userModal = true;
  }

  function openEditUser(u: AuthUser) {
    editingUser = u;
    userForm = {
      username: u.username,
      display_name: u.display_name,
      role: u.role,
      active: u.active,
    };
    roleStr = u.role;
    userModal = true;
  }

  async function saveUser() {
    const input: UserInput = {
      id: editingUser?.id,
      username: userForm.username,
      display_name: userForm.display_name,
      role: (roleStr === "admin" ? "admin" : "cajero") as UserRole,
      active: userForm.active,
    };
    try {
      const result = await api.upsertUser(input);
      userModal = false;
      if (result.temporary_password) {
        createdTempPassword = result.temporary_password;
        tempModal = true;
        showToast("Usuario creado — copia la contraseña temporal");
      } else {
        showToast(editingUser ? "Usuario actualizado" : "Usuario creado");
      }
      users = await api.listUsers();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }

  async function regenTemp(u: AuthUser) {
    if (
      !confirm(
        `¿Generar nueva contraseña temporal de ${TEMP_PASSWORD_LENGTH} caracteres para @${u.username}?`,
      )
    ) {
      return;
    }
    try {
      const result = await api.upsertUser({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        role: u.role,
        active: u.active,
        pin: "__regen_temp__",
      });
      if (result.temporary_password) {
        createdTempPassword = result.temporary_password;
        tempModal = true;
      }
      users = await api.listUsers();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }

  async function changePin() {
    if (pinForm.next !== pinForm.confirm) {
      showToast("Las contraseñas nuevas no coinciden", "err");
      return;
    }
    try {
      await api.changeOwnPin(pinForm.current, pinForm.next);
      pinForm = { current: "", next: "", confirm: "" };
      showToast("Contraseña actualizada");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "err");
    }
  }

  async function copyTemp() {
    if (!createdTempPassword) return;
    try {
      await navigator.clipboard.writeText(createdTempPassword);
      showToast("Contraseña copiada");
    } catch {
      showToast("Copia manualmente la contraseña", "info");
    }
  }

  function selectModel(m: string) {
    if (settings) settings.ollama_model = m;
  }

  async function onCheckUpdate() {
    updateBusy = true;
    updateStatus = null;
    try {
      updateStatus = await checkGitHubUpdate({ isDesktop: api.isTauri() });
      if (updateStatus.kind === "error") {
        showToast(updateStatus.message, "err");
      } else if (updateStatus.kind === "update_available") {
        showToast(updateStatus.message, "info");
      } else {
        showToast(updateStatus.message);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al comprobar actualizaciones";
      updateStatus = {
        kind: "error",
        current_version: appVersion,
        latest_version: null,
        release_name: null,
        html_url: null,
        download_url: null,
        message: msg,
        can_install_in_app: false,
      };
      showToast(msg, "err");
    } finally {
      updateBusy = false;
    }
  }

  async function onApplyUpdate() {
    if (!updateStatus) {
      showToast("Primero comprueba si hay actualizaciones", "info");
      return;
    }
    updateBusy = true;
    try {
      const result = await applyGitHubUpdate(updateStatus, openExternalUrl, {
        isDesktop: api.isTauri(),
      });
      showToast(result.message, result.ok ? "info" : "err");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al abrir la descarga", "err");
    } finally {
      updateBusy = false;
    }
  }

  function openReleasesPage() {
    openExternalUrl(DEFAULT_RELEASES_PAGE);
  }
</script>

{#if loading || !settings}
  <div class="space-y-4" data-ajustes-loading>
    <div class="skeleton h-14 w-full max-w-md"></div>
    <div class="grid gap-4 lg:grid-cols-[14rem_1fr]">
      <div class="skeleton h-64"></div>
      <div class="skeleton h-72"></div>
    </div>
  </div>
{:else}
  <!-- Page header: calm orientation, not a wall of forms -->
  <header
    class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    data-ajustes-header
  >
    <div>
      <p class="section-label mb-1">Configuración</p>
      <h1 class="text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">
        Ajustes
      </h1>
      <p class="mt-1 max-w-lg text-sm text-[var(--color-muted)]">
        Elige una categoría a la izquierda. Solo ves lo que necesitas en cada momento.
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <p class="hidden text-xs text-[var(--color-muted-dim)] sm:block" data-ajustes-context>
        {$currentUser?.display_name ?? "—"}
        ·
        {settings.shop_name || "Sin tienda"}
      </p>
      <Button variant="secondary" onclick={load}>Recargar</Button>
      {#if activeMeta.hasSave}
        <Button onclick={save} data-ajustes-save-header>Guardar ajustes</Button>
      {/if}
    </div>
  </header>

  <!-- Category shell: progressive disclosure -->
  <div
    class="grid gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)]"
    data-ajustes-shell
  >
    <!-- Nav rail (pills on small screens) -->
    <nav
      class="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
      data-ajustes-nav
      aria-label="Categorías de ajustes"
    >
      {#each navSections as sec (sec.id)}
        <button
          type="button"
          data-ajustes-nav-item={sec.id}
          data-active={activeSection === sec.id ? "true" : "false"}
          class="shrink-0 rounded-xl border px-3 py-2.5 text-left text-sm transition lg:w-full
            {activeSection === sec.id
            ? 'border-purple-400/40 bg-purple-500/15 text-[var(--color-purple-bright)] shadow-[0_0_20px_rgba(168,85,247,0.12)]'
            : 'border-transparent bg-black/20 text-[var(--color-muted)] hover:border-[var(--color-border)] hover:bg-white/[0.03] hover:text-[var(--color-text)]'}
            {sec.danger && activeSection !== sec.id ? 'text-rose-200/70' : ''}"
          onclick={() => setSection(sec.id)}
        >
          <span class="block font-medium leading-tight">{sec.label}</span>
          {#if sec.adminOnly}
            <span class="mt-0.5 block text-[0.65rem] opacity-70">Admin</span>
          {/if}
          {#if sec.danger}
            <span class="mt-0.5 block text-[0.65rem] opacity-70">Zona sensible</span>
          {/if}
        </button>
      {/each}
    </nav>

    <!-- Single focus panel -->
    <div class="min-w-0" data-ajustes-panel={activeSection} data-ajustes-active={activeSection}>
      {#if activeSection === "cuenta"}
        <Card
          lift={false}
          class="relative overflow-hidden border border-[var(--color-border)] !p-5"
        >
          <div
            class="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-purple-500/10 blur-2xl"
          ></div>
          <div class="relative max-w-lg">
            <p class="section-label mb-1">Seguridad</p>
            <h2 class="text-lg font-semibold text-[var(--color-text)]">{activeMeta.title}</h2>
            <p class="mt-1 mb-5 text-sm text-[var(--color-muted)]">{activeMeta.hint}</p>

            <div
              class="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-black/25 px-3 py-2.5 text-sm"
            >
              <span class="font-medium text-[var(--color-text)]">
                {$currentUser?.display_name ?? "—"}
              </span>
              <span class="text-[var(--color-muted-dim)]">@{$currentUser?.username}</span>
              <Badge tone={$currentUser?.role === "admin" ? "ai" : "ok"}>
                {$currentUser?.role}
              </Badge>
            </div>

            <div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-black/20 px-3 py-3">
              <div>
                <p class="text-sm font-medium text-[var(--color-text)]">Aspecto</p>
                <p class="mt-0.5 text-xs text-[var(--color-muted)]">Tema {$theme === "dark" ? "oscuro" : "claro"}, guardado en este dispositivo.</p>
              </div>
              <Button variant="secondary" onclick={toggleTheme} data-theme-toggle>
                Usar modo {$theme === "dark" ? "claro" : "oscuro"}
              </Button>
            </div>

            <form
              class="grid grid-cols-1 gap-3"
              onsubmit={(e) => {
                e.preventDefault();
                changePin();
              }}
            >
              <Input label="Actual" type="password" bind:value={pinForm.current} required />
              <div class="grid gap-3 sm:grid-cols-2">
                <Input label="Nueva" type="password" bind:value={pinForm.next} required />
                <Input label="Confirmar" type="password" bind:value={pinForm.confirm} required />
              </div>
              <div class="pt-1">
                <Button type="submit" variant="secondary">Actualizar contraseña</Button>
              </div>
            </form>

            {#if $isAdmin}
              <div class="mt-6 border-t border-[var(--color-border)] pt-5">
                <p class="section-label mb-1">Mostrador compartido</p>
                <h3 class="text-sm font-semibold text-[var(--color-text)]">Bloqueo por inactividad</h3>
                <p class="mt-1 text-xs text-[var(--color-muted)]">
                  Tras este tiempo se cierra la sesión en pantalla. Usa 0 para desactivarlo.
                </p>
                <div class="mt-3 flex flex-wrap items-end gap-2">
                  <label class="flex w-40 flex-col gap-1.5 text-sm">
                    <span class="font-medium text-[var(--color-muted)]">Minutos (0–480)</span>
                    <input
                      class="field w-full"
                      type="number"
                      min="0"
                      max="480"
                      value={settings.idle_timeout_minutes}
                      oninput={(event) => {
                        settings!.idle_timeout_minutes = normalizeIdleTimeoutMinutes(
                          Number((event.currentTarget as HTMLInputElement).value),
                        );
                      }}
                    />
                  </label>
                  <Button onclick={save}>Guardar bloqueo</Button>
                </div>
              </div>
            {/if}
          </div>
        </Card>
      {:else if activeSection === "tienda"}
        <Card
          lift={false}
          class="relative overflow-hidden border border-[var(--color-border)] !p-5"
        >
          <div
            class="pointer-events-none absolute -left-6 -bottom-6 h-24 w-24 rounded-full bg-fuchsia-500/10 blur-2xl"
          ></div>
          <div class="relative max-w-lg">
            <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="section-label mb-1">Comercio</p>
                <h2 class="text-lg font-semibold text-[var(--color-text)]">{activeMeta.title}</h2>
                <p class="mt-1 text-sm text-[var(--color-muted)]">{activeMeta.hint}</p>
              </div>
              <Button onclick={save} data-ajustes-save>Guardar ajustes</Button>
            </div>
            <div class="grid grid-cols-1 gap-3">
              <Input label="Nombre de la tienda" bind:value={settings.shop_name} />
              <Select
                label="IVA por defecto"
                bind:value={defaultVatStr}
                options={VAT_RATES.map((r) => ({ value: String(r), label: vatLabel(r) }))}
              />
            </div>
            <p class="mt-4 text-xs text-[var(--color-muted-dim)]">
              Los cambios de nombre e IVA no se aplican hasta pulsar «Guardar ajustes».
            </p>
          </div>
        </Card>
      {:else if activeSection === "equipo" && $isAdmin}
        <Card lift={false} class="border border-[var(--color-border)] !p-0">
          <div
            class="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p class="section-label mb-1">Equipo</p>
              <h2 class="text-lg font-semibold text-[var(--color-text)]">{activeMeta.title}</h2>
              <p class="mt-1 text-sm text-[var(--color-muted)]">
                Al crear un usuario se genera una contraseña temporal de {TEMP_PASSWORD_LENGTH}
                caracteres (24 h).
              </p>
            </div>
            <Button onclick={openCreateUser}>+ Usuario</Button>
          </div>
          {#if users.length === 0}
            <p class="px-5 py-8 text-center text-sm text-[var(--color-muted-dim)]">
              No hay usuarios listados.
            </p>
          {:else}
            <ul class="divide-y divide-white/[0.04]">
              {#each users as u}
                <li
                  class="flex flex-col gap-3 px-5 py-3.5 transition hover:bg-purple-500/[0.04] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div class="flex min-w-0 items-center gap-3">
                    <div
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-purple-400/30 bg-purple-500/15 text-sm font-semibold text-[var(--color-purple-bright)]"
                    >
                      {(u.display_name || u.username || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div class="min-w-0">
                      <p class="font-medium text-[var(--color-text)]">
                        {u.display_name}
                        {#if !u.active}
                          <Badge tone="danger">inactivo</Badge>
                        {/if}
                        {#if u.must_change_password}
                          <Badge tone="warn">temp</Badge>
                        {/if}
                      </p>
                      <p class="text-xs text-[var(--color-muted-dim)]">
                        @{u.username} · <span class="capitalize">{u.role}</span>
                      </p>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-1.5 sm:justify-end">
                    <Button
                      variant="ghost"
                      class="!px-2.5 !py-1.5 text-xs"
                      onclick={() => openEditUser(u)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="secondary"
                      class="!px-2.5 !py-1.5 text-xs"
                      onclick={() => regenTemp(u)}
                    >
                      Nueva temp
                    </Button>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </Card>
      {:else if activeSection === "ia"}
        <Card
          lift={false}
          class="relative overflow-hidden border border-[var(--color-border-strong)] !p-5 glow-purple"
        >
          <div
            class="pointer-events-none absolute right-0 top-0 h-32 w-48 rounded-full bg-purple-500/15 blur-3xl"
          ></div>
          <div class="relative">
            <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="section-label mb-1">Inteligencia local</p>
                <h2 class="text-lg font-semibold text-radiant-bright">{activeMeta.title}</h2>
                <p class="mt-1 text-sm text-[var(--color-muted)]">{activeMeta.hint}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <Badge tone={health?.ok ? "ok" : "danger"}>
                  {health?.ok ? "Conectado" : "Offline"}
                </Badge>
                <Button onclick={save} data-ajustes-save>Guardar ajustes</Button>
              </div>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="URL de Ollama" bind:value={settings.ollama_url} />
              <Input label="Modelo" bind:value={settings.ollama_model} placeholder="qwen3.5:4b" />
            </div>
            {#if health?.models?.length}
              <p class="section-label mt-4 mb-2 !normal-case !tracking-wide">Modelos detectados</p>
              <div class="flex flex-wrap gap-2">
                {#each health.models.slice(0, 16) as m}
                  <button
                    type="button"
                    class="rounded-full border px-3 py-1.5 text-xs transition {settings.ollama_model ===
                    m
                      ? 'border-purple-400/50 bg-purple-500/20 text-[var(--color-purple-bright)] shadow-[0_0_16px_rgba(168,85,247,0.25)]'
                      : 'border-[var(--color-border)] bg-black/30 text-[var(--color-muted)] hover:border-purple-400/40 hover:text-[var(--color-purple-bright)]'}"
                    onclick={() => selectModel(m)}
                  >
                    {m}
                  </button>
                {/each}
              </div>
            {:else if health && !health.ok}
              <p
                class="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200/90"
              >
                Ollama no responde en esta URL. Arranca
                <code class="text-rose-100">ollama serve</code>
                o revisa la dirección.
              </p>
            {/if}
          </div>
        </Card>
      {:else if activeSection === "actualizaciones"}
        <div data-update-panel="github">
          <Card
            lift={false}
            class="relative overflow-hidden border border-[var(--color-border-strong)] !p-5 glow-purple"
          >
            <div
              class="pointer-events-none absolute -right-10 top-0 h-32 w-40 rounded-full bg-purple-500/15 blur-3xl"
            ></div>
            <div class="relative">
              <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="section-label mb-1">Actualizaciones</p>
                  <h2 class="text-lg font-semibold text-radiant-bright">{activeMeta.title}</h2>
                  <p class="mt-1 text-sm text-[var(--color-muted)]">
                    Versión instalada:
                    <span class="font-mono text-[var(--color-purple-bright)]" data-app-version>
                      {appVersion}
                    </span>
                    · Canal: HEXA-NIX/hexa-crm Releases
                  </p>
                </div>
                {#if updateStatus}
                  <Badge
                    tone={updateStatus.kind === "update_available"
                      ? "warn"
                      : updateStatus.kind === "up_to_date"
                        ? "ok"
                        : "danger"}
                  >
                    {updateStatus.kind === "update_available"
                      ? "Disponible"
                      : updateStatus.kind === "up_to_date"
                        ? "Al día"
                        : "Error"}
                  </Badge>
                {/if}
              </div>

              {#if updateStatus}
                <p
                  class="mb-3 rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm text-[var(--color-muted)]"
                  data-update-status
                >
                  {updateStatus.message}
                  {#if updateStatus.latest_version && updateStatus.kind === "update_available"}
                    <span class="mt-1 block font-mono text-xs text-[var(--color-purple-bright)]">
                      Remoto: v{updateStatus.latest_version}
                    </span>
                  {/if}
                </p>
              {/if}

              {#if !api.isTauri()}
                <p
                  class="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90"
                  data-update-web-fallback
                >
                  Modo web: puedes comprobar releases y abrir GitHub, pero <strong>no</strong> se
                  instala un binario en el navegador. La actualización completa del empaquetado es
                  para la app de escritorio (Tauri).
                </p>
              {/if}

              <div class="flex flex-wrap gap-2">
                <Button onclick={onCheckUpdate} disabled={updateBusy}>
                  {updateBusy ? "Comprobando…" : "Buscar actualizaciones"}
                </Button>
                <Button
                  variant="secondary"
                  onclick={onApplyUpdate}
                  disabled={updateBusy || updateStatus?.kind !== "update_available"}
                >
                  {api.isTauri() ? "Descargar / instalar" : "Abrir descarga en GitHub"}
                </Button>
                <Button variant="ghost" onclick={openReleasesPage} disabled={updateBusy}>
                  Ver releases
                </Button>
              </div>
              <p class="mt-3 text-xs text-[var(--color-muted-dim)]">
                Al aplicar se abre la página o el asset de la release. Debes instalar y reiniciar; la
                app no se actualiza sola en segundo plano.
              </p>
            </div>
          </Card>
        </div>
      {:else if activeSection === "sistema"}
        <div class="space-y-4" data-ajustes-danger-zone>
          <Card lift={false} class="border border-[var(--color-border)] !p-5">
            <p class="section-label mb-1">Sistema</p>
            <h2 class="text-lg font-semibold text-[var(--color-text)]">Entorno y copias</h2>
            <p class="mt-1 mb-4 text-sm text-[var(--color-muted)]">
              Runtime:
              <span class="text-[var(--color-purple-bright)]">{runtimeMode}</span>
              · Documentación en
              <code class="text-xs text-[var(--color-muted)]">docs/BACKUP.md</code>
            </p>
            {#if $isAdmin}
              <div class="flex flex-wrap gap-2">
                <Button variant="secondary" onclick={exportBackup}>Exportar copia</Button>
              </div>
              <p class="mt-3 text-xs text-[var(--color-muted-dim)]">
                {#if settings.last_backup_at}
                  Última copia: {new Date(settings.last_backup_at).toLocaleString("es-ES")}.
                {:else}
                  Aún no hay una copia registrada. Descarga un JSON con los datos de la instancia.
                {/if}
              </p>
              {#if !api.isTauri()}
                <div class="mt-5 border-t border-[var(--color-border)] pt-4">
                  <p class="text-sm font-medium text-[var(--color-text)]">Restaurar una copia</p>
                  <p class="mt-1 text-xs text-[var(--color-muted)]">
                    Primero comprobamos el checksum y te mostramos la fecha; nada se restaura al seleccionar el archivo.
                  </p>
                  <input
                    class="mt-3 block w-full text-xs text-[var(--color-muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-purple-500/15 file:px-3 file:py-2 file:text-xs file:font-medium file:text-[var(--color-purple-bright)]"
                    type="file"
                    accept="application/json,.json"
                    onchange={inspectBackupFile}
                  />
                  {#if restorePreview}
                    <div class="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs text-amber-100">
                      <p class="font-medium">Copia válida · {new Date(restorePreview.created_at).toLocaleString("es-ES")}</p>
                      <p class="mt-1 break-all text-amber-100/70">Checksum: {restorePreview.checksum}</p>
                      <Button class="mt-3" variant="danger" onclick={restoreBackup} disabled={restoreBusy}>
                        {restoreBusy ? "Restaurando…" : "Confirmar restauración"}
                      </Button>
                    </div>
                  {/if}
                </div>
              {/if}
            {:else}
              <p class="text-sm text-[var(--color-muted)]">
                Las copias de seguridad las gestiona un administrador.
              </p>
            {/if}
          </Card>

          {#if $isAdmin && !api.isTauri()}
            <Card
              lift={false}
              class="border border-rose-500/30 bg-rose-500/[0.06] !p-5"
              data-ajustes-danger-card
            >
              <p class="section-label mb-1 !text-rose-300/80">Zona de peligro</p>
              <h2 class="text-lg font-semibold text-rose-100">Restaurar demo</h2>
              <p class="mt-1 mb-4 text-sm text-rose-100/75">
                Borra los datos actuales de la instancia web y cierra la sesión. No se puede
                deshacer desde la app.
              </p>
              <Button variant="danger" onclick={resetDemo}>Restaurar demo</Button>
            </Card>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<Modal
  open={userModal}
  title={editingUser ? "Editar usuario" : "Nuevo usuario"}
  onclose={() => (userModal = false)}
>
  <form
    class="grid gap-3"
    onsubmit={(e) => {
      e.preventDefault();
      saveUser();
    }}
  >
    <Input label="Usuario (login)" bind:value={userForm.username} required />
    <Input label="Nombre visible" bind:value={userForm.display_name} required />
    <Select
      label="Rol"
      bind:value={roleStr}
      options={[
        { value: "admin", label: "Administrador" },
        { value: "cajero", label: "Cajero" },
      ]}
    />
    {#if !editingUser}
      <p
        class="rounded-xl border border-purple-400/20 bg-purple-500/10 px-3 py-2 text-xs text-[var(--color-muted)]"
      >
        Se generará automáticamente una contraseña temporal de {TEMP_PASSWORD_LENGTH} caracteres. El
        usuario deberá cambiarla en su primer acceso (menos de 24 h).
      </p>
    {/if}
    {#if editingUser}
      <label class="flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <input type="checkbox" bind:checked={userForm.active} />
        Activo
      </label>
    {/if}
    <div class="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" type="button" onclick={() => (userModal = false)}>Cancelar</Button>
      <Button type="submit">Guardar</Button>
    </div>
  </form>
</Modal>

<Modal open={tempModal} title="Contraseña temporal" onclose={() => (tempModal = false)}>
  <p class="mb-3 text-sm text-[var(--color-muted)]">
    Copia y entrega esta contraseña ahora. Solo se muestra una vez. Caduca en 24 h si no se cambia.
  </p>
  <code
    class="block break-all rounded-xl border border-purple-400/30 bg-black/40 px-3 py-3 text-center text-lg tracking-wider text-radiant-bright"
  >
    {createdTempPassword}
  </code>
  <div class="mt-4 flex flex-wrap justify-end gap-2">
    <Button variant="secondary" onclick={copyTemp}>Copiar</Button>
    <Button onclick={() => (tempModal = false)}>Hecho</Button>
  </div>
</Modal>
