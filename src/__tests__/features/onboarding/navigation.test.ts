import { describe, expect, it } from "vitest";
import {
  ONBOARDING_SLUGS,
  STEP_ORDER,
  isStepComplete,
  nextStep,
  previousStep,
  progressFor,
  resolveAccessibleStep,
  stepFromPath,
  stepFromSlug,
  type FlowSnapshot,
} from "@/features/onboarding/navigation";
import { STEPS } from "@/features/onboarding/steps";

const emptyFlow: FlowSnapshot = {
  adultConfirmed: false,
  goals: [],
  focusAreas: [],
  preferences: {},
  photoGuideAcknowledged: false,
  frontPhotoReady: false,
  photoOwnershipConfirmed: false,
  faceProcessingConsent: false,
  termsAccepted: false,
  marketingOptIn: false,
  skipped: [],
};

const completeFlow: FlowSnapshot = {
  ...emptyFlow,
  adultConfirmed: true,
  goals: ["hair"],
  focusAreas: ["hair"],
  timeline: "90d",
  budget: "none",
  preferences: { hair: ["cut"], facialHairRelevant: "no", facialHair: [] },
  skipped: ["skin", "brows", "eyes", "smile", "jaw"],
  constraints: { dailyMinutes: "5", avoid: [] },
  photoGuideAcknowledged: true,
  frontPhotoReady: true,
  photoOwnershipConfirmed: true,
  email: "a@b.co",
  faceProcessingConsent: true,
  termsAccepted: true,
};

describe("onboarding navigation", () => {
  it("defines a short intake: no aesthetic questions, the photo decides", () => {
    expect(STEPS.map((s) => s.path)).toEqual([
      "/start",
      "/onboarding/photo-guide",
      "/onboarding/photos",
      "/onboarding/constraints",
      "/onboarding/delivery",
      "/onboarding/review",
    ]);
    expect(STEPS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ONBOARDING_SLUGS).toHaveLength(5);
    expect(STEPS.filter((s) => s.skippable)).toEqual([]);
  });

  it("moves forward and back in order", () => {
    expect(nextStep("start")?.id).toBe("photo-guide");
    expect(nextStep("review")).toBeUndefined();
    expect(previousStep("photo-guide")?.id).toBe("start");
    expect(previousStep("start")).toBeUndefined();
    expect(progressFor("photos")).toEqual({ current: 3, total: 6, ratio: 3 / 6 });
  });

  it("resolves paths and slugs", () => {
    expect(stepFromPath("/onboarding/photos/")?.id).toBe("photos");
    expect(stepFromSlug("photo-guide")?.id).toBe("photo-guide");
    expect(stepFromSlug("start")).toBeUndefined();
    expect(stepFromSlug("../api")).toBeUndefined();
  });

  it("sends deep links back to the first incomplete step", () => {
    expect(resolveAccessibleStep("review", emptyFlow).id).toBe("start");
    const started: FlowSnapshot = { ...emptyFlow, adultConfirmed: true };
    expect(resolveAccessibleStep("delivery", started).id).toBe("photo-guide");
    expect(resolveAccessibleStep("review", completeFlow).id).toBe("review");
  });

  it("sends a reloaded review page back to the photo step when photos are gone", () => {
    const afterReload = { ...completeFlow, frontPhotoReady: false, photoOwnershipConfirmed: false };
    expect(resolveAccessibleStep("review", afterReload).id).toBe("photos");
  });

  it("treats the optional 'avoid' step as complete with nothing chosen", () => {
    expect(isStepComplete("constraints", { ...emptyFlow, constraints: { avoid: [] } })).toBe(true);
  });

  it("walks every step of a complete flow", () => {
    for (const id of STEP_ORDER) expect(isStepComplete(id, completeFlow)).toBe(true);
  });
});
