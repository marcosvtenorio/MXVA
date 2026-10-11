import { create } from "zustand";
import type { PaidReport } from "@/features/report/schema";

/**
 * The paid result, held only in this tab's memory: the report, the concept image and
 * the PDF as Blobs behind object URLs. Nothing is persisted; the emailed PDF is the
 * durable copy. Cleared on demand and when the page is hidden for unload.
 */

type ResultState = {
  report?: PaidReport;
  imageUrl?: string;
  pdfUrl?: string;
  pdfFilename?: string;
  emailDelivered?: boolean;
};

type ResultActions = {
  setResult: (input: { report: PaidReport; image: Blob; pdf: Blob; pdfFilename: string; emailDelivered: boolean }) => void;
  clear: () => void;
};

function revoke(state: ResultState): void {
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
}

export const useResultStore = create<ResultState & ResultActions>()((set, get) => ({
  setResult: ({ report, image, pdf, pdfFilename, emailDelivered }) => {
    revoke(get());
    set({
      report,
      imageUrl: URL.createObjectURL(image),
      pdfUrl: URL.createObjectURL(pdf),
      pdfFilename,
      emailDelivered,
    });
  },
  clear: () => {
    revoke(get());
    set({ report: undefined, imageUrl: undefined, pdfUrl: undefined, pdfFilename: undefined, emailDelivered: undefined });
  },
}));

export function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

let installed = false;

/** Drops the result when the page is hidden for unload or the back/forward cache. */
export function installResultLifecycleGuards(target: Pick<Window, "addEventListener"> = window): void {
  if (installed) return;
  installed = true;
  target.addEventListener("pagehide", () => useResultStore.getState().clear());
}
