import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * LIVE vision check (OpenAI), opt-in and paid per run. Prints what the model observes,
 * including the minor/adult call. Use only a consenting adult's photo or a fictional face:
 *   LIVE_VISION_PHOTO=/path/photo.jpg npx vitest run vision-live
 */
const photoPath = process.env.LIVE_VISION_PHOTO;
const saved: Record<string, string | undefined> = {};

describe.skipIf(!photoPath)("live vision observations", () => {
  beforeAll(() => {
    saved.NEXT_PUBLIC_ENABLE_REAL_AI = process.env.NEXT_PUBLIC_ENABLE_REAL_AI;
    process.env.NEXT_PUBLIC_ENABLE_REAL_AI = "true";
    vi.resetModules();
  });
  afterAll(() => {
    if (saved.NEXT_PUBLIC_ENABLE_REAL_AI === undefined) delete process.env.NEXT_PUBLIC_ENABLE_REAL_AI;
    else process.env.NEXT_PUBLIC_ENABLE_REAL_AI = saved.NEXT_PUBLIC_ENABLE_REAL_AI;
    vi.resetModules();
  });

  it("describes the photo", async () => {
    const { validateUploadedPhoto } = await import("@/server/photos/validate");
    const { visionProvider } = await import("@/server/ai/vision-adapter");
    const bytes = readFileSync(photoPath!);
    const front = await validateUploadedPhoto(new File([bytes], "front.jpg", { type: "image/jpeg" }), 15 * 1024 * 1024);
    const observations = await visionProvider().observe({ front: front.jpeg, profiles: [], focusAreas: ["skin", "hair", "brows", "facial_hair"] });
    console.info(JSON.stringify(observations, null, 2));
    expect(observations.imageQuality.faceCount).toBe(1);
  }, 180_000);
});
