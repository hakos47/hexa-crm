import { writable, derived, get } from "svelte/store";
import {
  closePopup,
  collapseCompact,
  expandFullscreen,
  initialAiPopupState,
  isFullscreen,
  isOpen,
  openCompact,
  type AiPopupState,
} from "$lib/ai/popup-state";

/** @deprecated prefer aiPopup; kept as boolean derived for simple checks */
export const aiOpen = writable(false);

export const aiPopup = writable<AiPopupState>(initialAiPopupState());

// Keep aiOpen in sync for any leftover consumers
aiPopup.subscribe((s) => {
  aiOpen.set(isOpen(s));
});

export const aiIsOpen = derived(aiPopup, (s) => isOpen(s));
export const aiIsFullscreen = derived(aiPopup, (s) => isFullscreen(s));

export function openAiChat() {
  aiPopup.update(openCompact);
}

export function closeAiChat() {
  aiPopup.update(closePopup);
}

export function expandAiChat() {
  aiPopup.update(expandFullscreen);
}

export function collapseAiChat() {
  aiPopup.update(collapseCompact);
}

export function toggleAiChat() {
  const s = get(aiPopup);
  if (isOpen(s)) closeAiChat();
  else openAiChat();
}

export const sidebarCollapsed = writable(false);
export const toast = writable<{ message: string; type: "ok" | "err" | "info" } | null>(null);

export function showToast(message: string, type: "ok" | "err" | "info" = "ok") {
  toast.set({ message, type });
  setTimeout(() => toast.set(null), 3200);
}
