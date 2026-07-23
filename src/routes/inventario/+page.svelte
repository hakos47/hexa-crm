<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { api } from "$lib/api/client";
  import type {
    FulfillmentMode,
    InventoryMovement,
    InventoryMovementType,
    InventoryReason,
    Product,
    ProductCondition,
    ProductInput,
    StockBalance,
    StockLocation,
    Supplier,
    Warehouse,
  } from "$lib/types";
  import { INVENTORY_REASON_LABELS } from "$lib/types";
  import { formatEUR, parseEurosInput } from "$lib/money";
  import { VAT_RATES, vatLabel, type VatRate } from "$lib/vat";
  import Button from "$lib/components/Button.svelte";
  import Card from "$lib/components/Card.svelte";
  import KpiCard from "$lib/components/KpiCard.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Input from "$lib/components/Input.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Select from "$lib/components/Select.svelte";
  import { showToast } from "$lib/stores/ui";
  import {
    parseProductCsv,
    productCsvTemplate,
    productsToCsv,
  } from "$lib/import/product-csv";
  import { downloadCsv, reorderSuggestionsToCsv } from "$lib/export/csv";
  import { estimateDaysOfCover, qtySoldForProduct } from "$lib/inventory/stock-cover";
  import { countsInBusinessTotals } from "$lib/sales/cancel-sale";
  import { planReorderSuggestions } from "$lib/inventory/reorder";
  import {
    LEGACY_SUPPLIER,
    NO_SUPPLIER,
    productSupplierSelection,
    supplierSnapshotForSelection,
  } from "$lib/inventory/supplier-selection";

  type TabType = "resumen" | "products" | "movements" | "locations" | "suppliers";
  let activeTab = $state<TabType>("resumen");

  // Domain datasets
  let products = $state<Product[]>([]);
  let suppliers = $state<Supplier[]>([]);
  let warehouses = $state<Warehouse[]>([]);
  let stockLocations = $state<StockLocation[]>([]);
  let stockBalances = $state<StockBalance[]>([]);
  let inventoryMovements = $state<InventoryMovement[]>([]);

  let loading = $state(true);
  let importing = $state(false);
  /** product_id → units sold (net) last 14 days */
  let sold14d = $state<Record<number, number>>({});

  // Product catalog state
  let query = $state("");
  let categoryFilter = $state("");
  let supplyFilter = $state("");
  let conditionFilter = $state("");
  let showReorder = $state(false);
  let reorderQty = $state<Record<number, number>>({});

  // Product modal
  let modalOpen = $state(false);
  let editing = $state<Product | null>(null);
  let form = $state({
    sku: "",
    name: "",
    description: "",
    category: "",
    stock: "0",
    min_stock: "5",
    cost: "",
    price: "",
    vat_rate: "21" as string,
    supplier_name: "",
    supplier_contact: "",
    supplier_email: "",
    supplier_phone: "",
    fulfillment_mode: "own_stock" as FulfillmentMode,
    stock_location: "Almacén principal",
    condition_code: "new" as ProductCondition,
  });

  // Supplier modal
  let supplierModal = $state(false);
  let editingSupplier = $state<Supplier | null>(null);
  let selectedSupplier = $state(NO_SUPPLIER);
  let returnToProductAfterSupplier = $state(false);
  let supplierForm = $state({
    name: "",
    contact: "",
    email: "",
    phone: "",
    ordering_method: "email",
    notes: "",
  });

  // Movement audit log filters
  let movementQuery = $state("");
  let movementTypeFilter = $state("");
  let movementProductFilter = $state("");
  let movementLocationFilter = $state("");
  let movementFromDate = $state("");
  let movementToDate = $state("");

  // Create Movement modal
  let movementModalOpen = $state(false);
  let movementForm = $state({
    product_id: "",
    movement_type: "in",
    from_location_id: "",
    to_location_id: "",
    quantity: "1",
    reason: "purchase_receive",
    notes: "",
  });

  // Reverse Movement modal
  let reversalModalOpen = $state(false);
  let movementToReverse = $state<InventoryMovement | null>(null);
  let reversalReason = $state("Anulación de movimiento");

  const fulfillmentOptions = [
    { value: "own_stock", label: "Almacén propio" },
    { value: "supplier_dropship", label: "Proveedor · dropshipping" },
    { value: "third_party_fulfillment", label: "3PL / almacén externo" },
    { value: "make_to_order", label: "Bajo pedido" },
  ];

  const conditionOptions = [
    { value: "new", label: "Nuevo" },
    { value: "open_box", label: "Caja abierta" },
    { value: "refurbished", label: "Reacondicionado" },
    { value: "used", label: "Usado" },
    { value: "preowned", label: "Usado" },
    { value: "for_parts", label: "Para piezas" },
  ];

  const movementTypeOptions = [
    { value: "in", label: "Entrada de stock (+)" },
    { value: "out", label: "Salida de stock (−)" },
    { value: "transfer", label: "Transferencia / Traspaso (➔)" },
    { value: "adjustment", label: "Ajuste de inventario (±)" },
    { value: "damage_spoilage", label: "Daño / Merma (−)" },
    { value: "loss_theft", label: "Pérdida / Robo (−)" },
  ];

  const reasonOptions = [
    { value: "purchase_receive", label: "Recepción de compra / proveedor" },
    { value: "sale_shipment", label: "Salida por venta TPV" },
    { value: "sale_return", label: "Devolución de cliente" },
    { value: "transfer", label: "Traspaso entre ubicaciones" },
    { value: "audit_adjustment", label: "Ajuste por inventario / auditoría" },
    { value: "damage_spoilage", label: "Mermas / Daño / Caducidad" },
    { value: "loss_theft", label: "Pérdida / Extravío / Robo" },
    { value: "initial_stock", label: "Carga inicial de stock" },
    { value: "supplier_return", label: "Devolución a proveedor" },
    { value: "internal_use", label: "Uso interno / Muestra" },
    { value: "other", label: "Otro motivo" },
  ];

  const activeSuppliers = $derived(suppliers.filter((supplier) => supplier.active));
  const selectedSupplierRecord = $derived(
    activeSuppliers.find((supplier) => String(supplier.id) === selectedSupplier) ?? null,
  );

  const supplierOptions = $derived([
    { value: NO_SUPPLIER, label: "Sin proveedor", hint: "El artículo se abastece sin un contacto asociado" },
    ...activeSuppliers.map((supplier) => ({
      value: String(supplier.id),
      label: supplier.name,
      hint: supplier.contact || supplier.email || supplier.phone || "Proveedor guardado",
    })),
    ...(selectedSupplier === LEGACY_SUPPLIER
      ? [{
          value: LEGACY_SUPPLIER,
          label: `${form.supplier_name || "Proveedor anterior"} · histórico`,
          hint: "No está en el directorio actual; elige otro para sustituirlo",
        }]
      : []),
  ]);

  const productOptions = $derived([
    { value: "", label: "Seleccionar producto…" },
    ...products.map((p) => ({
      value: String(p.id),
      label: `${p.name} (${p.sku})`,
      hint: `Stock actual: ${p.stock} | Mín: ${p.min_stock} | PVP: ${formatEUR(p.price_cents)}`,
    })),
  ]);

  const defaultLocation = $derived(
    stockLocations.find((l) => l.code === "LOC-MAIN" || l.name.toLowerCase().includes("principal")) ?? stockLocations[0] ?? null
  );

  const locationOptions = $derived([
    { value: "", label: "Sin ubicación específica / Origen o destino externo" },
    ...stockLocations.map((loc) => {
      const wh = warehouses.find((w) => w.id === loc.warehouse_id);
      return {
        value: String(loc.id),
        label: loc.name,
        hint: `${loc.code} ${wh ? `· ${wh.name}` : ""}${loc.allow_negative_stock ? " (Permite stock negativo)" : ""}`,
      };
    }),
  ]);

  const movementTypeFilterOptions = [
    { value: "", label: "Todos los tipos de movimiento" },
    { value: "in", label: "Entrada" },
    { value: "out", label: "Salida" },
    { value: "transfer", label: "Transferencia" },
    { value: "adjustment", label: "Ajuste" },
    { value: "reversal", label: "Reversión" },
  ];

  const movementProductFilterOptions = $derived([
    { value: "", label: "Todos los productos" },
    ...products.map((p) => ({
      value: String(p.id),
      label: `${p.sku} - ${p.name}`,
    })),
  ]);

  const movementLocationFilterOptions = $derived([
    { value: "", label: "Todas las ubicaciones" },
    ...stockLocations.map((l) => ({
      value: String(l.id),
      label: `${l.code} - ${l.name}`,
    })),
  ]);

  const categories = $derived(
    [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "es")
    )
  );

  const filteredProducts = $derived(
    products.filter((p) => {
      const q = query.toLowerCase();
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        (p.supplier_name || "").toLowerCase().includes(q) ||
        (p.supplier_contact || "").toLowerCase().includes(q);
      const matchCat = !categoryFilter || p.category === categoryFilter;
      const matchSupply = !supplyFilter || (p.fulfillment_mode ?? "own_stock") === supplyFilter;
      const normalizedCondition = p.condition_code === "preowned" ? "used" : (p.condition_code ?? "used");
      const matchCondition = !conditionFilter || normalizedCondition === conditionFilter;
      return matchQ && matchCat && matchSupply && matchCondition;
    })
  );

  const HORIZON_DAYS = 14;
  const reorderSuggestions = $derived(planReorderSuggestions(products, sold14d, HORIZON_DAYS));

  // Resumen derived metrics
  const activeProducts = $derived(products.filter((p) => p.active));
  const outOfStockProducts = $derived(products.filter((p) => p.active && p.stock <= 0));
  const lowStockProducts = $derived(products.filter((p) => p.active && p.stock > 0 && p.stock <= p.min_stock));
  const totalStockUnits = $derived(products.reduce((sum, p) => sum + (p.stock || 0), 0));
  const totalValuationCents = $derived(products.reduce((sum, p) => sum + (p.stock || 0) * (p.cost_cents || 0), 0));

  // Reversed movements mapping
  const reversedMovementSet = $derived(
    new Set(
      inventoryMovements
        .map((m) => m.reversed_movement_id)
        .filter((id): id is number => id != null)
    )
  );

  // Filtered movements for audit log
  const filteredMovements = $derived(
    inventoryMovements.filter((m) => {
      const q = movementQuery.toLowerCase();
      const matchQ =
        !q ||
        (m.product_sku || "").toLowerCase().includes(q) ||
        (m.product_name || "").toLowerCase().includes(q) ||
        (m.created_by_name || "").toLowerCase().includes(q) ||
        (m.notes || "").toLowerCase().includes(q) ||
        String(m.id).includes(q) ||
        String(m.reference_id || "").toLowerCase().includes(q);

      const matchType = !movementTypeFilter || m.movement_type === movementTypeFilter;
      const matchProduct = !movementProductFilter || m.product_id === Number(movementProductFilter);
      const matchLoc =
        !movementLocationFilter ||
        m.from_location_id === Number(movementLocationFilter) ||
        m.to_location_id === Number(movementLocationFilter);
      const matchFrom = !movementFromDate || m.created_at >= movementFromDate;
      const matchTo = !movementToDate || m.created_at <= movementToDate + "T23:59:59";

      return matchQ && matchType && matchProduct && matchLoc && matchFrom && matchTo;
    })
  );

  function fulfillmentLabel(mode?: string) {
    return fulfillmentOptions.find((item) => item.value === mode)?.label ?? "Almacén propio";
  }

  function conditionLabel(condition?: string) {
    return conditionOptions.find((item) => item.value === condition)?.label ?? "Usado";
  }

  function locationName(locId?: number | null) {
    if (!locId) return "—";
    const loc = stockLocations.find((l) => l.id === locId);
    return loc ? loc.name : `Ubicación #${locId}`;
  }

  function movementDirectionText(m: InventoryMovement) {
    if (m.movement_type === "in") {
      return `— ➔ ${m.to_location_name || locationName(m.to_location_id)}`;
    }
    if (m.movement_type === "out") {
      return `${m.from_location_name || locationName(m.from_location_id)} ➔ —`;
    }
    if (m.movement_type === "transfer") {
      return `${m.from_location_name || locationName(m.from_location_id)} ➔ ${m.to_location_name || locationName(m.to_location_id)}`;
    }
    if (m.movement_type === "adjustment") {
      if (m.to_location_id) return `— ➔ ${m.to_location_name || locationName(m.to_location_id)}`;
      if (m.from_location_id) return `${m.from_location_name || locationName(m.from_location_id)} ➔ —`;
      return "Ajuste de existencias";
    }
    if (m.movement_type === "reversal") {
      if (m.to_location_id && m.from_location_id) {
        return `${m.from_location_name || locationName(m.from_location_id)} ➔ ${m.to_location_name || locationName(m.to_location_id)}`;
      }
      if (m.to_location_id) return `— ➔ ${m.to_location_name || locationName(m.to_location_id)}`;
      if (m.from_location_id) return `${m.from_location_name || locationName(m.from_location_id)} ➔ —`;
      return "Reversión de saldo";
    }
    return "—";
  }

  function movementBadgeInfo(m: InventoryMovement): { label: string; tone: "ok" | "danger" | "vat" | "warn" | "ai" } {
    if (m.is_reversal || m.movement_type === "reversal") {
      return { label: "↩ Reversión", tone: "ai" };
    }
    switch (m.movement_type) {
      case "in":
        return { label: "+ Entrada", tone: "ok" };
      case "out":
        return { label: "− Salida", tone: "danger" };
      case "transfer":
        return { label: "➔ Transferencia", tone: "vat" };
      case "adjustment":
        return { label: "± Ajuste", tone: "warn" };
      default:
        return { label: m.movement_type, tone: "vat" };
    }
  }

  function reasonLabel(reason?: string | null) {
    if (!reason) return "—";
    return (INVENTORY_REASON_LABELS as Record<string, string>)[reason] || reason;
  }

  function formatDate(isoStr: string) {
    if (!isoStr) return "—";
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  }

  async function loadSoldMap() {
    try {
      const sales = await api.listSales();
      const cutoff = Date.now() - HORIZON_DAYS * 86400000;
      const recent = sales
        .filter(
          (s) =>
            countsInBusinessTotals(s.status) && new Date(s.sold_at).getTime() >= cutoff,
        )
        .slice(0, 80);
      const lines: { product_id: number; qty: number; returned_qty?: number }[] = [];
      for (const s of recent) {
        try {
          const detail = await api.getSale(s.id);
          if (detail.lines) {
            for (const l of detail.lines) {
              lines.push({
                product_id: l.product_id,
                qty: l.qty,
                returned_qty: l.returned_qty,
              });
            }
          }
        } catch {
          /* skip */
        }
      }
      const map: Record<number, number> = {};
      for (const p of products) {
        map[p.id] = qtySoldForProduct(lines, p.id);
      }
      sold14d = map;
    } catch {
      sold14d = {};
    }
  }

  function coverFor(p: Product) {
    return estimateDaysOfCover({
      stock: p.stock,
      qtySoldInHorizon: sold14d[p.id] ?? 0,
      horizonDays: HORIZON_DAYS,
    });
  }

  async function load() {
    loading = true;
    try {
      const [pList, sList, wList, locList, balList, movList] = await Promise.all([
        api.listProducts(false).catch(() => []),
        api.listSuppliers().catch(() => []),
        api.listWarehouses().catch(() => []),
        api.listStockLocations().catch(() => []),
        api.listStockBalances().catch(() => []),
        api.listInventoryMovements({ limit: 300 }).catch(() => []),
      ]);
      products = pList;
      suppliers = sList;
      warehouses = wList;
      stockLocations = locList;
      stockBalances = balList;
      inventoryMovements = movList;
      await loadSoldMap();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al cargar datos de inventario", "err");
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    await load();
    if ($page.url.searchParams.get("nuevo") === "1") {
      openCreate();
    }
    if ($page.url.searchParams.get("reponer") === "1") {
      activeTab = "products";
      showReorder = true;
    }
  });

  // Supplier management functions
  function openSupplier(s?: Supplier) {
    editingSupplier = s ?? null;
    supplierForm = s
      ? { name: s.name, contact: s.contact, email: s.email, phone: s.phone, ordering_method: s.ordering_method, notes: s.notes }
      : { name: "", contact: "", email: "", phone: "", ordering_method: "email", notes: "" };
    supplierModal = true;
  }

  function closeSupplierModal() {
    supplierModal = false;
    if (returnToProductAfterSupplier) {
      returnToProductAfterSupplier = false;
      modalOpen = true;
    }
  }

  function openSupplierFromProduct() {
    modalOpen = false;
    returnToProductAfterSupplier = true;
    openSupplier();
  }

  function chooseSupplier(value: string) {
    selectedSupplier = value;
    const snapshot = supplierSnapshotForSelection(value, suppliers, form);
    form.supplier_name = snapshot.supplier_name ?? "";
    form.supplier_contact = snapshot.supplier_contact ?? "";
    form.supplier_email = snapshot.supplier_email ?? "";
    form.supplier_phone = snapshot.supplier_phone ?? "";
  }

  async function saveSupplier() {
    if (!supplierForm.name.trim()) return showToast("El nombre del proveedor es obligatorio", "err");
    try {
      const saved = await api.upsertSupplier({ id: editingSupplier?.id, ...supplierForm });
      const shouldReturnToProduct = returnToProductAfterSupplier;
      supplierModal = false;
      returnToProductAfterSupplier = false;
      showToast(editingSupplier ? "Proveedor actualizado" : "Proveedor creado con éxito");
      await load();
      if (shouldReturnToProduct) {
        chooseSupplier(String(saved.id));
        modalOpen = true;
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar proveedor", "err");
    }
  }

  // Product functions
  function openCreate() {
    editing = null;
    form = {
      sku: "",
      name: "",
      description: "",
      category: "",
      stock: "0",
      min_stock: "5",
      cost: "",
      price: "",
      vat_rate: "21",
      supplier_name: "",
      supplier_contact: "",
      supplier_email: "",
      supplier_phone: "",
      fulfillment_mode: "own_stock",
      stock_location: "Almacén principal",
      condition_code: "new",
    };
    selectedSupplier = NO_SUPPLIER;
    modalOpen = true;
  }

  function openEdit(p: Product) {
    editing = p;
    form = {
      sku: p.sku,
      name: p.name,
      description: p.description,
      category: p.category || "",
      stock: String(p.stock),
      min_stock: String(p.min_stock),
      cost: (p.cost_cents / 100).toFixed(2),
      price: (p.price_cents / 100).toFixed(2),
      vat_rate: String(p.vat_rate),
      supplier_name: p.supplier_name ?? "",
      supplier_contact: p.supplier_contact ?? "",
      supplier_email: p.supplier_email ?? "",
      supplier_phone: p.supplier_phone ?? "",
      fulfillment_mode: p.fulfillment_mode ?? "own_stock",
      stock_location: p.stock_location ?? "Almacén principal",
      condition_code: p.condition_code === "preowned" ? "used" : (p.condition_code ?? "used"),
    };
    selectedSupplier = productSupplierSelection(p, suppliers);
    modalOpen = true;
  }

  async function saveProduct() {
    const cost = parseEurosInput(form.cost);
    const price = parseEurosInput(form.price);
    if (cost === null || price === null) {
      showToast("Precio o coste no válidos", "err");
      return;
    }
    const input: ProductInput = {
      id: editing?.id,
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description,
      category: form.category.trim(),
      stock: Number(form.stock) || 0,
      min_stock: Number(form.min_stock) || 0,
      cost_cents: cost,
      price_cents: price,
      vat_rate: Number(form.vat_rate) as VatRate,
      supplier_name: form.supplier_name.trim(),
      supplier_contact: form.supplier_contact.trim(),
      supplier_email: form.supplier_email.trim(),
      supplier_phone: form.supplier_phone.trim(),
      fulfillment_mode: form.fulfillment_mode,
      stock_location: form.stock_location.trim(),
      condition_code: form.condition_code,
      active: true,
    };
    try {
      await api.upsertProduct(input);
      modalOpen = false;
      showToast(editing ? "Producto actualizado" : "Producto creado correctamente");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar producto", "err");
    }
  }

  // Reorder export
  function reorderQuantity(suggestion: (typeof reorderSuggestions)[number]) {
    return reorderQty[suggestion.product_id] ?? suggestion.qty_suggested;
  }

  function exportReorder() {
    const rows = reorderSuggestions
      .map((suggestion) => ({ ...suggestion, qty_suggested: Math.max(0, Math.trunc(reorderQuantity(suggestion))) }))
      .filter((suggestion) => suggestion.qty_suggested > 0);
    if (!rows.length) {
      showToast("No hay líneas de reposición para exportar", "info");
      return;
    }
    downloadCsv(`pedido-proveedor-${new Date().toISOString().slice(0, 10)}.csv`, reorderSuggestionsToCsv(rows));
  }

  // CSV Import/Export
  let fileInput: HTMLInputElement | undefined = $state();

  function downloadTemplate() {
    downloadCsv("plantilla-productos.csv", productCsvTemplate());
  }

  function exportCatalog() {
    downloadCsv(
      `productos-${new Date().toISOString().slice(0, 10)}.csv`,
      productsToCsv(products),
    );
  }

  function triggerImport() {
    fileInput?.click();
  }

  async function onImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    importing = true;
    try {
      const text = await file.text();
      const parsed = parseProductCsv(text, products);
      if (parsed.errors.length && !parsed.rows.length) {
        showToast(parsed.errors[0]?.message || "CSV no válido", "err");
        return;
      }
      if (parsed.errors.length) {
        showToast(
          `${parsed.errors.length} fila(s) con error. Primera: ${parsed.errors[0].message}`,
          "err",
        );
        return;
      }
      if (!parsed.rows.length) {
        showToast("No hay filas de producto en el CSV", "err");
        return;
      }
      let ok = 0;
      for (const row of parsed.rows) {
        await api.upsertProduct(row);
        ok += 1;
      }
      showToast(
        `Importación completada: ${ok} producto(s) (${parsed.would_create} nuevos, ${parsed.would_update} actualizados)`,
      );
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al importar CSV", "err");
    } finally {
      importing = false;
    }
  }

  // Movement Modal Logic
  function openMovementModal(product?: Product) {
    const defaultLocId = defaultLocation ? String(defaultLocation.id) : "";
    movementForm = {
      product_id: product ? String(product.id) : products[0] ? String(products[0].id) : "",
      movement_type: "in",
      from_location_id: defaultLocId,
      to_location_id: defaultLocId,
      quantity: "1",
      reason: "purchase_receive",
      notes: "",
    };
    movementModalOpen = true;
  }

  function onMovementTypeChange(typeVal: string) {
    const defaultLocId = defaultLocation ? String(defaultLocation.id) : "";
    movementForm.movement_type = typeVal;

    if (typeVal === "in") {
      movementForm.reason = "purchase_receive";
      if (!movementForm.to_location_id) movementForm.to_location_id = defaultLocId;
    } else if (typeVal === "out") {
      movementForm.reason = "sale_shipment";
      if (!movementForm.from_location_id) movementForm.from_location_id = defaultLocId;
    } else if (typeVal === "transfer") {
      movementForm.reason = "transfer";
      if (!movementForm.from_location_id) movementForm.from_location_id = defaultLocId;
    } else if (typeVal === "adjustment") {
      movementForm.reason = "audit_adjustment";
      if (!movementForm.to_location_id && !movementForm.from_location_id) {
        movementForm.to_location_id = defaultLocId;
      }
    } else if (typeVal === "damage_spoilage") {
      movementForm.reason = "damage_spoilage";
      if (!movementForm.from_location_id) movementForm.from_location_id = defaultLocId;
    } else if (typeVal === "loss_theft") {
      movementForm.reason = "loss_theft";
      if (!movementForm.from_location_id) movementForm.from_location_id = defaultLocId;
    }
  }

  async function saveMovement() {
    const prodId = Number(movementForm.product_id);
    const qty = Number(movementForm.quantity);

    if (!prodId) {
      showToast("Selecciona un producto para el movimiento", "err");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast("La cantidad debe ser mayor que cero", "err");
      return;
    }

    let realType: InventoryMovementType = "in";
    let realReason = movementForm.reason;

    if (movementForm.movement_type === "damage_spoilage") {
      realType = "out";
      realReason = "damage_spoilage";
    } else if (movementForm.movement_type === "loss_theft") {
      realType = "out";
      realReason = "loss_theft";
    } else {
      realType = movementForm.movement_type as InventoryMovementType;
    }

    let fromLocId: number | null = movementForm.from_location_id ? Number(movementForm.from_location_id) : null;
    let toLocId: number | null = movementForm.to_location_id ? Number(movementForm.to_location_id) : null;

    if (realType === "in" && !toLocId && defaultLocation) {
      toLocId = defaultLocation.id;
    }
    if ((realType === "out") && !fromLocId && defaultLocation) {
      fromLocId = defaultLocation.id;
    }
    if (realType === "transfer") {
      if (!fromLocId || !toLocId) {
        showToast("Selecciona ubicación de origen y destino para traspasos", "err");
        return;
      }
      if (fromLocId === toLocId) {
        showToast("La ubicación de origen y destino no pueden ser iguales", "err");
        return;
      }
    }

    try {
      await api.createInventoryMovement({
        product_id: prodId,
        movement_type: realType,
        reason: realReason,
        quantity: qty,
        from_location_id: fromLocId,
        to_location_id: toLocId,
        notes: movementForm.notes.trim() || null,
      });
      movementModalOpen = false;
      showToast("Movimiento de inventario registrado correctamente");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al registrar movimiento", "err");
    }
  }

  // Reversal Action
  function openReversalModal(m: InventoryMovement) {
    movementToReverse = m;
    reversalReason = "movement_reversal";
    reversalModalOpen = true;
  }

  async function confirmReversal() {
    if (!movementToReverse) return;
    try {
      await api.reverseInventoryMovement(movementToReverse.id, reversalReason);
      showToast("Movimiento revertido y anulado con éxito");
      reversalModalOpen = false;
      movementToReverse = null;
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al revertir el movimiento", "err");
    }
  }

  const stockLocationTypeLabels: Record<string, string> = {
    store: "Tienda / Punto de venta",
    warehouse: "Almacén principal",
    in_transit: "En tránsito",
    quality_hold: "Control de calidad",
    returns: "Devoluciones",
    third_party: "Almacén 3PL / Terceros",
    supplier_virtual: "Proveedor virtual",
    virtual: "Virtual",
  };
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".csv,text/csv"
  class="hidden"
  onchange={onImportFile}
/>

<section class="inventory-page workspace-page">
  <!-- Header -->
  <div class="workspace-intro workspace-intro-compact">
    <p class="workspace-index">02 / INVENTARIO</p>
    <div class="workspace-intro-row">
      <h2>Operaciones de Inventario,<br /><em>visibilidad y control total.</em></h2>
      <p>Catálogo denso, existencias, trazabilidad de movimientos y ubicaciones en una sola vista.</p>
    </div>
  </div>

  <!-- Sub-navigation tabs -->
  <div class="workspace-tabs mb-5 flex flex-wrap gap-2 border-b border-[var(--color-border-soft)] pb-3">
    <Button
      variant={activeTab === "resumen" ? "primary" : "ghost"}
      onclick={() => (activeTab = "resumen")}
    >
      Resumen Operativo
    </Button>
    <Button
      variant={activeTab === "products" ? "primary" : "ghost"}
      onclick={() => (activeTab = "products")}
    >
      Productos {products.length ? `(${products.length})` : ""}
    </Button>
    <Button
      variant={activeTab === "movements" ? "primary" : "ghost"}
      onclick={() => (activeTab = "movements")}
    >
      Movimientos {inventoryMovements.length ? `(${inventoryMovements.length})` : ""}
    </Button>
    <Button
      variant={activeTab === "locations" ? "primary" : "ghost"}
      onclick={() => (activeTab = "locations")}
    >
      Almacenes y Ubicaciones {stockLocations.length ? `(${stockLocations.length})` : ""}
    </Button>
    <Button
      variant={activeTab === "suppliers" ? "primary" : "ghost"}
      onclick={() => (activeTab = "suppliers")}
    >
      Proveedores {suppliers.length ? `(${suppliers.length})` : ""}
    </Button>
  </div>

  <!-- Content Loading Skeleton -->
  {#if loading}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
      <div class="skeleton h-24"></div>
      <div class="skeleton h-24"></div>
      <div class="skeleton h-24"></div>
      <div class="skeleton h-24"></div>
    </div>
    <div class="skeleton h-64"></div>
  {:else}

    <!-- TAB 1: RESUMEN OPERATIVO -->
    {#if activeTab === "resumen"}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard
          label="Catálogo Total"
          value={String(products.length)}
          hint={`${products.filter((p) => p.active).length} productos activos`}
          icon="📦"
          accent="cyan"
        />
        <KpiCard
          label="Unidades en Stock"
          value={String(totalStockUnits)}
          hint="Sumatorio de existencias"
          icon="📊"
          accent="emerald"
        />
        <KpiCard
          label="Stock Bajo / Crítico"
          value={String(lowStockProducts.length + outOfStockProducts.length)}
          hint={`${outOfStockProducts.length} agotados · ${lowStockProducts.length} en mínimo`}
          icon="⚠️"
          accent={outOfStockProducts.length > 0 ? "rose" : lowStockProducts.length > 0 ? "amber" : "emerald"}
        />
        <KpiCard
          label="Valoración Inventario"
          value={formatEUR(totalValuationCents)}
          hint="Valor total a coste"
          icon="💎"
          accent="violet"
        />
      </div>

      <!-- Quick Action Buttons Bar -->
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border-soft)] bg-white/[0.02] p-4">
        <div>
          <h3 class="font-semibold text-[var(--color-text)]">Acciones Rápidas</h3>
          <p class="text-xs text-[var(--color-muted-dim)]">Registra entradas, salidas o crea nuevos productos de forma inmediata.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" onclick={() => (activeTab = "movements")}>Ver auditoría de movimientos</Button>
          <Button variant="secondary" onclick={() => openMovementModal()}>+ Movimiento / Ajuste</Button>
          <Button onclick={openCreate}>+ Nuevo producto</Button>
        </div>
      </div>

      <!-- Out of Stock & Low Stock Exception Lists -->
      <div class="grid gap-6 lg:grid-cols-2 mb-6">
        <!-- Out of Stock -->
        <Card lift={false} class="p-0 overflow-hidden">
          <div class="flex items-center justify-between border-b border-[var(--color-border-soft)] p-4">
            <div class="flex items-center gap-2">
              <Badge tone="danger">Agotado</Badge>
              <h3 class="font-semibold text-[var(--color-text)]">Productos sin Stock ({outOfStockProducts.length})</h3>
            </div>
            {#if outOfStockProducts.length > 0}
              <span class="text-xs text-rose-300 font-medium">Urgente reponer</span>
            {/if}
          </div>
          {#if outOfStockProducts.length === 0}
            <div class="p-6 text-center text-sm text-[var(--color-muted-dim)]">
              ✨ No hay productos sin existencias en este momento.
            </div>
          {:else}
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead class="border-b border-[var(--color-border-soft)] text-[11px] uppercase text-[var(--color-muted-dim)]">
                  <tr>
                    <th class="px-4 py-2">Producto</th>
                    <th class="px-4 py-2">Categoría</th>
                    <th class="px-4 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {#each outOfStockProducts.slice(0, 8) as p (p.id)}
                    <tr class="border-b border-[var(--color-border-soft)] hover:bg-[var(--color-purple-mist)]">
                      <td class="px-4 py-2.5">
                        <p class="font-medium text-[var(--color-text)]">{p.name}</p>
                        <p class="text-xs text-[var(--color-muted-dim)]">{p.sku}</p>
                      </td>
                      <td class="px-4 py-2.5 text-xs text-[var(--color-muted)]">{p.category || "—"}</td>
                      <td class="px-4 py-2.5 text-right">
                        <Button variant="secondary" class="!px-2 !py-1 text-xs" onclick={() => openMovementModal(p)}>
                          + Entrada
                        </Button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </Card>

        <!-- Low Stock -->
        <Card lift={false} class="p-0 overflow-hidden">
          <div class="flex items-center justify-between border-b border-[var(--color-border-soft)] p-4">
            <div class="flex items-center gap-2">
              <Badge tone="warn">Bajo Mínimo</Badge>
              <h3 class="font-semibold text-[var(--color-text)]">Stock Bajo Mínimo ({lowStockProducts.length})</h3>
            </div>
            {#if lowStockProducts.length > 0}
              <Button variant="ghost" class="!py-0.5 text-xs" onclick={() => { activeTab = "products"; showReorder = true; }}>
                Ver reposición ➔
              </Button>
            {/if}
          </div>
          {#if lowStockProducts.length === 0}
            <div class="p-6 text-center text-sm text-[var(--color-muted-dim)]">
              👍 Todos los productos tienen existencias suficientes.
            </div>
          {:else}
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead class="border-b border-[var(--color-border-soft)] text-[11px] uppercase text-[var(--color-muted-dim)]">
                  <tr>
                    <th class="px-4 py-2">Producto</th>
                    <th class="px-4 py-2">Stock / Mín</th>
                    <th class="px-4 py-2">Cobertura</th>
                    <th class="px-4 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {#each lowStockProducts.slice(0, 8) as p (p.id)}
                    {@const cover = coverFor(p)}
                    <tr class="border-b border-[var(--color-border-soft)] hover:bg-[var(--color-purple-mist)]">
                      <td class="px-4 py-2.5">
                        <p class="font-medium text-[var(--color-text)]">{p.name}</p>
                        <p class="text-xs text-[var(--color-muted-dim)]">{p.sku}</p>
                      </td>
                      <td class="px-4 py-2.5 tabular text-xs">
                        <span class="text-amber-300 font-semibold">{p.stock}</span> <span class="text-[var(--color-muted-dim)]">/ {p.min_stock}</span>
                      </td>
                      <td class="px-4 py-2.5 text-xs tabular text-[var(--color-muted)]">{cover.display}</td>
                      <td class="px-4 py-2.5 text-right">
                        <Button variant="secondary" class="!px-2 !py-1 text-xs" onclick={() => openMovementModal(p)}>
                          + Ajustar
                        </Button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </Card>
      </div>

      <!-- Recent Movements Audit Widget -->
      <Card lift={false} class="p-0 overflow-hidden">
        <div class="flex items-center justify-between border-b border-[var(--color-border-soft)] p-4">
          <div>
            <h3 class="font-semibold text-[var(--color-text)]">Últimos Movimientos de Inventario</h3>
            <p class="text-xs text-[var(--color-muted-dim)]">Registros recientes de entradas, salidas y traspasos.</p>
          </div>
          <Button variant="ghost" class="text-xs" onclick={() => (activeTab = "movements")}>
            Ver historial completo ➔
          </Button>
        </div>
        {#if inventoryMovements.length === 0}
          <div class="p-8 text-center text-sm text-[var(--color-muted-dim)]">
            No hay movimientos de inventario registrados aún.
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full min-w-[40rem] text-left text-sm">
              <thead class="border-b border-[var(--color-border-soft)] text-xs uppercase text-[var(--color-muted-dim)]">
                <tr>
                  <th class="px-4 py-3">Fecha / Hora</th>
                  <th class="px-4 py-3">Producto</th>
                  <th class="px-4 py-3">Tipo</th>
                  <th class="px-4 py-3 tabular">Cantidad</th>
                  <th class="px-4 py-3">Motivo</th>
                  <th class="px-4 py-3">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {#each inventoryMovements.slice(0, 5) as m (m.id)}
                  {@const badge = movementBadgeInfo(m)}
                  <tr class="border-b border-[var(--color-border-soft)] hover:bg-[var(--color-purple-mist)]">
                    <td class="px-4 py-3 text-xs tabular text-[var(--color-muted)]">{formatDate(m.created_at)}</td>
                    <td class="px-4 py-3">
                      <p class="font-medium text-[var(--color-text)]">{m.product_name || `Producto #${m.product_id}`}</p>
                      <p class="text-xs text-[var(--color-muted-dim)]">{m.product_sku || ""}</p>
                    </td>
                    <td class="px-4 py-3">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td class="px-4 py-3 font-semibold tabular text-[var(--color-text)]">{m.quantity}</td>
                    <td class="px-4 py-3 text-xs text-[var(--color-muted)]">{reasonLabel(m.reason)}</td>
                    <td class="px-4 py-3 text-xs text-[var(--color-muted-dim)]">{m.created_by_name || "Sistema"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </Card>
    {/if}

    <!-- TAB 2: PRODUCTOS -->
    {#if activeTab === "products"}
      <div class="workspace-toolbar mb-5 flex flex-wrap items-center gap-3">
        <input
          bind:value={query}
          placeholder="Buscar por nombre, SKU, categoría o proveedor…"
          class="field w-full max-w-sm text-sm"
        />
        <Select
          class="w-full max-w-[13rem]"
          bind:value={categoryFilter}
          placeholder="Todas las categorías"
          options={[
            { value: "", label: "Todas las categorías" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />
        <Select
          class="w-full max-w-[13rem]"
          bind:value={supplyFilter}
          options={[{ value: "", label: "Todo abastecimiento" }, ...fulfillmentOptions]}
        />
        <Select
          class="w-full max-w-[11rem]"
          bind:value={conditionFilter}
          options={[{ value: "", label: "Todo estado" }, ...conditionOptions.filter((item) => item.value !== "preowned")]}
        />
        <div class="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onclick={downloadTemplate} disabled={importing}>
            Plantilla CSV
          </Button>
          <Button variant="secondary" onclick={exportCatalog} disabled={importing || !products.length}>
            Exportar CSV
          </Button>
          <Button variant="secondary" onclick={triggerImport} disabled={importing}>
            {importing ? "Importando…" : "Importar CSV"}
          </Button>
          <Button variant={showReorder ? "primary" : "secondary"} onclick={() => (showReorder = !showReorder)}>
            Reponer {reorderSuggestions.length ? `(${reorderSuggestions.length})` : ""}
          </Button>
          <Button variant="secondary" onclick={() => openMovementModal()}>
            + Movimiento
          </Button>
          <Button onclick={openCreate}>+ Nuevo producto</Button>
        </div>
      </div>

      {#if showReorder}
        <Card class="mb-5 border border-amber-400/25 bg-amber-500/[0.06]" lift={false} data-reorder-panel>
          <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="section-label mb-1 !text-amber-200">Reposición sugerida</p>
              <h3 class="text-base font-semibold text-[var(--color-text)]">Pedido local para proveedor</h3>
              <p class="mt-1 text-xs text-[var(--color-muted)]">Calculado con stock mínimo y ventas netas de los últimos {HORIZON_DAYS} días.</p>
            </div>
            <Button variant="secondary" onclick={exportReorder} disabled={!reorderSuggestions.length}>Exportar pedido CSV</Button>
          </div>
          {#if !reorderSuggestions.length}
            <p class="text-sm text-[var(--color-muted)]">No hay productos que requieran reposición en este momento.</p>
          {:else}
            <div class="overflow-x-auto">
              <table class="w-full min-w-[38rem] text-left text-sm">
                <thead class="border-b border-[var(--color-border-soft)] text-xs uppercase text-[var(--color-muted-dim)]">
                  <tr>
                    <th class="py-2 pr-3">Producto</th>
                    <th class="py-2 pr-3">Stock</th>
                    <th class="py-2 pr-3">Cobertura</th>
                    <th class="py-2 pr-3">Prioridad</th>
                    <th class="py-2 text-right">Pedir</th>
                  </tr>
                </thead>
                <tbody>
                  {#each reorderSuggestions as suggestion (suggestion.product_id)}
                    <tr class="border-b border-[var(--color-border-soft)] last:border-0">
                      <td class="py-2.5 pr-3">
                        <p class="font-medium text-[var(--color-text)]">{suggestion.name}</p>
                        <p class="text-xs text-[var(--color-muted-dim)]">{suggestion.sku}</p>
                      </td>
                      <td class="py-2.5 pr-3 tabular">{suggestion.stock} <span class="text-xs text-[var(--color-muted-dim)]">/ mín {suggestion.min_stock}</span></td>
                      <td class="py-2.5 pr-3 tabular">{suggestion.days_of_cover === null ? "sin ventas" : `~${suggestion.days_of_cover} d`}</td>
                      <td class="py-2.5 pr-3">
                        <Badge tone={suggestion.priority === "critical" ? "danger" : "warn"}>
                          {suggestion.priority === "critical" ? "crítico" : "vigilar"}
                        </Badge>
                      </td>
                      <td class="py-2.5 text-right">
                        <input
                          class="field w-20 py-1 text-right tabular"
                          type="number"
                          min="0"
                          value={reorderQuantity(suggestion)}
                          oninput={(event) => { reorderQty = { ...reorderQty, [suggestion.product_id]: Number((event.currentTarget as HTMLInputElement).value) || 0 }; }}
                        />
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </Card>
      {/if}

      {#if filteredProducts.length === 0}
        <EmptyState title="Sin productos" description="No hay productos que coincidan con la búsqueda.">
          <Button onclick={openCreate}>Crear producto</Button>
        </EmptyState>
      {:else}
        <Card lift={false} class="overflow-hidden p-0">
          <div class="w-full max-w-full overflow-x-auto">
            <table class="w-full min-w-[44rem] text-left text-sm">
              <thead class="border-b border-[var(--color-border-soft)] text-xs uppercase tracking-wide text-[var(--color-muted-dim)]">
                <tr>
                  <th class="px-4 py-3 font-medium">Producto</th>
                  <th class="px-4 py-3 font-medium">Categoría</th>
                  <th class="px-4 py-3 font-medium">Proveedor / contacto</th>
                  <th class="px-4 py-3 font-medium">Abastecimiento</th>
                  <th class="px-4 py-3 font-medium">Estado</th>
                  <th class="px-4 py-3 font-medium">Stock</th>
                  <th class="px-4 py-3 font-medium">Cobertura</th>
                  <th class="px-4 py-3 font-medium">PVP</th>
                  <th class="px-4 py-3 font-medium">IVA</th>
                  <th class="px-4 py-3 font-medium">Coste</th>
                  <th class="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredProducts as p (p.id)}
                  {@const cover = coverFor(p)}
                  <tr class="border-b border-[var(--color-border-soft)] transition hover:bg-[var(--color-purple-mist)]">
                    <td class="px-4 py-3">
                      <p class="font-medium text-[var(--color-text)]">{p.name}</p>
                      <p class="text-xs text-[var(--color-muted-dim)]">{p.sku}</p>
                    </td>
                    <td class="px-4 py-3 text-sm text-[var(--color-muted)]">
                      {p.category || "—"}
                    </td>
                    <td class="px-4 py-3">
                      <p class="text-sm text-[var(--color-text)]">{p.supplier_name || "Sin proveedor"}</p>
                      {#if p.supplier_contact || p.supplier_email || p.supplier_phone}
                        <p class="max-w-44 truncate text-xs text-[var(--color-muted-dim)]" title={p.supplier_email || p.supplier_phone || p.supplier_contact}>
                          {p.supplier_contact || p.supplier_email || p.supplier_phone}
                        </p>
                      {/if}
                    </td>
                    <td class="px-4 py-3 text-xs text-[var(--color-muted)]">{fulfillmentLabel(p.fulfillment_mode)}</td>
                    <td class="px-4 py-3">
                      <Badge tone={p.condition_code === "new" ? "ok" : p.condition_code === "for_parts" ? "danger" : "warn"}>
                        {conditionLabel(p.condition_code)}
                      </Badge>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <span class="tabular font-semibold {p.stock <= 0 ? 'text-rose-400' : p.stock <= p.min_stock ? 'text-amber-300' : 'text-[var(--color-text)]'}">
                          {p.stock}
                        </span>
                        {#if p.stock <= 0}
                          <Badge tone="danger">Agotado</Badge>
                        {:else if p.stock <= p.min_stock}
                          <Badge tone="warn">Bajo</Badge>
                        {/if}
                      </div>
                    </td>
                    <td class="px-4 py-3 text-xs">
                      <span
                        class="tabular {cover.label === 'critical'
                          ? 'text-rose-300 font-medium'
                          : cover.label === 'watch'
                            ? 'text-amber-200'
                            : 'text-[var(--color-muted-dim)]'}"
                        title="Estimación a ritmo de ventas de los últimos {HORIZON_DAYS} días"
                      >
                        {cover.display}
                      </span>
                    </td>
                    <td class="px-4 py-3 tabular font-medium">{formatEUR(p.price_cents)}</td>
                    <td class="px-4 py-3">
                      <Badge tone="vat">{p.vat_rate}%</Badge>
                    </td>
                    <td class="px-4 py-3 tabular text-[var(--color-muted)]">{formatEUR(p.cost_cents)}</td>
                    <td class="px-4 py-3 text-right">
                      <div class="flex justify-end gap-1">
                        <Button variant="ghost" class="!px-2 !py-1 text-xs" onclick={() => openMovementModal(p)}>
                          + Movimiento
                        </Button>
                        <Button variant="secondary" class="!px-2 !py-1 text-xs" onclick={() => openEdit(p)}>
                          Editar
                        </Button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </Card>
      {/if}
    {/if}

    <!-- TAB 3: MOVIMIENTOS DE INVENTARIO -->
    {#if activeTab === "movements"}
      <div class="workspace-toolbar mb-5 flex flex-wrap items-center gap-3">
        <input
          bind:value={movementQuery}
          placeholder="Buscar SKU, producto, usuario, notas o ref…"
          class="field w-full max-w-xs text-sm"
        />
        <Select
          class="w-full max-w-[12rem]"
          bind:value={movementTypeFilter}
          options={movementTypeFilterOptions}
        />
        <Select
          class="w-full max-w-[13rem]"
          bind:value={movementProductFilter}
          options={movementProductFilterOptions}
        />
        <Select
          class="w-full max-w-[13rem]"
          bind:value={movementLocationFilter}
          options={movementLocationFilterOptions}
        />
        <div class="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <span>Desde</span>
          <input type="date" bind:value={movementFromDate} class="field !py-1 !px-2 text-xs" />
          <span>Hasta</span>
          <input type="date" bind:value={movementToDate} class="field !py-1 !px-2 text-xs" />
        </div>
        <div class="ml-auto flex gap-2">
          {#if movementQuery || movementTypeFilter || movementProductFilter || movementLocationFilter || movementFromDate || movementToDate}
            <Button variant="ghost" class="text-xs" onclick={() => { movementQuery = ""; movementTypeFilter = ""; movementProductFilter = ""; movementLocationFilter = ""; movementFromDate = ""; movementToDate = ""; }}>
              Limpiar filtros
            </Button>
          {/if}
          <Button onclick={() => openMovementModal()}>+ Nuevo Movimiento / Ajuste</Button>
        </div>
      </div>

      {#if filteredMovements.length === 0}
        <EmptyState title="Sin movimientos" description="No se han encontrado registros de movimiento con los filtros seleccionados.">
          <Button onclick={() => openMovementModal()}>Registrar movimiento</Button>
        </EmptyState>
      {:else}
        <Card lift={false} class="overflow-hidden p-0">
          <div class="w-full max-w-full overflow-x-auto">
            <table class="w-full min-w-[52rem] text-left text-sm">
              <thead class="border-b border-[var(--color-border-soft)] text-xs uppercase tracking-wide text-[var(--color-muted-dim)]">
                <tr>
                  <th class="px-4 py-3 font-medium">ID / Fecha y Hora</th>
                  <th class="px-4 py-3 font-medium">Producto</th>
                  <th class="px-4 py-3 font-medium">Tipo Movimiento</th>
                  <th class="px-4 py-3 font-medium">Dirección (Origen ➔ Destino)</th>
                  <th class="px-4 py-3 font-medium tabular">Cantidad</th>
                  <th class="px-4 py-3 font-medium">Motivo</th>
                  <th class="px-4 py-3 font-medium">Usuario / Actor</th>
                  <th class="px-4 py-3 font-medium">Notas / Ref</th>
                  <th class="px-4 py-3 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredMovements as m (m.id)}
                  {@const badge = movementBadgeInfo(m)}
                  {@const isAlreadyReversed = m.is_reversal || m.movement_type === "reversal" || reversedMovementSet.has(m.id)}
                  <tr class="border-b border-[var(--color-border-soft)] transition hover:bg-[var(--color-purple-mist)]">
                    <td class="px-4 py-3 text-xs tabular text-[var(--color-muted)]">
                      <p class="font-semibold text-[var(--color-text)]">#{m.id}</p>
                      <p>{formatDate(m.created_at)}</p>
                    </td>
                    <td class="px-4 py-3">
                      <p class="font-medium text-[var(--color-text)]">{m.product_name || `Producto #${m.product_id}`}</p>
                      <p class="text-xs text-[var(--color-muted-dim)]">{m.product_sku || ""}</p>
                    </td>
                    <td class="px-4 py-3">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td class="px-4 py-3 text-xs text-[var(--color-muted)] font-mono">
                      {movementDirectionText(m)}
                    </td>
                    <td class="px-4 py-3 font-bold tabular text-[var(--color-text)]">
                      {m.quantity}
                    </td>
                    <td class="px-4 py-3 text-xs text-[var(--color-muted)]">
                      {reasonLabel(m.reason)}
                    </td>
                    <td class="px-4 py-3 text-xs text-[var(--color-muted-dim)]">
                      {m.created_by_name || "Sistema"}
                    </td>
                    <td class="px-4 py-3 text-xs text-[var(--color-muted-dim)] max-w-48 truncate" title={m.notes || ""}>
                      {m.notes || m.reference_id ? `${m.notes || ""} ${m.reference_id ? `[Ref: ${m.reference_id}]` : ""}` : "—"}
                    </td>
                    <td class="px-4 py-3 text-right">
                      {#if isAlreadyReversed}
                        <Badge tone="neutral">Anulado</Badge>
                      {:else}
                        <Button
                          variant="secondary"
                          class="!px-2 !py-1 text-xs"
                          onclick={() => openReversalModal(m)}
                        >
                          Revertir
                        </Button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </Card>
      {/if}
    {/if}

    <!-- TAB 4: ALMACENES Y UBICACIONES -->
    {#if activeTab === "locations"}
      <div class="grid gap-6">
        <!-- Almacenes Section -->
        <div>
          <div class="mb-3 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-[var(--color-text)]">Almacenes (Warehouses)</h3>
              <p class="text-xs text-[var(--color-muted-dim)]">Centros de distribución y almacenes físicos registrados.</p>
            </div>
          </div>

          {#if warehouses.length === 0}
            <Card lift={false} class="p-6 text-center text-sm text-[var(--color-muted-dim)]">
              No hay almacenes configurados. Se utiliza el almacén por defecto del sistema.
            </Card>
          {:else}
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {#each warehouses as wh (wh.id)}
                <Card lift={false} class="relative overflow-hidden">
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span class="text-xs font-mono font-semibold text-[var(--color-purple)]">[{wh.code}]</span>
                      <h4 class="font-medium text-base text-[var(--color-text)]">{wh.name}</h4>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                      {#if wh.is_default}
                        <Badge tone="ai">Por defecto</Badge>
                      {/if}
                      <Badge tone={wh.active ? "ok" : "neutral"}>{wh.active ? "Activo" : "Inactivo"}</Badge>
                    </div>
                  </div>
                  {#if wh.address}
                    <p class="text-xs text-[var(--color-muted)] mb-2">📍 {wh.address}</p>
                  {/if}
                  <div class="mt-3 border-t border-[var(--color-border-soft)] pt-2 flex items-center justify-between text-xs text-[var(--color-muted-dim)]">
                    <span>Ubicaciones asociadas:</span>
                    <span class="font-semibold text-[var(--color-text)]">
                      {stockLocations.filter((l) => l.warehouse_id === wh.id).length}
                    </span>
                  </div>
                </Card>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Ubicaciones de Stock Section -->
        <div>
          <div class="mb-3 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-[var(--color-text)]">Ubicaciones de Stock (Stock Locations)</h3>
              <p class="text-xs text-[var(--color-muted-dim)]">Zonas, estanterías y tipos de ubicación con políticas de existencias.</p>
            </div>
          </div>

          {#if stockLocations.length === 0}
            <Card lift={false} class="p-6 text-center text-sm text-[var(--color-muted-dim)]">
              No hay ubicaciones de stock registradas.
            </Card>
          {:else}
            <Card lift={false} class="overflow-hidden p-0">
              <div class="w-full max-w-full overflow-x-auto">
                <table class="w-full min-w-[40rem] text-left text-sm">
                  <thead class="border-b border-[var(--color-border-soft)] text-xs uppercase tracking-wide text-[var(--color-muted-dim)]">
                    <tr>
                      <th class="px-4 py-3 font-medium">Código / Nombre</th>
                      <th class="px-4 py-3 font-medium">Almacén Pertenencia</th>
                      <th class="px-4 py-3 font-medium">Tipo Ubicación</th>
                      <th class="px-4 py-3 font-medium">Política Stock Negativo</th>
                      <th class="px-4 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each stockLocations as loc (loc.id)}
                      {@const wh = warehouses.find((w) => w.id === loc.warehouse_id)}
                      <tr class="border-b border-[var(--color-border-soft)] transition hover:bg-[var(--color-purple-mist)]">
                        <td class="px-4 py-3">
                          <p class="font-medium text-[var(--color-text)]">{loc.name}</p>
                          <p class="text-xs font-mono text-[var(--color-purple)]">{loc.code}</p>
                        </td>
                        <td class="px-4 py-3 text-sm text-[var(--color-muted)]">
                          {wh ? wh.name : "—"}
                        </td>
                        <td class="px-4 py-3">
                          <Badge tone="vat">{stockLocationTypeLabels[loc.location_type] || loc.location_type}</Badge>
                        </td>
                        <td class="px-4 py-3">
                          {#if loc.allow_negative_stock}
                            <Badge tone="warn">Permitido (Saldo &lt; 0)</Badge>
                          {:else}
                            <Badge tone="neutral">Prohibido (Restringido)</Badge>
                          {/if}
                        </td>
                        <td class="px-4 py-3">
                          <Badge tone={loc.active ? "ok" : "neutral"}>{loc.active ? "Activa" : "Inactiva"}</Badge>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </Card>
          {/if}
        </div>
      </div>
    {/if}

    <!-- TAB 5: PROVEEDORES (Preserved) -->
    {#if activeTab === "suppliers"}
      <Card lift={false} class="overflow-hidden p-0">
        <div class="flex items-center justify-between gap-3 border-b border-[var(--color-border-soft)] p-4">
          <div>
            <h3 class="font-semibold text-[var(--color-text)]">Directorio de Proveedores</h3>
            <p class="text-xs text-[var(--color-muted-dim)]">Contactos directos y canales habituales para pedidos de reposición.</p>
          </div>
          <Button onclick={() => openSupplier()}>+ Nuevo proveedor</Button>
        </div>
        {#if suppliers.length === 0}
          <p class="p-6 text-sm text-[var(--color-muted)]">Aún no hay proveedores guardados. Crea el primero para reutilizarlo en tu catálogo.</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full min-w-[44rem] text-left text-sm">
              <thead class="border-b border-[var(--color-border-soft)] text-xs uppercase text-[var(--color-muted-dim)]">
                <tr>
                  <th class="px-4 py-3">Proveedor</th>
                  <th class="px-4 py-3">Contacto</th>
                  <th class="px-4 py-3">Canal Pedido</th>
                  <th class="px-4 py-3">Notas</th>
                  <th class="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {#each suppliers as supplier (supplier.id)}
                  <tr class="border-b border-[var(--color-border-soft)]">
                    <td class="px-4 py-3 font-medium text-[var(--color-text)]">{supplier.name}</td>
                    <td class="px-4 py-3 text-[var(--color-muted)]">
                      <p>{supplier.contact || "—"}</p>
                      <p class="text-xs">{supplier.email || supplier.phone || ""}</p>
                    </td>
                    <td class="px-4 py-3 text-[var(--color-muted)]">{supplier.ordering_method}</td>
                    <td class="max-w-56 truncate px-4 py-3 text-xs text-[var(--color-muted)]">{supplier.notes || "—"}</td>
                    <td class="px-4 py-3 text-right">
                      <Button variant="secondary" class="!px-2 !py-1 text-xs" onclick={() => openSupplier(supplier)}>Editar</Button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </Card>
    {/if}

  {/if}
</section>

<!-- MODAL: Crear/Editar Producto -->
<Modal open={modalOpen} title={editing ? "Editar producto" : "Nuevo producto"} onclose={() => (modalOpen = false)}>
  <form
    class="grid gap-3"
    onsubmit={(e) => {
      e.preventDefault();
      saveProduct();
    }}
  >
    <div class="grid gap-3 sm:grid-cols-2">
      <Input label="SKU" bind:value={form.sku} required />
      <Select
        label="IVA"
        bind:value={form.vat_rate}
        options={VAT_RATES.map((r) => ({ value: String(r), label: vatLabel(r) }))}
      />
    </div>
    <Input label="Nombre" bind:value={form.name} required />
    <Input label="Categoría" bind:value={form.category} placeholder="Alimentación, Tecnología…" />
    <Input label="Descripción" bind:value={form.description} />
    <div class="grid gap-3 sm:grid-cols-2">
      <Input label="PVP (€, IVA incl.)" bind:value={form.price} required />
      <Input label="Coste (€)" bind:value={form.cost} required />
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <Input label="Stock" type="number" bind:value={form.stock} />
      <Input label="Stock mínimo" type="number" bind:value={form.min_stock} />
    </div>
    <div class="mt-2 border-t border-[var(--color-border-soft)] pt-3">
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-dim)]">Abastecimiento y estado</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <Select label="Cómo se sirve" bind:value={form.fulfillment_mode} options={fulfillmentOptions} />
        <Select label="Condición" bind:value={form.condition_code} options={conditionOptions.filter((item) => item.value !== "preowned")} />
        <div class="grid gap-2 sm:col-span-2">
          <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
            <Select
              class="min-w-0 flex-1"
              label="Proveedor guardado"
              value={selectedSupplier}
              options={supplierOptions}
              onvaluechange={chooseSupplier}
            />
            <Button type="button" variant="secondary" class="w-full shrink-0 sm:w-auto" onclick={openSupplierFromProduct}>
              + Nuevo proveedor
            </Button>
          </div>
          {#if selectedSupplierRecord}
            <div class="rounded-xl border border-[var(--color-border-soft)] bg-white/[0.025] px-3 py-2.5 text-xs text-[var(--color-muted)]">
              <p class="font-medium text-[var(--color-text)]">{selectedSupplierRecord.name}</p>
              <p class="mt-1">
                {[selectedSupplierRecord.contact, selectedSupplierRecord.email, selectedSupplierRecord.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
              </p>
            </div>
          {:else if selectedSupplier === LEGACY_SUPPLIER}
            <p class="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-100">
              Este artículo conserva un proveedor histórico que no está en el directorio. Puedes mantenerlo o elegir uno de la lista.
            </p>
          {:else if activeSuppliers.length === 0}
            <p class="text-xs text-[var(--color-muted-dim)]">Aún no hay proveedores guardados. Créalo aquí y volverás al artículo sin perder los datos.</p>
          {/if}
        </div>
        <Input label="Ubicación / origen" bind:value={form.stock_location} placeholder="Almacén principal, proveedor…" />
      </div>
      {#if form.fulfillment_mode === "supplier_dropship"}
        <p class="mt-2 text-xs text-amber-200">Dropshipping: el proveedor envía al cliente; no uses este dato como stock propio disponible.</p>
      {/if}
    </div>
    <div class="mt-2 flex justify-end gap-2">
      <Button variant="ghost" type="button" onclick={() => (modalOpen = false)}>Cancelar</Button>
      <Button type="submit">Guardar</Button>
    </div>
  </form>
</Modal>

<!-- MODAL: Crear/Editar Proveedor -->
<Modal open={supplierModal} title={editingSupplier ? "Editar proveedor" : "Nuevo proveedor"} onclose={closeSupplierModal}>
  <form class="grid gap-3" onsubmit={(e) => { e.preventDefault(); saveSupplier(); }}>
    <Input label="Proveedor" bind:value={supplierForm.name} required placeholder="Empresa o profesional" />
    <div class="grid gap-3 sm:grid-cols-2">
      <Input label="Contacto directo" bind:value={supplierForm.contact} />
      <Select
        label="Canal de pedido"
        bind:value={supplierForm.ordering_method}
        options={[
          { value: "email", label: "Email" },
          { value: "phone", label: "Teléfono" },
          { value: "portal", label: "Portal web" },
          { value: "manual", label: "Manual" },
        ]}
      />
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <Input label="Email" type="email" bind:value={supplierForm.email} />
      <Input label="Teléfono" bind:value={supplierForm.phone} />
    </div>
    <Input label="Notas" bind:value={supplierForm.notes} placeholder="Plazos, condiciones o referencia de cuenta" />
    <div class="mt-2 flex justify-end gap-2">
      <Button variant="ghost" type="button" onclick={closeSupplierModal}>Cancelar</Button>
      <Button type="submit">Guardar proveedor</Button>
    </div>
  </form>
</Modal>

<!-- MODAL: Nuevo Movimiento / Ajuste -->
<Modal open={movementModalOpen} title="Nuevo Movimiento / Ajuste" onclose={() => (movementModalOpen = false)}>
  <form
    class="grid gap-3"
    onsubmit={(e) => {
      e.preventDefault();
      saveMovement();
    }}
  >
    <Select
      label="Producto *"
      value={movementForm.product_id}
      options={productOptions}
      onvaluechange={(val) => (movementForm.product_id = val)}
      required
    />

    <div class="grid gap-3 sm:grid-cols-2">
      <Select
        label="Tipo de Movimiento *"
        value={movementForm.movement_type}
        options={movementTypeOptions}
        onvaluechange={onMovementTypeChange}
        required
      />

      <Input
        label="Cantidad *"
        type="number"
        min="1"
        bind:value={movementForm.quantity}
        required
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <Select
        label="Ubicación Origen"
        value={movementForm.from_location_id}
        options={locationOptions}
        onvaluechange={(val) => (movementForm.from_location_id = val)}
      />

      <Select
        label="Ubicación Destino"
        value={movementForm.to_location_id}
        options={locationOptions}
        onvaluechange={(val) => (movementForm.to_location_id = val)}
      />
    </div>

    <Select
      label="Motivo del Movimiento"
      value={movementForm.reason}
      options={reasonOptions}
      onvaluechange={(val) => (movementForm.reason = val)}
    />

    <div class="flex flex-col gap-1.5 text-sm">
      <span class="font-medium text-[var(--color-muted)]">Notas / Observaciones</span>
      <textarea
        bind:value={movementForm.notes}
        placeholder="Información adicional, número de pedido, albarán o justificación…"
        rows={3}
        class="field w-full text-sm"
      ></textarea>
    </div>

    <div class="mt-3 flex justify-end gap-2 border-t border-[var(--color-border-soft)] pt-3">
      <Button variant="ghost" type="button" onclick={() => (movementModalOpen = false)}>
        Cancelar
      </Button>
      <Button type="submit">
        Registrar Movimiento
      </Button>
    </div>
  </form>
</Modal>

<!-- MODAL: Revertir Movimiento -->
<Modal open={reversalModalOpen} title="Revertir Movimiento" onclose={() => (reversalModalOpen = false)}>
  {#if movementToReverse}
    <div class="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3 text-xs text-[var(--color-text)]">
      <p class="font-semibold text-rose-300 mb-1">Confirmar anulación / reversión</p>
      <p>Se creará un movimiento de reversión inverso para anular el registro <strong>#{movementToReverse.id}</strong> ({movementToReverse.product_name}, cantidad: {movementToReverse.quantity}).</p>
    </div>

    <form
      class="grid gap-3"
      onsubmit={(e) => {
        e.preventDefault();
        confirmReversal();
      }}
    >
      <Input
        label="Motivo de la reversión"
        bind:value={reversalReason}
        placeholder="Indica la razón de la anulación…"
        required
      />

      <div class="mt-3 flex justify-end gap-2 border-t border-[var(--color-border-soft)] pt-3">
        <Button variant="ghost" type="button" onclick={() => (reversalModalOpen = false)}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary">
          Confirmar Reversión
        </Button>
      </div>
    </form>
  {/if}
</Modal>
