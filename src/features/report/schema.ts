import "@/lib/zod-config";
import { z } from "zod";
import { FACIAL_HAIR_ACTIONS, FOCUS_AREAS, HAIRCUT_STYLES, JAW_SOFT_TISSUE } from "@/features/onboarding/schema";

// ─── Evidence registry ───

export const evidenceSourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(3),
    publisher: z.string().min(3),
    url: z.url().refine((url) => url.startsWith("https://"), "Sources must use https"),
    doi: z.string().optional(),
    kind: z.enum([
      "professional_guidance",
      "randomized_trial",
      "experimental_study",
      "pilot_study",
      "modelling_study",
      "systematic_review",
      "narrative_review",
    ]),
    published: z.iso.date().nullable(),
    dateLabel: z.string().min(3),
    accessedAt: z.iso.date(),
    limitations: z.string().min(3),
  })
  .strict();

export const evidenceRegistrySchema = z
  .object({ version: z.string(), note: z.string(), sources: z.array(evidenceSourceSchema).min(1) })
  .strict();

export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

// ─── Vision provider output (strict JSON, validated before use) ───

export const CONFIDENCE = ["high", "medium", "low"] as const;

export const visualObservationsSchema = z
  .object({
    imageQuality: z
      .object({
        usable: z.boolean(),
        faceCount: z.number().int().min(0).max(20),
        lightingLimitations: z.string().max(240),
      })
      .strict(),
    /** Set when the person may be under 18: the order goes to a human, never to processing. */
    possibleMinor: z.boolean(),
    /** Objective glow-up decisions from the photo; they drive the plan and the concept image. */
    glowUp: z
      .object({
        haircut: z.enum(HAIRCUT_STYLES),
        facialHair: z.enum(FACIAL_HAIR_ACTIONS),
        skin: z.object({ blemishes: z.boolean(), redness: z.boolean(), unevenTone: z.boolean(), shine: z.boolean() }).strict(),
        browsNeedGrooming: z.boolean(),
        eyesLookTired: z.boolean(),
        teethVisible: z.boolean(),
        jawSoftTissue: z.enum(JAW_SOFT_TISSUE),
      })
      .strict(),
    observations: z
      .array(
        z
          .object({
            area: z.enum(FOCUS_AREAS),
            observation: z.string().min(3).max(400),
            confidence: z.enum(CONFIDENCE),
          })
          .strict(),
      )
      .max(14),
    cannotAssess: z.array(z.string().min(3).max(300)).max(8),
  })
  .strict();

export type VisualObservations = z.infer<typeof visualObservationsSchema>;

// ─── Paid report (spec §4) ───

export const priorityRecommendationSchema = z
  .object({
    id: z.string(),
    area: z.enum(FOCUS_AREAS),
    title: z.string(),
    observation: z.string(),
    suggestion: z.string(),
    reason: z.string(),
    evidenceLevel: z.enum(["established", "limited", "styling_opinion"]),
    effort: z.enum(["low", "medium", "high"]),
    costBand: z.enum(["free", "low", "medium", "professional"]),
    horizon: z.enum(["now", "30d", "90d", "professional"]),
    uncertainty: z.string(),
    sourceIds: z.array(z.string()),
  })
  .strict();

export type PriorityRecommendation = z.infer<typeof priorityRecommendationSchema>;

export const paidReportSchema = z
  .object({
    title: z.string(),
    createdAt: z.iso.datetime(),
    disclaimer: z.string(),
    goalsSummary: z.array(z.string()),
    observations: z.array(
      z.object({ area: z.enum(FOCUS_AREAS), observation: z.string(), confidence: z.enum(CONFIDENCE) }).strict(),
    ),
    cannotAssess: z.array(z.string()),
    recommendations: z.array(priorityRecommendationSchema).min(5).max(10),
    sevenDayPlan: z.array(z.string()).min(1),
    thirtyDayPlan: z.array(z.string()).min(1),
    ninetyDayPlan: z.array(z.string()).min(1),
    professionalQuestions: z.array(z.string()).optional(),
    budgetNote: z.string(),
    usedSources: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          publisher: z.string(),
          url: z.string(),
          dateLabel: z.string(),
          limitations: z.string(),
          accessedAt: z.string(),
        })
        .strict(),
    ),
    imageEditSummary: z.array(z.string()).min(1),
    simulated: z.boolean(),
  })
  .strict();

export type PaidReport = z.infer<typeof paidReportSchema>;

/** Plain AI label for the concept image (honest, not discouraging). */
export const SIMULATION_DISCLAIMER = "Your concept image was created with AI from your own photo.";

export const CONCEPT_LABEL = "Your AI glow-up concept";
