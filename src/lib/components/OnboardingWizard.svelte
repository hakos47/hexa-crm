<script lang="ts">
  import { api } from "$lib/api/client";
  import { VAT_RATES, vatLabel, type VatRate } from "$lib/vat";
  import { markOnboardingDone } from "$lib/onboarding/state";
  import { PRODUCT_DISPLAY_NAME, PRODUCT_TAGLINE } from "$lib/product";
  import Button from "./Button.svelte";
  import Input from "./Input.svelte";
  import Select from "./Select.svelte";
  import Logo from "./Logo.svelte";
  import { showToast } from "$lib/stores/ui";

  let {
    onComplete,
  }: {
    onComplete: () => void;
  } = $props();

  let step = $state(0);
  let busy = $state(false);
  let shopName = $state("");
  let defaultVat = $state("21");
  let productName = $state("");
  let productPrice = $state("9.90");
  let productSku = $state("DEMO-001");

  const steps = ["Tu tienda", "Primer producto", "Primera venta"];

  async function loadSettings() {
    try {
      const s = await api.getSettings();
      shopName = s.shop_name || "";
      defaultVat = String(s.default_vat ?? 21);
    } catch {
      /* ignore */
    }
  }

  $effect(() => {
    void loadSettings();
  });

  async function saveShop() {
    if (!shopName.trim()) {
      showToast("Indica el nombre de la tienda", "err");
      return;
    }
    busy = true;
    try {
      await api.updateSettings({
        shop_name: shopName.trim(),
        default_vat: Number(defaultVat) as VatRate,
      });
      step = 1;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar", "err");
    } finally {
      busy = false;
    }
  }

  async function saveProduct() {
    if (!productName.trim()) {
      showToast("Indica un nombre de producto", "err");
      return;
    }
    const cents = Math.round(parseFloat(productPrice.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      showToast("Precio no válido", "err");
      return;
    }
    busy = true;
    try {
      await api.upsertProduct({
        sku: productSku.trim() || "DEMO-001",
        name: productName.trim(),
        description: "Creado en la puesta en marcha",
        category: "General",
        stock: 20,
        min_stock: 5,
        cost_cents: Math.round(cents * 0.6),
        price_cents: cents,
        vat_rate: Number(defaultVat) as VatRate,
        active: true,
      });
      showToast("Producto listo");
      step = 2;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al crear producto", "err");
    } finally {
      busy = false;
    }
  }

  function finish(opts?: { skipped?: boolean }) {
    markOnboardingDone(opts);
    onComplete();
    if (opts?.skipped) {
      showToast("Puedes configurar la tienda cuando quieras en Ajustes");
    } else {
      showToast("¡Listo! Ya puedes cobrar");
    }
  }

  function useDemoCatalog() {
    productName = productName || "Producto demo";
    productSku = productSku || "DEMO-001";
    productPrice = productPrice || "9.90";
    void saveProduct();
  }
</script>

<div
  class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
  data-onboarding-wizard
  role="dialog"
  aria-modal="true"
  aria-labelledby="onboarding-title"
>
  <div
    class="onboarding-editorial glass-strong max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto border border-[var(--color-border-strong)] p-6 shadow-2xl sm:p-8"
  >
    <div class="mb-6 text-center">
      <div class="mx-auto mb-3 flex justify-center">
        <Logo size={48} class="rounded-2xl glow-purple" />
      </div>
      <p class="section-label mb-1">Puesta en marcha</p>
      <h1 id="onboarding-title" class="editorial-serif text-3xl font-normal text-[var(--color-text)]">
        Bienvenido a {PRODUCT_DISPLAY_NAME}
      </h1>
      <p class="mt-1 text-sm text-[var(--color-muted)]">{PRODUCT_TAGLINE}</p>
    </div>

    <ol class="mb-6 flex justify-center gap-2">
      {#each steps as label, i}
        <li
          class="rounded-full px-2.5 py-1 text-[11px] font-medium {i === step
            ? 'bg-purple-500/25 text-[var(--color-purple-bright)]'
            : i < step
              ? 'bg-emerald-500/15 text-emerald-200/90'
              : 'bg-black/30 text-[var(--color-muted-dim)]'}"
        >
          {i + 1}. {label}
        </li>
      {/each}
    </ol>

    {#if step === 0}
      <div class="grid gap-3">
        <Input label="Nombre de la tienda" bind:value={shopName} placeholder="Mi comercio" />
        <Select
          label="IVA por defecto"
          bind:value={defaultVat}
          options={VAT_RATES.map((r) => ({ value: String(r), label: vatLabel(r) }))}
        />
        <div class="mt-2 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" type="button" onclick={() => finish({ skipped: true })}>
            Saltar y usar demo
          </Button>
          <Button type="button" disabled={busy} onclick={saveShop}>Continuar</Button>
        </div>
      </div>
    {:else if step === 1}
      <div class="grid gap-3">
        <p class="text-sm text-[var(--color-muted)]">
          Crea un producto para poder cobrar, o usa el catálogo demo.
        </p>
        <Input label="Nombre" bind:value={productName} placeholder="Café en grano 1 kg" />
        <div class="grid grid-cols-2 gap-3">
          <Input label="SKU" bind:value={productSku} />
          <Input label="PVP (€, IVA incl.)" bind:value={productPrice} />
        </div>
        <div class="mt-2 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" type="button" disabled={busy} onclick={useDemoCatalog}>
            Usar producto demo
          </Button>
          <Button type="button" disabled={busy} onclick={saveProduct}>Continuar</Button>
        </div>
      </div>
    {:else}
      <div class="grid gap-4 text-center">
        <p class="text-sm text-[var(--color-muted)]">
          Todo listo. Cobra tu primera venta en el TPV (precios con IVA incluido).
        </p>
        <div class="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            type="button"
            onclick={() => {
              finish();
              if (typeof window !== "undefined") {
                window.location.href = "/ventas?nuevo=1";
              }
            }}
          >
            Cobrar primera venta
          </Button>
          <Button variant="secondary" type="button" onclick={() => finish()}>
            Ir al panel
          </Button>
        </div>
      </div>
    {/if}
  </div>
</div>
