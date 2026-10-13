import "server-only";
import sharp from "sharp";
import { FOCUS_AREAS, type Constraints } from "@/features/onboarding/schema";
import { deriveReportInput } from "@/features/report/derive";
import type { Order } from "@/features/orders/states";
import { auditReportPdf, composeReportPdf } from "@/features/report/pdf";
import { planReport } from "@/features/report/planner";
import type { PaidReport } from "@/features/report/schema";
import { publicConfig } from "@/lib/config";
import { identityQualityGate } from "../ai/identity-qc";
import { imageEditProvider } from "../ai/image-edit-adapter";
import { buildImageEditPrompt } from "../ai/prompts";
import { visionProvider } from "../ai/vision-adapter";
import { serverEnv, supportEmail } from "../config";
import { ApiError } from "../http";
import { emailProvider } from "../mail/email-adapter";
import type { ServerPhoto } from "../photos/validate";

/**
 * PhotoValidator → VisualObservations → RecommendationPlanner → ImageEdit →
 * IdentityQualityGate → PDFComposer → EmailSender (spec §7). Everything stays in RAM.
 * Phases are reported only when the server actually enters them.
 */

export type FulfillmentPhase = "analysing_photo" | "preparing_image" | "checking_image" | "building_report" | "sending_email";

export type FulfillmentOutput = {
  report: PaidReport;
  conceptJpeg: Buffer;
  pdf: Uint8Array;
  emailDelivered: boolean;
  messageId: string | null;
};

/** Thrown when a human must review the order before anything else happens. */
export class NeedsHumanReview extends ApiError {}

const CONCEPT_LONG_SIDE = 1600;

async function withRetries<T>(attempts: number, run: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function runPipeline(args: {
  order: Order;
  front: ServerPhoto;
  profiles: ServerPhoto[];
  constraints: Constraints;
  /** The buyer's IANA time zone, for the report's date. */
  timeZone?: string;
  onPhase: (phase: FulfillmentPhase) => void;
}): Promise<FulfillmentOutput> {
  const { order, front, profiles, constraints, timeZone, onPhase } = args;
  const vision = visionProvider();
  const editor = imageEditProvider();
  const gate = identityQualityGate();
  const mailer = emailProvider();

  onPhase("analysing_photo");
  const observations = await vision.observe({ front: front.jpeg, profiles: profiles.map((p) => p.jpeg), focusAreas: FOCUS_AREAS });
  if (observations.possibleMinor) {
    console.warn("[fulfillment] held for human review: the photo may show a minor");
    throw new NeedsHumanReview("AGE_RESTRICTED");
  }
  if (observations.imageQuality.faceCount !== 1) {
    throw new ApiError("PHOTO_QUALITY_INSUFFICIENT", "We need a front photo with just you in it.");
  }
  if (!observations.imageQuality.usable) throw new ApiError("PHOTO_QUALITY_INSUFFICIENT");
  // Every aesthetic decision comes from the photo; the buyer only told us what to avoid.
  const input = deriveReportInput(observations, constraints);

  onPhase("preparing_image");
  let edited: Buffer | undefined;
  for (const strict of [false, true]) {
    const raw = await editor.edit({ front: front.jpeg, width: front.width, height: front.height, prompt: buildImageEditPrompt(input, { strict }) });
    const candidate = await sharp(raw)
      .rotate()
      .resize({ width: CONCEPT_LONG_SIDE, height: CONCEPT_LONG_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    raw.fill(0);
    onPhase("checking_image");
    const verdict = await gate.check({ original: front.jpeg, edited: candidate });
    if (verdict.pass) {
      edited = candidate;
      break;
    }
    console.warn(`[fulfillment] concept image failed QC (${verdict.reasons.join(",")}), strict=${strict}`);
    candidate.fill(0);
  }
  // Never deliver a distorted likeness: no fallback image of any kind.
  if (!edited) throw new ApiError("SIMULATION_QUALITY_FAILED");

  onPhase("building_report");
  const simulated = vision.simulated || editor.simulated;
  let pdf: Uint8Array;
  let report: PaidReport;
  try {
    if (serverEnv().MOCK_FORCE_FAILURE === "pdf" && simulated) throw new Error("forced");
    report = planReport(input, observations, { simulated });
    pdf = await composeReportPdf({
      report,
      conceptJpeg: edited,
      originalJpeg: front.jpeg,
      brandName: publicConfig.brandName,
      supportEmail: supportEmail(),
      timeZone,
    });
    const audit = await auditReportPdf(pdf, report);
    if (!audit.ok) {
      console.error(`[fulfillment] pdf audit failed: ${audit.problems.join(",")}`);
      throw new Error("audit");
    }
  } catch {
    edited.fill(0);
    throw new ApiError("PDF_GENERATION_FAILED");
  }

  onPhase("sending_email");
  try {
    const { messageId } = await withRetries(3, () =>
      mailer.sendReport({
        to: order.email,
        pdf: Buffer.from(pdf),
        idempotencyKey: `report-${order.id}-a${order.fulfillmentAttempts}`,
      }),
    );
    return { report, conceptJpeg: edited, pdf, emailDelivered: true, messageId };
  } catch {
    // The report exists: show it in the browser and let support/retry handle email.
    return { report, conceptJpeg: edited, pdf, emailDelivered: false, messageId: null };
  }
}
