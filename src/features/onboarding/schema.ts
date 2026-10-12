import { z } from "zod";

// ─── Versions of the texts a buyer agrees to. Bump when the wording changes. ───
export const TERMS_VERSION = "2026-10-11.v1";
export const FACE_PROCESSING_CONSENT_VERSION = "2026-10-11.v1";

// ─── Option vocabularies (ids are stable API values; labels live in steps.ts) ───
export const GOALS = ["clear_skin", "brow_definition", "smile", "hair", "grooming", "overall"] as const;
export const FOCUS_AREAS = ["skin", "brows", "eye_area", "hair", "facial_hair", "smile", "jaw_presentation"] as const;
export const TIMELINES = ["week", "30d", "90d", "flexible"] as const;
export const BUDGETS = ["none", "low", "moderate", "flexible"] as const;

export const SKIN_PREFERENCES = ["routine", "clarity", "uneven_tone", "under_eye", "none"] as const;
export const BROW_PREFERENCES = ["shape", "grooming", "fuller", "none"] as const;
export const EYE_PREFERENCES = ["rested", "grooming", "none"] as const;
export const HAIR_PREFERENCES = ["cut", "volume", "hairline_framing", "routine", "none"] as const;
export const FACIAL_HAIR_RELEVANCE = ["yes", "no"] as const;
export const FACIAL_HAIR_PREFERENCES = ["shape", "fuller", "stubble", "clean_shaven"] as const;
export const SMILE_PREFERENCES = ["hygiene", "whitening_info", "alignment_consult", "none"] as const;
export const JAW_PREFERENCES = ["leaner", "grooming", "framing", "photo_presentation", "none"] as const;

export const DAILY_MINUTES = ["5", "15", "30"] as const;
export const AVOID_OPTIONS = ["fragrance", "strong_actives", "animal_derived", "new_products", "none"] as const;

export const CONSTRAINT_NOTE_MAX = 280;
export const MAX_FOCUS_AREAS = 4;

export type Goal = (typeof GOALS)[number];
export type FocusArea = (typeof FOCUS_AREAS)[number];
export type Timeline = (typeof TIMELINES)[number];
export type Budget = (typeof BUDGETS)[number];
export type DailyMinutes = (typeof DAILY_MINUTES)[number];
export type AvoidOption = (typeof AVOID_OPTIONS)[number];

/** Multi-select where "none" can only stand alone. Empty array means the step was skipped. */
function exclusiveNoneList<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .array(z.enum(values))
    .max(values.length)
    .refine((list) => new Set(list).size === list.length, { message: "Each option can only be chosen once." })
    .refine((list) => !(list.includes("none" as T[number]) && list.length > 1), {
      message: "“Nothing specific” can't be combined with other options.",
    });
}

export const preferencesSchema = z.object({
  skin: exclusiveNoneList(SKIN_PREFERENCES).default([]),
  brows: exclusiveNoneList(BROW_PREFERENCES).default([]),
  eyes: exclusiveNoneList(EYE_PREFERENCES).default([]),
  hair: exclusiveNoneList(HAIR_PREFERENCES).default([]),
  facialHairRelevant: z.enum(FACIAL_HAIR_RELEVANCE).optional(),
  facialHair: z.array(z.enum(FACIAL_HAIR_PREFERENCES)).max(FACIAL_HAIR_PREFERENCES.length).default([]),
  smile: exclusiveNoneList(SMILE_PREFERENCES).default([]),
  jaw: exclusiveNoneList(JAW_PREFERENCES).default([]),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const noteSchema = z
  .string()
  .trim()
  .max(CONSTRAINT_NOTE_MAX, { message: `Keep the note under ${CONSTRAINT_NOTE_MAX} characters.` });

export const constraintsSchema = z.object({
  dailyMinutes: z.enum(DAILY_MINUTES, { message: "Choose how much time you have." }),
  avoid: exclusiveNoneList(AVOID_OPTIONS).default([]),
  note: noteSchema.optional(),
});

export type Constraints = z.infer<typeof constraintsSchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { message: "That email address is too long." })
  .pipe(z.email({ message: "Enter an email address like name@example.com." }));

// ─── Per-step schemas (one form per step) ───
export const stepSchemas = {
  start: z.object({
    adultConfirmed: z.literal(true, { message: "Confirm you're 18 or older to continue." }),
  }),
  goals: z.object({
    goals: z.array(z.enum(GOALS)).length(1, { message: "Pick the one that matters most right now." }),
  }),
  focus: z.object({
    focusAreas: z
      .array(z.enum(FOCUS_AREAS))
      .min(1, { message: "Choose at least one area." })
      .max(MAX_FOCUS_AREAS, { message: `Choose up to ${MAX_FOCUS_AREAS} areas.` })
      .refine((list) => new Set(list).size === list.length),
  }),
  timeline: z.object({ timeline: z.enum(TIMELINES, { message: "Choose a timeline." }) }),
  budget: z.object({ budget: z.enum(BUDGETS, { message: "Choose a budget." }) }),
  skin: z.object({ skin: preferencesSchema.shape.skin }),
  brows: z.object({ brows: preferencesSchema.shape.brows }),
  eyes: z.object({ eyes: preferencesSchema.shape.eyes }),
  hair: z
    .object({
      hair: preferencesSchema.shape.hair,
      facialHairRelevant: preferencesSchema.shape.facialHairRelevant,
      facialHair: preferencesSchema.shape.facialHair,
    })
    .refine((value) => value.facialHairRelevant === "yes" || value.facialHair.length === 0, {
      message: "Facial-hair preferences only apply when facial hair is relevant to you.",
      path: ["facialHair"],
    }),
  smile: z.object({ smile: preferencesSchema.shape.smile }),
  jaw: z.object({ jaw: preferencesSchema.shape.jaw }),
  constraints: constraintsSchema,
  "photo-guide": z.object({
    photoGuideAcknowledged: z.literal(true, { message: "Read the photo guide to continue." }),
  }),
  photos: z.object({
    frontPhotoReady: z.literal(true, { message: "Add a front-facing photo to continue." }),
    photoOwnershipConfirmed: z.literal(true, { message: "Confirm these are photos of you." }),
  }),
  delivery: z.object({
    email: emailSchema,
    faceProcessingConsent: z.literal(true, { message: "We need your consent to process your photos." }),
    termsAccepted: z.literal(true, { message: "Accept the Terms and Refund Policy to continue." }),
    marketingOptIn: z.boolean(),
  }),
  review: z.object({}),
} as const;

export type StepId = keyof typeof stepSchemas;

/**
 * The answers sent to the server (no photos). Mirrors the spec's OnboardingAnswers,
 * with constraints structured instead of free text.
 */
export const onboardingAnswersSchema = z.object({
  adultConfirmed: z.literal(true),
  goals: stepSchemas.goals.shape.goals,
  focusAreas: stepSchemas.focus.shape.focusAreas,
  timeline: z.enum(TIMELINES),
  budget: z.enum(BUDGETS),
  preferences: preferencesSchema,
  constraints: constraintsSchema,
  email: emailSchema,
  faceProcessingConsentVersion: z.literal(FACE_PROCESSING_CONSENT_VERSION),
  termsVersion: z.literal(TERMS_VERSION),
  marketingOptIn: z.boolean(),
});

export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;

/** The subset of answers needed to build a report (what /api/fulfill receives). */
export const reportInputSchema = onboardingAnswersSchema.pick({
  goals: true,
  focusAreas: true,
  timeline: true,
  budget: true,
  preferences: true,
  constraints: true,
});

export type ReportInput = z.infer<typeof reportInputSchema>;
