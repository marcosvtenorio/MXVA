import "server-only";
import sharp from "sharp";
import { ConfigError, fulfillmentMode, serverEnv } from "../config";
import { ApiError } from "../http";

export type ImageEditInput = { front: Buffer; width: number; height: number; prompt: string };

export interface ImageEditProvider {
  readonly simulated: boolean;
  /** Returns a JPEG of the same person. Never a stock or generated stranger. */
  edit(input: ImageEditInput): Promise<Buffer>;
}

/**
 * Development only: a light, honest adjustment of the buyer's OWN photo (even lighting,
 * a touch of clarity), stamped "SIMULATED" so it can never pass as a real concept.
 */
class MockImageEditProvider implements ImageEditProvider {
  readonly simulated = true;
  async edit(input: ImageEditInput): Promise<Buffer> {
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${Math.round(input.height * 0.06)}">
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)"/>
        <text x="50%" y="62%" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(input.height * 0.025)}" fill="#ffffff" text-anchor="middle" letter-spacing="2">SIMULATED CONCEPT — DEV MODE</text>
      </svg>`,
    );
    return sharp(input.front)
      .normalise({ lower: 1, upper: 99 })
      .modulate({ brightness: 1.03, saturation: 1.02 })
      .sharpen({ sigma: 0.6 })
      .composite([{ input: label, gravity: "south" }])
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  }
}

/** Size for gpt-image-2: keep the aspect ratio, multiples of 16, long side 1536. */
export function editSize(width: number, height: number): string {
  const scale = 1536 / Math.max(width, height);
  const round16 = (value: number) => Math.max(16, Math.round((value * scale) / 16) * 16);
  return `${round16(width)}x${round16(height)}`;
}

/** OpenAI Images Edit (Phase C). Uses the buyer's photo as the edit source, never text-to-image. */
class OpenAIImageEditProvider implements ImageEditProvider {
  readonly simulated = false;
  async edit(input: ImageEditInput): Promise<Buffer> {
    const env = serverEnv();
    if (!env.IMAGE_API_KEY || !env.IMAGE_EDIT_MODEL) throw new ConfigError("IMAGE_API_KEY and IMAGE_EDIT_MODEL are required.");
    const { default: OpenAI, toFile } = await import("openai");
    const client = new OpenAI({ apiKey: env.IMAGE_API_KEY, timeout: 180_000, maxRetries: 1 });
    const result = await client.images.edit({
      model: env.IMAGE_EDIT_MODEL,
      image: await toFile(input.front, "portrait.jpg", { type: "image/jpeg" }),
      prompt: input.prompt,
      size: editSize(input.width, input.height),
      quality: "high",
      output_format: "jpeg",
      n: 1,
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new ApiError("AI_PROVIDER_FAILED");
    return Buffer.from(b64, "base64");
  }
}

export function imageEditProvider(): ImageEditProvider {
  switch (fulfillmentMode()) {
    case "mock":
      return new MockImageEditProvider();
    case "real":
      return new OpenAIImageEditProvider();
    case "unavailable":
      throw new ApiError("SERVICE_UNAVAILABLE");
  }
}
