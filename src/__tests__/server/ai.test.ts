import { describe, expect, it } from "vitest";
import { evaluateVerdict } from "@/server/ai/identity-qc";
import { IDENTITY_QC_INSTRUCTIONS, OWNER_PROMPT, VISION_INSTRUCTIONS } from "@/server/ai/prompts";

describe("the owner's glow-up prompt", () => {
  it("is sent exactly as the owner wrote it", () => {
    expect(OWNER_PROMPT).toBe(
      `Analyze my appearance from the attached photo like an aesthetic/beauty consultant. Identify the highest-impact changes that could make me look more polished and harmonious, including hair cut/style/color, brows, eye makeup, skin/makeup placement, lips, and overall facial balance. Be specific to my actual features rather than giving generic advice.

Then generate a realistic “after” version of this exact photo showing your recommended glow-up. Keep me recognizably the same person and preserve my facial anatomy unless you specifically recommend a subtle structural change. Keep the same pose, camera angle, expression, lighting, clothing, and background as much as possible.

Make the changes refined and realistic, not an exaggerated beauty filter. Prioritize high-impact, low-risk styling changes. Do not automatically make my face thinner, nose smaller, lips bigger, eyes larger, or skin unrealistically perfect.

For the hair, choose the cut, color, part, volume, and face-framing that best complement my individual proportions. For makeup, optimize brow shape, eyeliner/lashes, blush/contour placement, lip definition, and complexion while keeping it natural.

Generate a before/after comparison with photo annotations explaining every change, similar to a professional beauty consultation.`,
    );
  });
});

describe("analysis and identity check instructions", () => {
  it("keeps the structured analysis to visible cues, never scores", () => {
    expect(VISION_INSTRUCTIONS).toMatch(/never estimate attractiveness, never score or rank/);
    expect(VISION_INSTRUCTIONS).not.toMatch(/haircut:/);
  });

  it("judges the after in an annotated comparison, allows makeup and hair colour, and fails a thinner face", () => {
    expect(IDENTITY_QC_INSTRUCTIONS).toMatch(/before\/after comparison with annotations/);
    expect(IDENTITY_QC_INSTRUCTIONS).toMatch(/judge the AFTER version/);
    expect(IDENTITY_QC_INSTRUCTIONS).toMatch(/hair colour, brows, facial hair, skin and complexion, the eye area and natural makeup/);
    expect(IDENTITY_QC_INSTRUCTIONS).toMatch(/face clearly thinner or narrower/);
  });
});

describe("identity quality gate", () => {
  it("fails on any lost likeness, added feature, broken feature or excluded change", () => {
    const ok = { comparison: true, sameAdultPersonLikely: true, addedPeopleOrFeatures: false, brokenEyesOrTeeth: false, excludedChanges: false, notes: "" };
    expect(evaluateVerdict(ok)).toEqual({ pass: true, reasons: [], comparison: true });
    expect(evaluateVerdict({ ...ok, sameAdultPersonLikely: false }).pass).toBe(false);
    expect(evaluateVerdict({ ...ok, excludedChanges: true }).reasons).toEqual(["excluded_changes"]);
  });
});
