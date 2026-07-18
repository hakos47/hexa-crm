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
  import { currentUser, isAdmin, clearSession } from "$lib/stores/session";
  import { TEMP_PASSWORD_LENGTH } from "$lib/auth/password-policy";

  let settings = $state<Settings | null>(null);
  let health = $state<{ ok: boolean; models: string[] } | null>(null);
  let users = $state<AuthUser[]>([]);
  let loading = $state(true);
  let defaultVatStr = $state("21");
  let roleStr = $state<string>("cajero");

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

  let pinForm = $state({ current: "", next: "", confirm: "" });

  const runtimeMode = $derived(
    api.isTauri() ? "Tauri · SQLite" : "Web · API / Postgres o localStorage",
  );

  async function load() {
    loading = true;
    try {
      settings = await api.getSettings();
      defaultVatStr = String(settings.default_vat);
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

  onMount(load);

  async function save() {
    if (!settings) return;
    try {
      settings.default_vat = Number(defaultVatStr) as VatRate;
      settings = await api.updateSettings(settings);
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
      a.download = `nix-c-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Copia de seguridad descargada");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al exportar", "err");
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
</script>

{#if loading || !settings}
  <div class="space-y-4">
    <div class="skeleton h-16 w-full max-w-xl"></div>
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="skeleton h-40"></div>
      <div class="skeleton h-40"></div>
    </div>
    <div class="skeleton h-56"></div>
  </div>
{:else}
  <!-- Page header -->
  <div
    class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
  >
    <div>
      <p class="section-label mb-1">Configuración</p>
      <h1 class="text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">
        Ajustes
      </h1>
      <p class="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
        Tienda, seguridad, Ollama y usuarios — mismo lenguaje visual que el resto del CRM.
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button variant="secondary" onclick={load}>Recargar</Button>
      <Button onclick={save}>Guardar ajustes</Button>
    </div>
  </div>

  <!-- Status strip -->
  <div class="mb-6 grid gap-3 sm:grid-cols-3">
    <Card class="!p-4" lift={false}>
      <div class="flex items-start gap-3">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/15 text-lg text-[var(--color-purple-bright)]"
        >
          ◈
        </div>
        <div class="min-w-0">
          <p class="section-label !text-[0.65rem]">Sesión</p>
          <p class="mt-1 truncate font-medium text-[var(--color-text)]">
            {$currentUser?.display_name ?? "—"}
          </p>
          <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted-dim)]">
            <span>@{$currentUser?.username}</span>
            <Badge tone={$currentUser?.role === "admin" ? "ai" : "ok"}>
              {$currentUser?.role}
            </Badge>
          </p>
        </div>
      </div>
    </Card>
    <Card class="!p-4" lift={false}>
      <div class="flex items-start gap-3">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-lg text-cyan-300"
        >
          ◎
        </div>
        <div class="min-w-0">
          <p class="section-label !text-[0.65rem]">Tienda</p>
          <p class="mt-1 truncate font-medium text-[var(--color-text)]">
            {settings.shop_name || "Sin nombre"}
          </p>
          <p class="mt-0.5 text-xs text-[var(--color-muted-dim)]">
            IVA por defecto {defaultVatStr}%
          </p>
        </div>
      </div>
    </Card>
    <Card class="!p-4" lift={false}>
      <div class="flex items-start gap-3">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/15 text-lg text-[var(--color-purple)]"
        >
          ✦
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <p class="section-label !text-[0.65rem]">Ollama</p>
            <Badge tone={health?.ok ? "ok" : "danger"}>
              {health?.ok ? "Conectado" : "Offline"}
            </Badge>
          </div>
          <p class="mt-1 truncate font-mono text-sm text-[var(--color-purple-bright)]">
            {settings.ollama_model || "—"}
          </p>
          <p class="mt-0.5 truncate text-xs text-[var(--color-muted-dim)]">
            {health?.models?.length ?? 0} modelo(s)
          </p>
        </div>
      </div>
    </Card>
  </div>

  <div class="grid gap-4 lg:grid-cols-2">
    <!-- Security -->
    <Card
      lift={false}
      class="relative overflow-hidden border border-[var(--color-border)] !p-5 lg:col-span-1"
    >
      <div
        class="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-purple-500/10 blur-2xl"
      ></div>
      <div class="relative">
        <p class="section-label mb-1">Seguridad</p>
        <h2 class="text-lg font-semibold text-[var(--color-text)]">Contraseña / PIN</h2>
        <p class="mt-1 mb-4 text-xs text-[var(--color-muted)]">
          Cambia las credenciales de la sesión actual.
        </p>
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
      </div>
    </Card>

    <!-- Shop -->
    <Card
      lift={false}
      class="relative overflow-hidden border border-[var(--color-border)] !p-5"
    >
      <div
        class="pointer-events-none absolute -left-6 -bottom-6 h-24 w-24 rounded-full bg-fuchsia-500/10 blur-2xl"
      ></div>
      <div class="relative">
        <p class="section-label mb-1">Comercio</p>
        <h2 class="text-lg font-semibold text-[var(--color-text)]">Tienda</h2>
        <p class="mt-1 mb-4 text-xs text-[var(--color-muted)]">
          Nombre visible en login y asistente IA. Usa «Guardar ajustes» arriba.
        </p>
        <div class="grid grid-cols-1 gap-3">
          <Input label="Nombre de la tienda" bind:value={settings.shop_name} />
          <Select
            label="IVA por defecto"
            bind:value={defaultVatStr}
            options={VAT_RATES.map((r) => ({ value: String(r), label: vatLabel(r) }))}
          />
        </div>
      </div>
    </Card>

    <!-- Ollama full width -->
    <Card
      lift={false}
      class="relative overflow-hidden border border-[var(--color-border-strong)] !p-5 glow-purple lg:col-span-2"
    >
      <div
        class="pointer-events-none absolute right-0 top-0 h-32 w-48 rounded-full bg-purple-500/15 blur-3xl"
      ></div>
      <div class="relative">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="section-label mb-1">Inteligencia local</p>
            <h2 class="text-lg font-semibold text-radiant-bright">Ollama</h2>
            <p class="mt-1 text-xs text-[var(--color-muted)]">
              URL y modelo del asistente. Selecciona un chip o escribe el nombre.
            </p>
          </div>
          <Badge tone={health?.ok ? "ok" : "danger"}>
            {health?.ok ? "Conectado" : "Offline"}
          </Badge>
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
            Ollama no responde en esta URL. Arranca <code class="text-rose-100">ollama serve</code> o
            revisa la dirección.
          </p>
        {/if}
      </div>
    </Card>

    <!-- Users -->
    {#if $isAdmin}
      <Card lift={false} class="border border-[var(--color-border)] !p-0 lg:col-span-2">
        <div
          class="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p class="section-label mb-1">Equipo</p>
            <h2 class="text-lg font-semibold text-[var(--color-text)]">Usuarios</h2>
            <p class="mt-1 text-xs text-[var(--color-muted)]">
              Al crear un usuario se genera una contraseña temporal de {TEMP_PASSWORD_LENGTH} caracteres
              (24 h).
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
                  <Button variant="ghost" class="!px-2.5 !py-1.5 text-xs" onclick={() => openEditUser(u)}>
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
    {/if}

    <!-- Environment / danger -->
    <Card
      lift={false}
      class="border border-[var(--color-border)] !p-5 lg:col-span-2"
    >
      <p class="section-label mb-1">Sistema</p>
      <h2 class="text-lg font-semibold text-[var(--color-text)]">Entorno y copias</h2>
      <p class="mt-1 mb-4 text-sm text-[var(--color-muted)]">
        Runtime: <span class="text-[var(--color-purple-bright)]">{runtimeMode}</span>
        · Documentación en <code class="text-xs text-[var(--color-muted)]">docs/BACKUP.md</code>
      </p>
      <div class="flex flex-wrap gap-2">
        {#if $isAdmin}
          <Button variant="secondary" onclick={exportBackup}>Exportar copia</Button>
        {/if}
        {#if $isAdmin && !api.isTauri()}
          <Button variant="danger" onclick={resetDemo}>Restaurar demo</Button>
        {/if}
      </div>
      {#if $isAdmin && !api.isTauri()}
        <p class="mt-3 text-xs text-[var(--color-muted-dim)]">
          «Restaurar demo» borra datos de la instancia web y cierra sesión.
        </p>
      {/if}
    </Card>
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
