import { describe, expect, it } from "vitest";
import type { Supplier } from "$lib/types";
import {
  LEGACY_SUPPLIER,
  NO_SUPPLIER,
  productSupplierSelection,
  supplierSnapshotForSelection,
} from "./supplier-selection";

const suppliers: Supplier[] = [
  {
    id: 7,
    company_id: 1,
    name: "Tecnología Directa",
    contact: "Canal retail",
    email: "pedidos@tecnologia.example",
    phone: "+34 910 000 007",
    ordering_method: "email",
    notes: "",
    active: true,
    created_at: "2026-07-22T10:00:00.000Z",
    updated_at: "2026-07-22T10:00:00.000Z",
  },
];

describe("selección de proveedor para artículos", () => {
  it("reconoce al proveedor guardado al editar por nombre normalizado", () => {
    expect(
      productSupplierSelection(
        { supplier_name: " tecnología directa ", supplier_contact: "", supplier_email: "", supplier_phone: "" },
        suppliers,
      ),
    ).toBe("7");
  });

  it("conserva como histórico un proveedor que ya no está en el directorio", () => {
    expect(
      productSupplierSelection(
        { supplier_name: "Proveedor antiguo", supplier_contact: "Ana", supplier_email: "", supplier_phone: "" },
        suppliers,
      ),
    ).toBe(LEGACY_SUPPLIER);
  });

  it("copia al artículo todos los datos del proveedor seleccionado", () => {
    expect(supplierSnapshotForSelection("7", suppliers, {})).toEqual({
      supplier_name: "Tecnología Directa",
      supplier_contact: "Canal retail",
      supplier_email: "pedidos@tecnologia.example",
      supplier_phone: "+34 910 000 007",
    });
  });

  it("limpia la ficha cuando se elige sin proveedor", () => {
    expect(
      supplierSnapshotForSelection(NO_SUPPLIER, suppliers, {
        supplier_name: "Tecnología Directa",
        supplier_contact: "Canal retail",
        supplier_email: "pedidos@tecnologia.example",
        supplier_phone: "+34 910 000 007",
      }),
    ).toEqual({ supplier_name: "", supplier_contact: "", supplier_email: "", supplier_phone: "" });
  });
});
