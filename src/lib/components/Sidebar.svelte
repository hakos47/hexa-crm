<script lang="ts">
  import { page } from "$app/stores";
  import { sidebarCollapsed } from "$lib/stores/ui";
  import Logo from "$lib/components/Logo.svelte";

  let {
    forceExpanded = false,
    onNavigate,
  }: {
    forceExpanded?: boolean;
    onNavigate?: () => void;
  } = $props();

  const collapsed = $derived(forceExpanded ? false : $sidebarCollapsed);

  const links = [
    { href: "/", label: "Dashboard", icon: "◈" },
    { href: "/inventario", label: "Inventario", icon: "▣" },
    { href: "/ventas", label: "Ventas", icon: "◎" },
    { href: "/caja", label: "Caja", icon: "€" },
    { href: "/clientes", label: "Clientes", icon: "◉" },
    { href: "/impuestos", label: "Impuestos", icon: "%" },
    { href: "/ajustes", label: "Ajustes", icon: "⚙" },
  ];

  const quick = [
    { href: "/ventas", label: "Nueva venta" },
    { href: "/inventario", label: "Nuevo producto" },
    { href: "/clientes", label: "Nuevo cliente" },
    { href: "/caja", label: "Movimiento caja" },
  ];

  function active(href: string, path: string) {
    if (href === "/") return path === "/";
    return path.startsWith(href);
  }

  function nav() {
    onNavigate?.();
  }
</script>

<aside
  class="glass-strong flex h-full w-full flex-col border-r border-[var(--color-border)] transition-all duration-300 {collapsed
    ? 'md:w-[72px]'
    : 'md:w-64'}"
>
  <div class="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-4 sm:py-5">
    <Logo size={40} class="rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.25)]" />
    {#if !collapsed}
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold tracking-wide text-[var(--color-text)]">Nix-C</p>
        <p class="truncate text-[11px] text-[var(--color-muted-dim)]">Gestión de tienda</p>
      </div>
    {/if}
  </div>

  <div class="flex-1 overflow-y-auto p-3">
    {#if !collapsed}
      <p class="section-label mb-2 px-2">Navigation</p>
    {/if}
    <nav class="space-y-0.5">
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
      <p class="section-label mb-2 mt-6 px-2">Quick actions</p>
      <div class="space-y-0.5">
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

  {#if !forceExpanded}
    <button
      class="m-3 hidden rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)] transition hover:border-purple-400/30 hover:bg-purple-500/10 hover:text-[var(--color-purple-bright)] md:block"
      onclick={() => sidebarCollapsed.update((v) => !v)}
    >
      {collapsed ? "»" : "« Colapsar"}
    </button>
  {/if}
</aside>
