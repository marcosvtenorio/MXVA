import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validateUploadedPhoto } from "@/server/photos/validate";

const fixture = (name: string, type = "image/jpeg") =>
  new File([readFileSync(new URL(`../../../e2e/fixtures/${name}`, import.meta.url))], name, { type });

const MAX = 8 * 1024 * 1024;

async function code(file: File, max = MAX): Promise<string> {
  try {
    await validateUploadedPhoto(file, max);
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? "other";
  }
}

describe("server photo validation", () => {
  it("re-encodes a valid photo into an upright, metadata-free JPEG", async () => {
    const result = await validateUploadedPhoto(fixture("exif-rotated.jpg"), MAX);
    expect([result.width, result.height]).toEqual([1200, 1600]);
    const meta = await sharp(result.jpeg).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(result.jpeg.includes(Buffer.from("SyntheticCam"))).toBe(false);
  });

  it("accepts PNG and WebP", async () => {
    expect(await code(fixture("synthetic-front.png", "image/png"))).toBe("ok");
    expect(await code(fixture("synthetic-front.webp", "image/webp"))).toBe("ok");
  });

  it("rejects non-images, tiny, dark and blank photos, and oversized uploads", async () => {
    expect(await code(fixture("not-an-image.jpg"))).toBe("UNSUPPORTED_IMAGE_TYPE");
    expect(await code(fixture("too-small.jpg"))).toBe("PHOTO_QUALITY_INSUFFICIENT");
    expect(await code(fixture("too-dark.jpg"))).toBe("PHOTO_QUALITY_INSUFFICIENT");
    expect(await code(fixture("blank.png", "image/png"))).toBe("PHOTO_QUALITY_INSUFFICIENT");
    expect(await code(fixture("synthetic-front.jpg"), 1000)).toBe("PHOTO_TOO_LARGE");
    expect(await code(new File([], "empty.jpg", { type: "image/jpeg" }))).toBe("PHOTO_REQUIRED");
  });
});
