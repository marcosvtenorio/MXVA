import { describe, expect, it } from "vitest";
import { reportInputSchema } from "@/features/onboarding/schema";
import { deriveReportInput } from "@/features/report/derive";
import { planReport } from "@/features/report/planner";
import type { VisualObservations } from "@/features/report/schema";

const base: VisualObservations = {
  imageQuality: { usable: true, faceCount: 1, lightingLimitations: "" },
  possibleMinor: false,
  glowUp: {
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
    expect(input).toMatchObject({ goals: ["overall"], timeline: "90d", budget: "flexible", hairChange: true });
    expect(new Set(input.focusAreas)).toEqual(new Set(["skin", "hair", "jaw_presentation", "brows", "eye_area", "facial_hair", "smile"]));
    expect(input.preferences.hair).toEqual(["cut", "routine"]);

    const report = planReport(input, base, { simulated: true });
    expect(report.recommendations.length).toBeGreaterThanOrEqual(8);
    // The concept's new cut leads the plan, pointing to the concept image.
    expect(report.recommendations[0]).toMatchObject({ id: "hair-cut-for-your-face", title: "Get the cut from your concept" });
    expect(report.recommendations[0]?.suggestion).toMatch(/^Show your barber or stylist the after photo in your concept image/);
  });

  it("leaves alone what already works", () => {
    const input = deriveReportInput(
      {
        ...base,
        glowUp: {
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
  });
});
