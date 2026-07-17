<script lang="ts">
  let {
    label = "",
    type = "text",
    value = $bindable(""),
    placeholder = "",
    required = false,
    step = undefined as string | undefined,
    min = undefined as string | number | undefined,
    class: className = "",
  }: {
    label?: string;
    type?: string;
    value?: string | number;
    placeholder?: string;
    required?: boolean;
    step?: string;
    min?: string | number;
    class?: string;
  } = $props();
</script>

<label class="flex flex-col gap-1.5 text-sm {className}">
  {#if label}
    <span class="font-medium text-[var(--color-muted)]">{label}</span>
  {/if}
  <input
    {type}
    {placeholder}
    {required}
    {step}
    {min}
    bind:value
    class="field w-full"
  />
</label>
