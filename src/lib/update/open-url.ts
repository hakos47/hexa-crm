/**
 * Open external URL — Tauri opener when desktop, window.open in browser.
 */
import { api } from "../api/client";

export async function openExternalUrl(url: string): Promise<void> {
  if (api.isTauri()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch {
      // fall through to window.open
    }
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
