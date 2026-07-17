<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import AiDrawer from "$lib/components/AiDrawer.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import Button from "$lib/components/Button.svelte";
  import LoginScreen from "$lib/components/LoginScreen.svelte";
  import ForcePasswordChange from "$lib/components/ForcePasswordChange.svelte";
  import Logo from "$lib/components/Logo.svelte";
  import { openAiChat } from "$lib/stores/ui";
  import {
    session,
    clearSession,
    setSession,
    markSessionReady,
    mustChangePassword,
  } from "$lib/stores/session";
  import { api } from "$lib/api/client";
  import { page } from "$app/stores";

  let { children } = $props();
  let mobileNavOpen = $state(false);

  const titles: Record<string, { title: string; subtitle: string }> = {
    "/": {
      title: "Dashboard",
      subtitle: "Vista general de tu tienda en tiempo real",
    },
    "/inventario": {
      title: "Inventario",
      subtitle: "Productos, stock y alertas",
    },
    "/ventas": {
      title: "Ventas",
      subtitle: "TPV ligero y historial de tickets",
    },
    "/caja": {
      title: "Caja y presupuesto",
      subtitle: "Saldo, ingresos y gastos",
    },
    "/clientes": {
      title: "Clientes",
      subtitle: "Relaciones y datos de contacto",
    },
    "/impuestos": {
      title: "Impuestos (IVA ES)",
      subtitle: "Libro IVA simplificado — control interno",
    },
    "/ajustes": {
      title: "Ajustes",
      subtitle: "Tienda, usuarios y Ollama",
    },
  };

  function metaFor(path: string) {
    return titles[path] ?? { title: "Nix-C", subtitle: "" };
  }

  const canEnter = $derived(
    $session.ready && !!$session.token && !!$session.user
  );

  // Close mobile nav on route change
  $effect(() => {
    void $page.url.pathname;
    mobileNavOpen = false;
  });

  onMount(async () => {
    const token = $session.token;
    if (!token) {
      clearSession();
      markSessionReady();
      return;
    }
    try {
      const me = await api.sessionMe();
      if (me) {
        setSession(me, token);
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    } finally {
      markSessionReady();
    }
  });

  async function lock() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    clearSession();
  }
</script>

{#if !$session.ready}
  <div class="flex min-h-screen items-center justify-center p-4">
    <div class="text-center">
      <div class="mx-auto mb-4 flex justify-center">
        <Logo size={48} class="rounded-2xl glow-purple" />
      </div>
      <div class="skeleton mx-auto h-3 w-36"></div>
      <p class="mt-3 text-xs text-[var(--color-muted-dim)]">Comprobando sesión…</p>
    </div>
  </div>
{:else if !canEnter}
  <LoginScreen />
  <Toast />
{:else if $mustChangePassword}
  <ForcePasswordChange />
  <Toast />
{:else}
  <div class="flex h-dvh max-h-dvh overflow-hidden">
    <!-- Desktop sidebar -->
    <div class="hidden h-full shrink-0 md:flex">
      <Sidebar />
    </div>

    <!-- Mobile drawer -->
    {#if mobileNavOpen}
      <div class="fixed inset-0 z-40 md:hidden">
        <button
          class="absolute inset-0 bg-black/60 backdrop-blur-sm"
          aria-label="Cerrar menú"
          onclick={() => (mobileNavOpen = false)}
        ></button>
        <div class="absolute inset-y-0 left-0 z-10 flex h-full w-[min(18rem,88vw)] shadow-2xl">
          <Sidebar forceExpanded onNavigate={() => (mobileNavOpen = false)} />
        </div>
      </div>
    {/if}

    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header
        class="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[rgba(8,8,14,0.85)] px-3 py-3 backdrop-blur-xl sm:px-5 sm:py-4"
      >
        <div class="flex min-w-0 items-center gap-2">
          <button
            type="button"
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] text-[var(--color-purple)] md:hidden"
            aria-label="Abrir menú"
            onclick={() => (mobileNavOpen = true)}
          >
            ☰
          </button>
          <div class="min-w-0">
            <h1
              class="truncate text-base font-semibold tracking-tight text-[var(--color-text)] sm:text-xl"
            >
              {metaFor($page.url.pathname).title}
            </h1>
            <p class="hidden truncate text-sm text-[var(--color-muted-dim)] sm:block">
              {metaFor($page.url.pathname).subtitle}
            </p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <div class="mr-0 hidden text-right lg:block">
            <p class="text-sm font-medium text-[var(--color-text)]">
              {$session.user?.display_name}
            </p>
            <p class="text-[11px] capitalize text-radiant">{$session.user?.role}</p>
          </div>
          <Button variant="secondary" class="!px-2.5 !py-1.5 text-xs sm:!px-3 sm:text-sm" onclick={lock}>
            🔒<span class="hidden sm:inline"> Bloquear</span>
          </Button>
          <Button
            variant="ai"
            class="!px-2.5 !py-1.5 text-xs sm:!px-3 sm:text-sm"
            onclick={() => openAiChat()}
          >
            <span class="h-1.5 w-1.5 rounded-full bg-white pulse-glow"></span>
            <span class="hidden sm:inline">Asistente </span>IA
          </Button>
        </div>
      </header>

      <main class="page-enter min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-5 md:p-6">
        {@render children()}
      </main>
    </div>
  </div>

  <AiDrawer />
  <Toast />
{/if}
