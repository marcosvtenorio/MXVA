import "server-only";
import sharp from "sharp";
import { ConfigError, fulfillmentMode, serverEnv } from "../config";
import { ApiError } from "../http";
import type { CostMeter, ImageToolUsage } from "./cost";
import { OWNER_PROMPT } from "./prompts";

export type ImageEditInput = { front: Buffer; width: number; height: number; meter?: CostMeter; attempt?: number };

/** What the owner's prompt returns: the annotated before and after, and the consultant's written analysis. */
export type ConceptResult = { image: Buffer; consultation: string };

export interface ImageEditProvider {
  readonly simulated: boolean;
  /** Made from the buyer's own photo. Never a stock or generated stranger. */
  edit(input: ImageEditInput): Promise<ConceptResult>;
}

/**
 * Development only: a light, honest adjustment of the buyer's OWN photo (even lighting,
 * a touch of clarity), stamped "SIMULATED" so it can never pass as a real concept.
 */
class MockImageEditProvider implements ImageEditProvider {
  readonly simulated = true;
  async edit(input: ImageEditInput): Promise<ConceptResult> {
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${Math.round(input.height * 0.06)}">
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)"/>
        <text x="50%" y="62%" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(input.height * 0.025)}" fill="#ffffff" text-anchor="middle" letter-spacing="2">SIMULATED CONCEPT — DEV MODE</text>
      </svg>`,
    );
    const image = await sharp(input.front)
      .normalise({ lower: 1, upper: 99 })
      .modulate({ brightness: 1.03, saturation: 1.02 })
      .sharpen({ sigma: 0.6 })
      .composite([{ input: label, gravity: "south" }])
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return {
      image,
      consultation:
        "Simulated consultation: no real model was called.\n\n### Highest-impact changes\n\n**1. Hair:** a **textured cut** with tidy sides.\n- Keeps the volume on top.\n\n**2. Brows:** clean up the strays only.",
    };
  }
}

/**
 * Like ChatGPT: the vision model reads the photo and the owner's prompt, writes its consultation and
 * calls the image tool, which makes the annotated before and after from the buyer's photo.
 */
class OpenAIImageEditProvider implements ImageEditProvider {
  readonly simulated = false;
  async edit(input: ImageEditInput): Promise<ConceptResult> {
    const env = serverEnv();
    if (!env.IMAGE_API_KEY || !env.IMAGE_EDIT_MODEL || !env.VISION_MODEL) {
      throw new ConfigError("IMAGE_API_KEY, IMAGE_EDIT_MODEL and VISION_MODEL are required.");
    }
    const { default: OpenAI } = await import("openai");
    // The strongest models think and draw for several minutes.
    const client = new OpenAI({ apiKey: env.IMAGE_API_KEY, timeout: 600_000, maxRetries: 0 });
    const response = await client.responses.create({
      model: env.VISION_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: OWNER_PROMPT },
            { type: "input_image", image_url: `data:image/jpeg;base64,${input.front.toString("base64")}`, detail: "high" },
          ],
        },
      ],
      tools: [{ type: "image_generation", model: env.IMAGE_EDIT_MODEL, quality: env.IMAGE_QUALITY, output_format: "jpeg" }],
      store: false,
    });
    const tries = input.attempt && input.attempt > 1 ? ` (tentativa ${input.attempt})` : "";
    input.meter?.addText(`consultoria escrita e pedido da imagem${tries}`, env.VISION_MODEL, response.usage);
    // The image tool's own tokens: not in the SDK's types yet, but in every response.
    const toolUsage = (response as { tool_usage?: { image_gen?: ImageToolUsage } }).tool_usage;
    input.meter?.addImage(`imagem antes/depois${tries}`, env.IMAGE_EDIT_MODEL, toolUsage?.image_gen);
    // If the model draws more than one image, the last is the finished comparison.
    const images = response.output.flatMap((item) => (item.type === "image_generation_call" && item.result ? [item.result] : []));
    const last = images.at(-1);
    if (!last) throw new ApiError("AI_PROVIDER_FAILED");
    return { image: Buffer.from(last, "base64"), consultation: response.output_text.trim() };
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
