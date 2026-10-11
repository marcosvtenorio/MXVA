import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import type { ProcessedPhoto, RejectedPhoto } from "../src/features/photos/client-processor";
import { photoProcessorBundle } from "./support/photo-bundle";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

type Outcome =
  | {
      ok: true;
      width: number;
      height: number;
      type: string;
      size: number;
      hasExifSegment: boolean;
      mentionsCamera: boolean;
      qualityOk: boolean;
      issues: string[];
    }
  | { ok: false; code: string; message: string };

async function process(page: Page, files: string | { name: string; mimeType: string; buffer: Buffer }): Promise<Outcome> {
  await page.setContent('<input type="file" id="file" accept="image/*">');
  await page.addScriptTag({ content: await photoProcessorBundle() });
  await page.setInputFiles("#file", files);
  return page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>("#file")!;
    const api = (window as unknown as { MXVAPhoto: { processPhoto: (f: File) => Promise<ProcessedPhoto | RejectedPhoto> } })
      .MXVAPhoto;
    const result = await api.processPhoto(input.files![0]!);
    if (!result.ok) return { ok: false, code: result.code, message: result.message };
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    let hasExifSegment = false;
    for (let i = 2; i + 10 < bytes.length && i < 65536; i++) {
      // APP1 marker followed by "Exif"
      if (bytes[i] === 0xff && bytes[i + 1] === 0xe1 && String.fromCharCode(...bytes.slice(i + 4, i + 8)) === "Exif") {
        hasExifSegment = true;
        break;
      }
    }
    const text = new TextDecoder("latin1").decode(bytes);
    return {
      ok: true,
      width: result.width,
      height: result.height,
      type: result.blob.type,
      size: result.blob.size,
      hasExifSegment,
      mentionsCamera: text.includes("SyntheticCam") || text.includes("FixtureModel"),
      qualityOk: result.quality.ok,
      issues: result.quality.issues.map((i) => `${i.code}:${i.severity}`),
    };
  });
}

test.describe("on-device photo processing", () => {
  test("normalises a synthetic portrait into a clean JPEG", async ({ page }) => {
    const result = await process(page, fixture("synthetic-front.jpg"));
    expect(result).toMatchObject({ ok: true, width: 1200, height: 1600, type: "image/jpeg", qualityOk: true });
  });

  test("applies EXIF orientation and strips camera metadata", async ({ page }) => {
    const result = await process(page, fixture("exif-rotated.jpg"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Stored 1600×1200 with orientation 6: upright output is portrait.
    expect([result.width, result.height]).toEqual([1200, 1600]);
    expect(result.hasExifSegment).toBe(false);
    expect(result.mentionsCamera).toBe(false);
  });

  test("accepts PNG and WebP and re-encodes them as JPEG", async ({ page }) => {
    for (const name of ["synthetic-front.png", "synthetic-front.webp"]) {
      const result = await process(page, fixture(name));
      expect(result).toMatchObject({ ok: true, type: "image/jpeg", width: 900, height: 1200 });
    }
  });

  test("rejects files that are not photos or are disguised", async ({ page }) => {
    expect(await process(page, fixture("not-an-image.jpg"))).toMatchObject({ ok: false, code: "UNSUPPORTED_IMAGE_TYPE" });
    expect(await process(page, fixture("disguised.png"))).toMatchObject({ ok: false, code: "UNSUPPORTED_IMAGE_TYPE" });
  });

  test("downscales a 48 MP phone photo to a 2048 px long side", async ({ page }) => {
    const buffer = await sharp({
      create: {
        width: 6000,
        height: 8000,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
        noise: { type: "gaussian", mean: 120, sigma: 40 },
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    const result = await process(page, { name: "IMG_4800.JPG", mimeType: "image/jpeg", buffer });
    expect(result).toMatchObject({ ok: true, width: 1536, height: 2048 });
  });

  test("rejects oversized originals before decoding", async ({ page }) => {
    const big = Buffer.alloc(26 * 1024 * 1024);
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(await process(page, { name: "huge.jpg", mimeType: "image/jpeg", buffer: big })).toMatchObject({
      ok: false,
      code: "PHOTO_TOO_LARGE",
    });
  });

  test("rejects decompression-bomb dimensions", async ({ page }) => {
    const header = Buffer.alloc(64);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    header.writeUInt32BE(30_000, 16);
    header.writeUInt32BE(30_000, 20);
    expect(await process(page, { name: "bomb.png", mimeType: "image/png", buffer: header })).toMatchObject({
      ok: false,
      code: "PHOTO_DIMENSIONS_UNSAFE",
    });
  });

  test("reports blocking quality problems with the preview kept", async ({ page }) => {
    const dark = await process(page, fixture("too-dark.jpg"));
    expect(dark).toMatchObject({ ok: true, qualityOk: false });
    if (dark.ok) expect(dark.issues).toContain("too_dark:block");

    const blank = await process(page, fixture("blank.png"));
    expect(blank).toMatchObject({ ok: true, qualityOk: false });
    if (blank.ok) expect(blank.issues).toContain("low_contrast:block");

    const small = await process(page, fixture("too-small.jpg"));
    if (small.ok) expect(small.issues).toContain("too_small:block");
  });
});
