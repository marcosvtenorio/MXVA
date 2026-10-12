import { describe, expect, it } from "vitest";
import {
  AVOID_OPTIONS,
  BROW_PREFERENCES,
  BUDGETS,
  DAILY_MINUTES,
  EYE_PREFERENCES,
  FACIAL_HAIR_PREFERENCES,
  FOCUS_AREAS,
  GOALS,
  HAIR_PREFERENCES,
  JAW_PREFERENCES,
  SKIN_PREFERENCES,
  SMILE_PREFERENCES,
  TIMELINES,
  reportInputSchema,
  type ReportInput,
} from "@/features/onboarding/schema";
import { BUDGET_ORDER, LIBRARY } from "@/features/report/library";
import { buildImageEditInstructions, planReport } from "@/features/report/planner";
import { EVIDENCE_REGISTRY, hasSource } from "@/features/report/references";
import type { VisualObservations } from "@/features/report/schema";

// Deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

function pickSome<T>(random: () => number, values: readonly T[], max: number): T[] {
  const out = values.filter(() => random() < 0.35).slice(0, max);
  return out;
}

function prefs<T extends string>(random: () => number, values: readonly T[]): T[] {
  if (random() < 0.3) return [];
  if (random() < 0.15 && values.includes("none" as T)) return ["none" as T];
  return pickSome(random, values.filter((v) => v !== "none"), values.length);
}

function randomInput(seed: number): ReportInput {
  const random = rng(seed);
  const pick = <T,>(values: readonly T[]) => values[Math.floor(random() * values.length)]!;
  const focus = pickSome(random, FOCUS_AREAS, 4);
  const facialHairRelevant = random() < 0.5 ? "yes" : "no";
  return reportInputSchema.parse({
    goals: [pick(GOALS)],
    focusAreas: focus.length > 0 ? focus : [pick(FOCUS_AREAS)],
    timeline: pick(TIMELINES),
    budget: pick(BUDGETS),
    preferences: {
      skin: prefs(random, SKIN_PREFERENCES),
      brows: prefs(random, BROW_PREFERENCES),
      eyes: prefs(random, EYE_PREFERENCES),
      hair: prefs(random, HAIR_PREFERENCES),
      facialHairRelevant,
      facialHair: facialHairRelevant === "yes" ? pickSome(random, FACIAL_HAIR_PREFERENCES, 4) : [],
      smile: prefs(random, SMILE_PREFERENCES),
      jaw: prefs(random, JAW_PREFERENCES),
    },
    constraints: { dailyMinutes: pick(DAILY_MINUTES), avoid: prefs(random, AVOID_OPTIONS) },
  });
}

const observations: VisualObservations = {
  imageQuality: { usable: true, faceCount: 1, lightingLimitations: "" },
  possibleMinor: false,
  observations: [{ area: "skin", observation: "Skin looks even in this light.", confidence: "medium" }],
  cannotAssess: [],
};

const FORBIDDEN = /\b(attractive(ness)?|ugly|unattractive|defect|flaw|cure[ds]?|guarantee[ds]?|hunter eyes|mewing works|score|rating|supplement|medication|diet)\b/i;

describe("evidence registry", () => {
  it("has unique ids and https URLs, and every template cites only registered ids", () => {
    const ids = EVIDENCE_REGISTRY.sources.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of LIBRARY) for (const id of template.sourceIds) expect(hasSource(id), `${template.id} → ${id}`).toBe(true);
  });

  it("labels unsourced advice as styling opinion", () => {
    for (const template of LIBRARY) {
      if (template.sourceIds.length === 0) expect(template.evidenceLevel, template.id).toBe("styling_opinion");
    }
  });

  it("keeps forbidden claims out of every template", () => {
    for (const template of LIBRARY) {
      const text = [template.title, template.suggestion, template.reason, template.uncertainty].join(" ");
      expect(text, template.id).not.toMatch(FORBIDDEN);
    }
  });
});

describe("recommendation planner", () => {
  it("always produces a valid 5–8 item report that honours constraints (400 random buyers)", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const input = randomInput(seed);
      const report = planReport(input, observations, { simulated: true, now: new Date("2026-10-11T12:00:00Z") });
      expect(report.recommendations.length).toBeGreaterThanOrEqual(5);
      expect(report.recommendations.length).toBeLessThanOrEqual(8);
      const chosen = report.recommendations.map((rec) => LIBRARY.find((t) => t.id === rec.id)!);
      for (const template of chosen) {
        expect(template.excludedBy?.some((option) => input.constraints.avoid.includes(option)) ?? false).toBe(false);
        if (template.minBudget) expect(BUDGET_ORDER[input.budget]).toBeGreaterThanOrEqual(BUDGET_ORDER[template.minBudget]);
        if (input.preferences.facialHairRelevant === "no") expect(template.area).not.toBe("facial_hair");
      }
      expect(report.recommendations.filter((rec) => rec.horizon === "professional").length).toBeLessThanOrEqual(2);
      for (const template of chosen) {
        if (template.alternativeTo) expect(chosen.map((t) => t.id)).not.toContain(template.alternativeTo);
      }
      const cited = new Set(report.recommendations.flatMap((rec) => rec.sourceIds));
      expect(new Set(report.usedSources.map((source) => source.id))).toEqual(cited);
      expect(report.sevenDayPlan.length).toBeGreaterThan(0);
      expect(report.ninetyDayPlan.length).toBeGreaterThan(0);
    }
  });

  it("covers each chosen focus area first", () => {
    const input = randomInput(7);
    const fixed = { ...input, focusAreas: ["brows", "smile"] as ReportInput["focusAreas"] };
    const areas = planReport(fixed, observations, { simulated: true }).recommendations.map((rec) => rec.area);
    expect(areas).toContain("brows");
    expect(areas).toContain("smile");
  });

  it("never suggests a professional (hairline, skin, whitening, alignment) unless the buyer raised it", () => {
    const referralTitles = LIBRARY.filter((template) => template.onlyIfAsked).map((template) => template.title);
    expect(referralTitles).toHaveLength(4);
    const grooming: ReportInput = {
      goals: ["grooming"],
      focusAreas: ["brows", "facial_hair", "hair"],
      timeline: "30d",
      budget: "high",
      preferences: { skin: [], brows: ["shape"], eyes: [], hair: ["routine"], facialHairRelevant: "yes", facialHair: ["shape"], smile: [], jaw: [] },
      constraints: { dailyMinutes: "30", avoid: [] },
    };
    const titles = (input: ReportInput) => planReport(input, observations, { simulated: false }).recommendations.map((rec) => rec.title);
    expect(titles(grooming).filter((title) => referralTitles.includes(title))).toEqual([]);
    for (let seed = 1; seed <= 200; seed++) {
      const input = randomInput(seed);
      const report = planReport(input, observations, { simulated: false });
      for (const rec of report.recommendations) {
        const template = LIBRARY.find((candidate) => candidate.title === rec.title);
        if (!template?.onlyIfAsked) continue;
        const asked = (template.matches ?? []).some(({ key, values }) => (input.preferences[key] as readonly string[]).some((value) => values.includes(value)));
        expect(asked, `${rec.title} for seed ${seed}`).toBe(true);
      }
    }
    expect(titles({ ...grooming, preferences: { ...grooming.preferences, hair: ["hairline_framing"] } })).toContain("Optional: ask a dermatologist about your hairline");
  });

  it("uses the photo observation for the matching area and says so when none exists", () => {
    const input = { ...randomInput(3), focusAreas: ["skin", "hair"] as ReportInput["focusAreas"] };
    const report = planReport(input, observations, { simulated: false });
    const skin = report.recommendations.find((rec) => rec.area === "skin");
    const hair = report.recommendations.find((rec) => rec.area === "hair");
    expect(skin?.observation).toContain("confidence: medium");
    expect(hair?.observation).toMatch(/Not assessed from your photo/);
  });

  it("asks the image edit only for what the buyer chose", () => {
    const base = randomInput(11);
    const none = {
      ...base,
      focusAreas: ["jaw_presentation"] as ReportInput["focusAreas"],
      preferences: { skin: [], brows: [], eyes: [], hair: [], facialHairRelevant: "no" as const, facialHair: [], smile: [], jaw: ["photo_presentation" as const] },
    };
    expect(buildImageEditInstructions(none)).toEqual([]);
    const brows = { ...none, focusAreas: ["brows"] as ReportInput["focusAreas"] };
    expect(buildImageEditInstructions(brows).join(" ")).toMatch(/eyebrows/i);
  });
});
