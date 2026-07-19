/**
 * Network adapter: check GitHub Releases for HEXA-NIX/hexa-crm.
 * Inject `fetch` for tests; never reports install success from open-URL alone.
 */
import pkg from "../../../package.json";
import {
  classifyUpdate,
  DEFAULT_RELEASES_API,
  DEFAULT_RELEASES_PAGE,
  type RemoteRelease,
  type UpdateStatus,
} from "./version";

export function getAppVersion(): string {
  return (pkg as { version?: string }).version || "0.0.0";
}

export type CheckUpdateOptions = {
  fetchImpl?: typeof fetch;
  apiUrl?: string;
  currentVersion?: string;
  isDesktop?: boolean;
};

/**
 * Fetch latest GitHub release and classify vs current app version.
 */
export async function checkGitHubUpdate(
  opts: CheckUpdateOptions = {},
): Promise<UpdateStatus> {
  const current = opts.currentVersion ?? getAppVersion();
  const apiUrl = opts.apiUrl ?? DEFAULT_RELEASES_API;
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;

  if (typeof fetchFn !== "function") {
    return classifyUpdate(current, null, {
      errorMessage: "fetch no disponible en este entorno.",
      isDesktop: opts.isDesktop,
    });
  }

  try {
    const res = await fetchFn(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Hexa-CRM-UpdateCheck",
      },
    });
    if (!res.ok) {
      return classifyUpdate(current, null, {
        errorMessage: `GitHub HTTP ${res.status}. Revisa ${DEFAULT_RELEASES_PAGE}`,
        isDesktop: opts.isDesktop,
      });
    }
    const data = (await res.json()) as RemoteRelease;
    if (data.draft) {
      return classifyUpdate(current, null, {
        errorMessage: "La última release está en borrador.",
        isDesktop: opts.isDesktop,
      });
    }
    return classifyUpdate(current, data, { isDesktop: opts.isDesktop });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return classifyUpdate(current, null, {
      errorMessage: `No se pudo consultar GitHub: ${msg}. Abre ${DEFAULT_RELEASES_PAGE}`,
      isDesktop: opts.isDesktop,
    });
  }
}

export type ApplyUpdateResult = {
  ok: boolean;
  /** What we did — never "installed" unless a real installer ran */
  action: "opened_url" | "noop" | "blocked_web";
  message: string;
  url: string | null;
};

/**
 * Apply path: open release/download URL. Does NOT claim the app was installed.
 */
export async function applyGitHubUpdate(
  status: UpdateStatus,
  openUrl: (url: string) => void | Promise<void>,
  opts?: { isDesktop?: boolean },
): Promise<ApplyUpdateResult> {
  if (status.kind !== "update_available") {
    return {
      ok: false,
      action: "noop",
      message:
        status.kind === "up_to_date"
          ? "No hay nada que actualizar."
          : status.message,
      url: null,
    };
  }

  const url = status.download_url || status.html_url;
  if (!url) {
    return {
      ok: false,
      action: "noop",
      message: "No hay URL de descarga en la release.",
      url: null,
    };
  }

  // Browser: still allowed to open tab, but copy is honest about no in-app install
  await openUrl(url);

  if (opts?.isDesktop) {
    return {
      ok: true,
      action: "opened_url",
      message:
        "Se abrió la descarga/página de release en GitHub. Instala el paquete y reinicia hexa-crm. La app no se actualiza sola en segundo plano.",
      url,
    };
  }

  return {
    ok: true,
    action: "opened_url",
    message:
      "Modo web: se abrió GitHub Releases en el navegador. La actualización in-app con instalador es para el escritorio Tauri; aquí no se puede parchear el SPA desde el botón.",
    url,
  };
}

export { DEFAULT_RELEASES_PAGE };
