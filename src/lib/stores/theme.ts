import { writable } from "svelte/store";

export type Theme = "dark" | "light";

const STORAGE_KEY = "hexa-crm-theme-v1";
export const theme = writable<Theme>("dark");

function applyTheme(next: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = next;
  }
}

export function setTheme(next: Theme) {
  theme.set(next);
  applyTheme(next);
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, next);
}

export function initTheme() {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  setTheme(stored === "light" ? "light" : "dark");
}

export function toggleTheme() {
  let next: Theme = "dark";
  theme.subscribe((current) => (next = current === "dark" ? "light" : "dark"))();
  setTheme(next);
}
