<script lang="ts">
  import { api } from "$lib/api/client";
  import { setSession, getToken, clearSession } from "$lib/stores/session";
  import Button from "./Button.svelte";
  import Logo from "./Logo.svelte";
  import { PERMANENT_PASSWORD_MIN } from "$lib/auth/password-policy";

  let tempPassword = $state("");
  let next = $state("");
  let confirm = $state("");
  let error = $state("");
  let loading = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    error = "";
    if (next !== confirm) {
      error = "Las contraseñas nuevas no coinciden";
      return;
    }
    loading = true;
    try {
      const user = await api.completeForcedPasswordChange(tempPassword, next);
      const token = getToken();
      if (!token) {
        clearSession();
        return;
      }
      setSession(user, token);
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo cambiar la contraseña";
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-stage relative flex min-h-screen items-center justify-center p-4 sm:p-6">
  <img class="login-backdrop" src="/crm-hero-v1.webp" alt="" width="1672" height="941" />
  <div class="login-stage-scrim"></div>
  <div
    class="login-card relative z-10 w-full max-w-md p-6 sm:p-8"
  >
    <div class="mb-4 flex justify-center">
      <Logo size={48} class="rounded-xl glow-purple" />
    </div>
    <p class="section-label mb-2 text-center">Seguridad</p>
    <h1 class="text-center text-2xl font-medium tracking-tight text-[var(--color-text)] sm:text-3xl">
      Cambia tu contraseña temporal
    </h1>
    <p class="mt-2 text-sm text-[var(--color-muted)]">
      Es tu primer acceso. Debes definir una contraseña permanente (mín.
      {PERMANENT_PASSWORD_MIN} caracteres) antes de usar el CRM. La temporal caduca a las 24 h.
    </p>

    <form class="mt-6 grid gap-3" onsubmit={submit}>
      <label class="grid gap-1.5 text-sm">
        <span class="text-[var(--color-muted)]">Contraseña temporal</span>
        <input class="field w-full" type="password" bind:value={tempPassword} required autocomplete="current-password" />
      </label>
      <label class="grid gap-1.5 text-sm">
        <span class="text-[var(--color-muted)]">Nueva contraseña</span>
        <input class="field w-full" type="password" bind:value={next} required minlength={PERMANENT_PASSWORD_MIN} autocomplete="new-password" />
      </label>
      <label class="grid gap-1.5 text-sm">
        <span class="text-[var(--color-muted)]">Confirmar nueva</span>
        <input class="field w-full" type="password" bind:value={confirm} required minlength={PERMANENT_PASSWORD_MIN} autocomplete="new-password" />
      </label>

      {#if error}
        <p class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      {/if}

      <Button type="submit" class="w-full" disabled={loading}>
        {loading ? "Guardando…" : "Guardar y continuar"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        class="w-full"
        data-logout
        aria-label="Cerrar sesión"
        onclick={() => clearSession()}
      >
        Cerrar sesión
      </Button>
    </form>
  </div>
</div>
