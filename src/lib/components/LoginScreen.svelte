<script lang="ts">
  import { api } from "$lib/api/client";
  import { setSession } from "$lib/stores/session";
  import { PRODUCT_DISPLAY_NAME, PRODUCT_TAGLINE } from "$lib/product";
  import Button from "./Button.svelte";
  import Logo from "./Logo.svelte";
  import { WEB_DATA_MODE } from "$lib/api/client";

  let { onBack }: { onBack?: () => void } = $props();

  let username = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);
  let shopName = $state<string>(PRODUCT_DISPLAY_NAME);
  let centralMode = $state(false);
  let centralEndpoint = $state("");
  let centralTenant = $state("MEIGA");

  let userInputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    api
      .publicMeta()
      .then((s) => {
        shopName = s.shop_name || PRODUCT_DISPLAY_NAME;
      })
      .catch(() => {});
  });

  $effect(() => {
    // Focus username on open for faster login
    queueMicrotask(() => userInputEl?.focus());
  });

  async function submit(e: Event) {
    e.preventDefault();
    error = "";
    if (!username.trim() || !password.trim()) {
      error = "Usuario y contraseña obligatorios";
      return;
    }
    loading = true;
    try {
      const remote = centralMode
        ? { endpoint: centralEndpoint.trim(), tenantCode: centralTenant.trim().toUpperCase() }
        : null;
      if (remote && (!remote.endpoint || !remote.tenantCode)) {
        error = "Indica la URL y el tenant del CRM central";
        return;
      }
      const res = remote
        ? await api.loginRemote(remote, username.trim(), password.trim())
        : await api.login(username.trim(), password.trim());
      setSession(res.user, res.token, {
        companies: res.companies ?? [],
        activeCompanyId: res.active_company_id ?? null,
        remote,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo iniciar sesión";
      password = "";
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-stage relative flex min-h-screen items-center justify-center p-4 sm:p-6">
  <img class="login-backdrop" src="/crm-hero-v1.webp" alt="" width="1672" height="941" />
  <div class="login-stage-scrim"></div>
  {#if onBack}
    <button type="button" class="login-back" onclick={onBack}>← Volver a la presentación</button>
  {/if}

  <div
    class="login-card relative z-10 w-full max-w-md p-6 sm:p-8"
  >
    <div class="mb-6 text-center sm:mb-8">
      <div class="mx-auto mb-4 flex justify-center">
        <Logo size={64} class="rounded-2xl glow-purple" />
      </div>
      <p class="section-label mb-2">ESPACIO DE TRABAJO</p>
      <h1 class="text-2xl font-medium tracking-tight text-[var(--color-text)] sm:text-3xl">
        {shopName}
      </h1>
      <p class="mt-1 text-sm text-[var(--color-muted)]">{PRODUCT_TAGLINE}</p>
      <p class="mt-1 text-xs text-[var(--color-muted-dim)]">
        {WEB_DATA_MODE === "local" ? "Entorno local · Datos en este navegador" : "Entorno producción · CRM central"}
      </p>
    </div>

    <form class="grid gap-4" onsubmit={submit}>
      <label class="grid gap-1.5 text-sm">
        <span class="font-medium text-[var(--color-muted)]">Usuario</span>
        <input
          bind:this={userInputEl}
          bind:value={username}
          autocomplete="username"
          class="field w-full"
          placeholder="Tu usuario"
          required
        />
      </label>

      <label class="flex items-center gap-2 text-xs text-[var(--color-muted)]">
        <input type="checkbox" bind:checked={centralMode} />
        Conectar como operador a CRM central
      </label>

      {#if centralMode}
        <label class="grid gap-1.5 text-sm">
          <span class="font-medium text-[var(--color-muted)]">URL CRM central</span>
          <input bind:value={centralEndpoint} class="field w-full" placeholder="https://crm.mi-red.local" required />
        </label>
        <label class="grid gap-1.5 text-sm">
          <span class="font-medium text-[var(--color-muted)]">Tenant</span>
          <input bind:value={centralTenant} class="field w-full" placeholder="MEIGA" required />
        </label>
      {/if}

      <label class="grid gap-1.5 text-sm">
        <span class="font-medium text-[var(--color-muted)]">Contraseña / PIN</span>
        <input
          type="password"
          bind:value={password}
          autocomplete="current-password"
          class="field w-full"
          placeholder="••••••••"
          required
        />
      </label>

      {#if error}
        <p
          class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
        >
          {error}
        </p>
      {/if}

      <Button type="submit" class="w-full" disabled={loading}>
        {loading ? "Verificando…" : "Entrar"}
      </Button>
    </form>

    <p class="mt-6 text-center text-[11px] leading-relaxed text-[var(--color-muted-dim)]">
      Solo personal autorizado. El modo central no escribe datos en SQLite ni reutiliza las claves de servicio de Meiga.
    </p>
  </div>
</div>
