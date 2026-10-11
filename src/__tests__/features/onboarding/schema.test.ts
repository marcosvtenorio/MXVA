import { describe, expect, it } from "vitest";
import {
  FACE_PROCESSING_CONSENT_VERSION,
  TERMS_VERSION,
  onboardingAnswersSchema,
  stepSchemas,
} from "@/features/onboarding/schema";

const validAnswers = {
  adultConfirmed: true,
  goals: ["clear_skin"],
  focusAreas: ["skin", "brows"],
  timeline: "30d",
  budget: "low",
  preferences: { skin: ["routine"], brows: [], eyes: [], hair: [], facialHair: [], smile: [], jaw: [] },
  constraints: { dailyMinutes: "15", avoid: ["fragrance"] },
  email: "  Person@Example.com ",
  faceProcessingConsentVersion: FACE_PROCESSING_CONSENT_VERSION,
  termsVersion: TERMS_VERSION,
  marketingOptIn: false,
};

describe("onboarding schemas", () => {
  it("accepts a complete answer set and normalises the email", () => {
    const parsed = onboardingAnswersSchema.parse(validAnswers);
    expect(parsed.email).toBe("person@example.com");
  });

  it("requires adult confirmation as literal true", () => {
    expect(stepSchemas.start.safeParse({ adultConfirmed: false }).success).toBe(false);
    expect(onboardingAnswersSchema.safeParse({ ...validAnswers, adultConfirmed: false }).success).toBe(false);
  });

  it("takes exactly one primary goal", () => {
    expect(stepSchemas.goals.safeParse({ goals: [] }).success).toBe(false);
    expect(stepSchemas.goals.safeParse({ goals: ["smile"] }).success).toBe(true);
    expect(stepSchemas.goals.safeParse({ goals: ["smile", "hair"] }).success).toBe(false);
  });

  it("limits focus areas to 1–4 known values without duplicates", () => {
    expect(stepSchemas.focus.safeParse({ focusAreas: [] }).success).toBe(false);
    expect(stepSchemas.focus.safeParse({ focusAreas: ["skin", "brows", "hair", "smile"] }).success).toBe(true);
    expect(stepSchemas.focus.safeParse({ focusAreas: ["skin", "brows", "hair", "smile", "eye_area"] }).success).toBe(false);
    expect(stepSchemas.focus.safeParse({ focusAreas: ["skin", "skin"] }).success).toBe(false);
    expect(stepSchemas.focus.safeParse({ focusAreas: ["attractiveness"] }).success).toBe(false);
  });

  it("keeps “nothing specific” exclusive", () => {
    expect(stepSchemas.skin.safeParse({ skin: ["none"] }).success).toBe(true);
    expect(stepSchemas.skin.safeParse({ skin: ["none", "clarity"] }).success).toBe(false);
  });

  it("only allows facial-hair preferences when facial hair is relevant", () => {
    expect(stepSchemas.hair.safeParse({ hair: ["cut"], facialHairRelevant: "yes", facialHair: ["stubble"] }).success).toBe(true);
    expect(stepSchemas.hair.safeParse({ hair: ["cut"], facialHairRelevant: "no", facialHair: ["stubble"] }).success).toBe(false);
  });

  it("caps the free-text note and requires a daily time budget", () => {
    expect(stepSchemas.constraints.safeParse({ avoid: [] }).success).toBe(false);
    expect(stepSchemas.constraints.safeParse({ dailyMinutes: "5", avoid: [], note: "x".repeat(281) }).success).toBe(false);
    expect(stepSchemas.constraints.safeParse({ dailyMinutes: "5", avoid: [], note: "Short note" }).success).toBe(true);
  });

  it("requires explicit consent and terms for delivery, marketing stays optional", () => {
    const base = { email: "a@b.co", faceProcessingConsent: true, termsAccepted: true, marketingOptIn: false };
    expect(stepSchemas.delivery.safeParse(base).success).toBe(true);
    expect(stepSchemas.delivery.safeParse({ ...base, faceProcessingConsent: false }).success).toBe(false);
    expect(stepSchemas.delivery.safeParse({ ...base, termsAccepted: false }).success).toBe(false);
    expect(stepSchemas.delivery.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects outdated consent or terms versions", () => {
    expect(onboardingAnswersSchema.safeParse({ ...validAnswers, termsVersion: "old" }).success).toBe(false);
    expect(onboardingAnswersSchema.safeParse({ ...validAnswers, faceProcessingConsentVersion: "old" }).success).toBe(false);
  });
});
