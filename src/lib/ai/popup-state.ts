/**
 * AI chat popup presentation state (compact bottom-right vs fullscreen).
 * Separate from message history so expand/collapse never clears chat.
 */

export type AiPopupMode = "closed" | "compact" | "fullscreen";

export type AiPopupState = {
  mode: AiPopupMode;
};

export function initialAiPopupState(): AiPopupState {
  return { mode: "closed" };
}

export function openCompact(state: AiPopupState): AiPopupState {
  return { ...state, mode: "compact" };
}

export function closePopup(state: AiPopupState): AiPopupState {
  return { ...state, mode: "closed" };
}

export function expandFullscreen(state: AiPopupState): AiPopupState {
  if (state.mode === "closed") return openCompact(state);
  return { ...state, mode: "fullscreen" };
}

export function collapseCompact(state: AiPopupState): AiPopupState {
  if (state.mode === "closed") return state;
  return { ...state, mode: "compact" };
}

export function toggleOpen(state: AiPopupState): AiPopupState {
  return state.mode === "closed" ? openCompact(state) : closePopup(state);
}

export function isOpen(state: AiPopupState): boolean {
  return state.mode !== "closed";
}

export function isFullscreen(state: AiPopupState): boolean {
  return state.mode === "fullscreen";
}

export function isCompact(state: AiPopupState): boolean {
  return state.mode === "compact";
}

/** CSS layout hints for tests and consumers (class fragments / positions). */
export function panelLayoutClasses(mode: AiPopupMode): {
  root: string;
  panel: string;
  hasBackdrop: boolean;
} {
  if (mode === "closed") {
    return { root: "hidden", panel: "hidden", hasBackdrop: false };
  }
  if (mode === "fullscreen") {
    return {
      root: "fixed inset-0 z-50 flex items-stretch justify-stretch p-0 sm:p-3",
      panel:
        "ai-popup-panel ai-popup-fullscreen flex h-full w-full max-h-full max-w-full flex-col",
      hasBackdrop: true,
    };
  }
  // compact: bottom-right floating card
  return {
    root: "fixed bottom-4 right-4 z-50 flex items-end justify-end pointer-events-none",
    panel:
      "ai-popup-panel ai-popup-compact pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] h-[min(32rem,calc(100vh-5rem))] max-h-[calc(100vh-5rem)] flex-col",
    hasBackdrop: false,
  };
}
