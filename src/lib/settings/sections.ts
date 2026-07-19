/**
 * Ajustes information architecture — categories by user mental model
 * (task / frequency / risk), not by technical stack.
 *
 * Order: personal → business → team → AI → updates → system/danger.
 */

export type AjustesSectionId =
  | "cuenta"
  | "tienda"
  | "equipo"
  | "ia"
  | "actualizaciones"
  | "sistema";

export type AjustesSectionDef = {
  id: AjustesSectionId;
  /** Short nav label (ES) */
  label: string;
  /** Panel title */
  title: string;
  /** One-line help under the title */
  hint: string;
  /** Only admins see this category in the nav */
  adminOnly: boolean;
  /** Destructive / rare actions live here */
  danger?: boolean;
  /** Show primary «Guardar ajustes» in this panel */
  hasSave?: boolean;
};

/** Canonical catalog — single source for nav + tests. */
export const AJUSTES_SECTIONS: readonly AjustesSectionDef[] = [
  {
    id: "cuenta",
    label: "Cuenta",
    title: "Tu cuenta",
    hint: "Contraseña o PIN de la sesión actual. Solo te afecta a ti.",
    adminOnly: false,
  },
  {
    id: "tienda",
    label: "Tienda",
    title: "Comercio",
    hint: "Nombre visible en login y asistente, e IVA por defecto en ventas.",
    adminOnly: false,
    hasSave: true,
  },
  {
    id: "equipo",
    label: "Equipo",
    title: "Usuarios",
    hint: "Quién puede entrar y con qué rol. Solo administradores.",
    adminOnly: true,
  },
  {
    id: "ia",
    label: "Asistente IA",
    title: "Ollama",
    hint: "URL y modelo del asistente local. Guarda desde Tienda si cambias la URL o el modelo.",
    adminOnly: false,
    hasSave: true,
  },
  {
    id: "actualizaciones",
    label: "Actualizaciones",
    title: "Desde GitHub",
    hint: "Comprueba releases y abre la descarga. La app no se actualiza sola.",
    adminOnly: false,
  },
  {
    id: "sistema",
    label: "Sistema",
    title: "Sistema y copias",
    hint: "Runtime, copias de seguridad y acciones que pueden borrar datos.",
    adminOnly: false,
    danger: true,
  },
] as const;

export const DEFAULT_AJUSTES_SECTION: AjustesSectionId = "tienda";

export const AJUSTES_SECTION_STORAGE_KEY = "hexa-crm-ajustes-section";

/** Sections visible for this role (order preserved). */
export function visibleAjustesSections(isAdmin: boolean): AjustesSectionDef[] {
  return AJUSTES_SECTIONS.filter((s) => !s.adminOnly || isAdmin);
}

export function isAjustesSectionId(value: unknown): value is AjustesSectionId {
  return typeof value === "string" && AJUSTES_SECTIONS.some((s) => s.id === value);
}

/**
 * Resolve active section: prefer requested id if visible, else default, else first visible.
 */
export function resolveActiveSection(
  requested: string | null | undefined,
  isAdmin: boolean,
): AjustesSectionId {
  const visible = visibleAjustesSections(isAdmin);
  if (isAjustesSectionId(requested) && visible.some((s) => s.id === requested)) {
    return requested;
  }
  if (visible.some((s) => s.id === DEFAULT_AJUSTES_SECTION)) {
    return DEFAULT_AJUSTES_SECTION;
  }
  return visible[0]?.id ?? DEFAULT_AJUSTES_SECTION;
}

export function sectionById(id: AjustesSectionId): AjustesSectionDef {
  const found = AJUSTES_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown ajustes section: ${id}`);
  return found;
}
