<script lang="ts">
  import { fly } from "svelte/transition";

  export type SelectOption = {
    value: string;
    label: string;
    hint?: string;
    disabled?: boolean;
  };

  let {
    label = "",
    value = $bindable(""),
    options = [],
    placeholder = "Seleccionar…",
    required = false,
    disabled = false,
    onvaluechange,
    class: className = "",
  }: {
    label?: string;
    value?: string;
    options?: SelectOption[];
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    onvaluechange?: (value: string) => void;
    class?: string;
  } = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();

  const selected = $derived(options.find((o) => o.value === value));
  const display = $derived(selected?.label ?? placeholder);

  function toggle() {
    if (disabled) return;
    open = !open;
  }

  function pick(opt: SelectOption) {
    if (opt.disabled) return;
    value = opt.value;
    onvaluechange?.(opt.value);
    open = false;
  }

  function onDocClick(e: MouseEvent) {
    if (!open || !rootEl) return;
    if (!rootEl.contains(e.target as Node)) open = false;
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") {
      open = false;
      e.preventDefault();
    }
  }
</script>

<svelte:window onclick={onDocClick} onkeydown={onKey} />

<div class="flex flex-col gap-1.5 text-sm {className}" bind:this={rootEl}>
  {#if label}
    <span class="font-medium text-[var(--color-muted)]">{label}</span>
  {/if}

  <div class="relative">
    <button
      type="button"
      class="select-trigger field flex w-full items-center justify-between gap-2 text-left {open
        ? 'select-trigger-open'
        : ''} {disabled ? 'opacity-50 pointer-events-none' : ''}"
      aria-haspopup="listbox"
      aria-expanded={open}
      {disabled}
      onclick={(e) => {
        e.stopPropagation();
        toggle();
      }}
    >
      <span
        class="min-w-0 truncate {selected
          ? 'text-[var(--color-text)]'
          : 'text-[var(--color-muted-dim)]'}"
      >
        {display}
      </span>
      <span
        class="select-chevron shrink-0 text-[var(--color-purple)] transition-transform duration-200 {open
          ? 'rotate-180'
          : ''}"
        aria-hidden="true"
      >
        ▾
      </span>
    </button>

    <!-- Hidden input for form required validation if needed -->
    {#if required}
      <input type="text" class="sr-only" tabindex="-1" {value} {required} readonly aria-hidden="true" />
    {/if}

    {#if open}
      <ul
        class="select-menu absolute left-0 right-0 z-[80] mt-1.5 max-h-60 overflow-y-auto py-1"
        role="listbox"
        transition:fly={{ y: -6, duration: 160 }}
      >
        {#each options as opt}
          <li role="option" aria-selected={opt.value === value}>
            <button
              type="button"
              class="select-option flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition {opt.value ===
              value
                ? 'select-option-active'
                : ''} {opt.disabled ? 'opacity-40 pointer-events-none' : ''}"
              disabled={opt.disabled}
              onclick={(e) => {
                e.stopPropagation();
                pick(opt);
              }}
            >
              <span class="min-w-0 flex-1">
                <span class="block font-medium">{opt.label}</span>
                {#if opt.hint}
                  <span class="mt-0.5 block text-[11px] text-[var(--color-muted-dim)]">{opt.hint}</span>
                {/if}
              </span>
              {#if opt.value === value}
                <span class="text-radiant shrink-0 text-xs">✓</span>
              {/if}
            </button>
          </li>
        {/each}
        {#if options.length === 0}
          <li class="px-3 py-3 text-xs text-[var(--color-muted-dim)]">Sin opciones</li>
        {/if}
      </ul>
    {/if}
  </div>
</div>
