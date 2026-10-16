import { describe, expect, it } from "vitest";
import { evaluateVerdict } from "@/server/ai/identity-qc";
import { IDENTITY_QC_INSTRUCTIONS, OWNER_PROMPT, VISION_INSTRUCTIONS } from "@/server/ai/prompts";

describe("the owner's glow-up prompt", () => {
  it("is sent exactly as the owner wrote it", () => {
    expect(OWNER_PROMPT).toBe(
      `Analyze my appearance from the attached photo like an aesthetic/beauty consultant and looksmaxxing coach. Identify the highest-impact changes that could make me look as attractive as possible, including hair cut/style/color, brows, eye area, skin, facial hair, jawline, cheekbones, and overall facial balance. Be specific to my actual features rather than giving generic advice.

Then generate a realistic “after” version of this exact photo showing your recommended glow-up at its full potential. Keep me recognizably the same person: a friend should still know it is me at a glance. Keep the same pose, camera angle, expression, lighting, clothing, and background as much as possible.

Make the change strong and obvious at first glance, not a subtle touch-up: show the best version of me that is realistically possible. Go as far as possible on:
- Jawline: a sharp, well-defined jawline and chin, with clean angles and no soft tissue under the chin or along the jaw, as at a lean body-fat level.
- Eyes: hunter eyes, with straighter, lower-set, fuller brows, less exposed upper eyelid, no under-eye bags or dark circles, and a calm, intense, confident gaze.
- Face: leaner, with more visible cheekbones and a more defined mid-face.
- Skin: clear, even and healthy, with natural texture.
- Hair and facial hair: the cut, color, volume, and beard or stubble shape that make my face look sharpest.
It must still look like a real photo, not a cartoon, a beauty filter, or a different person. Do not make my nose smaller, lips bigger, eyes larger, or skin plastic.

For the hair, choose the cut, color, part, volume, and face-framing that best complement my individual proportions. For makeup, optimize brow shape, eyeliner/lashes, blush/contour placement, lip definition, and complexion while keeping it natural.

Generate a before/after comparison with photo annotations explaining every change, similar to a professional beauty consultation. In the written analysis, say how each change can be achieved (grooming, styling, skin care, losing body fat, or a professional consultation) and be honest when a change depends mostly on bone structure.`,
    );
  });
});

describe("analysis and identity check instructions", () => {
  it("keeps the structured analysis to visible cues, never scores", () => {
    expect(VISION_INSTRUCTIONS).toMatch(/never estimate attractiveness, never score or rank/);
    expect(VISION_INSTRUCTIONS).not.toMatch(/haircut:/);
  });

  it("judges the after in an annotated comparison, allows a sharper jaw and hunter eyes, and fails a smaller nose", () => {
    expect(IDENTITY_QC_INSTRUCTIONS).toMatch(/before\/after comparison with annotations/);
    expect(IDENTITY_QC_INSTRUCTIONS).toMatch(/judge the AFTER version/);
    expect(IDENTITY_QC_INSTRUCTIONS).toMatch(/hair colour, brows, facial hair, skin and complexion, the eye area and natural makeup/);
    expect(IDENTITY_QC_INSTRUCTIONS).toMatch(/sharper, more defined jawline and chin/);
    expect(IDENTITY_QC_INSTRUCTIONS).toMatch(/"hunter eyes"/);
    expect(IDENTITY_QC_INSTRUCTIONS).not.toMatch(/face clearly thinner or narrower/);
    expect(IDENTITY_QC_INSTRUCTIONS).toMatch(/is the nose smaller, are the eyes larger/);
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
