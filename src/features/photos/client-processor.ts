import { ANALYSIS_LONG_SIDE, assessQuality } from "./quality";
import type { PhotoQualityReport, PhotoRejectionCode } from "./types";
import { UPLOAD_MIME } from "./types";
import {
  MAX_INPUT_BYTES,
  MAX_UPLOAD_BYTES_DEFAULT,
  NORMALISED_LONG_SIDE,
  checkPhotoBasics,
  dimensionsAreSafe,
  fitWithin,
} from "./validator";

/**
 * Turns a picked or captured file into an upright, metadata-free JPEG held in memory.
 * Re-encoding through a canvas drops EXIF (GPS, device, timestamps) and applies the
 * camera orientation. Nothing is written anywhere; the caller decides what to keep.
 */

export type ProcessedPhoto = {
  ok: true;
  blob: Blob;
  width: number;
  height: number;
  quality: PhotoQualityReport;
};

export type RejectedPhoto = { ok: false; code: PhotoRejectionCode; message: string };

const HEAD_BYTES = 64 * 1024;
/** Tried in order until the photo fits its upload size; detailed photos step down. */
const JPEG_QUALITIES = [0.9, 0.82, 0.74, 0.66] as const;

type Canvas2D = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
};

function createCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false });
    if (context) return { canvas, context };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D is unavailable");
  return { canvas, context };
}

function releaseCanvas({ canvas }: Canvas2D): void {
  canvas.width = 0;
  canvas.height = 0;
}

async function encodeJpeg({ canvas }: Canvas2D, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: UPLOAD_MIME, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))), UPLOAD_MIME, quality),
  );
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

/** Above this many stored pixels, decode straight to a smaller size (in-app browsers have tight memory). */
const DOWNSAMPLE_ON_DECODE_PIXELS = 16_000_000;

async function decode(file: Blob, longSide: number, header?: { width: number; height: number }): Promise<Decoded> {
  const options: ImageBitmapOptions = { imageOrientation: "from-image" };
  if (header && header.width * header.height > DOWNSAMPLE_ON_DECODE_PIXELS) {
    // Width only: the height follows proportionally, whichever way EXIF rotates the image.
    options.resizeWidth = Math.round((header.width * longSide) / Math.max(header.width, header.height));
    options.resizeQuality = "high";
  }
  try {
    // `from-image` applies EXIF orientation, so portrait phone photos stay upright.
    const bitmap = await createImageBitmap(file, options);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  // Fallback for engines without ImageBitmap options: <img> decoding also honours
  // EXIF orientation. The temporary object URL is revoked as soon as decoding ends.
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => image.removeAttribute("src") };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function heicHelp(): string {
  return "This browser can't open HEIC photos. On iPhone: Settings › Camera › Formats › Most Compatible, or choose a JPEG.";
}

export async function processPhoto(
  file: File,
  options: { maxUploadBytes?: number; longSide?: number } = {},
): Promise<ProcessedPhoto | RejectedPhoto> {
  const longSide = options.longSide ?? NORMALISED_LONG_SIDE;
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const basics = checkPhotoBasics({
    head,
    size: file.size,
    declaredType: file.type,
    fileName: file.name,
    maxBytes: MAX_INPUT_BYTES,
  });
  if (!basics.ok) return { ok: false, code: basics.code, message: basics.message };

  let decoded: Decoded;
  try {
    decoded = await decode(file, longSide, basics.headerDimensions);
  } catch {
    return {
      ok: false,
      code: basics.type === "image/heic" ? "UNSUPPORTED_IMAGE_TYPE" : "PHOTO_UNREADABLE",
      message: basics.type === "image/heic" ? heicHelp() : "We couldn't open that photo. Try another one.",
    };
  }

  try {
    if (!dimensionsAreSafe({ width: decoded.width, height: decoded.height })) {
      return { ok: false, code: "PHOTO_DIMENSIONS_UNSAFE", message: "That image is too large to process safely." };
    }

    const target = fitWithin(decoded.width, decoded.height, longSide);
    const main = createCanvas(target.width, target.height);
    main.context.imageSmoothingEnabled = true;
    main.context.imageSmoothingQuality = "high";
    main.context.drawImage(decoded.source, 0, 0, target.width, target.height);

    const small = fitWithin(target.width, target.height, ANALYSIS_LONG_SIDE);
    const analysis = createCanvas(small.width, small.height);
    analysis.context.imageSmoothingQuality = "high";
    analysis.context.drawImage(main.canvas, 0, 0, small.width, small.height);
    const pixels = analysis.context.getImageData(0, 0, small.width, small.height);
    const quality = assessQuality(
      { data: pixels.data, width: small.width, height: small.height, channels: 4 },
      { width: decoded.width, height: decoded.height },
    );
    releaseCanvas(analysis);

    const maxUploadBytes = options.maxUploadBytes ?? MAX_UPLOAD_BYTES_DEFAULT;
    let blob = await encodeJpeg(main, JPEG_QUALITIES[0]);
    for (const quality of JPEG_QUALITIES.slice(1)) {
      if (blob.size <= maxUploadBytes) break;
      blob = await encodeJpeg(main, quality);
    }
    releaseCanvas(main);
    if (blob.size > maxUploadBytes) {
      return { ok: false, code: "PHOTO_TOO_LARGE", message: "That photo is too large after processing. Try another one." };
    }

    // Quality problems are reported, not thrown away: the buyer sees the preview next
    // to the reason, and a photo with a blocking issue never counts as ready.
    return { ok: true, blob, width: target.width, height: target.height, quality };
  } catch {
    return { ok: false, code: "PHOTO_UNREADABLE", message: "We couldn't process that photo. Try another one." };
  } finally {
    decoded.release();
  }
}
