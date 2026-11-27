import { beforeEach, describe, expect, it, vi } from "vitest";
import { updaterApi } from "../api/updaterApi";
import { useUpdaterStore } from "../hooks/useUpdaterStore";

vi.mock("../api/updaterApi", () => ({
  updaterApi: {
    updaterGetInfo: vi.fn(),
    updaterCheck: vi.fn(),
    updaterDownload: vi.fn(),
    updaterInstall: vi.fn(),
  },
}));

describe("useUpdaterStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUpdaterStore.setState({
      env: {
        current_version: "0.5.4",
        install_kind: "portable",
        can_install_in_app: false,
        supports_silent_auto_download: false,
      },
      envLoaded: false,
      phase: "idle",
      latest: null,
      progress: null,
      errorMessage: null,
      isModalOpen: false,
    });
  });

  it("auto-downloads in background for NSIS builds when updateMode is auto", async () => {
    vi.mocked(updaterApi.updaterCheck).mockResolvedValueOnce({
      available: true,
      current_version: "0.5.4",
      install_kind: "nsis",
      version: "0.6.0",
      tag_name: "v0.6.0",
      release_notes: "- Faster SSH\n- Auto update",
      release_url: "https://github.com/ChungPr0/CoreTerm/releases/tag/v0.6.0",
      asset_name: "CoreTerm_0.6.0_x64-setup.exe",
      asset_size: 8_500_000,
      can_install_in_app: true,
      is_downloaded: false,
    });
    vi.mocked(updaterApi.updaterDownload).mockResolvedValueOnce({
      version: "0.6.0",
      ready: true,
    });

    await useUpdaterStore
      .getState()
      .checkForUpdate({ updateMode: "auto", silent: true });

    // Wait for fire-and-forget background download promise to settle
    await vi.waitFor(() => {
      expect(useUpdaterStore.getState().phase).toBe("ready");
    });

    expect(updaterApi.updaterDownload).toHaveBeenCalledTimes(1);
    expect(useUpdaterStore.getState().latest?.is_downloaded).toBe(true);
  });

  it("notifies without downloading for Portable and MSI builds even when updateMode is auto", async () => {
    vi.mocked(updaterApi.updaterCheck).mockResolvedValueOnce({
      available: true,
      current_version: "0.5.4",
      install_kind: "portable",
      version: "0.6.0",
      tag_name: "v0.6.0",
      release_url: "https://github.com/ChungPr0/CoreTerm/releases/tag/v0.6.0",
      can_install_in_app: false,
      is_downloaded: false,
    });

    await useUpdaterStore
      .getState()
      .checkForUpdate({ updateMode: "auto", silent: true });

    expect(useUpdaterStore.getState().phase).toBe("available");
    expect(updaterApi.updaterDownload).not.toHaveBeenCalled();

    vi.mocked(updaterApi.updaterCheck).mockResolvedValueOnce({
      available: true,
      current_version: "0.5.4",
      install_kind: "msi",
      version: "0.6.0",
      tag_name: "v0.6.0",
      asset_name: "CoreTerm_0.6.0_x64_en-US.msi",
      can_install_in_app: true,
      is_downloaded: false,
    });

    await useUpdaterStore
      .getState()
      .checkForUpdate({ updateMode: "auto", silent: true });

    expect(useUpdaterStore.getState().phase).toBe("available");
    expect(updaterApi.updaterDownload).not.toHaveBeenCalled();
  });

  it("marks up_to_date when no newer official release exists", async () => {
    vi.mocked(updaterApi.updaterCheck).mockResolvedValueOnce({
      available: false,
      current_version: "0.5.4",
      install_kind: "nsis",
      can_install_in_app: true,
      is_downloaded: false,
    });

    await useUpdaterStore.getState().checkForUpdate({ silent: false });
    expect(useUpdaterStore.getState().phase).toBe("up_to_date");
  });
});
