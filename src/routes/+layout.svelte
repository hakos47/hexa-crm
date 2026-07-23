<script lang="ts">
  import "../app.css";
  import { onMount, type Component } from "svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import Button from "$lib/components/Button.svelte";
  import Select from "$lib/components/Select.svelte";
  import LoginScreen from "$lib/components/LoginScreen.svelte";
  import MarketingLanding from "$lib/components/MarketingLanding.svelte";
  import ForcePasswordChange from "$lib/components/ForcePasswordChange.svelte";
  import OnboardingWizard from "$lib/components/OnboardingWizard.svelte";
  import Logo from "$lib/components/Logo.svelte";
  import { openAiChat } from "$lib/stores/ui";
  import {
    session,
    clearSession,
    setSession,
    setActiveCompanyLocal,
    setCompaniesLocal,
    markSessionReady,
    mustChangePassword,
    activeCompany,
    idleTimeoutMinutes,
    setIdleTimeoutMinutes,
  } from "$lib/stores/session";
  import { idleTimeoutMs } from "$lib/auth/idle-timeout";
  import { api } from "$lib/api/client";
  import { configureRemoteOperator } from "$lib/api/client";
  import { page } from "$app/stores";
  import { showToast } from "$lib/stores/ui";
  import { isOnboardingDone } from "$lib/onboarding/state";
  import { PRODUCT_DISPLAY_NAME } from "$lib/product";
  import { initTheme, theme, toggleTheme } from "$lib/stores/theme";

  let { children } = $props();
  let mobileNavOpen = $state(false);
  let showLogin = $state(false);
  let switchingCompany = $state(false);
  let masterExpanded = $state(false);
  let masterMenuOpen = $state(false);
  let masterOwnCompanies = $state<import("$lib/types").Company[]>([]);
  let showOnboarding = $state(false);
  // El chat (y marked) no forma parte del camino login → TPV.
  let AiDrawer = $state<Component | null>(null);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const MASTER_COMPANY_VIEW_KEY = "hexa-crm-master-all-companies";

  const titles: Record<string, { title: string; subtitle: string }> = {
    "/": {
      title: "Dashboard",
      subtitle: "Vista general de tu tienda en tiempo real",
    },
    "/trabajo": {
      title: "Trabajo",
      subtitle: "Bandeja de tareas, incidencias e hitos",
    },
    "/proyectos": {
      title: "Proyectos",
      subtitle: "Gestión de proyectos y carteras de trabajo",
    },
    "/roadmap": {
      title: "Roadmap",
      subtitle: "Prioridades y fechas de los proyectos",
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
    initTheme();
    const token = $session.token;
    if (!token) {
      clearSession();
      markSessionReady();
      return;
    }
    try {
      configureRemoteOperator($session.remote);
      const me = await api.sessionMe();
      if (me) {
        let companies = $session.companies;
        let activeCompanyId = $session.activeCompanyId;
        try {
          companies = await api.listCompanies(false);
          masterOwnCompanies = companies;
          if (me.is_master && sessionStorage.getItem(MASTER_COMPANY_VIEW_KEY) === "1") {
            companies = await api.listCompanies(true);
            masterExpanded = true;
          }
          const active = await api.getActiveCompany();
          activeCompanyId = active?.id ?? companies[0]?.id ?? null;
        } catch {
          /* company API optional on older backends */
        }
        setSession(me, token, { companies, activeCompanyId, remote: $session.remote });
        try {
          const settings = await api.getSettings();
          setIdleTimeoutMinutes(settings.idle_timeout_minutes);
        } catch {
          // Older backends keep the safe 15-minute default.
        }
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    } finally {
      markSessionReady();
    }
  });

  function clearIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function lockAfterIdle() {
    clearIdleTimer();
    void api.logout().catch(() => {
      /* local lock still wins if the backend is unavailable */
    });
    clearSession();
    showToast("Sesión bloqueada por inactividad. Vuelve a iniciar sesión.", "info");
  }

  function noteActivity() {
    clearIdleTimer();
    if (!canEnter) return;
    const timeout = idleTimeoutMs($idleTimeoutMinutes);
    if (timeout !== null) idleTimer = setTimeout(lockAfterIdle, timeout);
  }

  onMount(() => {
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((event) => window.addEventListener(event, noteActivity, { passive: true }));
    noteActivity();
    return () => {
      clearIdleTimer();
      events.forEach((event) => window.removeEventListener(event, noteActivity));
    };
  });

  $effect(() => {
    void canEnter;
    void $idleTimeoutMinutes;
    noteActivity();
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

  async function openAssistant() {
    if (!AiDrawer) {
      const module = await import("$lib/components/AiDrawer.svelte");
      AiDrawer = module.default;
    }
    openAiChat();
  }

  async function onCompanyChange(value: string) {
    const id = Number(value);
    if (!id || switchingCompany) return;
    switchingCompany = true;
    masterMenuOpen = false;
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

  async function toggleMasterCompanies() {
    if (!$session.user?.is_master || switchingCompany) return;
    switchingCompany = true;
    try {
      const own = masterOwnCompanies.length ? masterOwnCompanies : await api.listCompanies(false);
      masterOwnCompanies = own;
      if (!masterExpanded) {
        const all = await api.listCompanies(true);
        masterExpanded = true;
        masterMenuOpen = true;
        sessionStorage.setItem(MASTER_COMPANY_VIEW_KEY, "1");
        setCompaniesLocal(all);
        showToast(`Vista maestra: ${all.length} empresas`);
      } else {
        masterMenuOpen = !masterMenuOpen;
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo cambiar la vista maestra", "err");
    } finally {
      switchingCompany = false;
    }
  }

  async function showOwnCompanies() {
    if (switchingCompany) return;
    switchingCompany = true;
    try {
      const own = masterOwnCompanies.length ? masterOwnCompanies : await api.listCompanies(false);
      masterOwnCompanies = own;
      masterExpanded = false;
      masterMenuOpen = false;
      sessionStorage.removeItem(MASTER_COMPANY_VIEW_KEY);
      setCompaniesLocal(own);
      if (!$session.activeCompanyId || !own.some((company) => company.id === $session.activeCompanyId)) {
        const fallback = own[0];
        if (fallback) {
          switchingCompany = false;
          await onCompanyChange(String(fallback.id));
          return;
        }
      }
      showToast("Mostrando solo tus empresas");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo recuperar la vista asignada", "err");
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
  {#if showLogin}
    <LoginScreen onBack={() => (showLogin = false)} />
  {:else}
    <MarketingLanding onEnter={() => (showLogin = true)} />
  {/if}
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
      <header class="app-header flex shrink-0 items-center justify-between gap-3 px-3 py-3 sm:px-5 lg:px-8">
        <div class="app-header-heading flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            type="button"
            class="app-header-menu inline-flex h-10 w-10 shrink-0 items-center justify-center md:hidden"
            aria-label="Abrir menú"
            onclick={() => (mobileNavOpen = true)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <div class="app-header-number hidden sm:grid" aria-hidden="true">
            <span>{String(Object.keys(titles).indexOf($page.url.pathname) + 1).padStart(2, "0")}</span>
          </div>
          <div class="min-w-0 border-l border-[var(--color-border)] pl-3 sm:pl-4">
            <p class="app-header-index hidden sm:flex"><span>Espacio de trabajo</span><i></i></p>
            <h1 class="app-header-title editorial-serif truncate text-[var(--color-text)]">
              {metaFor($page.url.pathname).title}
            </h1>
            <p class="app-header-subtitle hidden truncate text-[var(--color-muted-dim)] sm:block">
              {metaFor($page.url.pathname).subtitle}
            </p>
          </div>
        </div>
        <div class="app-header-actions flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {#if $session.companies.length > 1 || $session.user?.is_master}
            <div class="app-header-company hidden min-w-0 sm:block" data-company-switcher>
              <div class="mb-1 flex items-center justify-between gap-2">
                <p class="m-0 text-[0.52rem] font-bold uppercase tracking-[0.16em] text-[var(--color-muted-dim)]">Empresa activa</p>
                {#if $session.user?.is_master}
                  <button
                    type="button"
                    class="app-header-master-toggle"
                    aria-pressed={masterMenuOpen}
                    aria-label={masterMenuOpen ? "Cerrar lista de empresas" : "Desplegar todas las empresas"}
                    data-master-companies-toggle
                    disabled={switchingCompany}
                    onclick={toggleMasterCompanies}
                  >
                    {masterMenuOpen ? "Todas ↑" : "Todas ↓"}
                  </button>
                {/if}
              </div>
              {#if $session.companies.length > 1}
                <Select
                  class="header-company-select"
                  value={String($session.activeCompanyId ?? "")}
                  options={$session.companies.map((company) => ({
                    value: String(company.id),
                    label: company.trade_name,
                    hint: company.code,
                  }))}
                  disabled={switchingCompany}
                  onvaluechange={onCompanyChange}
                />
              {:else if $activeCompany}
                <strong class="block truncate text-xs font-medium text-[var(--color-text)]">{$activeCompany.trade_name}</strong>
                <small class="text-[0.55rem] font-bold tracking-[0.12em] text-[var(--color-purple)]">{$activeCompany.code}</small>
              {:else}
                <strong class="block truncate text-xs font-medium text-amber-200">Sin empresa asignada</strong>
              {/if}
              {#if masterExpanded && masterMenuOpen}
                <div class="app-header-master-menu" data-master-company-menu>
                  <p>Todas las empresas</p>
                  {#each $session.companies as company}
                    <button
                      type="button"
                      class:active={company.id === $session.activeCompanyId}
                      disabled={switchingCompany}
                      onclick={() => onCompanyChange(String(company.id))}
                    >
                      <span>
                        <strong>{company.trade_name}</strong>
                        <small>{company.code}</small>
                      </span>
                      {#if masterOwnCompanies.some((own) => own.id === company.id)}
                        <em>Asignada</em>
                      {:else}
                        <em>Global</em>
                      {/if}
                    </button>
                  {/each}
                  <button type="button" class="own-view" data-master-own-companies onclick={showOwnCompanies}>
                    <span><strong>← Solo mis empresas</strong></span>
                    <em>Asignadas</em>
                  </button>
                </div>
              {/if}
            </div>
          {:else if $activeCompany}
            <div
              class="app-header-company app-header-company-static hidden sm:block"
              title={$activeCompany.legal_name}
            >
              <p>Empresa activa</p>
              <strong>{$activeCompany.trade_name}</strong>
              <small>{$activeCompany.code}</small>
            </div>
          {/if}
          <div class="app-header-user hidden items-center gap-2.5 lg:flex">
            <span class="app-header-avatar" aria-hidden="true">
              {$session.user?.display_name?.slice(0, 1).toUpperCase()}
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-[var(--color-text)]">{$session.user?.display_name}</p>
              <p class="text-[10px] uppercase tracking-[0.16em] text-[var(--color-purple)]">{$session.user?.is_master ? "maestro" : $session.user?.role}</p>
            </div>
          </div>
          <button
            type="button"
            class="app-header-icon-button"
            onclick={toggleTheme}
            aria-label={$theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
            title={$theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            <span aria-hidden="true">{$theme === "dark" ? "☼" : "◐"}</span>
          </button>
          <Button
            variant="ghost"
            class="app-header-logout !px-3 !py-2 sm:!px-4"
            onclick={closeSession}
            data-logout
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <span class="sm:hidden" aria-hidden="true">⎋</span>
            <span class="hidden sm:inline">Salir</span>
            <span class="hidden text-[var(--color-purple)] sm:inline" aria-hidden="true">↗</span>
          </Button>
        </div>
      </header>

      <main class="app-main page-enter min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-5 md:p-6 lg:p-8">
        {@render children()}
      </main>
    </div>
  </div>

  {#if AiDrawer}
    <AiDrawer />
  {/if}
  <button
    type="button"
    class="ai-launcher"
    onclick={openAssistant}
    aria-label="Abrir asistente IA"
    title="Abrir asistente IA"
    data-ai-launcher
  >
    <span class="ai-launcher-orb" aria-hidden="true"><Logo size={38} /></span>
    <span class="ai-launcher-copy"><small>HEXA · IA</small><strong>Asistente</strong></span>
    <span class="ai-launcher-status" aria-hidden="true"></span>
  </button>
  <Toast />
  {#if showOnboarding && !$mustChangePassword}
    <OnboardingWizard onComplete={() => (showOnboarding = false)} />
  {/if}
{/if}
