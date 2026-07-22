/** Canonical package / identity name (lowercase, hyphenated). */
export const PRODUCT_NAME = "hexa-crm" as const;

/** Commercial display name (Retail OS vision — issue #23). */
export const PRODUCT_DISPLAY_NAME = "Hexa" as const;

/** Short value line under logo / login. */
export const PRODUCT_TAGLINE = "Asistente de tienda · IA local opcional" as const;

/** Browser / window document title. */
export const PRODUCT_TITLE = `${PRODUCT_DISPLAY_NAME} · Gestión de tienda` as const;

/** User-Agent for GitHub Releases update checks. */
export const PRODUCT_UPDATE_UA = "Hexa-CRM-UpdateCheck" as const;
