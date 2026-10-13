import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_BYTES,
  UPLOAD_BUDGET_BYTES,
  checkPhotoBasics,
  dimensionsAreSafe,
  fitWithin,
  isDisguised,
  readHeaderDimensions,
  sniffImageType,
} from "@/features/photos/validator";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../../../e2e/fixtures/${name}`, import.meta.url)));

/** A PNG header announcing 30 000 × 30 000 pixels: a decompression-bomb shape. */
function bombPngHeader(): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 30_000);
  view.setUint32(20, 30_000);
  return bytes;
}

function heicHeader(): Uint8Array {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 24);
  bytes.set([...("ftypheic" as string)].map((c) => c.charCodeAt(0)), 4);
  return bytes;
}

describe("sniffImageType", () => {
  it("identifies formats from bytes, not names", () => {
    expect(sniffImageType(fixture("synthetic-front.jpg"))).toBe("image/jpeg");
    expect(sniffImageType(fixture("synthetic-front.png"))).toBe("image/png");
    expect(sniffImageType(fixture("synthetic-front.webp"))).toBe("image/webp");
    expect(sniffImageType(fixture("disguised.png"))).toBe("image/jpeg");
    expect(sniffImageType(heicHeader())).toBe("image/heic");
    expect(sniffImageType(fixture("not-an-image.jpg"))).toBeUndefined();
    expect(sniffImageType(new TextEncoder().encode("GIF89a......"))).toBeUndefined();
  });
});

describe("isDisguised", () => {
  it("flags names or MIME types that contradict the bytes", () => {
    expect(isDisguised("image/jpeg", "image/png", "disguised.png")).toBe(true);
    expect(isDisguised("image/jpeg", "image/jpeg", "disguised.png")).toBe(true);
    expect(isDisguised("image/jpeg", "image/jpeg", "photo.exe")).toBe(true);
  });

  it("accepts consistent or missing declarations", () => {
    expect(isDisguised("image/jpeg", "image/jpeg", "IMG_0042.JPG")).toBe(false);
    expect(isDisguised("image/jpeg", "", "image")).toBe(false);
    expect(isDisguised("image/heic", "image/heif", "IMG_0042.HEIC")).toBe(false);
    expect(isDisguised("image/png", "image/png", "Screenshot 2026-10-11 at 15.00.12")).toBe(false);
    expect(isDisguised("image/jpeg", "application/octet-stream", "upload.jpeg")).toBe(false);
  });
});

describe("readHeaderDimensions", () => {
  it("reads dimensions without decoding", () => {
    expect(readHeaderDimensions(fixture("synthetic-front.jpg"), "image/jpeg")).toEqual({ width: 1200, height: 1600 });
    expect(readHeaderDimensions(fixture("synthetic-front.png"), "image/png")).toEqual({ width: 900, height: 1200 });
    expect(readHeaderDimensions(fixture("synthetic-front.webp"), "image/webp")).toEqual({ width: 900, height: 1200 });
    expect(readHeaderDimensions(fixture("exif-rotated.jpg"), "image/jpeg")).toEqual({ width: 1600, height: 1200 });
  });
});

describe("checkPhotoBasics", () => {
  const base = { declaredType: "image/jpeg", fileName: "photo.jpg", maxBytes: MAX_INPUT_BYTES };

  it("accepts a normal photo", () => {
    const head = fixture("synthetic-front.jpg");
    expect(checkPhotoBasics({ ...base, head, size: head.length })).toMatchObject({ ok: true, type: "image/jpeg" });
  });

  it("rejects empty, oversized, unknown and disguised files with specific codes", () => {
    const head = fixture("synthetic-front.jpg");
    expect(checkPhotoBasics({ ...base, head, size: 0 })).toMatchObject({ ok: false, code: "PHOTO_UNREADABLE" });
    expect(checkPhotoBasics({ ...base, head, size: MAX_INPUT_BYTES + 1 })).toMatchObject({ ok: false, code: "PHOTO_TOO_LARGE" });
    const text = fixture("not-an-image.jpg");
    expect(checkPhotoBasics({ ...base, head: text, size: text.length })).toMatchObject({ ok: false, code: "UNSUPPORTED_IMAGE_TYPE" });
    const disguised = fixture("disguised.png");
    expect(
      checkPhotoBasics({ ...base, head: disguised, size: disguised.length, declaredType: "image/png", fileName: "disguised.png" }),
    ).toMatchObject({ ok: false, code: "UNSUPPORTED_IMAGE_TYPE" });
  });

  it("rejects decompression-bomb dimensions before any decode", () => {
    const head = bombPngHeader();
    expect(
      checkPhotoBasics({ ...base, head, size: head.length, declaredType: "image/png", fileName: "bomb.png" }),
    ).toMatchObject({ ok: false, code: "PHOTO_DIMENSIONS_UNSAFE" });
  });
});

describe("geometry helpers", () => {
  it("caps decode size", () => {
    expect(dimensionsAreSafe({ width: 8064, height: 6048 })).toBe(true); // 48 MP phone
    expect(dimensionsAreSafe({ width: 30_000, height: 30_000 })).toBe(false);
    expect(dimensionsAreSafe({ width: 0, height: 100 })).toBe(false);
  });

  it("fits within a long side without upscaling", () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(800, 1000, 2048)).toEqual({ width: 800, height: 1000 });
  });
});

describe("upload budget", () => {
  it("keeps the front photo and both profiles under the host's 4.5 MB request cap", () => {
    const formOverhead = 64 * 1024; // multipart boundaries, headers and the plan answers
    expect(UPLOAD_BUDGET_BYTES.front + 2 * UPLOAD_BUDGET_BYTES.profile + formOverhead).toBeLessThan(4_500_000);
  });
});
