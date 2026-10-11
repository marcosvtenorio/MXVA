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
  it("defines exactly 16 steps with the canonical routes", () => {
    expect(STEPS).toHaveLength(16);
    expect(STEPS.map((s) => s.path)).toEqual([
      "/start",
      "/onboarding/goals",
      "/onboarding/focus",
      "/onboarding/timeline",
      "/onboarding/budget",
      "/onboarding/skin",
      "/onboarding/brows",
      "/onboarding/eyes",
      "/onboarding/hair",
      "/onboarding/smile",
      "/onboarding/jaw",
      "/onboarding/constraints",
      "/onboarding/photo-guide",
      "/onboarding/photos",
      "/onboarding/delivery",
      "/onboarding/review",
    ]);
    expect(STEPS.map((s) => s.number)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(ONBOARDING_SLUGS).toHaveLength(15);
  });

  it("marks only steps 06–11 as skippable", () => {
    expect(STEPS.filter((s) => s.skippable).map((s) => s.number)).toEqual([6, 7, 8, 9, 10, 11]);
  });

  it("moves forward and back in order", () => {
    expect(nextStep("start")?.id).toBe("goals");
    expect(nextStep("review")).toBeUndefined();
    expect(previousStep("goals")?.id).toBe("start");
    expect(previousStep("start")).toBeUndefined();
    expect(progressFor("photos")).toEqual({ current: 14, total: 16, ratio: 14 / 16 });
  });

  it("resolves paths and slugs", () => {
    expect(stepFromPath("/onboarding/photos/")?.id).toBe("photos");
    expect(stepFromSlug("photo-guide")?.id).toBe("photo-guide");
    expect(stepFromSlug("start")).toBeUndefined();
    expect(stepFromSlug("../api")).toBeUndefined();
  });

  it("sends deep links back to the first incomplete step", () => {
    expect(resolveAccessibleStep("review", emptyFlow).id).toBe("start");
    const partial: FlowSnapshot = { ...emptyFlow, adultConfirmed: true, goals: ["smile"] };
    expect(resolveAccessibleStep("photos", partial).id).toBe("focus");
    expect(resolveAccessibleStep("review", completeFlow).id).toBe("review");
  });

  it("sends a reloaded review page back to the photo step when photos are gone", () => {
    const afterReload = { ...completeFlow, frontPhotoReady: false, photoOwnershipConfirmed: false };
    expect(resolveAccessibleStep("review", afterReload).id).toBe("photos");
  });

  it("treats an untouched preference step as incomplete until answered or skipped", () => {
    expect(isStepComplete("brows", emptyFlow)).toBe(false);
    expect(isStepComplete("brows", { ...emptyFlow, skipped: ["brows"] })).toBe(true);
    expect(isStepComplete("brows", { ...emptyFlow, preferences: { brows: ["shape"] } })).toBe(true);
  });

  it("walks every step of a complete flow", () => {
    for (const id of STEP_ORDER) expect(isStepComplete(id, completeFlow)).toBe(true);
  });
});
