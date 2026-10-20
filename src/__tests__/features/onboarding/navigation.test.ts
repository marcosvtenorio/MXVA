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
    // The landing's Start opens the photo step, which also holds the photo guide.
    expect(STEPS.map((s) => s.path)).toEqual(["/onboarding/photos", "/onboarding/constraints", "/onboarding/delivery", "/onboarding/review"]);
    expect(STEPS.map((s) => s.number)).toEqual([1, 2, 3, 4]);
    expect(ONBOARDING_SLUGS).toHaveLength(4);
    expect(STEPS.filter((s) => s.skippable)).toEqual([]);
  });

  it("moves forward and back in order", () => {
    expect(nextStep("photos")?.id).toBe("constraints");
    expect(nextStep("review")).toBeUndefined();
    expect(previousStep("constraints")?.id).toBe("photos");
    expect(previousStep("photos")).toBeUndefined();
    expect(progressFor("delivery")).toEqual({ current: 3, total: 4, ratio: 3 / 4 });
  });

  it("resolves paths and slugs", () => {
    expect(stepFromPath("/onboarding/photos/")?.id).toBe("photos");
    expect(stepFromSlug("photo-guide")).toBeUndefined();
    expect(stepFromSlug("start")).toBeUndefined();
    expect(stepFromSlug("../api")).toBeUndefined();
  });

  it("sends deep links back to the first incomplete step", () => {
    expect(resolveAccessibleStep("review", emptyFlow).id).toBe("photos");
    const photoIn: FlowSnapshot = { ...emptyFlow, frontPhotoReady: true, photoOwnershipConfirmed: true, constraints: { avoid: [] } };
    expect(resolveAccessibleStep("review", photoIn).id).toBe("delivery");
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
