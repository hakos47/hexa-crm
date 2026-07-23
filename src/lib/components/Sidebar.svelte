<script lang="ts">
  import { page } from "$app/stores";
  import { sidebarCollapsed } from "$lib/stores/ui";
  import Logo from "$lib/components/Logo.svelte";
  import { PRODUCT_DISPLAY_NAME, PRODUCT_TAGLINE } from "$lib/product";
  import { api } from "$lib/api/client";

  let {
    forceExpanded = false,
    onNavigate,
    onLogout,
  }: {
    forceExpanded?: boolean;
    onNavigate?: () => void;
    /** Cerrar sesión (layout wire). */
    onLogout?: () => void | Promise<void>;
  } = $props();

  const collapsed = $derived(forceExpanded ? false : $sidebarCollapsed);
  const showWork = $derived(api.supportsWorkManagement());

  const links = $derived([
    { href: "/", label: "Pulso", icon: "⌁" },
    ...(showWork ? [{ href: "/trabajo", label: "Trabajo", icon: "☑" }] : []),
    { href: "/inventario", label: "Inventario", icon: "□" },
    { href: "/ventas", label: "Ventas", icon: "○" },
    { href: "/caja", label: "Caja", icon: "€" },
    { href: "/clientes", label: "Clientes", icon: "◇" },
    { href: "/impuestos", label: "Impuestos", icon: "%" },
    { href: "/ajustes", label: "Ajustes", icon: "⚙" },
  ]);

  /** Deep-links that open create flows (?nuevo=1). */
  const quick = $derived([
    ...(showWork ? [{ href: "/trabajo?nuevo=1", label: "Nueva tarea" }] : []),
    { href: "/ventas?nuevo=1", label: "Nueva venta" },
    { href: "/inventario?nuevo=1", label: "Nuevo producto" },
    { href: "/clientes?nuevo=1", label: "Nuevo cliente" },
    { href: "/caja?nuevo=1", label: "Movimiento de caja" },
  ]);

  function active(href: string, path: string) {
    const base = href.split("?")[0];
    if (base === "/") return path === "/";
    return path.startsWith(base);
  }

  function nav() {
    onNavigate?.();
  }

  async function logout() {
    onNavigate?.();
    await onLogout?.();
  }
</script>

<aside
  class="crm-sidebar flex h-full w-full flex-col transition-all duration-300 {collapsed ? 'md:w-[76px]' : 'md:w-[17.5rem]'}"
  data-sidebar
>
  <div class="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-5 sm:py-6">
    <Logo size={40} class="rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.25)]" />
    {#if !collapsed}
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold tracking-wide text-[var(--color-text)]">
          {PRODUCT_DISPLAY_NAME}
        </p>
        <p class="truncate text-[11px] text-[var(--color-muted-dim)]" title={PRODUCT_TAGLINE}>
          RETAIL OPERATING SYSTEM
        </p>
      </div>
    {/if}
  </div>

  <div class="flex-1 overflow-y-auto p-3">
    {#if !collapsed}
      <p class="section-label mb-3 px-2">ESPACIOS</p>
    {/if}
    <nav class="space-y-0.5" aria-label="Navegación principal">
      {#each links as link}
        <a
          href={link.href}
          onclick={nav}
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 {active(
            link.href,
            $page.url.pathname
          )
            ? 'nav-active'
            : 'text-[var(--color-muted)] hover:bg-purple-500/[0.08] hover:text-[var(--color-purple-bright)]'}"
          title={link.label}
        >
          <span
            class="w-5 text-center text-base opacity-90 {active(link.href, $page.url.pathname)
              ? 'text-radiant'
              : ''}"
          >
            {link.icon}
          </span>
          {#if !collapsed}
            <span class="font-medium">{link.label}</span>
          {/if}
        </a>
      {/each}
    </nav>

    {#if !collapsed}
      <p class="section-label mb-2 mt-6 px-2">Accesos rápidos</p>
      <div class="space-y-0.5" data-quick-actions>
        {#each quick as q}
          <a
            href={q.href}
            onclick={nav}
            class="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--color-muted)] transition hover:bg-purple-500/[0.08] hover:text-[var(--color-purple)]"
          >
            <span class="text-radiant text-sm">+</span>
            <span>{q.label}</span>
          </a>
        {/each}
      </div>
    {/if}
  </div>

  <div class="space-y-2 border-t border-[var(--color-border)] p-3">
    {#if onLogout}
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--color-muted)] transition hover:bg-rose-500/10 hover:text-rose-200"
        onclick={logout}
        data-logout
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <span class="w-5 text-center">⎋</span>
        {#if !collapsed}
          <span class="font-medium">Cerrar sesión</span>
        {/if}
      </button>
    {/if}
    {#if !forceExpanded}
      <button
        type="button"
        class="hidden w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)] transition hover:border-purple-400/30 hover:bg-purple-500/10 hover:text-[var(--color-purple-bright)] md:block"
        onclick={() => sidebarCollapsed.update((v) => !v)}
      >
        {collapsed ? "»" : "« Contraer menú"}
      </button>
    {/if}
  </div>
</aside>
