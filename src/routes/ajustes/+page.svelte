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
    if (!confirm(`¿Generar nueva contraseña temporal de ${TEMP_PASSWORD_LENGTH} caracteres para @${u.username}?`)) {
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
</script>

{#if loading || !settings}
  <div class="skeleton h-64"></div>
{:else}
  <div class="mx-auto grid w-full max-w-3xl gap-4">
    <Card lift={false}>
      <h2 class="mb-3 font-semibold">Sesión</h2>
      <p class="text-sm text-[var(--color-muted)]">
        Conectado como <strong class="text-[var(--color-text)]">{$currentUser?.display_name}</strong>
        <Badge tone={$currentUser?.role === "admin" ? "ai" : "ok"}>{$currentUser?.role}</Badge>
      </p>
      <p class="mt-1 text-xs text-[var(--color-muted-dim)]">Usuario: {$currentUser?.username}</p>
    </Card>

    <Card lift={false}>
      <h2 class="mb-3 font-semibold">Cambiar mi contraseña / PIN</h2>
      <form
        class="grid grid-cols-1 gap-3 sm:grid-cols-3"
        onsubmit={(e) => {
          e.preventDefault();
          changePin();
        }}
      >
        <Input label="Actual" type="password" bind:value={pinForm.current} required />
        <Input label="Nueva" type="password" bind:value={pinForm.next} required />
        <Input label="Confirmar" type="password" bind:value={pinForm.confirm} required />
        <div class="sm:col-span-3">
          <Button type="submit">Actualizar</Button>
        </div>
      </form>
    </Card>

    <Card lift={false}>
      <h2 class="mb-3 font-semibold">Tienda</h2>
      <div class="grid grid-cols-1 gap-3">
        <Input label="Nombre de la tienda" bind:value={settings.shop_name} />
        <Select
          label="IVA por defecto"
          bind:value={defaultVatStr}
          options={VAT_RATES.map((r) => ({ value: String(r), label: vatLabel(r) }))}
        />
      </div>
    </Card>

    <Card lift={false}>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold">Ollama (IA local)</h2>
        <Badge tone={health?.ok ? "ok" : "danger"}>
          {health?.ok ? "Conectado" : "Offline"}
        </Badge>
      </div>
      <div class="grid grid-cols-1 gap-3">
        <Input label="URL de Ollama" bind:value={settings.ollama_url} />
        <Input label="Modelo" bind:value={settings.ollama_model} placeholder="qwen3.5:4b" />
        {#if health?.models?.length}
          <div class="flex flex-wrap gap-1.5">
            {#each health.models.slice(0, 12) as m}
              <button
                type="button"
                class="rounded-lg border border-[var(--color-border)] bg-black/20 px-2 py-1 text-xs text-[var(--color-muted)] hover:border-purple-400/40"
                onclick={() => {
                  settings!.ollama_model = m;
                }}
              >
                {m}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </Card>

    {#if $isAdmin}
      <Card lift={false}>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="font-semibold">Usuarios</h2>
            <p class="mt-0.5 text-xs text-[var(--color-muted-dim)]">
              Al crear un usuario se genera una contraseña temporal de {TEMP_PASSWORD_LENGTH} caracteres
              (válida 24 h; debe cambiarla al entrar).
            </p>
          </div>
          <Button onclick={openCreateUser}>+ Usuario</Button>
        </div>
        <ul class="divide-y divide-white/5">
          {#each users as u}
            <li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
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
              <div class="flex flex-wrap gap-1">
                <Button variant="ghost" class="!px-2 !py-1 text-xs" onclick={() => openEditUser(u)}>
                  Editar
                </Button>
                <Button variant="secondary" class="!px-2 !py-1 text-xs" onclick={() => regenTemp(u)}>
                  Nueva temp
                </Button>
              </div>
            </li>
          {/each}
        </ul>
      </Card>
    {/if}

    <Card lift={false}>
      <h2 class="mb-2 font-semibold">Entorno</h2>
      <p class="mb-3 text-sm text-[var(--color-muted)]">
        Modo: {api.isTauri() ? "Tauri (SQLite nativo)" : "Navegador (localStorage)"}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button onclick={save}>Guardar ajustes</Button>
        <Button variant="secondary" onclick={load}>Recargar</Button>
        {#if $isAdmin && !api.isTauri()}
          <Button variant="danger" onclick={resetDemo}>Restaurar demo</Button>
        {/if}
      </div>
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
      <p class="rounded-xl border border-purple-400/20 bg-purple-500/10 px-3 py-2 text-xs text-[var(--color-muted)]">
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
