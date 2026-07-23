<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { PluginConfig, PluginKey, TenantPlugin } from "$lib/types";
  import Badge from "./Badge.svelte";
  import Button from "./Button.svelte";
  import Select from "./Select.svelte";
  import { showToast } from "$lib/stores/ui";

  let plugins = $state<TenantPlugin[]>([]);
  let busy = $state<PluginKey | null>(null);
  let testing = $state<PluginKey | null>(null);
  let loading = $state(true);

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

  async function load() {
    loading = true;
    try {
      plugins = await api.listPlugins();
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
    } catch (error) {
      showToast(error instanceof Error ? error.message : "La conexión falló", "err");
      await load();
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
      La activación y la configuración pertenecen únicamente a la empresa seleccionada. Las claves no se
      guardan aquí: configura la variable indicada en el servicio del servidor.
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
                    <span class="font-medium text-[var(--color-muted)]">Variable con la URL PostgreSQL</span>
                    <input class="field font-mono text-xs" value={plugin.config.database_url_env ?? ""} oninput={(event) => updateConfig(plugin, { database_url_env: event.currentTarget.value })} />
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
                    </label>
                  </div>
                  <label class="mt-3 flex items-start gap-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.05] px-3 py-3 text-sm">
                    <input type="checkbox" class="mt-0.5 accent-purple-500" checked={plugin.config.allow_write_tools === true} onchange={(event) => updateConfig(plugin, { allow_write_tools: event.currentTarget.checked })} />
                    <span>
                      <span class="block font-medium text-[var(--color-text)]">Permitir herramientas de escritura</span>
                      <span class="mt-0.5 block text-xs text-[var(--color-muted)]">Crear cobros, facturas o reembolsos seguirá requiriendo confirmación humana de un administrador.</span>
                    </span>
                  </label>
                {/if}

                {#if plugin.last_error}
                  <p class="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{plugin.last_error}</p>
                {:else if !plugin.secret_configured}
                  <p class="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-100/80">Guarda el secreto en Incus o en el entorno del servicio y reinícialo para completar la conexión.</p>
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
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>
