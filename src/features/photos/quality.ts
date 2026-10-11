import type { PhotoQualityReport, QualityIssue } from "./types";

/**
 * Lightweight, on-device photo quality heuristics. They catch unusable photos
 * (tiny, black, blown out, blank) and warn about likely problems (soft focus, dim
 * light, landscape framing). They never judge the face itself.
 */

export type PixelBuffer = {
  data: ArrayLike<number>;
  width: number;
  height: number;
  /** 4 for RGBA (canvas ImageData), 3 for RGB. */
  channels: 3 | 4;
};

export const QUALITY_THRESHOLDS = {
  minShortSideBlock: 480,
  minShortSideWarn: 720,
  darkBlock: 0.1,
  darkWarn: 0.2,
  brightBlock: 0.92,
  brightWarn: 0.82,
  clippedBlock: 0.5,
  clippedWarn: 0.2,
  contrastBlock: 0.035,
  contrastWarn: 0.07,
  sharpnessWarn: 12,
  landscapeRatio: 1.15,
} as const;

/** Analysis runs on a small copy; this is its long side in pixels. */
export const ANALYSIS_LONG_SIDE = 384;

function luminanceAt(buffer: PixelBuffer, index: number): number {
  const offset = index * buffer.channels;
  const r = buffer.data[offset]!;
  const g = buffer.data[offset + 1]!;
  const b = buffer.data[offset + 2]!;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function measure(buffer: PixelBuffer) {
  const { width, height } = buffer;
  const count = width * height;
  const lum = new Float32Array(count);
  let sum = 0;
  let clipped = 0;
  for (let i = 0; i < count; i++) {
    const y = luminanceAt(buffer, i);
    lum[i] = y;
    sum += y;
    if (y > 0.97) clipped++;
  }
  const mean = count > 0 ? sum / count : 0;
  let variance = 0;
  for (let i = 0; i < count; i++) variance += (lum[i]! - mean) ** 2;
  const contrast = count > 0 ? Math.sqrt(variance / count) : 0;

  // Variance of the Laplacian over the central 60% (where a portrait's face is),
  // on a 0–255 scale. Low values mean few edges: soft focus or motion blur.
  const x0 = Math.max(1, Math.floor(width * 0.2));
  const x1 = Math.min(width - 1, Math.ceil(width * 0.8));
  const y0 = Math.max(1, Math.floor(height * 0.2));
  const y1 = Math.min(height - 1, Math.ceil(height * 0.8));
  let lapSum = 0;
  let lapSq = 0;
  let lapCount = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      const value =
        255 * (lum[i - 1]! + lum[i + 1]! + lum[i - width]! + lum[i + width]! - 4 * lum[i]!);
      lapSum += value;
      lapSq += value * value;
      lapCount++;
    }
  }
  const lapMean = lapCount > 0 ? lapSum / lapCount : 0;
  const sharpness = lapCount > 0 ? lapSq / lapCount - lapMean * lapMean : 0;

  return { meanLuminance: mean, contrast, sharpness, clippedRatio: count > 0 ? clipped / count : 0 };
}

export function assessQuality(
  buffer: PixelBuffer,
  fullSize: { width: number; height: number },
): PhotoQualityReport {
  const t = QUALITY_THRESHOLDS;
  const { meanLuminance, contrast, sharpness, clippedRatio } = measure(buffer);
  const issues: QualityIssue[] = [];
  const shortSide = Math.min(fullSize.width, fullSize.height);

  if (shortSide < t.minShortSideBlock) {
    issues.push({ code: "too_small", severity: "block", message: "This photo is too small. Use your phone's camera at full resolution." });
  } else if (shortSide < t.minShortSideWarn) {
    issues.push({ code: "too_small", severity: "warn", message: "This photo is quite small, so fine details may be missed." });
  }

  if (meanLuminance < t.darkBlock) {
    issues.push({ code: "too_dark", severity: "block", message: "This photo is too dark to use. Face a window or a soft light." });
  } else if (meanLuminance < t.darkWarn) {
    issues.push({ code: "too_dark", severity: "warn", message: "This photo is dim. Brighter, even light gives a better result." });
  }

  if (meanLuminance > t.brightBlock || clippedRatio > t.clippedBlock) {
    issues.push({ code: "too_bright", severity: "block", message: "This photo is overexposed. Step out of direct light and try again." });
  } else if (meanLuminance > t.brightWarn || clippedRatio > t.clippedWarn) {
    issues.push({ code: "too_bright", severity: "warn", message: "Parts of this photo are very bright. Softer light works better." });
  }

  if (contrast < t.contrastBlock) {
    issues.push({ code: "low_contrast", severity: "block", message: "We can't make out a face in this image. Choose a clear photo of yourself." });
  } else if (contrast < t.contrastWarn) {
    issues.push({ code: "low_contrast", severity: "warn", message: "This photo looks flat or hazy. Clean the lens and use even light." });
  }

  if (sharpness < t.sharpnessWarn && contrast >= t.contrastBlock) {
    issues.push({ code: "blurry", severity: "warn", message: "This photo looks a little blurry. Hold still or tap to focus on your face." });
  }

  if (fullSize.width > fullSize.height * t.landscapeRatio) {
    issues.push({ code: "landscape", severity: "warn", message: "A vertical (portrait) photo frames your face best." });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "block"),
    issues,
    metrics: {
      width: fullSize.width,
      height: fullSize.height,
      meanLuminance: round(meanLuminance),
      contrast: round(contrast),
      sharpness: Math.round(sharpness * 10) / 10,
    },
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
