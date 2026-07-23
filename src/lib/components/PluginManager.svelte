<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { PluginAuditLogEntry, PluginConfig, PluginKey, TenantPlugin } from "$lib/types";
  import Badge from "./Badge.svelte";
  import Button from "./Button.svelte";
  import Select from "./Select.svelte";
  import { showToast } from "$lib/stores/ui";

  let plugins = $state<TenantPlugin[]>([]);
  let busy = $state<PluginKey | null>(null);
  let testing = $state<PluginKey | null>(null);
  let loading = $state(true);

  let logsMap = $state<Record<PluginKey, PluginAuditLogEntry[]>>({
    database_bridge: [],
    stripe_mcp: [],
  });
  let logsOpen = $state<Record<PluginKey, boolean>>({
    database_bridge: false,
    stripe_mcp: false,
  });
  let loadingLogs = $state<Record<PluginKey, boolean>>({
    database_bridge: false,
    stripe_mcp: false,
  });

  const statusLabel = (plugin: TenantPlugin) => ({
    inactive: "Inactivo",
    needs_secret: "Falta secreto",
    ready: "Preparado",
    error: "Con error",
  })[plugin.status];

  const statusTone = (plugin: TenantPlugin): "ok" | "warn" | "danger" | "neutral" => ({
    inactive: "neutral",
    needs_secret: "warn",
    ready: "ok",
    error: "danger",
  })[plugin.status] as "ok" | "warn" | "danger" | "neutral";

  const actionLabel = (action: string) => {
    switch (action) {
      case "enabled_or_updated":
      case "enabled":
        return "Configuración activada / guardada";
      case "disabled":
        return "Plugin desactivado";
      case "connection_test_ok":
      case "test_ok":
        return "Prueba de conexión correcta";
      case "connection_test_failed":
      case "test_failed":
        return "Prueba de conexión fallida";
      case "tool_requested":
        return "Solicitud de herramienta";
      case "tool_blocked_permission":
        return "Bloqueado por permisos";
      case "tool_blocked_approval":
        return "Bloqueado por confirmación";
      case "tool_write":
        return "Escritura por herramienta";
      case "tool_read":
      case "tool_success":
        return "Lectura por herramienta";
      case "tool_error":
        return "Error en herramienta";
      default:
        return action;
    }
  };

  const resultTone = (result: string): "ok" | "warn" | "danger" | "neutral" => {
    switch (result) {
      case "ok":
        return "ok";
      case "blocked":
        return "warn";
      case "error":
        return "danger";
      default:
        return "neutral";
    }
  };

  const resultLabel = (result: string) => {
    switch (result) {
      case "ok":
        return "Éxito";
      case "blocked":
        return "Bloqueado";
      case "error":
        return "Error";
      default:
        return result;
    }
  };

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return "Sin datos";
    try {
      const d = new Date(iso);
      return d.toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return String(iso);
    }
  }

  async function loadLogs(key: PluginKey) {
    loadingLogs[key] = true;
    try {
      logsMap[key] = await api.listPluginLogs(key, 20);
    } catch {
      logsMap[key] = [];
    } finally {
      loadingLogs[key] = false;
    }
  }

  function toggleLogs(key: PluginKey) {
    logsOpen[key] = !logsOpen[key];
    if (logsOpen[key]) {
      loadLogs(key);
    }
  }

  async function load() {
    loading = true;
    try {
      plugins = await api.listPlugins();
      for (const p of plugins) {
        if (logsOpen[p.plugin_key]) {
          await loadLogs(p.plugin_key);
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudieron cargar los plugins", "err");
    } finally {
      loading = false;
    }
  }

  async function persist(plugin: TenantPlugin, enabled = plugin.enabled) {
    busy = plugin.plugin_key;
    try {
      const saved = await api.updatePlugin(plugin.plugin_key, enabled, plugin.config);
      plugins = plugins.map((item) => item.plugin_key === saved.plugin_key ? saved : item);
      showToast(enabled ? "Plugin guardado para esta tienda" : "Plugin desactivado para esta tienda");
      if (logsOpen[plugin.plugin_key]) {
        await loadLogs(plugin.plugin_key);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo guardar", "err");
      await load();
    } finally {
      busy = null;
    }
  }

  async function toggle(plugin: TenantPlugin) {
    await persist(plugin, !plugin.enabled);
  }

  async function test(plugin: TenantPlugin) {
    testing = plugin.plugin_key;
    try {
      const result = await api.testPlugin(plugin.plugin_key);
      showToast(result.message);
      await load();
      if (logsOpen[plugin.plugin_key]) {
        await loadLogs(plugin.plugin_key);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "La conexión falló", "err");
      await load();
      if (logsOpen[plugin.plugin_key]) {
        await loadLogs(plugin.plugin_key);
      }
    } finally {
      testing = null;
    }
  }

  function updateConfig(plugin: TenantPlugin, patch: PluginConfig) {
    plugin.config = { ...plugin.config, ...patch };
  }

  onMount(load);
</script>

<section class="space-y-4" data-plugin-manager>
  <div class="rounded-2xl border border-purple-400/20 bg-purple-500/[0.06] px-4 py-3">
    <p class="text-sm font-medium text-[var(--color-purple-bright)]">Plugins por tienda</p>
    <p class="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
      La activación y la configuración pertenecen únicamente a la empresa seleccionada. Las credenciales no se
      ingresan aquí: configura únicamente el nombre de la variable de entorno en el servidor. Nunca se almacenan valores de secretos.
    </p>
  </div>

  {#if loading}
    <div class="rounded-2xl border border-[var(--color-border)] bg-black/20 px-5 py-10 text-center text-sm text-[var(--color-muted)]">
      Cargando plugins…
    </div>
  {:else}
    <div class="grid gap-4 xl:grid-cols-2">
      {#each plugins as plugin (plugin.plugin_key)}
        <article
          class="relative overflow-hidden rounded-2xl border p-5 transition {plugin.enabled
            ? 'border-purple-400/30 bg-purple-500/[0.07] shadow-[0_0_28px_rgba(147,51,234,0.08)]'
            : 'border-[var(--color-border)] bg-black/20'}"
          data-plugin-key={plugin.plugin_key}
          data-plugin-enabled={plugin.enabled}
        >
          <div class="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-fuchsia-500/10 blur-3xl"></div>
          <div class="relative">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="mb-2 flex flex-wrap items-center gap-2">
                  <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/15 text-lg text-[var(--color-purple-bright)]">
                    {plugin.plugin_key === "stripe_mcp" ? "S" : "DB"}
                  </span>
                  <div>
                    <h3 class="font-semibold text-[var(--color-text)]">{plugin.name}</h3>
                    <p class="text-[0.65rem] uppercase tracking-[0.16em] text-[var(--color-muted-dim)]">{plugin.category}</p>
                  </div>
                  <Badge tone={statusTone(plugin)}>{statusLabel(plugin)}</Badge>
                </div>
                <p class="max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">{plugin.description}</p>
              </div>
              <button
                type="button"
                class="relative h-7 w-12 shrink-0 rounded-full border transition {plugin.enabled
                  ? 'border-purple-400/50 bg-purple-500/60'
                  : 'border-white/15 bg-black/40'} disabled:opacity-50"
                role="switch"
                aria-checked={plugin.enabled}
                aria-label={`Activar ${plugin.name}`}
                disabled={busy === plugin.plugin_key}
                onclick={() => toggle(plugin)}
              >
                <span class="absolute top-1 h-[18px] w-[18px] rounded-full bg-white shadow transition-all {plugin.enabled ? 'left-[25px]' : 'left-1'}"></span>
              </button>
            </div>

            <!-- Panel de Estado Operativo y Parámetros del Plugin -->
            <div class="mt-4 rounded-xl border border-white/[0.06] bg-black/30 p-3 text-xs space-y-2" data-plugin-status-info>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <span class="text-[var(--color-muted-dim)] block text-[10px] uppercase font-semibold">Estado de salud</span>
                  <span class="font-medium text-[var(--color-text)]">{statusLabel(plugin)}</span>
                </div>
                <div>
                  <span class="text-[var(--color-muted-dim)] block text-[10px] uppercase font-semibold">Último chequeo</span>
                  <span class="font-mono text-[var(--color-muted)]">{formatDate(plugin.last_check || plugin.updated_at)}</span>
                </div>
                <div>
                  <span class="text-[var(--color-muted-dim)] block text-[10px] uppercase font-semibold">Secreto por referencia</span>
                  <span class="font-mono text-purple-300 font-semibold">
                    {plugin.plugin_key === "database_bridge"
                      ? (plugin.config.database_url_env || "HEXA_PLUGIN_DATABASE_SHOP_URL")
                      : (plugin.config.credential_env || "HEXA_STRIPE_SHOP_TOKEN")}
                  </span>
                </div>
                <div>
                  <span class="text-[var(--color-muted-dim)] block text-[10px] uppercase font-semibold">Entorno / Alcance</span>
                  <span class="font-medium text-[var(--color-text)]">
                    {plugin.plugin_key === "database_bridge"
                      ? (plugin.config.access_mode === "read_write" ? "Lectura y escritura" : "Solo lectura")
                      : (plugin.config.environment === "live" ? "Producción (Live)" : "Sandbox / Pruebas")}
                  </span>
                </div>
              </div>
              <div class="border-t border-white/5 pt-2 flex items-center justify-between text-[11px]">
                <span class="text-[var(--color-muted)]">Permisos de escritura:</span>
                <span class="font-medium {plugin.plugin_key === 'database_bridge'
                  ? (plugin.config.access_mode === 'read_write' ? 'text-amber-300' : 'text-emerald-400')
                  : (plugin.config.allow_write_tools ? 'text-amber-300' : 'text-emerald-400')}">
                  {plugin.plugin_key === "database_bridge"
                    ? (plugin.config.access_mode === "read_write" ? "Permitidos" : "Bloqueados (solo lectura)")
                    : (plugin.config.allow_write_tools ? "Permitidos (requiere confirmación humana)" : "Bloqueados (solo lectura)")}
                </span>
              </div>
            </div>

            <!-- Advertencia explícita para Stripe MCP (Requisito 5 & 6) -->
            {#if plugin.plugin_key === "stripe_mcp"}
              <div class="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.08] p-3 text-xs leading-relaxed text-amber-200/90" data-stripe-policy-notice>
                <div class="flex items-center gap-1.5 font-semibold text-amber-100 mb-1">
                  <span>ℹ️</span>
                  <span>Política del Plugin Stripe MCP: Sin sincronización automática</span>
                </div>
                <p>
                  Stripe MCP se encuentra <strong>desactivado por defecto</strong> y en <strong>modo solo lectura por defecto</strong>.
                  No realiza sincronización automática ni <strong>creación, migración o sincronización de clientes</strong> en Stripe para evitar duplicados y desajustes de sincronización bidireccional opaca.
                </p>
                {#if plugin.config.environment === "live"}
                  <p class="mt-2 text-amber-300 font-medium">
                    💡 En producción (Live), se recomienda utilizar únicamente una variable con clave restringida (<code>rk_live_...</code>) con permisos mínimos auditados.
                  </p>
                {/if}
              </div>
            {/if}

            <ul class="mt-4 flex flex-wrap gap-1.5">
              {#each plugin.capabilities as capability}
                <li class="rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-1 text-[11px] text-[var(--color-muted)]">{capability}</li>
              {/each}
            </ul>

            {#if plugin.enabled}
              <div class="mt-5 border-t border-[var(--color-border)] pt-4" data-plugin-config>
                {#if plugin.plugin_key === "database_bridge"}
                  <div class="grid gap-3 sm:grid-cols-2">
                    <label class="flex flex-col gap-1.5 text-sm">
                      <span class="font-medium text-[var(--color-muted)]">Nombre visible</span>
                      <input class="field" value={plugin.config.display_name ?? ""} oninput={(event) => updateConfig(plugin, { display_name: event.currentTarget.value })} />
                    </label>
                    <Select
                      label="Acceso"
                      value={plugin.config.access_mode ?? "read_only"}
                      onvaluechange={(value) => updateConfig(plugin, { access_mode: value === "read_write" ? "read_write" : "read_only" })}
                      options={[
                        { value: "read_only", label: "Solo lectura", hint: "Recomendado para centralización" },
                        { value: "read_write", label: "Lectura y escritura", hint: "Solo para integraciones controladas" },
                      ]}
                    />
                  </div>
                  <label class="mt-3 flex flex-col gap-1.5 text-sm">
                    <span class="font-medium text-[var(--color-muted)]">Variable de entorno con la URL PostgreSQL</span>
                    <input class="field font-mono text-xs" value={plugin.config.database_url_env ?? ""} oninput={(event) => updateConfig(plugin, { database_url_env: event.currentTarget.value })} />
                    <span class="text-[11px] text-[var(--color-muted-dim)]">Indica únicamente el nombre de la variable de entorno. Nunca ingreses URLs ni contraseñas reales.</span>
                  </label>
                {:else}
                  <div class="grid gap-3 sm:grid-cols-2">
                    <Select
                      label="Entorno Stripe"
                      value={plugin.config.environment ?? "sandbox"}
                      onvaluechange={(value) => updateConfig(plugin, { environment: value === "live" ? "live" : "sandbox" })}
                      options={[
                        { value: "sandbox", label: "Sandbox / pruebas" },
                        { value: "live", label: "Producción", hint: "Usa una clave restringida" },
                      ]}
                    />
                    <label class="flex flex-col gap-1.5 text-sm">
                      <span class="font-medium text-[var(--color-muted)]">Variable con token restringido</span>
                      <input class="field font-mono text-xs" value={plugin.config.credential_env ?? ""} oninput={(event) => updateConfig(plugin, { credential_env: event.currentTarget.value })} />
                      <span class="text-[11px] text-[var(--color-muted-dim)]">Nombre de la variable en el entorno (ej: HEXA_STRIPE_SHOP_TOKEN). Nunca ingresar el token directo.</span>
                    </label>
                  </div>
                  <label class="mt-3 flex items-start gap-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.05] px-3 py-3 text-sm">
                    <input type="checkbox" class="mt-0.5 accent-purple-500" checked={plugin.config.allow_write_tools === true} onchange={(event) => updateConfig(plugin, { allow_write_tools: event.currentTarget.checked })} />
                    <span>
                      <span class="block font-medium text-[var(--color-text)]">Permitir herramientas de escritura</span>
                      <span class="mt-0.5 block text-xs text-[var(--color-muted)]">Crear cobros, facturas o reembolsos seguirá requiriendo confirmación humana obligatoria de un administrador.</span>
                    </span>
                  </label>
                {/if}

                {#if plugin.last_error}
                  <p class="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{plugin.last_error}</p>
                {:else if !plugin.secret_configured}
                  <p class="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-100/80">Configura el secreto en el entorno del servicio y reinícialo para completar la conexión.</p>
                {/if}

                <div class="mt-4 flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" disabled={testing === plugin.plugin_key || busy === plugin.plugin_key} onclick={() => test(plugin)}>
                    {testing === plugin.plugin_key ? "Probando…" : "Probar conexión"}
                  </Button>
                  <Button disabled={busy === plugin.plugin_key} onclick={() => persist(plugin)}>
                    {busy === plugin.plugin_key ? "Guardando…" : "Guardar configuración"}
                  </Button>
                </div>
              </div>
            {/if}

            <!-- Panel Plegable de Historial de Actividad (Requisito 2 & 8) -->
            <div class="mt-5 border-t border-[var(--color-border)] pt-4" data-plugin-audit-panel>
              <button
                type="button"
                class="flex items-center justify-between w-full text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] transition py-1"
                onclick={() => toggleLogs(plugin.plugin_key)}
                data-toggle-audit-logs={plugin.plugin_key}
              >
                <span class="flex items-center gap-2">
                  <span>📋 Historial de actividad (auditoría por tienda)</span>
                  {#if logsMap[plugin.plugin_key]?.length > 0}
                    <span class="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300 font-mono">
                      {logsMap[plugin.plugin_key].length}
                    </span>
                  {/if}
                </span>
                <span>{logsOpen[plugin.plugin_key] ? "▲ Ocultar" : "▼ Ver registros"}</span>
              </button>

              {#if logsOpen[plugin.plugin_key]}
                <div class="mt-3 space-y-2" data-audit-logs-list={plugin.plugin_key}>
                  {#if loadingLogs[plugin.plugin_key]}
                    <p class="text-xs text-[var(--color-muted-dim)] py-2 text-center">Cargando registros de auditoría…</p>
                  {:else if logsMap[plugin.plugin_key].length === 0}
                    <div class="rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-center text-[var(--color-muted-dim)]" data-audit-logs-empty>
                      No hay registros de actividad auditables para este plugin en esta tienda. Las acciones de configuración, pruebas y uso de herramientas quedarán registradas aquí de forma segura.
                    </div>
                  {:else}
                    <div class="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {#each logsMap[plugin.plugin_key] as entry (entry.id)}
                        <div class="rounded-xl border border-white/5 bg-black/40 p-2.5 text-xs flex flex-col gap-1" data-audit-log-item={entry.id}>
                          <div class="flex flex-wrap items-center justify-between gap-1.5">
                            <div class="flex items-center gap-2">
                              <Badge tone={resultTone(entry.result)}>{resultLabel(entry.result)}</Badge>
                              <span class="font-medium text-[var(--color-text)]">{actionLabel(entry.action)}</span>
                              {#if entry.tool_name}
                                <span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-purple-200">{entry.tool_name}</span>
                              {/if}
                            </div>
                            <span class="text-[10px] font-mono text-[var(--color-muted-dim)]">{formatDate(entry.created_at)}</span>
                          </div>
                          {#if entry.summary}
                            <p class="text-[11px] text-[var(--color-muted)] leading-tight font-mono break-all">{entry.summary}</p>
                          {/if}
                          <div class="text-[10px] text-[var(--color-muted-dim)] flex items-center justify-between">
                            <span>Actor: <strong class="text-[var(--color-muted)]">{entry.actor_name || "Sistema"}</strong></span>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>
