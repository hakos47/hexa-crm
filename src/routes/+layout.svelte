<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import AiDrawer from "$lib/components/AiDrawer.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import Button from "$lib/components/Button.svelte";
  import LoginScreen from "$lib/components/LoginScreen.svelte";
  import ForcePasswordChange from "$lib/components/ForcePasswordChange.svelte";
  import OnboardingWizard from "$lib/components/OnboardingWizard.svelte";
  import Logo from "$lib/components/Logo.svelte";
  import { openAiChat } from "$lib/stores/ui";
  import {
    session,
    clearSession,
    setSession,
    setActiveCompanyLocal,
    markSessionReady,
    mustChangePassword,
    activeCompany,
  } from "$lib/stores/session";
  import { api } from "$lib/api/client";
  import { page } from "$app/stores";
  import { showToast } from "$lib/stores/ui";
  import { isOnboardingDone } from "$lib/onboarding/state";
  import { PRODUCT_DISPLAY_NAME } from "$lib/product";

  let { children } = $props();
  let mobileNavOpen = $state(false);
  let switchingCompany = $state(false);
  let showOnboarding = $state(false);

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
    return titles[path] ?? { title: PRODUCT_DISPLAY_NAME, subtitle: "" };
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
        let companies = $session.companies;
        let activeCompanyId = $session.activeCompanyId;
        try {
          companies = await api.listCompanies();
          const active = await api.getActiveCompany();
          activeCompanyId = active?.id ?? companies[0]?.id ?? null;
        } catch {
          /* company API optional on older backends */
        }
        setSession(me, token, { companies, activeCompanyId });
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    } finally {
      markSessionReady();
    }
  });

  // First-run wizard when session becomes valid (issue #11)
  $effect(() => {
    if (canEnter && !$mustChangePassword) {
      try {
        showOnboarding = !isOnboardingDone();
      } catch {
        showOnboarding = false;
      }
    } else {
      showOnboarding = false;
    }
  });

  /** Cerrar sesión: API logout best-effort + limpia store (issue #9). */
  async function closeSession() {
    try {
      await api.logout();
    } catch {
      /* ignore network/session errors — still clear local state */
    }
    clearSession();
    showToast("Sesión cerrada");
  }

  async function onCompanyChange(e: Event) {
    const id = Number((e.target as HTMLSelectElement).value);
    if (!id || switchingCompany) return;
    switchingCompany = true;
    try {
      const c = await api.setActiveCompany(id);
      setActiveCompanyLocal(c);
      showToast(`Empresa activa: ${c.trade_name}`);
      // Reload current route data
      if (typeof window !== "undefined") window.location.reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo cambiar de empresa", "err");
    } finally {
      switchingCompany = false;
    }
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
      <Sidebar onLogout={closeSession} />
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
          <Sidebar
            forceExpanded
            onNavigate={() => (mobileNavOpen = false)}
            onLogout={closeSession}
          />
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
          {#if $session.companies.length > 1}
            <label class="hidden min-w-0 flex-col text-[10px] text-[var(--color-muted-dim)] sm:flex">
              Empresa
              <select
                class="field mt-0.5 max-w-[10rem] py-1 text-xs"
                value={String($session.activeCompanyId ?? "")}
                disabled={switchingCompany}
                onchange={onCompanyChange}
                data-company-switcher
              >
                {#each $session.companies as c}
                  <option value={String(c.id)}>{c.code} · {c.trade_name}</option>
                {/each}
              </select>
            </label>
          {:else if $activeCompany}
            <span
              class="hidden rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-medium text-[var(--color-purple-bright)] sm:inline"
              title={$activeCompany.legal_name}
            >
              {$activeCompany.code}
            </span>
          {/if}
          <div class="mr-0 hidden text-right lg:block">
            <p class="text-sm font-medium text-[var(--color-text)]">
              {$session.user?.display_name}
            </p>
            <p class="text-[11px] capitalize text-radiant">{$session.user?.role}</p>
          </div>
          <Button
            variant="secondary"
            class="!px-2.5 !py-1.5 text-xs sm:!px-3 sm:text-sm"
            onclick={closeSession}
            data-logout
            aria-label="Cerrar sesión"
          >
            <span class="sm:hidden" aria-hidden="true">⎋</span>
            <span class="hidden sm:inline">Cerrar sesión</span>
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
  {#if showOnboarding && !$mustChangePassword}
    <OnboardingWizard onComplete={() => (showOnboarding = false)} />
  {/if}
{/if}
