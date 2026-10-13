import type { Constraints, FocusArea, Preferences, ReportInput } from "@/features/onboarding/schema";
import type { VisualObservations } from "./schema";

/**
 * Turns the photo analysis into the planner's input. The buyer doesn't pick aesthetic goals:
 * they want the full glow-up, so every lever the photo supports is on, short and long term,
 * whatever it costs (they decide what to buy). Only their constraints come from them.
 */
export function deriveReportInput(observations: VisualObservations, constraints: Constraints): ReportInput {
  const g = observations.glowUp;
  const beard = g.facialHair === "sharpen_lines" || g.facialHair === "even_stubble";

  const preferences: Preferences = {
    skin: [
      "routine",
      ...(g.skin.blemishes || g.skin.redness ? (["clarity"] as const) : []),
      ...(g.skin.unevenTone ? (["uneven_tone"] as const) : []),
      ...(g.eyesLookTired ? (["under_eye"] as const) : []),
    ],
    brows: g.browsNeedGrooming ? ["shape"] : [],
    eyes: g.eyesLookTired ? ["rested"] : [],
    hair: ["cut", "routine"],
    facialHairRelevant: g.facialHair === "stay_clean_shaven" ? "no" : "yes",
    facialHair:
      g.facialHair === "sharpen_lines" ? ["shape"] : g.facialHair === "even_stubble" ? ["stubble"] : g.facialHair === "clean_shave" ? ["clean_shaven"] : [],
    smile: g.teethVisible ? ["hygiene"] : [],
    jaw: [
      ...(g.jawSoftTissue === "defined" ? [] : (["leaner"] as const)),
      ...(beard ? (["grooming"] as const) : []),
      "photo_presentation",
    ],
  };

  const focusAreas: FocusArea[] = ["skin", "hair", "jaw_presentation"];
  if (g.browsNeedGrooming) focusAreas.push("brows");
  if (g.eyesLookTired) focusAreas.push("eye_area");
  if (g.facialHair !== "stay_clean_shaven") focusAreas.push("facial_hair");
  if (g.teethVisible) focusAreas.push("smile");

  return {
    goals: ["overall"],
    focusAreas,
    timeline: "90d",
    budget: "flexible",
    preferences,
    constraints,
    // The owner's prompt always restyles the hair (cut, colour, part, volume), so the plan leads with it.
    hairChange: true,
  };
}
