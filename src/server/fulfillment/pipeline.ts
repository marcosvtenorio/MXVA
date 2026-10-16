import "server-only";
import sharp from "sharp";
import { FOCUS_AREAS, type Constraints } from "@/features/onboarding/schema";
import { deriveReportInput } from "@/features/report/derive";
import { auditReportPdf, composeReportPdf } from "@/features/report/pdf";
import { planReport } from "@/features/report/planner";
import type { PaidReport, VisualObservations } from "@/features/report/schema";
import { publicConfig } from "@/lib/config";
import type { CostMeter } from "../ai/cost";
import { identityQualityGate } from "../ai/identity-qc";
import { imageEditProvider } from "../ai/image-edit-adapter";
import { visionProvider } from "../ai/vision-adapter";
import { serverEnv, supportEmail } from "../config";
import { ApiError } from "../http";
import type { ServerPhoto } from "../photos/validate";

/**
 * PhotoValidator → VisualObservations → RecommendationPlanner → ImageEdit →
 * IdentityQualityGate → PDFComposer (spec §7). Everything stays in RAM. The queue
 * (./queue.ts) runs this, retries it and emails the PDF. Phases are reported only when
 * the server actually enters them.
 */

export type FulfillmentPhase = "analysing_photo" | "preparing_image" | "checking_image" | "building_report" | "sending_email";

export type GeneratedReport = { report: PaidReport; pdf: Uint8Array };

/**
 * What a report's earlier try already learned, kept in RAM by the queue so a retry (e.g. after the
 * image step was rate-limited) doesn't pay for the photo analysis again. Dropped with the job.
 */
export type ReportCache = { observations?: VisualObservations };

/** Thrown when a human must review the order before anything else happens. */
export class NeedsHumanReview extends ApiError {}

const CONCEPT_LONG_SIDE = 1600;

export async function generateReport(args: {
  front: ServerPhoto;
  profiles: ServerPhoto[];
  constraints: Constraints;
  /** The buyer's IANA time zone, for the report's date. */
  timeZone?: string;
  onPhase: (phase: FulfillmentPhase) => void;
  cache?: ReportCache;
  /** Records every OpenAI call's tokens and price, for the owner's receipt. */
  meter?: CostMeter;
}): Promise<GeneratedReport> {
  const { front, profiles, constraints, timeZone, onPhase, cache = {}, meter } = args;
  const vision = visionProvider();
  const editor = imageEditProvider();
  const gate = identityQualityGate();

  onPhase("analysing_photo");
  const observations = (cache.observations ??= await vision.observe({ front: front.jpeg, profiles: profiles.map((p) => p.jpeg), focusAreas: FOCUS_AREAS, meter }));
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
  // The owner's prompt, exactly as written; a second try only if the first fails the likeness check.
  let edited: Buffer | undefined;
  let consultation = "";
  let comparison = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await editor.edit({ front: front.jpeg, width: front.width, height: front.height, meter, attempt });
    const raw = result.image;
    const candidate = await sharp(raw)
      .rotate()
      .resize({ width: CONCEPT_LONG_SIDE, height: CONCEPT_LONG_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    raw.fill(0);
    onPhase("checking_image");
    const verdict = await gate.check({ original: front.jpeg, edited: candidate, meter, attempt });
    if (verdict.pass) {
      edited = candidate;
      consultation = result.consultation;
      comparison = verdict.comparison;
      break;
    }
    console.warn(`[fulfillment] concept image failed QC (${verdict.reasons.join(",")}), attempt=${attempt}`);
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
    report = planReport(input, observations, { simulated, consultation, conceptLayout: comparison ? "comparison" : "portrait" });
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
    throw new ApiError("PDF_GENERATION_FAILED");
  } finally {
    // The concept now lives only inside the PDF, which the queue emails and then wipes.
    edited.fill(0);
  }
  return { report, pdf };
}
