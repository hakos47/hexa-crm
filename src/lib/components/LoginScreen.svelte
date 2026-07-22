<script lang="ts">
  import { api } from "$lib/api/client";
  import { setSession } from "$lib/stores/session";
  import { PRODUCT_DISPLAY_NAME, PRODUCT_TAGLINE } from "$lib/product";
  import Button from "./Button.svelte";
  import Logo from "./Logo.svelte";

  let username = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);
  let shopName = $state<string>(PRODUCT_DISPLAY_NAME);

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
      const res = await api.login(username.trim(), password.trim());
      setSession(res.user, res.token, {
        companies: res.companies ?? [],
        activeCompanyId: res.active_company_id ?? null,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo iniciar sesión";
      password = "";
    } finally {
      loading = false;
    }
  }
</script>

<div class="relative flex min-h-screen items-center justify-center p-4 sm:p-6">
  <div
    class="pointer-events-none absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-purple-600/20 blur-[100px]"
  ></div>
  <div
    class="pointer-events-none absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-violet-700/15 blur-[120px]"
  ></div>

  <div
    class="glass-strong relative z-10 w-full max-w-md rounded-3xl border border-[var(--color-border-strong)] p-6 sm:p-8 glow-purple"
  >
    <div class="mb-6 text-center sm:mb-8">
      <div class="mx-auto mb-4 flex justify-center">
        <Logo size={64} class="rounded-2xl glow-purple" />
      </div>
      <h1 class="text-xl font-semibold tracking-tight text-[var(--color-text)] sm:text-2xl">
        {shopName}
      </h1>
      <p class="mt-1 text-sm text-[var(--color-muted)]">{PRODUCT_TAGLINE}</p>
      <p class="mt-0.5 text-xs text-[var(--color-muted-dim)]">
        Datos locales · Sin nube obligatoria · {PRODUCT_DISPLAY_NAME}
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
      Solo personal autorizado. Si es tu primer acceso con contraseña temporal, se te pedirá
      cambiarla de inmediato.
    </p>
  </div>
</div>
