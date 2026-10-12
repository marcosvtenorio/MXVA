import { describe, expect, it } from "vitest";
import { reportInputSchema } from "@/features/onboarding/schema";
import { deriveReportInput } from "@/features/report/derive";
import { buildImageEditInstructions, planReport } from "@/features/report/planner";
import type { VisualObservations } from "@/features/report/schema";

const base: VisualObservations = {
  imageQuality: { usable: true, faceCount: 1, lightingLimitations: "" },
  possibleMinor: false,
  glowUp: {
    haircut: "fade_textured_top",
    facialHair: "sharpen_lines",
    skin: { blemishes: true, redness: false, unevenTone: true, shine: false },
    browsNeedGrooming: true,
    eyesLookTired: true,
    teethVisible: true,
    jawSoftTissue: "some_fullness",
  },
  observations: [],
  cannotAssess: [],
};
const constraints = { dailyMinutes: "30" as const, avoid: [] };

describe("decisions from the photo", () => {
  it("turns every visible lever on: a full glow-up, short and long term, no budget cap", () => {
    const input = deriveReportInput(base, constraints);
    expect(reportInputSchema.parse(input)).toEqual(input);
    expect(input).toMatchObject({ goals: ["overall"], timeline: "90d", budget: "flexible", haircut: "fade_textured_top" });
    expect(new Set(input.focusAreas)).toEqual(new Set(["skin", "hair", "jaw_presentation", "brows", "eye_area", "facial_hair", "smile"]));
    expect(input.preferences.jaw).toContain("leaner");

    const edits = buildImageEditInstructions(input).join("\n");
    expect(edits).toMatch(/leaner, athletic body-fat level/);
    expect(edits).toMatch(/mid fade with a textured top/);
    expect(edits).toMatch(/eyebrows/);
    expect(edits).toMatch(/barber/);
    expect(edits).toMatch(/well rested/);

    const report = planReport(input, base, { simulated: true });
    expect(report.recommendations.length).toBeGreaterThanOrEqual(8);
    expect(report.recommendations.map((rec) => rec.title)).toContain("Lean out to show the jaw you already have");
  });

  it("leaves alone what already works", () => {
    const input = deriveReportInput(
      {
        ...base,
        glowUp: {
          haircut: "tidy_current_length",
          facialHair: "stay_clean_shaven",
          skin: { blemishes: false, redness: false, unevenTone: false, shine: false },
          browsNeedGrooming: false,
          eyesLookTired: false,
          teethVisible: false,
          jawSoftTissue: "defined",
        },
      },
      { dailyMinutes: "30", avoid: ["fragrance"] },
    );
    expect(input.focusAreas).toEqual(["skin", "hair", "jaw_presentation"]);
    expect(input.preferences.jaw).not.toContain("leaner");
    expect(input.constraints.avoid).toEqual(["fragrance"]);
    const edits = buildImageEditInstructions(input).join("\n");
    expect(edits).not.toMatch(/body-fat|eyebrows|barber|The haircut to show/);
  });
});
