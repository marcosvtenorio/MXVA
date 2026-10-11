import "server-only";
import sharp, { type OutputInfo } from "sharp";
import {
  MAX_DECODE_PIXELS,
  NORMALISED_LONG_SIDE,
  dimensionsAreSafe,
  readHeaderDimensions,
  sniffImageType,
} from "@/features/photos/validator";
import { ApiError } from "../http";

export type ServerPhoto = { jpeg: Buffer; width: number; height: number };

const SERVER_ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Re-validates an uploaded photo entirely in memory: real type, size, safe dimensions,
 * a bounded decode, upright orientation and a fresh metadata-free JPEG. The original
 * bytes are zeroed afterwards.
 */
export async function validateUploadedPhoto(file: File, maxBytes: number): Promise<ServerPhoto> {
  if (file.size === 0) throw new ApiError("PHOTO_REQUIRED");
  if (file.size > maxBytes) throw new ApiError("PHOTO_TOO_LARGE");
  const original = Buffer.from(await file.arrayBuffer());
  try {
    const type = sniffImageType(original);
    if (!type || !SERVER_ACCEPTED.has(type)) throw new ApiError("UNSUPPORTED_IMAGE_TYPE");
    const header = readHeaderDimensions(original, type);
    if (header && !dimensionsAreSafe(header)) throw new ApiError("PHOTO_TOO_LARGE");

    let output: { data: Buffer; info: OutputInfo };
    try {
      output = await sharp(original, { limitInputPixels: MAX_DECODE_PIXELS, failOn: "error", sequentialRead: true })
        .rotate()
        .resize({ width: NORMALISED_LONG_SIDE, height: NORMALISED_LONG_SIDE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new ApiError("UNSUPPORTED_IMAGE_TYPE", "We couldn't read that photo. Choose another one.");
    }

    const { width, height } = output.info;
    if (Math.min(width, height) < 480) throw new ApiError("PHOTO_QUALITY_INSUFFICIENT", "That photo is too small to use.");
    const stats = await sharp(output.data).greyscale().stats();
    const channel = stats.channels[0];
    if (!channel || channel.mean < 20 || channel.mean > 243 || channel.stdev < 8) {
      throw new ApiError("PHOTO_QUALITY_INSUFFICIENT");
    }
    return { jpeg: output.data, width, height };
  } finally {
    original.fill(0);
  }
}
