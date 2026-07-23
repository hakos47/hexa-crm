import type { Product, Supplier } from "$lib/types";

export const NO_SUPPLIER = "none";
export const LEGACY_SUPPLIER = "legacy";

export type SupplierSnapshot = Pick<
  Product,
  "supplier_name" | "supplier_contact" | "supplier_email" | "supplier_phone"
>;

function normalized(value?: string) {
  return (value ?? "").trim().toLocaleLowerCase("es");
}

export function productSupplierSelection(
  product: SupplierSnapshot,
  suppliers: Supplier[],
): string {
  const name = normalized(product.supplier_name);
  const email = normalized(product.supplier_email);

  if (!name && !email && !normalized(product.supplier_phone) && !normalized(product.supplier_contact)) {
    return NO_SUPPLIER;
  }

  const match = suppliers.find(
    (supplier) =>
      supplier.active &&
      ((email && normalized(supplier.email) === email) ||
        (name && normalized(supplier.name) === name)),
  );

  return match ? String(match.id) : LEGACY_SUPPLIER;
}

export function supplierSnapshotForSelection(
  selection: string,
  suppliers: Supplier[],
  current: SupplierSnapshot,
): SupplierSnapshot {
  if (selection === LEGACY_SUPPLIER) return current;

  if (selection === NO_SUPPLIER || !selection) {
    return {
      supplier_name: "",
      supplier_contact: "",
      supplier_email: "",
      supplier_phone: "",
    };
  }

  const supplier = suppliers.find(
    (candidate) => candidate.active && String(candidate.id) === selection,
  );
  if (!supplier) return current;

  return {
    supplier_name: supplier.name,
    supplier_contact: supplier.contact,
    supplier_email: supplier.email,
    supplier_phone: supplier.phone,
  };
}
