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

<div class="relative flex min-h-screen items-center justify-center p-4 sm:p-6">
  <div
    class="pointer-events-none absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-purple-600/20 blur-[100px]"
  ></div>
  <div
    class="glass-strong relative z-10 w-full max-w-md rounded-3xl border border-[var(--color-border-strong)] p-6 sm:p-8 glow-purple"
  >
    <div class="mb-4 flex justify-center">
      <Logo size={48} class="rounded-xl glow-purple" />
    </div>
    <p class="section-label mb-2 text-center">Seguridad</p>
    <h1 class="text-center text-xl font-semibold text-[var(--color-text)] sm:text-2xl">
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
      <Button type="button" variant="ghost" class="w-full" onclick={() => clearSession()}>
        Cancelar e ir al login
      </Button>
    </form>
  </div>
</div>
