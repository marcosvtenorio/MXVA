import { create } from "zustand";
import type { HeldPhoto, PhotoQualityReport, PhotoSlot } from "./types";

/**
 * Volatile photo holder (spec §0.3, §5.1). Photos live only in this JS heap:
 * no persistence middleware, no storage, no IndexedDB, no URL state. A reload,
 * tab close or navigation away from the site drops them.
 */

type ObjectUrlApi = { create: (blob: Blob) => string; revoke: (url: string) => void };

const browserObjectUrls: ObjectUrlApi = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

let objectUrls: ObjectUrlApi = browserObjectUrls;

/** Test hook (jsdom has no object URLs). */
export function setObjectUrlApi(api: ObjectUrlApi | undefined): void {
  objectUrls = api ?? browserObjectUrls;
}

type PhotoState = {
  photos: Partial<Record<PhotoSlot, HeldPhoto>>;
  ownershipConfirmed: boolean;
  /** Set when a reload cleared photos the buyer had added, so the photo step can say so. */
  clearedNotice: boolean;
};

type PhotoActions = {
  setPhoto: (
    slot: PhotoSlot,
    photo: { blob: Blob; width: number; height: number; quality: PhotoQualityReport },
  ) => void;
  removePhoto: (slot: PhotoSlot) => void;
  setOwnershipConfirmed: (value: boolean) => void;
  setClearedNotice: (value: boolean) => void;
  /** Drops every photo reference and revokes every preview URL. */
  clearAll: () => void;
};

export const usePhotoStore = create<PhotoState & PhotoActions>()((set, get) => ({
  photos: {},
  ownershipConfirmed: false,
  clearedNotice: false,

  setPhoto: (slot, { blob, width, height, quality }) => {
    const previous = get().photos[slot];
    const previewUrl = objectUrls.create(blob);
    set((state) => ({
      photos: { ...state.photos, [slot]: { blob, previewUrl, width, height, byteSize: blob.size, quality } },
      clearedNotice: false,
    }));
    if (previous) objectUrls.revoke(previous.previewUrl);
  },

  removePhoto: (slot) => {
    const previous = get().photos[slot];
    if (!previous) return;
    set((state) => {
      const photos = { ...state.photos };
      delete photos[slot];
      return { photos };
    });
    objectUrls.revoke(previous.previewUrl);
  },

  setOwnershipConfirmed: (value) => set({ ownershipConfirmed: value }),
  setClearedNotice: (value) => set({ clearedNotice: value }),

  clearAll: () => {
    const held = Object.values(get().photos);
    set({ photos: {}, ownershipConfirmed: false });
    for (const photo of held) if (photo) objectUrls.revoke(photo.previewUrl);
  },
}));

export function frontPhotoReady(state: PhotoState): boolean {
  return Boolean(state.photos.front?.quality.ok);
}

let lifecycleInstalled = false;

/**
 * Clears photos when the page is hidden for unload or the back/forward cache, so a
 * restored page never shows a previous visitor's photos. Call once on the client.
 */
export function installPhotoLifecycleGuards(target: Pick<Window, "addEventListener"> = window): void {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  target.addEventListener("pagehide", () => usePhotoStore.getState().clearAll());
}

/** Test hook. */
export function resetPhotoLifecycleGuardsForTests(): void {
  lifecycleInstalled = false;
}
