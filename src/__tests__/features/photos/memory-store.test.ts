// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  frontPhotoReady,
  installPhotoLifecycleGuards,
  resetPhotoLifecycleGuardsForTests,
  setObjectUrlApi,
  usePhotoStore,
} from "@/features/photos/memory-store";
import type { PhotoQualityReport } from "@/features/photos/types";

const okQuality: PhotoQualityReport = {
  ok: true,
  issues: [],
  metrics: { width: 1200, height: 1600, meanLuminance: 0.5, contrast: 0.2, sharpness: 40 },
};

const photo = (label: string) => ({
  blob: new Blob([label], { type: "image/jpeg" }),
  width: 1200,
  height: 1600,
  quality: okQuality,
});

describe("volatile photo store", () => {
  const created: string[] = [];
  const revoked: string[] = [];

  beforeEach(() => {
    let n = 0;
    created.length = 0;
    revoked.length = 0;
    setObjectUrlApi({
      create: () => {
        const url = `blob:test/${++n}`;
        created.push(url);
        return url;
      },
      revoke: (url) => revoked.push(url),
    });
    usePhotoStore.getState().clearAll();
    revoked.length = 0;
  });

  afterEach(() => setObjectUrlApi(undefined));

  it("revokes the previous preview when a photo is replaced", () => {
    usePhotoStore.getState().setPhoto("front", photo("a"));
    usePhotoStore.getState().setPhoto("front", photo("b"));
    expect(created).toEqual(["blob:test/1", "blob:test/2"]);
    expect(revoked).toEqual(["blob:test/1"]);
    expect(usePhotoStore.getState().photos.front?.previewUrl).toBe("blob:test/2");
  });

  it("clears every photo and preview URL", () => {
    usePhotoStore.getState().setPhoto("front", photo("a"));
    usePhotoStore.getState().setPhoto("left", photo("b"));
    usePhotoStore.getState().setOwnershipConfirmed(true);
    usePhotoStore.getState().clearAll();
    expect(usePhotoStore.getState().photos).toEqual({});
    expect(usePhotoStore.getState().ownershipConfirmed).toBe(false);
    expect(revoked.sort()).toEqual(["blob:test/1", "blob:test/2"]);
  });

  it("only counts a front photo that passed quality checks", () => {
    expect(frontPhotoReady(usePhotoStore.getState())).toBe(false);
    usePhotoStore.getState().setPhoto("front", { ...photo("a"), quality: { ...okQuality, ok: false } });
    expect(frontPhotoReady(usePhotoStore.getState())).toBe(false);
    usePhotoStore.getState().setPhoto("front", photo("b"));
    expect(frontPhotoReady(usePhotoStore.getState())).toBe(true);
  });

  it("drops photos when the page is hidden (unload or back/forward cache)", () => {
    resetPhotoLifecycleGuardsForTests();
    installPhotoLifecycleGuards(window);
    usePhotoStore.getState().setPhoto("front", photo("a"));
    window.dispatchEvent(new Event("pagehide"));
    expect(usePhotoStore.getState().photos).toEqual({});
  });

  it("never writes photos to browser storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    usePhotoStore.getState().setPhoto("front", photo("a"));
    expect(setItem).not.toHaveBeenCalled();
  });
});
