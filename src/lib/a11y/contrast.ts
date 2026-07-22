/**
 * Relative luminance helpers (sRGB) for WCAG-ish checks on design tokens.
 * Used to keep muted text readable on the obsidian background.
 */

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Parse #RRGGBB → [r,g,b] 0–255 */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) throw new Error(`hex inválido: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Contrast ratio between two #RRGGBB colors (WCAG). */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const L1 = relativeLuminance(fgHex);
  const L2 = relativeLuminance(bgHex);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Design tokens: keep in sync with src/app.css @theme */
export const DESIGN_TOKENS = {
  bgObsidian: "#050508",
  text: "#f3eefc",
  muted: "#c4b8d9",
  mutedDim: "#9a90b0",
  bgLight: "#ffffff",
  textLight: "#20162d",
  mutedLight: "#5d526c",
} as const;
