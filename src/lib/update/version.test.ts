import { describe, expect, it } from "vitest";
import {
  classifyUpdate,
  compareVersions,
  normalizeVersion,
  parseVersion,
  pickDownloadAsset,
  type RemoteRelease,
} from "./version";

describe("normalizeVersion / parseVersion", () => {
  it("strips v prefix", () => {
    expect(normalizeVersion("v0.2.0")).toBe("0.2.0");
    expect(normalizeVersion("V1.0.0")).toBe("1.0.0");
  });

  it("parses major.minor.patch", () => {
    expect(parseVersion("0.1.0")).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
      normalized: "0.1.0",
    });
    expect(parseVersion("v2.3")).toMatchObject({ major: 2, minor: 3, patch: 0 });
  });
});

describe("compareVersions", () => {
  it("orders older / equal / newer", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    expect(compareVersions("0.2.0", "0.1.0")).toBe(1);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });

  it("handles v prefix on either side", () => {
    expect(compareVersions("0.1.0", "v0.2.0")).toBe(-1);
    expect(compareVersions("v0.2.0", "0.2.0")).toBe(0);
    expect(compareVersions("v0.3.1", "v0.3.0")).toBe(1);
  });
});

describe("classifyUpdate", () => {
  const baseRelease: RemoteRelease = {
    tag_name: "v0.2.0",
    name: "Nix-C 0.2.0",
    html_url: "https://github.com/HEXA-NIX/hexa-crm/releases/tag/v0.2.0",
    assets: [
      {
        name: "Nix-C_0.2.0_amd64.AppImage",
        browser_download_url:
          "https://github.com/HEXA-NIX/hexa-crm/releases/download/v0.2.0/Nix-C_0.2.0_amd64.AppImage",
      },
    ],
  };

  it("marks update_available when remote is newer", () => {
    const s = classifyUpdate("0.1.0", baseRelease);
    expect(s.kind).toBe("update_available");
    expect(s.latest_version).toBe("0.2.0");
    expect(s.current_version).toBe("0.1.0");
    expect(s.html_url).toContain("releases");
    expect(s.download_url).toContain("AppImage");
    expect(s.can_install_in_app).toBe(false);
    expect(s.message).toMatch(/actualización/i);
  });

  it("marks up_to_date when equal or current is newer", () => {
    expect(classifyUpdate("0.2.0", baseRelease).kind).toBe("up_to_date");
    expect(classifyUpdate("v0.2.0", baseRelease).kind).toBe("up_to_date");
    expect(classifyUpdate("0.3.0", baseRelease).kind).toBe("up_to_date");
  });

  it("surfaces network/API errors without false success", () => {
    const s = classifyUpdate("0.1.0", null, {
      errorMessage: "GitHub HTTP 403",
    });
    expect(s.kind).toBe("error");
    expect(s.message).toContain("403");
    expect(s.can_install_in_app).toBe(false);
  });
});

describe("pickDownloadAsset", () => {
  it("prefers AppImage over random asset", () => {
    const url = pickDownloadAsset([
      { name: "notes.txt", browser_download_url: "https://x/notes.txt" },
      { name: "app.AppImage", browser_download_url: "https://x/app.AppImage" },
    ]);
    expect(url).toBe("https://x/app.AppImage");
  });
});
