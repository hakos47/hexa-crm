import { describe, expect, it } from "vitest";
import type { AiMessage } from "$lib/types";
import {
  collapseCompact,
  closePopup,
  expandFullscreen,
  initialAiPopupState,
  isCompact,
  isFullscreen,
  isOpen,
  openCompact,
  panelLayoutClasses,
  toggleOpen,
} from "./popup-state";

describe("AI popup state machine", () => {
  it("starts closed", () => {
    const s = initialAiPopupState();
    expect(s.mode).toBe("closed");
    expect(isOpen(s)).toBe(false);
    expect(isCompact(s)).toBe(false);
    expect(isFullscreen(s)).toBe(false);
  });

  it("open → compact → fullscreen → compact → close", () => {
    let s = initialAiPopupState();
    s = openCompact(s);
    expect(s.mode).toBe("compact");
    expect(isOpen(s)).toBe(true);
    expect(isCompact(s)).toBe(true);

    s = expandFullscreen(s);
    expect(s.mode).toBe("fullscreen");
    expect(isFullscreen(s)).toBe(true);

    s = collapseCompact(s);
    expect(s.mode).toBe("compact");
    expect(isCompact(s)).toBe(true);

    s = closePopup(s);
    expect(s.mode).toBe("closed");
    expect(isOpen(s)).toBe(false);
  });

  it("toggleOpen switches closed ↔ compact", () => {
    let s = initialAiPopupState();
    s = toggleOpen(s);
    expect(s.mode).toBe("compact");
    s = toggleOpen(s);
    expect(s.mode).toBe("closed");
  });

  it("expand/collapse does not live in message list (messages stay separate)", () => {
    // Simulate UI: messages live outside popup state
    let messages: AiMessage[] = [{ role: "user", content: "hola" }];
    let s = openCompact(initialAiPopupState());
    messages = [...messages, { role: "assistant", content: "respuesta" }];
    s = expandFullscreen(s);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe("hola");
    s = collapseCompact(s);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toBe("respuesta");
    s = closePopup(s);
    expect(messages).toHaveLength(2);
  });

  it("panelLayoutClasses: compact is bottom-right fixed without backdrop", () => {
    const c = panelLayoutClasses("compact");
    expect(c.hasBackdrop).toBe(false);
    expect(c.root).toMatch(/fixed/);
    expect(c.root).toMatch(/bottom-4/);
    expect(c.root).toMatch(/right-4/);
    expect(c.panel).toMatch(/ai-popup-compact/);
  });

  it("panelLayoutClasses: fullscreen covers viewport with backdrop", () => {
    const f = panelLayoutClasses("fullscreen");
    expect(f.hasBackdrop).toBe(true);
    expect(f.root).toMatch(/inset-0/);
    expect(f.panel).toMatch(/ai-popup-fullscreen/);
  });
});
