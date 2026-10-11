import { describe, expect, it } from "vitest";
import { assessQuality, measure, type PixelBuffer } from "@/features/photos/quality";

function buffer(width: number, height: number, pixel: (x: number, y: number) => number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height, channels: 4 };
}

// Deterministic pseudo-random texture with real edges, like skin, hair and background.
const textured = (base: number, spread: number) => (x: number, y: number) =>
  Math.max(0, Math.min(255, base + (((x * 73856093) ^ (y * 19349663)) % spread) - spread / 2 + ((x >> 3) % 2) * 30));

const portrait = { width: 1200, height: 1600 };

describe("photo quality heuristics", () => {
  it("passes a well-lit, detailed portrait", () => {
    const report = assessQuality(buffer(96, 128, textured(120, 90)), portrait);
    expect(report.ok).toBe(true);
    expect(report.issues.filter((i) => i.severity === "block")).toEqual([]);
  });

  it("blocks a blank image and a photo that is too small", () => {
    expect(assessQuality(buffer(96, 128, () => 128), portrait).issues.map((i) => i.code)).toContain("low_contrast");
    expect(assessQuality(buffer(96, 128, () => 128), portrait).ok).toBe(false);
    const small = assessQuality(buffer(96, 128, textured(120, 90)), { width: 300, height: 400 });
    expect(small.ok).toBe(false);
    expect(small.issues[0]).toMatchObject({ code: "too_small", severity: "block" });
  });

  it("blocks very dark and blown-out photos, warns on dim ones", () => {
    expect(assessQuality(buffer(96, 128, textured(8, 12)), portrait).issues.find((i) => i.code === "too_dark")?.severity).toBe("block");
    expect(assessQuality(buffer(96, 128, textured(45, 40)), portrait).issues.find((i) => i.code === "too_dark")?.severity).toBe("warn");
    expect(assessQuality(buffer(96, 128, () => 252), portrait).ok).toBe(false);
  });

  it("scores sharp detail above a smooth gradient", () => {
    const sharp = measure(buffer(96, 128, (x, y) => ((x + y) % 2 === 0 ? 40 : 210)));
    const smooth = measure(buffer(96, 128, (x) => 60 + x));
    expect(sharp.sharpness).toBeGreaterThan(smooth.sharpness * 10);
  });

  it("only warns (never blocks) on blur and landscape framing", () => {
    const report = assessQuality(buffer(128, 96, (x) => 60 + x), { width: 1600, height: 1200 });
    const codes = report.issues.map((i) => `${i.code}:${i.severity}`);
    expect(codes).toContain("blurry:warn");
    expect(codes).toContain("landscape:warn");
  });
});
