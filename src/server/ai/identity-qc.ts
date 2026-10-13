import "server-only";
import { z } from "zod";
import { ConfigError, fulfillmentMode, serverEnv } from "../config";
import { ApiError } from "../http";
import { IDENTITY_QC_INSTRUCTIONS } from "./prompts";

/**
 * IdentityQualityGate (spec §7): human-readable automated checks. No face-recognition
 * embeddings or biometric templates — a vision model answers plain questions instead.
 */

export const qcVerdictSchema = z
  .object({
    /** The concept is an annotated before and after rather than a single photo. */
    comparison: z.boolean(),
    sameAdultPersonLikely: z.boolean(),
    addedPeopleOrFeatures: z.boolean(),
    brokenEyesOrTeeth: z.boolean(),
    excludedChanges: z.boolean(),
    notes: z.string().max(300),
  })
  .strict();

export type QcVerdict = z.infer<typeof qcVerdictSchema>;
export type QcResult = { pass: boolean; reasons: string[]; comparison: boolean };

export function evaluateVerdict(verdict: QcVerdict): QcResult {
  const reasons: string[] = [];
  if (!verdict.sameAdultPersonLikely) reasons.push("likeness_lost");
  if (verdict.addedPeopleOrFeatures) reasons.push("added_people_or_features");
  if (verdict.brokenEyesOrTeeth) reasons.push("broken_features");
  if (verdict.excludedChanges) reasons.push("excluded_changes");
  return { pass: reasons.length === 0, reasons, comparison: verdict.comparison };
}

export interface IdentityQualityGate {
  check(input: { original: Buffer; edited: Buffer }): Promise<QcResult>;
}

class MockIdentityQualityGate implements IdentityQualityGate {
  async check(): Promise<QcResult> {
    return serverEnv().MOCK_FORCE_FAILURE === "qc"
      ? { pass: false, reasons: ["likeness_lost"], comparison: false }
      : { pass: true, reasons: [], comparison: false };
  }
}

class OpenAIIdentityQualityGate implements IdentityQualityGate {
  async check(input: { original: Buffer; edited: Buffer }): Promise<QcResult> {
    const env = serverEnv();
    if (!env.VISION_API_KEY || !env.VISION_MODEL) throw new ConfigError("VISION_API_KEY and VISION_MODEL are required.");
    const { default: OpenAI } = await import("openai");
    const { zodTextFormat } = await import("openai/helpers/zod");
    const client = new OpenAI({ apiKey: env.VISION_API_KEY, timeout: 90_000, maxRetries: 1 });
    const image = (buffer: Buffer) => ({
      type: "input_image" as const,
      image_url: `data:image/jpeg;base64,${buffer.toString("base64")}`,
      detail: "high" as const,
    });
    const response = await client.responses.parse({
      model: env.VISION_MODEL,
      instructions: IDENTITY_QC_INSTRUCTIONS,
      input: [{ role: "user", content: [{ type: "input_text", text: "Original first, glow-up concept second." }, image(input.original), image(input.edited)] }],
      text: { format: zodTextFormat(qcVerdictSchema, "identity_qc") },
      store: false,
    });
    const parsed = qcVerdictSchema.safeParse(response.output_parsed);
    if (!parsed.success) throw new ApiError("AI_PROVIDER_FAILED");
    return evaluateVerdict(parsed.data);
  }
}

export function identityQualityGate(): IdentityQualityGate {
  switch (fulfillmentMode()) {
    case "mock":
      return new MockIdentityQualityGate();
    case "real":
      return new OpenAIIdentityQualityGate();
    case "unavailable":
      throw new ApiError("SERVICE_UNAVAILABLE");
  }
}
