/**
 * Pure version compare + update status (no network).
 * Used by the in-app "update from GitHub" control.
 */

export type VersionParts = {
  major: number;
  minor: number;
  patch: number;
  /** Original normalized string without leading v */
  normalized: string;
};

/** Strip leading `v`/`V` and optional prerelease suffix for numeric compare. */
export function normalizeVersion(input: string): string {
  let s = input.trim();
  if (s.startsWith("v") || s.startsWith("V")) s = s.slice(1);
  // drop build metadata
  const plus = s.indexOf("+");
  if (plus >= 0) s = s.slice(0, plus);
  return s;
}

/**
 * Parse major.minor.patch (extra prerelease after - ignored for ordering baseline).
 * Returns null if not parseable as at least major.minor.
 */
export function parseVersion(input: string): VersionParts | null {
  const normalized = normalizeVersion(input);
  const core = normalized.split("-")[0] ?? normalized;
  const m = core.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3] ?? 0),
    normalized,
  };
}

/** -1 if a < b, 0 if equal, 1 if a > b. Null parts sort as older. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
}

export type UpdateKind = "up_to_date" | "update_available" | "error";

export type UpdateStatus = {
  kind: UpdateKind;
  current_version: string;
  latest_version: string | null;
  release_name: string | null;
  /** HTML page for the release (GitHub) */
  html_url: string | null;
  /** Preferred asset download if present */
  download_url: string | null;
  message: string;
  /** True only when a desktop updater install path exists — never true for "opened browser" alone */
  can_install_in_app: boolean;
};

export type RemoteRelease = {
  tag_name: string;
  name?: string | null;
  html_url: string;
  prerelease?: boolean;
  draft?: boolean;
  assets?: { name: string; browser_download_url: string }[];
};

/**
 * Classify update state from current app version + remote release metadata.
 */
export function classifyUpdate(
  currentVersion: string,
  release: RemoteRelease | null,
  opts?: { errorMessage?: string; isDesktop?: boolean },
): UpdateStatus {
  if (opts?.errorMessage) {
    return {
      kind: "error",
      current_version: currentVersion,
      latest_version: null,
      release_name: null,
      html_url: null,
      download_url: null,
      message: opts.errorMessage,
      can_install_in_app: false,
    };
  }
  if (!release || !release.tag_name) {
    return {
      kind: "error",
      current_version: currentVersion,
      latest_version: null,
      release_name: null,
      html_url: null,
      download_url: null,
      message: "No se encontró ninguna release en GitHub.",
      can_install_in_app: false,
    };
  }

  const latest = release.tag_name;
  const cmp = compareVersions(currentVersion, latest);
  const download =
    pickDownloadAsset(release.assets ?? []) ?? null;

  if (cmp >= 0) {
    return {
      kind: "up_to_date",
      current_version: currentVersion,
      latest_version: normalizeVersion(latest),
      release_name: release.name ?? latest,
      html_url: release.html_url,
      download_url: download,
      message: `Ya tienes la última versión (${normalizeVersion(currentVersion)}).`,
      can_install_in_app: false,
    };
  }

  return {
    kind: "update_available",
    current_version: currentVersion,
    latest_version: normalizeVersion(latest),
    release_name: release.name ?? latest,
    html_url: release.html_url,
    download_url: download,
    message: `Hay una actualización: ${normalizeVersion(latest)} (tienes ${normalizeVersion(currentVersion)}).`,
    // Full silent install requires signed Tauri updater bundles; we open GitHub download.
    can_install_in_app: false,
  };
}

/** Prefer platform-ish installers when present; else first asset. */
export function pickDownloadAsset(
  assets: { name: string; browser_download_url: string }[],
): string | null {
  if (!assets.length) return null;
  const lower = (n: string) => n.toLowerCase();
  const prefer = [".AppImage", ".deb", ".rpm", ".msi", ".exe", ".dmg", ".apk"];
  for (const ext of prefer) {
    const hit = assets.find((a) => lower(a.name).endsWith(ext.toLowerCase()));
    if (hit) return hit.browser_download_url;
  }
  return assets[0]?.browser_download_url ?? null;
}

export const DEFAULT_GITHUB_REPO = "HEXA-NIX/hexa-crm";
export const DEFAULT_RELEASES_API = `https://api.github.com/repos/${DEFAULT_GITHUB_REPO}/releases/latest`;
export const DEFAULT_RELEASES_PAGE = `https://github.com/${DEFAULT_GITHUB_REPO}/releases`;
