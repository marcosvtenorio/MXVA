import "server-only";
import type { FocusArea } from "@/features/onboarding/schema";
import { visualObservationsSchema, type VisualObservations } from "@/features/report/schema";
import { ConfigError, fulfillmentMode, serverEnv } from "../config";
import { ApiError } from "../http";
import { VISION_INSTRUCTIONS } from "./prompts";

export type VisionInput = { front: Buffer; profiles: Buffer[]; focusAreas: readonly FocusArea[] };

export interface VisionProvider {
  readonly simulated: boolean;
  observe(input: VisionInput): Promise<VisualObservations>;
}

const MOCK_LINES: Record<FocusArea, string> = {
  skin: "Simulated: skin looks fairly even in this light; fine texture is hard to judge at this resolution.",
  brows: "Simulated: brows have a natural shape with a few stray hairs at the inner edges.",
  eye_area: "Simulated: the eye area looks slightly shadowed, partly from overhead light.",
  hair: "Simulated: hair sits close to the head on the sides with more length on top.",
  facial_hair: "Simulated: the facial-hair edge along the neck is soft and uneven.",
  smile: "Simulated: the expression is neutral, so the smile can't be assessed.",
  jaw_presentation: "Simulated: the camera is close and slightly below eye level, which changes how the lower face reads.",
};

/** Development only: deterministic, clearly labelled placeholder observations. */
class MockVisionProvider implements VisionProvider {
  readonly simulated = true;
  async observe(input: VisionInput): Promise<VisualObservations> {
    if (serverEnv().MOCK_FORCE_FAILURE === "ai") throw new ApiError("AI_PROVIDER_FAILED");
    return {
      imageQuality: { usable: true, faceCount: 1, lightingLimitations: "Simulated analysis — no real model was called." },
      possibleMinor: false,
      observations: input.focusAreas.map((area) => ({ area, observation: MOCK_LINES[area], confidence: "low" as const })),
      cannotAssess: ["Simulated mode: nothing about this photo was actually analysed."],
      glowUp: {
        haircut: "textured_crop",
        facialHair: "sharpen_lines",
        skin: { blemishes: true, redness: false, unevenTone: true, shine: false },
        browsNeedGrooming: true,
        eyesLookTired: true,
        teethVisible: false,
        jawSoftTissue: "some_fullness",
      },
    };
  }
}

/** OpenAI Responses API with strict JSON output (Phase C; verify model choice before launch). */
class OpenAIVisionProvider implements VisionProvider {
  readonly simulated = false;
  async observe(input: VisionInput): Promise<VisualObservations> {
    const env = serverEnv();
    if (!env.VISION_API_KEY || !env.VISION_MODEL) throw new ConfigError("VISION_API_KEY and VISION_MODEL are required.");
    const { default: OpenAI } = await import("openai");
    const { zodTextFormat } = await import("openai/helpers/zod");
    const client = new OpenAI({ apiKey: env.VISION_API_KEY, timeout: 90_000, maxRetries: 1 });
    const images = [input.front, ...input.profiles].map((buffer) => ({
      type: "input_image" as const,
      image_url: `data:image/jpeg;base64,${buffer.toString("base64")}`,
      detail: "high" as const,
    }));
    const response = await client.responses.parse({
      model: env.VISION_MODEL,
      instructions: VISION_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `The person wants a full glow-up; describe every area you can see. First image is the front photo${input.profiles.length ? "; the others are profiles" : ""}.` },
            ...images,
          ],
        },
      ],
      text: { format: zodTextFormat(visualObservationsSchema, "visual_observations") },
      store: false,
    });
    const parsed = visualObservationsSchema.safeParse(response.output_parsed);
    if (!parsed.success) throw new ApiError("AI_PROVIDER_FAILED");
    return parsed.data;
  }
}

export function visionProvider(): VisionProvider {
  switch (fulfillmentMode()) {
    case "mock":
      return new MockVisionProvider();
    case "real":
      return new OpenAIVisionProvider();
    case "unavailable":
      throw new ApiError("SERVICE_UNAVAILABLE");
  }
}
