import { describe, expect, it } from "vitest";
import { evaluateVerdict } from "@/server/ai/identity-qc";
import { editSize } from "@/server/ai/image-edit-adapter";
import { buildImageEditPrompt } from "@/server/ai/prompts";
import type { ReportInput } from "@/features/onboarding/schema";

const input: ReportInput = {
  goals: ["grooming"],
  focusAreas: ["brows", "facial_hair"],
  timeline: "30d",
  budget: "low",
  preferences: { skin: [], brows: ["shape"], eyes: [], hair: [], facialHairRelevant: "yes", facialHair: ["shape"], smile: [], jaw: [] },
  constraints: { dailyMinutes: "15", avoid: [] },
};

describe("image edit prompt", () => {
  it("always preserves identity and lists only requested changes", () => {
    const prompt = buildImageEditPrompt(input, { strict: false });
    expect(prompt).toMatch(/Identity is non-negotiable/);
    expect(prompt).toMatch(/skin tone, apparent age and ethnicity/);
    expect(prompt).toMatch(/eyebrows/i);
    expect(prompt).toMatch(/facial hair/i);
    // Only what was asked for: no haircut, no leaner face unless chosen.
    expect(prompt).not.toMatch(/haircut that suits/);
    expect(prompt).not.toMatch(/body-fat/);
    expect(prompt).not.toMatch(/STRICT MODE/);
    expect(buildImageEditPrompt(input, { strict: true })).toMatch(/STRICT MODE/);
  });

  it("shows a leaner face only when the buyer asked for it, and never changes bone", () => {
    const leaner = buildImageEditPrompt({ ...input, preferences: { ...input.preferences, jaw: ["leaner"] } }, { strict: false });
    expect(leaner).toMatch(/leaner, athletic body-fat level/);
    expect(leaner).toMatch(/same face width at the bones, jaw angle, chin projection/);
  });
});

describe("identity quality gate", () => {
  it("fails on any lost likeness, added feature, broken feature or excluded change", () => {
    const ok = { sameAdultPersonLikely: true, addedPeopleOrFeatures: false, brokenEyesOrTeeth: false, excludedChanges: false, notes: "" };
    expect(evaluateVerdict(ok)).toEqual({ pass: true, reasons: [] });
    expect(evaluateVerdict({ ...ok, sameAdultPersonLikely: false }).pass).toBe(false);
    expect(evaluateVerdict({ ...ok, excludedChanges: true }).reasons).toEqual(["excluded_changes"]);
  });
});

describe("edit size", () => {
  it("keeps the aspect ratio in multiples of 16", () => {
    expect(editSize(1536, 2048)).toBe("1152x1536");
    expect(editSize(2048, 1536)).toBe("1536x1152");
  });
});
