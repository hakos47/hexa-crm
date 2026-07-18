import { describe, expect, it, vi } from "vitest";
import { applyGitHubUpdate, checkGitHubUpdate, getAppVersion } from "./check";
import type { UpdateStatus } from "./version";

describe("checkGitHubUpdate", () => {
  it("classifies newer remote release via real check path + fetch fixture", async () => {
    const body = {
      tag_name: "v9.9.9",
      name: "Far future",
      html_url: "https://github.com/HEXA-NIX/hexa-crm/releases/tag/v9.9.9",
      draft: false,
      assets: [
        {
          name: "Nix-C.AppImage",
          browser_download_url: "https://example.com/Nix-C.AppImage",
        },
      ],
    };
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const status = await checkGitHubUpdate({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      currentVersion: "0.1.0",
    });
    expect(fetchImpl).toHaveBeenCalled();
    expect(status.kind).toBe("update_available");
    expect(status.latest_version).toBe("9.9.9");
    expect(status.download_url).toContain("AppImage");
  });

  it("returns error status on HTTP failure (no fake up_to_date)", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    const status = await checkGitHubUpdate({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      currentVersion: "0.1.0",
    });
    expect(status.kind).toBe("error");
    expect(status.message).toMatch(/503/);
  });

  it("getAppVersion matches package.json", () => {
    expect(getAppVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("applyGitHubUpdate", () => {
  it("opens download URL and does not claim in-app install", async () => {
    const opened: string[] = [];
    const status: UpdateStatus = {
      kind: "update_available",
      current_version: "0.1.0",
      latest_version: "0.2.0",
      release_name: "0.2.0",
      html_url: "https://github.com/HEXA-NIX/hexa-crm/releases/tag/v0.2.0",
      download_url: "https://example.com/app.AppImage",
      message: "update",
      can_install_in_app: false,
    };
    const result = await applyGitHubUpdate(status, (u) => {
      opened.push(u);
    }, { isDesktop: true });
    expect(opened).toEqual(["https://example.com/app.AppImage"]);
    expect(result.action).toBe("opened_url");
    expect(result.message).not.toMatch(/actualizad[oa] con éxito|instalad/i);
    expect(result.message).toMatch(/GitHub|reinicia/i);
  });

  it("noops when up to date", async () => {
    const result = await applyGitHubUpdate(
      {
        kind: "up_to_date",
        current_version: "0.2.0",
        latest_version: "0.2.0",
        release_name: null,
        html_url: null,
        download_url: null,
        message: "ok",
        can_install_in_app: false,
      },
      () => {
        throw new Error("should not open");
      },
    );
    expect(result.action).toBe("noop");
  });
});
